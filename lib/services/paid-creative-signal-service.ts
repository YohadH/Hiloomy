// Paid-creative signal — what's WORKING and what's NOT in the store's live
// Meta ads, framed for CREATIVE decisions (owner ask, 2026-08-28: "the
// creative agent needs to know what was working and what wasn't and keep
// that line"). Fed to the creative agent's runtime context and the brief
// generators so new creatives echo the winning angles and avoid the losers.
//
// Reads ad-LEVEL MetaAdsCampaignInsight rows (creativeTitle/creativeBody +
// spend-weighted ROAS). Purely a read; no writes, no LLM.

import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";

export interface CreativeWinner {
  name: string;
  roas: number | null;
  spend: number;
  purchases: number;
  headline: string | null;
  body: string | null;
}

export interface PaidCreativeSignal {
  hasData: boolean;
  windowDays: number;
  currency: string;
  winners: CreativeWinner[];
  losers: Array<{ name: string; roas: number | null; spend: number }>;
}

// An ad needs at least this spend to be a signal rather than noise.
const MIN_SPEND = 200;

export async function buildPaidCreativeSignal(
  storeId: string,
  opts?: { days?: number }
): Promise<PaidCreativeSignal> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const days = opts?.days ?? 30;
  const empty: PaidCreativeSignal = { hasData: false, windowDays: days, currency: "ILS", winners: [], losers: [] };
  if (!db?.metaAdsCampaignInsight) return empty;

  const start = new Date(Date.now() - days * 86_400_000);
  const [rows, store] = await Promise.all([
    db.metaAdsCampaignInsight
      .findMany({
        where: { storeId, level: "ad", dateStart: { gte: start } },
        select: {
          adId: true,
          adName: true,
          creativeTitle: true,
          creativeBody: true,
          spend: true,
          purchaseRoas: true,
          purchases: true
        }
      })
      .catch(() => []),
    db.store.findUnique({ where: { id: storeId }, select: { currency: true } }).catch(() => null)
  ]);
  const currency = (store?.currency as string) ?? "ILS";
  if (!Array.isArray(rows) || rows.length === 0) return { ...empty, currency };

  const byAd = new Map<
    string,
    { name: string; spend: number; revenue: number; purchases: number; headline: string | null; body: string | null }
  >();
  for (const r of rows as Array<Record<string, unknown>>) {
    const key = String(r.adId ?? r.adName ?? "unknown");
    const acc = byAd.get(key) ?? {
      name: (r.adName as string) ?? "Meta ad",
      spend: 0,
      revenue: 0,
      purchases: 0,
      headline: null as string | null,
      body: null as string | null
    };
    const s = toNumber(r.spend);
    acc.spend += s;
    if (r.purchaseRoas != null) acc.revenue += toNumber(r.purchaseRoas) * s;
    acc.purchases += Number(r.purchases ?? 0);
    if (!acc.headline && typeof r.creativeTitle === "string" && r.creativeTitle.trim()) acc.headline = r.creativeTitle.trim();
    if (!acc.body && typeof r.creativeBody === "string" && r.creativeBody.trim()) acc.body = r.creativeBody.trim();
    byAd.set(key, acc);
  }

  const ads = [...byAd.values()]
    .filter((a) => a.spend >= MIN_SPEND)
    .map((a) => ({
      name: a.name,
      spend: Math.round(a.spend),
      purchases: a.purchases,
      roas: a.spend > 0 ? Math.round((a.revenue / a.spend) * 100) / 100 : null,
      headline: a.headline,
      body: a.body ? a.body.slice(0, 200) : null
    }));
  const withRoas = ads.filter((a): a is typeof a & { roas: number } => a.roas != null);

  const winners = [...withRoas].sort((x, y) => y.roas - x.roas).filter((a) => a.purchases > 0).slice(0, 4);
  const losers = [...withRoas].sort((x, y) => x.roas - y.roas).slice(0, 3);

  return { hasData: ads.length > 0, windowDays: days, currency, winners, losers };
}

// Compact prompt block for the creative agent / brief generators. Returns
// null when there's nothing meaningful to say (so callers can skip it).
export function formatPaidCreativeSignal(sig: PaidCreativeSignal): string | null {
  if (!sig.hasData || (sig.winners.length === 0 && sig.losers.length === 0)) return null;
  const lines: string[] = [
    `## Paid performance — what is WORKING in the store's live Meta ads (last ${sig.windowDays} days)`,
    `Steer NEW creative toward the winning ANGLES/HOOKS/OFFERS below and away from the losers — keep the line that converts. This informs the SCENE, mood, and concept; never copy ad text INTO the image.`
  ];
  if (sig.winners.length) {
    lines.push(`Winners (highest ROAS with real purchases):`);
    for (const w of sig.winners) {
      lines.push(
        `- "${w.name}" · ROAS ${w.roas} · ${w.purchases} purchases` +
          (w.headline ? ` · hook: "${w.headline}"` : "") +
          (w.body ? ` · copy: "${w.body}"` : "")
      );
    }
  }
  if (sig.losers.length) {
    lines.push(`Underperformers (avoid repeating these angles):`);
    for (const l of sig.losers) lines.push(`- "${l.name}" · ROAS ${l.roas} · spend ${sig.currency} ${l.spend}`);
  }
  return lines.join("\n");
}
