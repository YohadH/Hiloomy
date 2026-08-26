// Meta campaigns overview — the "which campaigns are running" section on
// the Command Center (owner ask, 2026-08-26), plus its BI insight.
//
// Data source: MetaAdsCampaignInsight daily rows (level "campaign") already
// synced from the Marketing API — no live Meta call on page load. "Running"
// is derived, not fetched: Meta's status field isn't stored, so a campaign
// counts as recently active when it spent within the last 3 data-days of
// the window. The UI labels it that way — honest, not a fake live status.
//
// The BI insight is a one-shot LLM call over a compact digest of the same
// aggregates (OpenAI default / Anthropic fallback — the BI chat keys),
// cached in SystemConfig per store+window for 6h so page views don't bill.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getDb } from "@/lib/server/db";

const RECENT_ACTIVITY_DAYS = 3;

export interface MetaCampaignRow {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  revenue: number;
  roas: number | null;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  lastActiveDate: string | null;
  activeRecently: boolean;
}

export interface MetaCampaignsOverview {
  rangeStart: string;
  rangeEnd: string;
  dataThrough: string | null;
  totalSpend: number;
  totalPurchases: number;
  totalRevenue: number;
  blendedRoas: number | null;
  campaigns: MetaCampaignRow[];
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getMetaCampaignsOverview(
  storeId: string,
  range: { start: Date; end: Date }
): Promise<MetaCampaignsOverview | null> {
  const db = getDb();
  if (!db?.metaAdsCampaignInsight) return null;

  const rows = (await db.metaAdsCampaignInsight
    .findMany({
      where: {
        storeId,
        level: "campaign",
        dateStart: { gte: range.start },
        dateStop: { lte: range.end }
      },
      select: {
        campaignId: true,
        campaignName: true,
        dateStop: true,
        spend: true,
        impressions: true,
        clicks: true,
        linkClicks: true,
        purchases: true,
        purchaseRoas: true
      }
    })
    .catch(() => [])) as Array<{
    campaignId: string;
    campaignName: string;
    dateStop: Date;
    spend: unknown;
    impressions: number;
    clicks: number;
    linkClicks: number;
    purchases: number;
    purchaseRoas: unknown | null;
  }>;

  if (rows.length === 0) return null;

  let dataThrough: Date | null = null;
  const byCampaign = new Map<
    string,
    {
      name: string;
      spend: number;
      impressions: number;
      clicks: number;
      linkClicks: number;
      purchases: number;
      revenue: number;
      lastActive: Date | null;
    }
  >();

  for (const row of rows) {
    const spend = toNum(row.spend);
    if (!dataThrough || row.dateStop > dataThrough) dataThrough = row.dateStop;
    const agg = byCampaign.get(row.campaignId) ?? {
      name: row.campaignName,
      spend: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      purchases: 0,
      revenue: 0,
      lastActive: null
    };
    agg.name = row.campaignName || agg.name;
    agg.spend += spend;
    agg.impressions += row.impressions ?? 0;
    agg.clicks += row.clicks ?? 0;
    agg.linkClicks += row.linkClicks ?? 0;
    agg.purchases += row.purchases ?? 0;
    // purchaseRoas is per-row ROAS → row revenue = roas × spend.
    if (row.purchaseRoas != null) agg.revenue += toNum(row.purchaseRoas) * spend;
    if (spend > 0 && (!agg.lastActive || row.dateStop > agg.lastActive)) {
      agg.lastActive = row.dateStop;
    }
    byCampaign.set(row.campaignId, agg);
  }

  const recencyCutoff = dataThrough
    ? new Date(dataThrough.getTime() - RECENT_ACTIVITY_DAYS * 86_400_000)
    : null;

  const campaigns: MetaCampaignRow[] = [...byCampaign.entries()]
    .map(([campaignId, agg]) => ({
      campaignId,
      campaignName: agg.name,
      spend: Math.round(agg.spend * 100) / 100,
      impressions: agg.impressions,
      clicks: agg.clicks,
      linkClicks: agg.linkClicks,
      purchases: agg.purchases,
      revenue: Math.round(agg.revenue * 100) / 100,
      roas: agg.spend > 0 ? Math.round((agg.revenue / agg.spend) * 100) / 100 : null,
      ctr: agg.impressions > 0 ? Math.round((agg.clicks / agg.impressions) * 10000) / 100 : null,
      cpc: agg.clicks > 0 ? Math.round((agg.spend / agg.clicks) * 100) / 100 : null,
      cpa: agg.purchases > 0 ? Math.round((agg.spend / agg.purchases) * 100) / 100 : null,
      lastActiveDate: agg.lastActive ? agg.lastActive.toISOString().slice(0, 10) : null,
      activeRecently: Boolean(agg.lastActive && recencyCutoff && agg.lastActive >= recencyCutoff)
    }))
    .sort((a, b) => b.spend - a.spend);

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);

  return {
    rangeStart: range.start.toISOString().slice(0, 10),
    rangeEnd: range.end.toISOString().slice(0, 10),
    dataThrough: dataThrough ? dataThrough.toISOString().slice(0, 10) : null,
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalPurchases: campaigns.reduce((s, c) => s + c.purchases, 0),
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    blendedRoas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : null,
    campaigns
  };
}

// ── BI insight over the overview ────────────────────────────────────────

export interface MetaCampaignsInsight {
  headline: string;
  insights: string[];
  actions: string[];
  generatedAt: string;
}

const INSIGHT_TTL_MS = 6 * 60 * 60 * 1000;
const insightCacheKey = (storeId: string, overview: MetaCampaignsOverview) =>
  `meta_campaigns_insight:${storeId}:${overview.rangeStart}:${overview.rangeEnd}`;

function buildDigest(overview: MetaCampaignsOverview): string {
  const lines: string[] = [
    `Window: ${overview.rangeStart} → ${overview.rangeEnd} (data through ${overview.dataThrough ?? "?"})`,
    `Totals: spend ₪${overview.totalSpend}, purchases ${overview.totalPurchases}, tracked revenue ₪${overview.totalRevenue}, blended ROAS ${overview.blendedRoas ?? "n/a"}`,
    `Campaigns (by spend):`
  ];
  for (const c of overview.campaigns.slice(0, 15)) {
    lines.push(
      `- "${c.campaignName}": spend ₪${c.spend}, purchases ${c.purchases}, revenue ₪${c.revenue}, ROAS ${c.roas ?? "n/a"}, CPA ${c.cpa != null ? `₪${c.cpa}` : "n/a"}, CTR ${c.ctr ?? "n/a"}%, ${c.activeRecently ? "recently active" : `inactive since ${c.lastActiveDate ?? "?"}`}`
    );
  }
  return lines.join("\n");
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sanitizeInsight(raw: Record<string, unknown>): MetaCampaignsInsight | null {
  const asList = (v: unknown, max: number): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max)
      : [];
  const headline = typeof raw.headline === "string" ? raw.headline.trim() : "";
  const insights = asList(raw.insights, 4);
  const actions = asList(raw.actions, 3);
  if (!headline || insights.length === 0) return null;
  return { headline, insights, actions, generatedAt: new Date().toISOString() };
}

async function callInsightModel(prompt: string): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const client = new OpenAI({ apiKey: openaiKey });
    const response = (await client.responses.create({
      model: process.env.BI_CHAT_MODEL?.trim() || "gpt-5.6-terra",
      input: prompt,
      max_output_tokens: 1500
    } as never)) as unknown as { output_text?: string };
    return response.output_text ?? null;
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    });
    return message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  return null;
}

export async function buildMetaCampaignsInsight(input: {
  storeId: string;
  overview: MetaCampaignsOverview;
  locale: "he" | "en";
  force?: boolean;
}): Promise<MetaCampaignsInsight | null> {
  const db = getDb();
  const key = insightCacheKey(input.storeId, input.overview);

  if (!input.force && db?.systemConfig) {
    const row = (await db.systemConfig
      .findUnique({ where: { key } })
      .catch(() => null)) as { value: string } | null;
    if (row?.value) {
      try {
        const cached = JSON.parse(row.value) as MetaCampaignsInsight;
        if (Date.now() - Date.parse(cached.generatedAt) < INSIGHT_TTL_MS) return cached;
      } catch {
        // stale/corrupt cache — regenerate below
      }
    }
  }

  const language = input.locale === "he" ? "Hebrew" : "English";
  const prompt = `You are a sharp e-commerce media buyer reviewing Meta Ads performance for a store owner.

DATA:
${buildDigest(input.overview)}

Write in ${language}. Respond with ONLY a JSON object, no markdown fences:
{"headline": "one sentence — the single most important thing in this data",
 "insights": ["2-4 short observations, each naming a SPECIFIC campaign and number (what's winning, what's burning money, notable CPA/CTR patterns)"],
 "actions": ["2-3 concrete next moves, each tied to a named campaign (scale/kill/fix, with the number that justifies it)"]}
Rules: name real campaigns from the data verbatim; cite the numbers; a ROAS under 1 is losing money — say so plainly; never invent data not shown.`;

  const raw = await callInsightModel(prompt).catch((err) => {
    console.error("[meta-campaigns-insight] model call failed:", err);
    return null;
  });
  if (!raw) return null;
  const parsed = extractJson(raw);
  const insight = parsed ? sanitizeInsight(parsed) : null;
  if (!insight) return null;

  if (db?.systemConfig) {
    await db.systemConfig
      .upsert({
        where: { key },
        create: { key, value: JSON.stringify(insight) },
        update: { value: JSON.stringify(insight) }
      })
      .catch(() => null);
  }
  return insight;
}
