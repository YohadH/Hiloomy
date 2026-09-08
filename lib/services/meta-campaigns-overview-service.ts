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

import { AppError } from "@/lib/server/errors";
import { assertLlmBudget, recordLlmUsage } from "@/lib/services/llm-usage-service";
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

// Compressed shape (owner, 7 Sep 2026: "decision → why → what to do →
// evidence on click", ~25% of the old text above the fold):
//   decision   — the call, ≤ 8 words ("No case for raising budget yet")
//   conclusion — 1–2 sentences of why, plain business language
//   why        — ≤ 4 bullets, each one number
//   actions    — ≤ 3 concrete steps
//   evidence   — the per-campaign detail, shown only behind "Show evidence"
//
// Two axes, never conflated (owner, 7 Sep 2026): PERFORMANCE (ROAS, purchases,
// CTR, trend — Meta data, available without costs) and PROFITABILITY
// (breakeven, contribution — needs COGS). Missing COGS lowers the profit
// axis; it does not silence the performance axis. The two confidences are
// computed from the data server-side, not asked of the model.
export type InsightConfidence = "high" | "medium" | "low";

export interface MetaCampaignsInsight {
  decision: string;
  conclusion: string;
  // "What we know" — performance facts, one number each.
  known: string[];
  // "What we don't know" — the profit-side gaps, stated plainly.
  unknown: string[];
  actions: string[];
  evidence: string[];
  // Model's relative read of the account's campaign performance.
  health: "strong" | "mixed" | "weak";
  // Computed: quality of the performance evidence (window, spend, tracking).
  performanceConfidence: InsightConfidence;
  // Computed: quality of the profit evidence (cost coverage).
  profitConfidence: InsightConfidence;
  // Computed: blended ROAS vs breakeven when breakeven is trusted.
  profitability: "verified_profitable" | "verified_losing" | "not_verified";
  breakevenRoas: number | null;
  generatedAt: string;
}

const INSIGHT_TTL_MS = 6 * 60 * 60 * 1000;
const INSIGHT_FAILURE_TTL_MS = 30 * 60 * 1000;
// Version suffix (v3 = localized prompt + locale in the key): v2 keys ignored
// the viewer's language, so whichever locale generated first was served to
// every viewer of that store+window for the whole TTL. Bumping retires the
// stale English entries immediately instead of waiting out the 6h TTL.
const insightCacheKey = (storeId: string, locale: "he" | "en", overview: MetaCampaignsOverview) =>
  `meta_campaigns_insight:v6:${storeId}:${locale}:${overview.rangeStart}:${overview.rangeEnd}`;

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

// Facts the model MUST reflect, computed here so they cannot be missed or
// softened: campaigns that spent without a single attributed purchase, the
// account leader, and how far the evidence reaches. Plus the phrasing rules
// that keep insight and decision apart (owner, 7 Sep 2026):
//   - the decision is an INSIGHT headline, not a budget instruction;
//   - no invented numbers ("raise 15%") when breakeven is unknown;
//   - spend-without-purchases is REVIEW / candidate to pause, never "stop".
function buildDecisionFrame(overview: MetaCampaignsOverview, ctx: DigestContext, isHe: boolean): string {
  const money = (n: number) => `${ctx.currency} ${Math.round(n).toLocaleString("en-US")}`;
  const noPurchase = overview.campaigns
    .filter((c) => c.spend >= 100 && c.purchases === 0)
    .sort((a, b) => b.spend - a.spend);
  const noPurchaseSpend = noPurchase.reduce((sum, c) => sum + c.spend, 0);
  const leader = [...overview.campaigns].filter((c) => c.purchases > 0).sort((a, b) => b.revenue - a.revenue)[0] ?? null;
  const breakevenKnown = ctx.breakevenRoas != null;
  if (isHe) {
    const lines = [
      "מסגרת החלטה (עובדות מחושבות — חובה לשקף):",
      noPurchase.length
        ? `- קמפיינים שהוציאו בלי אף רכישה מיוחסת בחלון: ${noPurchase.map((c) => `"${c.campaignName}" ${money(c.spend)}`).join(", ")} (סה"כ ${money(noPurchaseSpend)}). זה REVIEW / מועמד להשהיה — לא "לעצור": לא ידועים יעד CPA, ייחוס או שלב למידה.`
        : "- אין קמפיין שהוציא בלי רכישה מיוחסת.",
      leader
        ? `- הקמפיין המוביל: "${leader.campaignName}" — ${leader.purchases} רכישות, ROAS ${leader.roas ?? "n/a"}. ${breakevenKnown ? "נקודת האיזון ידועה — מותר לשפוט רווחיות." : "מועמד להגדלה — אבל בלי נקודת איזון אסור לאשר שהגדלה תוסיף רווח."}`
        : "- אין קמפיין עם רכישות מיוחסות.",
      breakevenKnown
        ? `- נקודת האיזון ידועה (${ctx.breakevenRoas}×): מותר לומר רווחי/מפסיד.`
        : "- נקודת האיזון לא ידועה (אין עלויות מוצר): אסור לומר רווחי/מפסיד ואסור לנקוב באחוז הגדלה (לא 15%, לא 20%). ניסוח מותר: \"מועמד להגדלת תקציב — לאחר השלמת COGS, אם ה־ROAS נשאר מעל נקודת האיזון, scale מדורג\" או \"אפשר scale קטן ומבוקר, אבל אי אפשר לאשר שהוא מגדיל רווח תרומה\".",
      "- הכותרת (decision) היא תובנה, לא הוראת תקציב. תבנית: \"ביצועי המדיה חזקים — הרווחיות עדיין לא מאומתת\". ההוראות הולכות ל־actions בלבד.",
      "- סדר הפעולות: (1) להשלים COGS כדי לחשב נקודת איזון; (2) לבדוק את הקמפיינים שהוציאו בלי רכישה, בשמם ובסכום; (3) לסמן את המוביל כמועמד ל־scale בתנאי שאחרי השלמת העלויות הוא נשאר מעל נקודת האיזון."
    ];
    return lines.join("\n");
  }
  const lines = [
    "Decision frame (computed facts — must be reflected):",
    noPurchase.length
      ? `- Campaigns that spent with no attributed purchase in the window: ${noPurchase.map((c) => `"${c.campaignName}" ${money(c.spend)}`).join(", ")} (total ${money(noPurchaseSpend)}). This is REVIEW / candidate to pause — never "stop": CPA target, attribution and learning phase are unknown.`
      : "- No campaign spent without an attributed purchase.",
    leader
      ? `- Account leader: "${leader.campaignName}" — ${leader.purchases} purchases, ROAS ${leader.roas ?? "n/a"}. ${breakevenKnown ? "Breakeven is known — profitability may be judged." : "Scale candidate — but without breakeven you may not claim scaling adds profit."}`
      : "- No campaign has attributed purchases.",
    breakevenKnown
      ? `- Breakeven is known (${ctx.breakevenRoas}×): profitable/losing may be stated.`
      : "- Breakeven is unknown (no product costs): never say profitable/losing and never quote a scaling percentage (no 15%, no 20%). Allowed phrasing: \"scale candidate — once COGS is complete, if ROAS stays above breakeven, scale gradually\" or \"a small controlled scale is possible, but it cannot be confirmed to add contribution profit\".",
    "- The decision is an INSIGHT headline, not a budget instruction. Template: \"Media performance is strong — profitability not yet verified\". Instructions go into actions only.",
    "- Action order: (1) complete COGS to compute breakeven; (2) review the no-purchase campaigns by name and amount; (3) mark the leader as a scale candidate conditional on staying above breakeven once costs are in."
  ];
  return lines.join("\n");
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

type ModelInsight = Pick<MetaCampaignsInsight, "decision" | "conclusion" | "known" | "unknown" | "actions" | "evidence" | "health">;

function sanitizeInsight(raw: Record<string, unknown>): ModelInsight | null {
  const asList = (v: unknown, max: number): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max)
      : [];
  const decision = typeof raw.decision === "string" ? raw.decision.trim() : "";
  const conclusion = typeof raw.conclusion === "string" ? raw.conclusion.trim() : "";
  const known = asList(raw.known, 4);
  const unknown = asList(raw.unknown, 3);
  const actions = asList(raw.actions, 3);
  const evidence = asList(raw.evidence, 10);
  const healthRaw = typeof raw.health === "string" ? raw.health.trim().toLowerCase() : "";
  const health: ModelInsight["health"] = healthRaw === "strong" || healthRaw === "weak" ? healthRaw : "mixed";
  if (!decision || !conclusion || known.length === 0) return null;
  return { decision, conclusion, known, unknown, actions, evidence, health };
}

// The two confidences come from the DATA, not from the model's mood.
function assessConfidence(
  overview: MetaCampaignsOverview,
  ctx: DigestContext,
  costCoverage: number
): Pick<MetaCampaignsInsight, "performanceConfidence" | "profitConfidence" | "profitability" | "breakevenRoas"> {
  const days = Math.max(
    1,
    Math.round((new Date(overview.rangeEndAt).getTime() - new Date(overview.rangeStartAt).getTime()) / 86_400_000)
  );
  const tracked = overview.totalPurchases > 0;
  const performanceConfidence: InsightConfidence =
    tracked && overview.totalSpend >= 1000 && days >= 7 ? "high" : tracked && overview.totalSpend > 0 ? "medium" : "low";
  const profitConfidence: InsightConfidence =
    ctx.breakevenRoas !== null ? (costCoverage >= 0.8 ? "high" : "medium") : "low";
  const profitability: MetaCampaignsInsight["profitability"] =
    ctx.breakevenRoas !== null && overview.blendedRoas !== null
      ? overview.blendedRoas >= ctx.breakevenRoas
        ? "verified_profitable"
        : "verified_losing"
      : "not_verified";
  return { performanceConfidence, profitConfidence, profitability, breakevenRoas: ctx.breakevenRoas };
}

const DEFAULT_BI_MODEL = "gpt-5.6-terra";

async function callInsightModel(prompt: string, storeId: string): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const client = new OpenAI({ apiKey: openaiKey });
    type InsightResponse = {
      output_text?: string;
      status?: string;
      incomplete_details?: { reason?: string };
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    // max_output_tokens covers the model's REASONING as well as the visible
    // answer on this model family. At 4,000 the JSON was cut mid-way once
    // the prompt asked for known/unknown/evidence (7 Sep 2026: the card
    // spun, then vanished — parse failure → 503 → hidden). Low reasoning
    // effort keeps the budget for the answer; if the model rejects the
    // param, retry without it rather than fail.
    const call = (model: string, withReasoning: boolean) =>
      client.responses.create({
        model,
        input: prompt,
        max_output_tokens: 12000,
        ...(withReasoning ? { reasoning: { effort: "low" } } : {})
      } as never) as unknown as Promise<InsightResponse>;
    const pinned = process.env.BI_CHAT_MODEL?.trim() || DEFAULT_BI_MODEL;
    let response: InsightResponse;
    try {
      response = await call(pinned, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/reasoning/i.test(message)) {
        console.warn("[meta-campaigns-insight] model rejected reasoning param; retrying without it.");
        response = await call(pinned, false);
      } else if (pinned !== DEFAULT_BI_MODEL) {
        // A bad BI_CHAT_MODEL pin must not silently kill the insight — retry
        // once with the known-good default.
        console.warn(`[meta-campaigns-insight] model "${pinned}" failed (${message}); retrying with ${DEFAULT_BI_MODEL}.`);
        response = await call(DEFAULT_BI_MODEL, false);
      } else {
        throw err;
      }
    }
    if (response.usage) {
      void recordLlmUsage({
        storeId,
        feature: "meta_insight",
        model: pinned,
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0
      });
    }
    if (response.status && response.status !== "completed") {
      console.warn(
        `[meta-campaigns-insight] response ${response.status}${response.incomplete_details?.reason ? ` (${response.incomplete_details.reason})` : ""} — ${(response.output_text ?? "").length} chars of output`
      );
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
  const key = insightCacheKey(input.storeId, input.locale, input.overview);

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

  const isHe = input.locale === "he";

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

  // Fully bilingual prompt (owner report, 3 Sep 2026): the old prompt asked
  // for Hebrew in one clause ("writing in Hebrew") buried inside an otherwise
  // all-English prompt with an English JSON template — the model followed the
  // dominant language and Hebrew viewers got English. Same bug class and same
  // fix as the competitor brief's bilingual prompts (bd8e467).
  const prompt = isHe
    ? `את הילומה, קניינית מדיה בכירה במטא (פייסבוק/אינסטגרם) וגם אנליסטית שיעורי המרה, שסוקרת חשבון מודעות עבור בעלי חנות שאינם אנשי שיווק. עני בעברית בלבד — כל שדה בעברית; שמות קמפיינים נשארים כלשונם. היי ספציפית, כנה ומעשית. התאימי את הניתוח למודל העסקי שעולה מהנתונים: אם רכישות מניעות את המשפך — זה איקומרס; אם הרכישות בערך 0 אבל זורמים קליקים או לידים — התייחסי לחשבון כעסק לידים ועברי לשיטות העבודה של עולם הלידים.

נתוני החנות והקמפיינים:
${buildDigest(input.overview, ctx)}

${buildDecisionFrame(input.overview, ctx, isHe)}

הפיקי עבור הבעלים:
1) פסק דין ROAS — אמרי בפשטות אם לחשבון כולו, ולכל קמפיין משמעותי, יש ROAS טוב או רע, בהשוואה לROAS נקודת האיזון של החנות שלמעלה (לא 3x/4x גנרי). נקבי במספרים. אם נקודת האיזון לא ידועה — אמרי שפסק דין מדויק דורש עלויות מוצר.
2) שלב במשפך לכל קמפיין — הסיקי את התפקיד של כל קמפיין (ראש המשפך / מודעות, אמצע / שקילה, תחתית / רימרקטינג והמרה, או לידים). לכל קמפיין מצאי את השלב החלש ביותר — הנפילה הגדולה ביותר במשפך שלו — והסבירי מה היא אומרת במילים פשוטות. דוגמאות: חשיפות עם CTR נמוך = הוק/קריאייטיב חלש; קליקים אבל מעט צפיות בדף נחיתה = דף איטי או קישור שבור; צפיות בדף נחיתה אבל מעט הוספות לעגלה = בעיה בדף המוצר, במחיר או בהצעה; הוספות לעגלה אבל מעט רכישות = חיכוך בתשלום, במשלוח או באמון. אם שלב חימום הקהל (ראש המשפך) דל — אמרי זאת.
3) פעולות מותאמות לנישה — לבעיות הגדולות ביותר תני את שיטת העבודה המומלצת לסוג העסק שזוהה (איקומרס או לידים) וגם ביצוע קונקרטי לחנות הזו שהבעלים יכולים לעשות השבוע. כל פעולה ברת ביצוע, לא גנרית ("לבדוק 3 וריאציות הוק שנפתחות בתועלת המוצר ב2 השניות הראשונות", לא "לשפר קריאייטיב").

הפרידי בין שני צירים ואל תערבבי ביניהם: ביצועי קמפיין (ROAS, רכישות, CTR, תדירות, CPA, מגמה, מי מוביל, מי מוציא בלי רכישות, מועמד להגדלה) — על אלה מותר וצריך לדבר גם בלי עלויות מוצר; רווחיות קמפיין (רווחי/מפסיד, האם הגדלת תקציב תוסיף רווח) — על זה מותר לדבר רק אם נקודת האיזון של החנות ידועה למעלה. אם אינה ידועה: אל תכתבי "הקמפיין רווחי" ואל תמליצי להגדיל תקציב על בסיס רווח; כתבי בנוסח "ROAS 5.92 מצביע על ביצועים חזקים, אך רווחיות הקמפיין עדיין לא מאומתת ללא COGS", וההחלטה תהיה מסוג "מועמד להגדלה — להשלים עלויות או להגדיר ROAS מינימלי ידני לפני שינוי תקציב", לא "לא לעשות כלום". אל תהיי שמרנית יתר על המידה: תשובה חלקית שאומרת בדיוק איפה הראיות נעצרות עדיפה על שתיקה.
הפלט נקרא על ידי מנהל/ת שיש להם 20 שניות. החלק העליון חייב להיות קצר מאוד; כל הפירוט הולך ל־evidence.
Respond with ONLY a JSON object, no markdown fences:
{"decision": "כותרת תובנה, עד 10 מילים, למשל: ביצועי המדיה חזקים — הרווחיות עדיין לא מאומתת",
 "conclusion": "משפט אחד או שניים: מה הביצועים אומרים, ואיפה הראיות נעצרות. שפה עסקית",
 "health": "strong | mixed | weak — קריאה יחסית של ביצועי הקמפיינים בחשבון, לא של רווחיות",
 "known": ["עד 4 עובדות ביצועים, כל אחת עד 12 מילים ומספר אחד, למשל: rosh Hasana 2026 מוביל בחשבון עם ROAS 6.65"],
 "unknown": ["עד 3 פערים בצד הרווח, רק אם קיימים, למשל: ROAS נקודת איזון לא ידוע — אין עלויות מוצר"],
 "actions": ["עד 3 צעדים קונקרטיים לשבוע הזה, כל אחד עד 15 מילים"],
 "evidence": ["עד 10 שורות, אחת לכל קמפיין משמעותי: שם · שלב במשפך · הצעד החלש ביותר עם המספר · המשמעות. כאן, ורק כאן, כל הפירוט"]}
כללים: שפטי ROAS טוב/רע מול נקודת האיזון של החנות; נקבי בשמות הקמפיינים האמיתיים כלשונם; צטטי את מספרי המשפך; ROAS מתחת לנקודת האיזון מפסיד כסף — אמרי זאת; אם שלב במשפך מציג 0 או לא זמין ייתכן שחסר אירוע פיקסל — הצביעי על בעיית מדידה במקום להמציא סיפור; לעולם אל תמציאי נתונים שלא הוצגו; סגנון: בלי מקף מחבר בין אות שימוש למספר או למילה לועזית — כתבי "הROAS", "ב2".`
    : `You are a senior Meta (Facebook/Instagram) media buyer AND conversion-rate analyst, reviewing an ad account for a store OWNER who is not a marketer. Answer in English only. Be specific, honest, and practical. Adapt to the business model you see in the data: if purchases drive the funnel it is e-commerce; if purchases are ~0 but link clicks / leads flow, treat it as lead generation and switch to lead-gen best practices.

STORE + CAMPAIGN DATA:
${buildDigest(input.overview, ctx)}

${buildDecisionFrame(input.overview, ctx, isHe)}

Produce, writing in English for the owner:
1) ROAS VERDICT — say plainly whether the account overall, and each meaningful campaign, has GOOD or BAD ROAS, judged against the store's BREAKEVEN ROAS above (not a generic 3x/4x). Name the numbers. If breakeven is unknown, say a precise verdict needs product costs.
2) FUNNEL STAGE per campaign — infer each campaign's role (top-of-funnel / awareness, mid / consideration, bottom / retargeting-conversion, or lead-gen). For each, find the WEAKEST stage — the biggest drop-off in its funnel — and say what it means in plain terms. Examples: impressions but low CTR = weak hook/creative; clicks but few landing views = slow page or broken link; landing views but little add-to-cart = product page / price / offer problem; add-to-cart but few purchases = checkout, shipping, trust or payment friction. If the audience-warming (top) stage is thin, say so.
3) NICHE-AWARE ACTION ITEMS — for the biggest problems, give the BEST PRACTICE for this kind of business (e-commerce or lead-gen as detected) AND a concrete, store-specific how-to the owner can do THIS WEEK. Make each action doable, not generic ("test 3 hook variations that open on the product benefit in the first 2s", not "improve creative").

Keep two axes apart and never blend them: campaign PERFORMANCE (ROAS, purchases, CTR, frequency, CPA, trend, who leads, who spends without buying, who is a scale candidate) — you may and must speak to these even without product costs; campaign PROFITABILITY (profitable/losing, whether more budget adds profit) — only when the store's breakeven ROAS above is known. If it is not: never write "the campaign is profitable" and never recommend more budget on profit grounds; write in the shape "ROAS 5.92 indicates strong performance, but campaign profitability is not yet verified without COGS", and make the decision "scale candidate — complete COGS or set a manual minimum ROAS before changing budget", not "do nothing". Do not over-hedge: a partial answer that says exactly where the evidence stops beats silence.
The reader is a manager with 20 seconds. The top must be very short; every detail goes into evidence.
Respond with ONLY a JSON object, no markdown fences:
{"decision": "an insight headline, ≤ 10 words, e.g.: Media performance is strong — profitability not yet verified",
 "conclusion": "one or two sentences: what performance says, and where the evidence stops. Business language",
 "health": "strong | mixed | weak — a relative read of campaign performance in this account, not of profitability",
 "known": ["≤ 4 performance facts, each ≤ 12 words with ONE number, e.g.: rosh Hasana 2026 leads the account at ROAS 6.65"],
 "unknown": ["≤ 3 profit-side gaps, only if they exist, e.g.: breakeven ROAS unknown — no product costs"],
 "actions": ["≤ 3 concrete steps for this week, each ≤ 15 words"],
 "evidence": ["≤ 10 lines, one per meaningful campaign: name · funnel stage · weakest step with the number · what it means. All the detail lives here and only here"]}
Rules: judge good/bad ROAS against the store's breakeven; name real campaigns verbatim; cite the funnel numbers; a ROAS below breakeven loses money — say it; if a funnel stage shows 0/n-a it may be a missing pixel event, so flag tracking rather than inventing a story; never invent data not shown.`;

  // Cached insights were served above; only a fresh generation spends.
  // Negative cache: a failed generation used to be retried on every
  // dashboard mount (the card fetches after load) — a full call, discarded,
  // per page view. Remember the failure for 30 minutes unless forced.
  const failedKey = `${key}:failed`;
  if (!input.force && db?.systemConfig) {
    const failedRow = (await db.systemConfig
      .findUnique({ where: { key: failedKey }, select: { updatedAt: true } })
      .catch(() => null)) as { updatedAt: Date } | null;
    if (failedRow && Date.now() - new Date(failedRow.updatedAt).getTime() < INSIGHT_FAILURE_TTL_MS) {
      throw new AppError("recent_failure", 503);
    }
  }
  const markFailed = async () => {
    if (!db?.systemConfig) return;
    const value = new Date().toISOString();
    await db.systemConfig.upsert({ where: { key: failedKey }, update: { value }, create: { key: failedKey, value } }).catch(() => null);
  };
  await assertLlmBudget(input.storeId, "meta_insight");
  let raw: string | null;
  try {
    raw = await callInsightModel(prompt, input.storeId);
  } catch (err) {
    await markFailed();
    console.error("[meta-campaigns-insight] model call failed:", err);
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(
      status === 429 || /insufficient_quota|rate.?limit/i.test(message)
        ? "provider_rate_limited"
        : `model_failed: ${message.slice(0, 160)}`,
      502
    );
  }
  if (!raw) {
    await markFailed();
    throw new AppError("model_no_output", 502);
  }
  const parsed = extractJson(raw);
  const modelInsight = parsed ? sanitizeInsight(parsed) : null;
  if (!modelInsight) {
    console.error("[meta-campaigns-insight] unparseable model output (first 400 chars):", raw.slice(0, 400));
    await markFailed();
    throw new AppError(parsed ? "model_output_incomplete" : "model_output_unparseable", 502);
  }
  const insight: MetaCampaignsInsight = {
    ...modelInsight,
    ...assessConfidence(input.overview, ctx, costCoverage),
    generatedAt: new Date().toISOString()
  };

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
