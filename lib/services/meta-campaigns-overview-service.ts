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
import { formatDateInTimeZone, getStoreTimeZone } from "@/lib/server/reporting-date-range";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";

const RECENT_ACTIVITY_DAYS = 3;

export interface MetaCampaignRow {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  // Funnel stages (for stage-by-stage drop-off analysis).
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
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
  /** Calendar dates in the STORE timezone — for labels and cache keys. */
  rangeStart: string;
  rangeEnd: string;
  /** The exact window instants (ISO) — for anything that re-queries the window. */
  rangeStartAt: string;
  rangeEndAt: string;
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

  // Scope to the CURRENTLY connected ad account. Without this, rows synced
  // earlier under a different (wrongly auto-picked) account stay visible for
  // this store forever — hbosem showed Incense's "JulyPromotions" even after
  // a sync that returned 0 rows (2 Sep 2026). No connection, or no account
  // chosen yet → nothing to show.
  const connection = db.metaAdsConnection
    ? ((await db.metaAdsConnection
        .findUnique({ where: { storeId }, select: { adAccountId: true } })
        .catch(() => null)) as { adAccountId: string | null } | null)
    : null;
  if (!connection?.adAccountId) return null;

  const rows = (await db.metaAdsCampaignInsight
    .findMany({
      where: {
        storeId,
        adAccountId: connection.adAccountId,
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
        landingPageViews: true,
        addToCart: true,
        initiateCheckout: true,
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
    landingPageViews: number;
    addToCart: number;
    initiateCheckout: number;
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
      landingPageViews: number;
      addToCart: number;
      initiateCheckout: number;
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
      landingPageViews: 0,
      addToCart: 0,
      initiateCheckout: 0,
      purchases: 0,
      revenue: 0,
      lastActive: null
    };
    agg.name = row.campaignName || agg.name;
    agg.spend += spend;
    agg.impressions += row.impressions ?? 0;
    agg.clicks += row.clicks ?? 0;
    agg.linkClicks += row.linkClicks ?? 0;
    agg.landingPageViews += row.landingPageViews ?? 0;
    agg.addToCart += row.addToCart ?? 0;
    agg.initiateCheckout += row.initiateCheckout ?? 0;
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
      landingPageViews: agg.landingPageViews,
      addToCart: agg.addToCart,
      initiateCheckout: agg.initiateCheckout,
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

  // Label the window by the calendar day it falls on in the store's
  // timezone. toISOString() rendered the Aug-25 00:00 Israel boundary as
  // "2026-08-24" — the same off-by-one R-01 fixed everywhere else, which
  // this block missed (QA run 4, M-14).
  const timeZone = await getStoreTimeZone(storeId);
  return {
    rangeStart: formatDateInTimeZone(range.start, timeZone),
    rangeEnd: formatDateInTimeZone(range.end, timeZone),
    rangeStartAt: range.start.toISOString(),
    rangeEndAt: range.end.toISOString(),
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
// Version suffix (v2 = funnel + breakeven-aware prompt): bumping it retires
// the old flat-metric cache so the richer analysis shows immediately instead
// of waiting out the 6h TTL on stale entries.
const insightCacheKey = (storeId: string, overview: MetaCampaignsOverview) =>
  `meta_campaigns_insight:v2:${storeId}:${overview.rangeStart}:${overview.rangeEnd}`;

interface DigestContext {
  storeName: string | null;
  currency: string;
  // Breakeven ROAS = 1 / contribution-margin-rate. null when product costs
  // aren't set (can't judge profitability precisely).
  breakevenRoas: number | null;
  marginRatePct: number | null;
}

// Stage-to-stage conversion, as a percent, or null when the denominator is 0.
function stagePct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function buildDigest(overview: MetaCampaignsOverview, ctx: DigestContext): string {
  const lines: string[] = [
    `Store: ${ctx.storeName ?? "the store"} · currency ${ctx.currency}`,
    `Window: ${overview.rangeStart} → ${overview.rangeEnd} (data through ${overview.dataThrough ?? "?"})`,
    `Totals: spend ${ctx.currency} ${overview.totalSpend}, purchases ${overview.totalPurchases}, tracked revenue ${ctx.currency} ${overview.totalRevenue}, blended ROAS ${overview.blendedRoas ?? "n/a"}`
  ];
  if (ctx.breakevenRoas != null) {
    lines.push(
      `BREAKEVEN ROAS for THIS store ≈ ${ctx.breakevenRoas} (= 1 / contribution margin ${ctx.marginRatePct}%). A campaign ABOVE this makes profit; BELOW it loses money. Judge "good/bad ROAS" against THIS number — not a generic 3x/4x rule of thumb.`
    );
  } else {
    lines.push(
      `BREAKEVEN ROAS: unknown (product costs / COGS not set for this store). You can still compare campaigns to each other, but say a precise profit verdict needs COGS.`
    );
  }
  lines.push(
    `\nPer-campaign FUNNEL (impressions → link clicks → landing views → add-to-cart → checkout → purchase, each with its conversion from the previous stage). A "0" or "n/a" stage may mean the pixel isn't firing that event, not zero real activity — say so rather than guessing:`
  );
  for (const c of overview.campaigns.slice(0, 12)) {
    const ctrPct = stagePct(c.linkClicks, c.impressions);
    const lpvRate = stagePct(c.landingPageViews, c.linkClicks);
    const atcRate = stagePct(c.addToCart, c.landingPageViews);
    const icRate = stagePct(c.initiateCheckout, c.addToCart);
    const purRate = stagePct(c.purchases, c.initiateCheckout);
    lines.push(
      `- "${c.campaignName}" [${c.activeRecently ? "active" : `paused since ${c.lastActiveDate ?? "?"}`}]: spend ${ctx.currency} ${c.spend}, ROAS ${c.roas ?? "n/a"}, CPA ${c.cpa != null ? `${ctx.currency} ${c.cpa}` : "n/a"}\n` +
        `    ${c.impressions} impressions → ${c.linkClicks} link clicks (CTR ${ctrPct ?? "n/a"}%) → ${c.landingPageViews} landing views (${lpvRate ?? "n/a"}% of clicks) → ${c.addToCart} add-to-cart (${atcRate ?? "n/a"}% of views) → ${c.initiateCheckout} checkouts (${icRate ?? "n/a"}% of ATC) → ${c.purchases} purchases (${purRate ?? "n/a"}% of checkouts)`
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
  const insights = asList(raw.insights, 6);
  const actions = asList(raw.actions, 5);
  if (!headline || insights.length === 0) return null;
  return { headline, insights, actions, generatedAt: new Date().toISOString() };
}

const DEFAULT_BI_MODEL = "gpt-5.6-terra";

async function callInsightModel(prompt: string): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const client = new OpenAI({ apiKey: openaiKey });
    const call = (model: string) =>
      client.responses.create({ model, input: prompt, max_output_tokens: 4000 } as never) as unknown as Promise<{
        output_text?: string;
      }>;
    const pinned = process.env.BI_CHAT_MODEL?.trim() || DEFAULT_BI_MODEL;
    let response: { output_text?: string };
    try {
      response = await call(pinned);
    } catch (err) {
      // A bad BI_CHAT_MODEL pin must not silently kill the insight — retry
      // once with the known-good default.
      if (pinned !== DEFAULT_BI_MODEL) {
        console.warn(`[meta-campaigns-insight] model "${pinned}" failed; retrying with ${DEFAULT_BI_MODEL}.`);
        response = await call(DEFAULT_BI_MODEL);
      } else {
        throw err;
      }
    }
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

  // Store-specific profitability benchmark: breakeven ROAS = 1 / margin.
  // Only trust it when there's enough cost coverage to mean anything.
  const [storeMeta, margin] = await Promise.all([
    (db?.store
      ?.findUnique({ where: { id: input.storeId }, select: { name: true, currency: true } })
      .catch(() => null)) as Promise<{ name: string; currency: string } | null>,
    buildContributionMargin({
      storeId: input.storeId,
      // The real instants — parsing the date LABEL as a bare UTC midnight
      // shifted this window by hours against the one the campaigns used.
      start: new Date(input.overview.rangeStartAt),
      end: new Date(input.overview.rangeEndAt)
    }).catch(() => null)
  ]);
  const marginRate = margin?.totals?.contributionMarginRate ?? null; // 0..1
  const costCoverage = margin?.quality?.costCoverage ?? 0;
  const trustMargin = marginRate != null && marginRate > 0 && costCoverage >= 0.2;
  const ctx: DigestContext = {
    storeName: storeMeta?.name ?? null,
    currency: storeMeta?.currency ?? "ILS",
    breakevenRoas: trustMargin ? Math.round((1 / marginRate!) * 100) / 100 : null,
    marginRatePct: trustMargin ? Math.round(marginRate! * 100) : null
  };

  const prompt = `You are a senior Meta (Facebook/Instagram) media buyer AND conversion-rate analyst, reviewing an ad account for a store OWNER who is not a marketer. Be specific, honest, and practical. Adapt to the business model you see in the data: if purchases drive the funnel it is e-commerce; if purchases are ~0 but link clicks / leads flow, treat it as lead generation and switch to lead-gen best practices.

STORE + CAMPAIGN DATA:
${buildDigest(input.overview, ctx)}

Produce, writing in ${language} for the owner:
1) ROAS VERDICT — say plainly whether the account overall, and each meaningful campaign, has GOOD or BAD ROAS, judged against the store's BREAKEVEN ROAS above (not a generic 3x/4x). Name the numbers. If breakeven is unknown, say a precise verdict needs product costs.
2) FUNNEL STAGE per campaign — infer each campaign's role (top-of-funnel / awareness, mid / consideration, bottom / retargeting-conversion, or lead-gen). For each, find the WEAKEST stage — the biggest drop-off in its funnel — and say what it means in plain terms. Examples: impressions but low CTR = weak hook/creative; clicks but few landing views = slow page or broken link; landing views but little add-to-cart = product page / price / offer problem; add-to-cart but few purchases = checkout, shipping, trust or payment friction. If the audience-warming (top) stage is thin, say so.
3) NICHE-AWARE ACTION ITEMS — for the biggest problems, give the BEST PRACTICE for this kind of business (e-commerce or lead-gen as detected) AND a concrete, store-specific how-to the owner can do THIS WEEK. Make each action doable, not generic ("test 3 hook variations that open on the product benefit in the first 2s", not "improve creative").

Respond with ONLY a JSON object, no markdown fences:
{"headline": "one sentence — is the account healthy vs breakeven, and the single most important thing to fix",
 "insights": ["4-6 items. Each names a campaign, its funnel STAGE, its weakest step WITH the number, and what that means"],
 "actions": ["3-5 items. Each: the fix + WHY (best practice for this niche) + a specific how-to for this store, tied to a named campaign or funnel stage"]}
Rules: judge good/bad ROAS against the store's breakeven; name real campaigns verbatim; cite the funnel numbers; a ROAS below breakeven loses money — say it; if a funnel stage shows 0/n-a it may be a missing pixel event, so flag tracking rather than inventing a story; never invent data not shown.`;

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
