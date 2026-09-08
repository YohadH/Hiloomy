// Decision Inbox — composes the existing detection engines into Decision
// Objects (lib/domain/decision.ts) for the Today / Watchlist / Market /
// Memory / Data Health screens.
//
// Ledger: the Alert table. Every decision maps 1:1 to an alert row — the
// engines (stockout, ROAS collapse, competitor promo, commission leakage,
// silent product) already write rows with stable fingerprints, and the two
// derived kinds that have no engine (standalone-loss product, discount
// trade-off) are upserted here with the same discipline. A situation seen
// again tomorrow advances the SAME row (state + evidence snapshots) — it
// never mints a new decision id. Human decisions and judgments land in
// Alert.status + payloadJson, under keys upsertAlert preserves.
//
// Honesty rules enforced here, not in the UI:
//   - a fact that does not exist is `unavailable`, never guessed;
//   - exposure is labelled by what it is (recent revenue attached, commission
//     paid), never "money at risk"; profit exposure is null + "COGS missing"
//     when the product has no real cost;
//   - a product is only called unprofitable / over-discounted when its cost
//     is REAL (override or Shopify-supplied);
//   - a paid campaign is context, contributor or driver by a materiality
//     score — never "material" by default;
//   - ranking is by ₪ exposure, not by severity label; the per-domain cap is
//     a PRESENTATION cap, the ledger keeps everything.

import { cache } from "react";
import { getDb } from "@/lib/server/db";
import { listOpenAlerts, upsertAlert, resolveStaleAlerts } from "@/lib/services/alert-writer-service";
import { getActiveCampaignsByProduct, type LiveCampaignForProduct } from "@/lib/services/campaign-product-link-service";
import { getCommissionLeakageSummary, upsertCommissionLeakageAlert, type LeakageSummary } from "@/lib/services/affiliate-leakage-service";
import { buildStockoutImminentReport } from "@/lib/services/stockout-imminent-service";
import { buildRoasCollapseReport } from "@/lib/services/roas-collapse-service";
import { upsertSilentProductAlerts } from "@/lib/services/silent-product-alert-service";
import { measureOutcomesForResolvedAlerts } from "@/lib/services/alert-outcome-service";
import {
  buildCompetitorWeekSection,
  getCompetitorCrawlSummary,
  listCompetitors,
  upsertCompetitorResponseAlerts,
  type CompetitorWeekSection
} from "@/lib/services/competitor-intel-service";
import { getShopifySalesSummaryForWindow } from "@/lib/data/prisma-analytics-repository";
import { marketSignalsFromJson, type CompetitorMarketSignals } from "@/lib/clients/rivalsweeper-client";
import { buildTrafficSearchSummary } from "@/lib/services/traffic-search-summary-service";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";
import { computeCostCoverage } from "@/lib/services/cost-coverage";
import { buildSetupHealth, type SetupHealthReport } from "@/lib/services/setup-health-service";
import { getMetaCampaignsOverview, type MetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";
import { getBundleOverview } from "@/lib/services/bundle-profitability-service";
import { getLlmUsageToday, llmDailyBudgetUsd, LLM_GLOBAL_BUCKET } from "@/lib/services/llm-usage-service";
import { writeDecisionInboxSummary } from "@/lib/services/command-center-summary-service";
import type {
  Decision,
  DecisionInbox,
  DecisionLedgerState,
  DecisionOutcome,
  DecisionState,
  DecisionStatus,
  EvidenceFact,
  EvidenceQuality,
  EvidenceSnapshot,
  EvidenceSource,
  ExposureDim,
  HumanDecision,
  Judgment,
  JudgmentTag,
  Localized,
  MaterialityAssessment,
  MemoryEntry,
  WatchItem
} from "@/lib/domain/decision";

const DAY_MS = 86_400_000;
const MAX_INBOX_CARDS = 5;
// Presentation cap: at most this many cards from one decision kind on Today
// (a critical one may add a third). The ledger keeps every decision.
const MAX_CARDS_PER_KIND = 2;
const MAX_SNAPSHOTS = 30;

// Alert types that are rendered as decisions. Anything else stays an alert.
const DECISION_TYPES = [
  "stockout_imminent",
  "commission_leakage",
  "competitor_promo",
  "roas_collapse",
  "product_gone_silent",
  "decision_standalone_loss",
  "decision_discount_tradeoff"
] as const;

const L = (he: string, en: string): Localized => ({ he, en });
const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
// Card-level currency: ₪41.6K above ten thousand, exact below.
const ilsK = (n: number) => (Math.abs(n) >= 10_000 ? `₪${(n / 1000).toFixed(1)}K` : ils(n));
const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

type AlertRow = {
  id: string;
  storeId: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  recommendedAction: string | null;
  currentValue: unknown;
  previousValue: unknown;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  payloadJson: unknown;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
};

// ── Shared context (one fetch per request) ──────────────────────────────

interface InternalPulse {
  velocityChangePct: number | null;
  sales7: number | null;
  conversionRate: number | null;
  conversionQuality: EvidenceQuality;
  marginRate: number | null;
  marginQuality: EvidenceQuality;
  breakevenRoas: number | null;
}

interface ProductEcon {
  title: string;
  units14: number;
  net14: number;
  cogs14: number;
  realCost: boolean;
  inventory: number;
}

interface DecisionContext {
  storeId: string;
  now: Date;
  campaignsByProduct: Map<string, LiveCampaignForProduct[]>;
  campaignLinksExist: boolean;
  leakage: LeakageSummary | null;
  pulse: InternalPulse;
  bundleComponentIds: Set<string>;
  competitorNames: Map<string, string>;
  productEcon: Map<string, ProductEcon>;
}

async function buildPulse(storeId: string, now: Date): Promise<InternalPulse> {
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const d14 = new Date(now.getTime() - 14 * DAY_MS);
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const [cur, prev, traffic, margin] = await Promise.all([
    getShopifySalesSummaryForWindow(storeId, d7, now).catch(() => null),
    getShopifySalesSummaryForWindow(storeId, d14, d7).catch(() => null),
    buildTrafficSearchSummary(storeId, { start: d7, end: now }).catch(() => null),
    buildContributionMargin({ storeId, start: d30, end: now }).catch(() => null)
  ]);
  const velocityChangePct =
    cur && prev && prev.netSales > 0 ? (cur.netSales - prev.netSales) / prev.netSales : null;
  const conversionRate = traffic?.ga4?.conversionRate ?? null;
  const marginRate = margin && margin.totals.revenue > 0 ? margin.totals.contributionMarginRate : null;
  return {
    velocityChangePct,
    sales7: cur?.netSales ?? null,
    conversionRate,
    conversionQuality: conversionRate === null ? "unavailable" : "known",
    marginRate,
    marginQuality:
      marginRate === null ? "unavailable" : margin?.quality.accuracy === "estimated" ? "estimated" : "calculated",
    breakevenRoas: marginRate && marginRate > 0 ? 1 / marginRate : null
  };
}

// Per-product 14-day economics + current inventory, one query. Feeds the
// profit dimension of exposure and the "better SKU" candidate search.
async function loadProductEcon(storeId: string, now: Date): Promise<Map<string, ProductEcon>> {
  const db = getDb() as any;
  const d14 = new Date(now.getTime() - 14 * DAY_MS);
  const rows = (await db.$queryRaw`
    SELECT
      p.id AS product_id,
      p.title AS title,
      (p."costOverrideAmount" IS NOT NULL OR p."estimatedCost" > 0) AS real_cost,
      COALESCE(SUM(li.quantity), 0)::int AS units,
      COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0)::float AS net,
      COALESCE(SUM(li."estimatedCostAmount"), 0)::float AS cogs,
      GREATEST(COALESCE((SELECT SUM(v."inventoryQuantity") FROM "ProductVariant" v WHERE v."productId" = p.id), 0), 0)::int AS inventory
    FROM "Product" p
    JOIN "OrderLineItem" li ON li."productId" = p.id
    JOIN "Order" o ON o.id = li."orderId"
    WHERE p."storeId" = ${storeId}
      AND o."createdAt" >= ${d14} AND o."createdAt" <= ${now}
      AND o."cancelledAt" IS NULL AND o.test = false
    GROUP BY p.id, p.title
  `.catch(() => [])) as Array<{ product_id: string; title: string; real_cost: boolean; units: number; net: number; cogs: number; inventory: number }>;
  const map = new Map<string, ProductEcon>();
  for (const r of rows) {
    map.set(r.product_id, {
      title: r.title,
      units14: num(r.units),
      net14: num(r.net),
      cogs14: num(r.cogs),
      realCost: Boolean(r.real_cost),
      inventory: num(r.inventory)
    });
  }
  return map;
}

const getContext = cache(async (storeId: string): Promise<DecisionContext> => {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const [campaignsByProduct, leakage, pulse, bundles, competitors, productEcon, linkCount] = await Promise.all([
    getActiveCampaignsByProduct(storeId).catch(() => new Map<string, LiveCampaignForProduct[]>()),
    getCommissionLeakageSummary({ storeId, start: d30, end: now }).catch(() => null),
    buildPulse(storeId, now),
    getBundleOverview(storeId).catch(() => null),
    listCompetitors(storeId).catch(() => []),
    loadProductEcon(storeId, now),
    getDb()
      .campaignProductLink.count({ where: { storeId } })
      .catch(() => 0)
  ]);
  const bundleComponentIds = new Set<string>();
  for (const b of bundles?.bundles ?? []) {
    for (const c of b.components) bundleComponentIds.add(c.componentProductId);
  }
  return {
    storeId,
    now,
    campaignsByProduct,
    campaignLinksExist: linkCount > 0,
    leakage,
    pulse,
    bundleComponentIds,
    competitorNames: new Map(competitors.map((c) => [c.id, c.name])),
    productEcon
  };
});

// ── Ledger helpers ──────────────────────────────────────────────────────

function payloadOf(alert: AlertRow): Record<string, unknown> {
  return alert.payloadJson && typeof alert.payloadJson === "object"
    ? (alert.payloadJson as Record<string, unknown>)
    : {};
}

function humanOf(alert: AlertRow): HumanDecision {
  const raw = payloadOf(alert).humanDecision as Partial<HumanDecision> | undefined;
  if (raw && raw.choice) {
    return { choice: raw.choice, optionKey: raw.optionKey, decidedAt: raw.decidedAt, decidedBy: raw.decidedBy };
  }
  // Legacy rows closed from the Command Center — infer from status.
  if (alert.status === "ignored") return { choice: "ignored", decidedAt: alert.resolvedAt?.toISOString() };
  if (alert.status === "resolved" && alert.resolvedBy?.startsWith("user")) {
    return { choice: "approved", decidedAt: alert.resolvedAt?.toISOString() };
  }
  if (alert.status === "resolved") {
    return { choice: "auto_closed", decidedAt: alert.resolvedAt?.toISOString() };
  }
  return { choice: "pending" };
}

function outcomeOf(alert: AlertRow): DecisionOutcome | null {
  const raw = payloadOf(alert).outcome as
    | { verdict?: DecisionOutcome["verdict"]; summary?: Localized; measuredAt?: string }
    | undefined;
  if (!raw?.verdict || !raw.summary) return null;
  return { verdict: raw.verdict, summary: raw.summary, measuredAt: raw.measuredAt ?? "" };
}

function judgmentOf(alert: AlertRow): Judgment | null {
  const raw = payloadOf(alert).judgment as Partial<Judgment> | undefined;
  if (!raw || !Array.isArray(raw.tags)) return null;
  return {
    tags: raw.tags as JudgmentTag[],
    changedDecision: typeof raw.changedDecision === "boolean" ? raw.changedDecision : null,
    at: raw.at ?? "",
    by: raw.by ?? ""
  };
}

function ledgerOf(alert: AlertRow): DecisionLedgerState | null {
  const raw = payloadOf(alert).decision as Partial<DecisionLedgerState> | undefined;
  if (!raw || !raw.state || !raw.firstDetectedAt) return null;
  return {
    state: raw.state,
    firstDetectedAt: raw.firstDetectedAt,
    lastEvaluatedAt: raw.lastEvaluatedAt ?? raw.firstDetectedAt,
    surfacedAt: raw.surfacedAt ?? null,
    snapshots: Array.isArray(raw.snapshots) ? (raw.snapshots as EvidenceSnapshot[]) : []
  };
}

// When the signal itself dates from — the engine's period start when it
// says so, otherwise the row's creation. Never the cron's run time.
function signalTime(alert: AlertRow): string {
  const p = payloadOf(alert);
  const ps = typeof p.periodStart === "string" ? Date.parse(p.periodStart) : NaN;
  if (Number.isFinite(ps) && ps < alert.createdAt.getTime()) return new Date(ps).toISOString();
  return alert.createdAt.toISOString();
}

function fact(
  label: Localized,
  value: string | Localized | null,
  source: EvidenceFact["source"],
  sourceDetail: Localized,
  quality: EvidenceQuality,
  note?: Localized
): EvidenceFact {
  return { label, value, source, sourceDetail, quality, note };
}

function dim(label: Localized, value: string | null, quality: EvidenceQuality, note?: Localized): ExposureDim {
  return { label, value, quality, note };
}

function domainsOf(evidence: EvidenceFact[]): EvidenceSource[] {
  const out: EvidenceSource[] = [];
  for (const f of evidence) if (f.quality !== "unavailable" && !out.includes(f.source)) out.push(f.source);
  return out;
}

// Profit dimension for a product over 14 days — honest about missing cost.
function profitDim(econ: ProductEcon | undefined): ExposureDim {
  if (!econ || !econ.realCost) {
    return dim(L("השפעה על רווח", "Profit impact"), null, "unavailable", L("עלות מוצר (COGS) חסרה", "COGS missing"));
  }
  return dim(L("תרומה / 14 ימים", "Contribution / 14 days"), ils(econ.net14 - econ.cogs14), "calculated", L("מכירות נטו − עלות", "net sales − COGS"));
}

// Base of a Decision that every builder fills in; ledger state is attached
// afterwards by finish().
type DecisionDraft = Omit<Decision, "ledger" | "detectedAt" | "judgment" | "human" | "outcome" | "createdAt" | "critical" | "domains">;

function finish(alert: AlertRow, draft: DecisionDraft): Decision {
  const existing = ledgerOf(alert);
  const detectedAt = existing?.firstDetectedAt ?? signalTime(alert);
  return {
    ...draft,
    critical: alert.severity === "critical",
    domains: domainsOf(draft.evidence),
    createdAt: alert.createdAt.toISOString(),
    detectedAt,
    ledger: existing ?? {
      state: draft.status === "watch" || draft.status === "do_not_act" ? "watching" : "open",
      firstDetectedAt: detectedAt,
      lastEvaluatedAt: alert.createdAt.toISOString(),
      surfacedAt: null,
      snapshots: []
    },
    human: humanOf(alert),
    judgment: judgmentOf(alert),
    outcome: outcomeOf(alert)
  };
}

// ── Campaign materiality ────────────────────────────────────────────────
//
// Meta is "evidence only" until the numbers say otherwise. Spend share =
// weekly spend ÷ weekly product revenue; attributed share = campaign
// purchases ÷ product units (campaign-level purchases, so an upper bound —
// labelled estimated).
function assessMateriality(live: LiveCampaignForProduct[], revenue14: number, units14: number): MaterialityAssessment | null {
  if (live.length === 0) return null;
  const spend7 = live.reduce((s, c) => s + num(c.spend), 0);
  const purchases7 = live.reduce((s, c) => s + num(c.purchases), 0);
  const weeklyRevenue = revenue14 / 2;
  const weeklyUnits = units14 / 2;
  const spendShare = weeklyRevenue > 0 ? spend7 / weeklyRevenue : null;
  const attributedShare = weeklyUnits > 0 ? Math.min(1, purchases7 / weeklyUnits) : null;
  const level: MaterialityAssessment["level"] =
    (attributedShare ?? 0) >= 0.35 || (spendShare ?? 0) >= 0.25
      ? "driver"
      : (attributedShare ?? 0) >= 0.15 || (spendShare ?? 0) >= 0.1
        ? "material"
        : "evidence";
  const parts: string[] = [];
  const partsEn: string[] = [];
  if (spendShare !== null) {
    parts.push(`הוצאה ${pct(spendShare, 1)} מהכנסות המוצר`);
    partsEn.push(`spend ${pct(spendShare, 1)} of product revenue`);
  }
  if (attributedShare !== null) {
    parts.push(`עד ${pct(attributedShare)} מהיחידות מיוחסות לקמפיין`);
    partsEn.push(`up to ${pct(attributedShare)} of units attributable to the campaign`);
  }
  return {
    level,
    detail: L(parts.join(" · ") || "אין מספיק נתונים", partsEn.join(" · ") || "not enough data"),
    spendShare,
    attributedShare
  };
}

function materialityLabel(level: MaterialityAssessment["level"]): Localized {
  return level === "driver" ? L("מניע ההחלטה", "decision driver") : level === "material" ? L("תורם מהותי", "material contributor") : L("ראיה בלבד", "evidence only");
}

// ── Decision builders (one per kind) ────────────────────────────────────

function stockoutDecision(alert: AlertRow, ctx: DecisionContext): Decision {
  const p = payloadOf(alert);
  const title = alert.relatedEntityId ? alert.title.replace(/ עומד להיגמר במלאי$/, "") : alert.title;
  const inventory = num(p.currentInventory);
  const days = num(p.daysToStockout);
  const revenue14 = num(p.trailingRevenue);
  const units14 = num(p.trailingUnits);
  const fromPayload = Array.isArray(p.activeCampaigns) ? (p.activeCampaigns as LiveCampaignForProduct[]) : [];
  const live = fromPayload.length ? fromPayload : alert.relatedEntityId ? (ctx.campaignsByProduct.get(alert.relatedEntityId) ?? []) : [];
  const spend7 = live.reduce((s, c) => s + num(c.spend), 0);
  const materiality = assessMateriality(live, revenue14, units14);
  const campaignMatters = materiality !== null && materiality.level !== "evidence";
  const econ = alert.relatedEntityId ? ctx.productEcon.get(alert.relatedEntityId) : undefined;
  // Days cover decides urgency, not the campaign: ≤14 days needs a
  // replenishment call today; beyond that it is watched.
  const status: DecisionStatus = alert.severity === "critical" || alert.severity === "high" ? "act" : "watch";
  const leadDays = Math.max(1, Math.floor(days));

  const metaFact: EvidenceFact = materiality
    ? fact(
        L("קמפיין Meta", "Meta campaign"),
        L(`פעיל · ${materialityLabel(materiality.level).he}`, `Active · ${materialityLabel(materiality.level).en}`),
        "meta",
        L("Meta Ads × קישור קמפיין-מוצר", "Meta Ads × campaign-product link"),
        "estimated",
        L(`${ils(spend7)} / 7 ימים · ${materiality.detail.he}`, `${ils(spend7)} / 7 days · ${materiality.detail.en}`)
      )
    : ctx.campaignLinksExist
      ? fact(L("קמפיין Meta", "Meta campaign"), L("אין קמפיין מקושר פעיל", "No linked campaign active"), "meta", L("Meta Ads", "Meta Ads"), "known")
      : fact(L("קמפיין Meta", "Meta campaign"), null, "meta", L("Meta Ads", "Meta Ads"), "unavailable", L("לא קושרו קמפיינים למוצרים", "No campaigns are linked to products"));

  const evidence: EvidenceFact[] = [
    fact(L("מלאי", "Inventory"), `${inventory.toLocaleString("en-US")}`, "inventory", L("מלאי Shopify", "Shopify Inventory"), "known", L("יחידות נותרו", "units remaining")),
    fact(L("כיסוי מלאי", "Stock cover"), `${days.toFixed(1)}`, "inventory", L("מחושב מקצב 14 יום", "Calculated from 14-day velocity"), "calculated", L("ימים", "days cover")),
    fact(L("מכירות", "Sales"), ils(revenue14), "shopify", L("הזמנות Shopify", "Shopify Orders"), "known", L("הכנסה / 14 ימים אחרונים", "revenue / last 14 days")),
    metaFact,
    ...(econ && econ.realCost
      ? [fact(L("תרומה", "Contribution"), ils(econ.net14 - econ.cogs14), "profit", L("מכירות נטו − עלות, 14 ימים", "Net sales − COGS, 14 days"), "calculated")]
      : [fact(L("תרומה", "Contribution"), null, "profit", L("עלות מוצר", "Product cost"), "unavailable", L("עלות (COGS) חסרה למוצר", "COGS missing for this product"))])
  ];

  const options = campaignMatters
    ? [
        { key: "replenish_keep", label: L("לאשר חידוש מלאי היום ולהשאיר את הקמפיין", "Confirm replenishment today, keep the campaign"), recommended: true },
        { key: "replenish_pause", label: L("לאשר חידוש מלאי ולהשהות את הקמפיין עד שהמלאי חוזר", "Replenish and pause the campaign until stock arrives"), recommended: false },
        { key: "none", label: L("לא לפעול", "Take no action"), recommended: false }
      ]
    : [
        { key: "replenish", label: L("לאשר חידוש מלאי היום", "Confirm replenishment today"), recommended: true },
        { key: "let_run_out", label: L("לתת למלאי להיגמר", "Let it run out"), recommended: false },
        { key: "none", label: L("לא לפעול", "Take no action"), recommended: false }
      ];

  return finish(alert, {
    id: alert.id,
    kind: "stockout_imminent",
    status,
    title: L(`${title} צפוי להיגמר תוך ${days.toFixed(1)} ימים`, `${title} is likely to stock out in ${days.toFixed(1)} days`),
    whyNow: materiality
      ? L(`${ilsK(revenue14)} מכירות ב־14 יום · קמפיין Meta פעיל (${materialityLabel(materiality.level).he})`, `${ilsK(revenue14)} sales / 14 days · Meta campaign active (${materialityLabel(materiality.level).en})`)
      : L(`${ilsK(revenue14)} מכירות ב־14 יום · ${inventory} יחידות במלאי`, `${ilsK(revenue14)} sales / 14 days · ${inventory} units left`),
    question: campaignMatters
      ? L("האם לאשר חידוש מלאי היום — והאם הקמפיין שמזין את הביקוש צריך להשתנות?", "Should we confirm replenishment today, and does the campaign feeding this demand need to change?")
      : L("האם לאשר חידוש מלאי היום?", "Should we confirm replenishment today?"),
    trigger: L(
      `כיסוי המלאי ירד ל־${days.toFixed(1)} ימים לפי קצב המכירה ב־14 הימים האחרונים${materiality ? `; קמפיין Meta מקושר פעיל (${materiality.detail.he})` : ""}.`,
      `Stock cover fell to ${days.toFixed(1)} days at the last-14-day sales rate${materiality ? `; a linked Meta campaign is active (${materiality.detail.en})` : ""}.`
    ),
    evidence,
    exposure: [
      dim(L("הכנסה / 14 ימים", "Revenue / 14 days"), ilsK(revenue14), "known", L("מיוחסת למוצר", "attached to this SKU")),
      profitDim(econ),
      dim(L("כיסוי מלאי", "Inventory cover"), `${days.toFixed(1)}`, "calculated", L(`ימים · ${inventory} יחידות`, `days · ${inventory} units`))
    ],
    connected: {
      inputs: materiality ? [L("מלאי", "Inventory"), L("מכירות", "Sales"), L("Meta", "Meta")] : [L("מלאי", "Inventory"), L("מכירות", "Sales")],
      statement: campaignMatters
        ? L("מלאי נמוך + קצב מכירות חזק + רכישת לקוחות פעילה", "Low inventory + strong sales velocity + active acquisition")
        : materiality
          ? L("מלאי נמוך + קצב מכירות חזק (הקמפיין הוא הקשר, לא גורם)", "Low inventory + strong sales velocity (campaign is context, not a driver)")
          : L("מלאי נמוך + קצב מכירות חזק", "Low inventory + strong sales velocity"),
      conclusion: L("אזילת מלאי עלולה לקטוע ביקוש רווחי", "Stockout may interrupt profitable demand")
    },
    materiality,
    options,
    recommendation: campaignMatters
      ? L(
          `לאשר חידוש מלאי היום ולהשאיר את הקמפיין כמו שהוא. אם הספק לא מגיע בתוך ${leadDays} ימים, תיפתח החלטה נפרדת: להגן על המלאי הנותר או להמשיך למקסם ביקוש.`,
          `Confirm replenishment today and leave the campaign as is. If the supplier cannot deliver within ${leadDays} days, a separate decision opens: protect remaining inventory or keep maximizing demand.`
        )
      : materiality
        ? L(
            "נדרשת החלטת חידוש מלאי היום. לא לשנות את קמפיין ה־Meta: הוא קטן מכדי להשפיע על הביקוש עד שנדע אם האספקה מגיעה לפני ה־stockout.",
            "A replenishment decision is needed today. Do not change the Meta campaign: it is too small to move demand until we know whether supply arrives before the stockout."
          )
        : L("נדרשת החלטת חידוש מלאי היום. אין תנועה ממומנת מקושרת, כך שאין מה לשנות בקמפיינים.", "A replenishment decision is needed today. No paid traffic is attached, so there is nothing to change in campaigns."),
    reason: null,
    confidence: "medium",
    confidenceReason: L(
      "המלאי, קצב המכירה וההוצאה ידועים; זמן אספקה ועלות רכש חסרים, ולכן אי אפשר לדעת אם ה־stockout בכלל יקרה.",
      "Inventory, sales rate and spend are known; supplier lead time and purchase cost are missing, so whether the stockout will actually happen cannot be settled."
    ),
    missingEvidence: [
      L("זמן אספקה של הספק", "Supplier lead time"),
      L("עלות רכש / חידוש מלאי", "Purchase / replenishment cost"),
      ...(materiality ? [L("כמה מהביקוש באמת מגיע מהקמפיין (ייחוס ברמת המוצר)", "How much demand actually comes from the campaign (product-level attribution)")] : [])
    ],
    wouldChange: [
      L(`הספק מאשר שהמלאי מגיע בתוך ${leadDays} ימים — ההחלטה נסגרת.`, `Supplier confirms stock arrives within ${leadDays} days — the decision closes.`),
      ...(materiality
        ? [L(`הספק לא יכול לספק בתוך ${leadDays} ימים — נפתחת החלטה על הקמפיין: להגן על המלאי או למקסם ביקוש.`, `Supplier cannot deliver within ${leadDays} days — a campaign decision opens: protect inventory or maximize demand.`)]
        : []),
      L("קצב המכירה השבועי יורד ביותר מ־50%.", "Seven-day sales velocity falls by more than 50%.")
    ],
    unknown: materiality && !campaignMatters
      ? L("לא ידוע אם הקמפיין מייצר ביקוש שלא היה קורה בלעדיו; לפי הנתונים חלקו קטן.", "It is not known whether the campaign creates demand that would not exist without it; by the numbers its share is small.")
      : null,
    primaryAction: "review",
    rank: revenue14,
    entity: { type: "product", id: alert.relatedEntityId, label: title }
  });
}

function affiliateDecision(alert: AlertRow, ctx: DecisionContext): Decision {
  const s = ctx.leakage;
  const returningCommission = s?.returningCustomer.commission ?? num(alert.currentValue);
  const returningConversions = s?.returningCustomer.conversions ?? 0;
  const share = s ? s.leakageRate : null;
  const top = (s?.topLeakyAffiliates ?? []).slice(0, 3);
  const evidence: EvidenceFact[] = [
    fact(L("עמלות על לקוחות חוזרים", "Commissions on returning customers"), ils(returningCommission), "affiliate", L("ייחוס שותפים", "Affiliate attribution"), "known", L("30 הימים האחרונים", "last 30 days")),
    fact(L("לקוחות קיימים", "Existing customers"), `${returningConversions.toLocaleString("en-US")}`, "shopify", L("היסטוריית הזמנות Shopify", "Shopify order history"), "known", L("המרות של לקוחות חוזרים", "returning-customer conversions")),
    fact(L("חלק מכלל העמלות", "Share of affiliate commissions"), share === null ? null : pct(share), "affiliate", L("מחושב", "Calculated"), share === null ? "unavailable" : "calculated"),
    ...top.map((t) => fact(L("חשיפה גבוהה", "Highest exposure"), ils(t.returningCommission), "affiliate", L("ייחוס שותפים", "Affiliate attribution"), "known", L(t.name, t.name)))
  ];
  return finish(alert, {
    id: alert.id,
    kind: "commission_leakage",
    status: "test",
    title: L("האם אנחנו משלמים עמלת שותפים מיותרת?", "Are we overpaying affiliate commission?"),
    whyNow: L(
      `${ilsK(returningCommission)} עמלות על ${returningConversions} לקוחות חוזרים ב־30 יום${share === null ? "" : ` · ${pct(share)} מכלל העמלות`}`,
      `${ilsK(returningCommission)} commission on ${returningConversions} returning customers in 30 days${share === null ? "" : ` · ${pct(share)} of all commission`}`
    ),
    question: L("האם לקוחות חוזרים צריכים לייצר עמלת שותפים מלאה?", "Should returning customers generate full affiliate commission?"),
    trigger: L(
      `${share === null ? "חלק משמעותי" : pct(share)} מעמלות השותפים ב־30 הימים האחרונים שולמו על רכישות של לקוחות קיימים.`,
      `${share === null ? "A significant share" : pct(share)} of affiliate commission in the last 30 days was paid on purchases by existing customers.`
    ),
    evidence,
    exposure: [
      dim(L("עמלות על לקוחות חוזרים / 30 יום", "Commission on returning customers / 30 days"), ilsK(returningCommission), "known"),
      dim(L("השפעה על רווח", "Profit impact"), null, "unavailable", L("תלוי בתוספתיות שלא נמדדה", "depends on unmeasured incrementality")),
      dim(L("לקוחות מעורבים", "Customers involved"), `${returningConversions}`, "known")
    ],
    connected: {
      inputs: [L("שותפים", "Affiliate"), L("היסטוריית לקוחות", "Customer history")],
      statement: L("עמלה מלאה + לקוח שכבר קנה בעבר + ללא הוכחת תוספתיות", "Full commission + a customer who bought before + no proof of incrementality"),
      conclusion: L("ייתכן שמשלמים על ביקוש שהיה קיים ממילא", "We may be paying for demand that already existed")
    },
    materiality: null,
    options: [
      { key: "keep", label: L("להשאיר את המדיניות", "Keep the current policy"), recommended: false },
      { key: "review_returning", label: L("לבחון מדיניות עמלה ללקוחות חוזרים לפני שינוי גלובלי", "Review the commission policy for returning customers before changing the program globally"), recommended: true },
      { key: "remove_returning", label: L("לבטל עמלה על לקוחות חוזרים", "Remove commission on returning customers"), recommended: false }
    ],
    recommendation: L("לבחון את מדיניות העמלה עבור לקוחות קיימים שרכשו לאחרונה, לפני שינוי התוכנית לכולם.", "Review the commission policy for recent existing customers before changing the program globally."),
    reason: null,
    confidence: "medium",
    confidenceReason: L("הסכומים והלקוחות ידועים. לא ידוע אילו מהרכישות החוזרות נגרמו באמת על ידי השותף.", "The amounts and customers are known. It is not known which of the repeat purchases were genuinely caused by the affiliate."),
    missingEvidence: [L("תוספתיות — כמה מהרכישות החוזרות לא היו קורות בלי השותף", "Incrementality — how many repeat purchases would not have happened without the affiliate")],
    wouldChange: [L("ראיה שהרכישות החוזרות הגיעו דרך השותף (קופון/קליק ראשון) ולא מלקוח שחזר בעצמו.", "Evidence that the repeat purchases came through the affiliate (coupon / first touch) rather than a customer returning on their own.")],
    unknown: L("לא ניתן כרגע לקבוע כמה מהרכישות החוזרות האלה נגרמו באמת בזכות השותף.", "We cannot currently determine how many of these repeat purchases were genuinely caused by the affiliate."),
    primaryAction: "review",
    rank: returningCommission,
    entity: null
  });
}

function standaloneLossDecision(alert: AlertRow, ctx: DecisionContext): Decision {
  const p = payloadOf(alert);
  const title = String(p.title ?? alert.title);
  const units = num(p.units);
  const discounts = num(p.discounts);
  const net = num(p.net);
  const contribution = num(p.contribution);
  const inBundle = alert.relatedEntityId ? ctx.bundleComponentIds.has(alert.relatedEntityId) : false;
  const evidence: EvidenceFact[] = [
    fact(L("יחידות שנמכרו", "Units sold"), units.toLocaleString("en-US"), "shopify", L("הזמנות Shopify", "Shopify Orders"), "known", L("90 ימים", "90 days")),
    fact(L("הנחות", "Discounts"), ils(discounts), "shopify", L("הזמנות Shopify", "Shopify Orders"), "known", L("90 ימים", "90 days")),
    fact(L("תרומת המוצר", "Product contribution"), ils(contribution), "profit", L("מכירות נטו − עלות", "Net sales − COGS"), "calculated", L("90 ימים, ברמת המוצר בלבד", "90 days, SKU standalone")),
    fact(L("כיסוי עלויות", "COGS coverage"), "100%", "profit", L("עלות מוצר אמיתית", "Real product cost on file"), "known"),
    fact(L("כלכלת הסל", "Basket-level economics"), inBundle ? L("מוגדר כרכיב בחבילה", "Defined as a bundle component") : null, "profit", L("מבנה סלים", "Basket structure"), inBundle ? "estimated" : "unavailable", inBundle ? undefined : L("לא זמין כרגע", "currently unavailable"))
  ];
  return finish(alert, {
    id: alert.id,
    kind: "decision_standalone_loss",
    status: "do_not_act",
    title: L(`${title} מפסיד ${ilsK(Math.abs(contribution))} ב־90 יום — אבל עדיין לא להסיר את ההצעה`, `${title} loses ${ilsK(Math.abs(contribution))} over 90 days — but don't remove the offer yet`),
    whyNow: L(`${units} יחידות · ${ilsK(discounts)} הנחות · עלות אמיתית ידועה · כלכלת הסל לא נמדדה`, `${units} units · ${ilsK(discounts)} discounts · real cost on file · basket economics not measured`),
    question: L("האם להסיר את ההצעה על סמך הכלכלה של המוצר בפני עצמו?", "Should the offer be removed based on the SKU's standalone economics?"),
    trigger: L(`תרומת המוצר ב־90 הימים האחרונים שלילית (${ils(contribution)}) עם עלות אמיתית ידועה.`, `The SKU's contribution in the last 90 days is negative (${ils(contribution)}) with a real cost on file.`),
    evidence,
    exposure: [
      dim(L("מכירות נטו / 90 יום", "Net sales / 90 days"), ilsK(net), "known"),
      dim(L("תרומה / 90 יום", "Contribution / 90 days"), ils(contribution), "calculated", L("ברמת המוצר בלבד", "SKU standalone")),
      dim(L("הנחות שניתנו", "Discounts given"), ilsK(discounts), "known")
    ],
    connected: {
      inputs: [L("מכירות", "Sales"), L("הנחות", "Discounts"), L("עלות", "COGS")],
      statement: L("נפח מכירות גבוה + הנחה עמוקה + עלות אמיתית מעל המחיר נטו", "High volume + deep discount + real cost above net price"),
      conclusion: L("הפסד ברמת המוצר — אבל בלי ראיה ברמת ההזמנה", "Standalone loss — but no order-level evidence")
    },
    materiality: null,
    options: [
      { key: "remove", label: L("להסיר את ההצעה", "Remove the offer"), recommended: false },
      { key: "keep_measure", label: L("להשאיר ולמדוד תרומה ברמת הסל", "Keep and measure basket-level contribution"), recommended: true },
      { key: "reduce_discount", label: L("להקטין את ההנחה", "Reduce the discount"), recommended: false }
    ],
    recommendation: L("לא להסיר את ההצעה על סמך הכלכלה של המוצר בפני עצמו בלבד.", "Do not remove the offer based only on the SKU's standalone economics."),
    reason: L("ייתכן שהמוצר משמש כמוצר פיתוי בתוך סלים רב־מוצריים רווחיים.", "This product may function as a loss leader inside profitable multi-product baskets."),
    confidence: "low",
    confidenceReason: L("הכלכלה ברמת המוצר ידועה, אבל תרומת ההזמנות שבהן הוא נמכר לא נמדדה — וזה מה שמכריע.", "The SKU-level economics are known, but the contribution of the orders it sells in has not been measured — and that is what decides."),
    missingEvidence: [L("תרומה ברמת ההזמנה / הסל", "Order / basket-level contribution")],
    wouldChange: [L("אישור של תרומה שלילית ברמת ההזמנה / הסל המלא.", "Confirmed negative contribution at the full order / basket level.")],
    unknown: null,
    primaryAction: "see_evidence",
    rank: Math.abs(contribution),
    entity: { type: "product", id: alert.relatedEntityId, label: title }
  });
}

function discountTradeoffDecision(alert: AlertRow): Decision {
  const p = payloadOf(alert);
  const title = String(p.title ?? alert.title);
  const units = num(p.units);
  const gross = num(p.gross);
  const discounts = num(p.discounts);
  const net = num(p.net);
  const contribution = num(p.contribution);
  const discountRate = gross > 0 ? discounts / gross : 0;
  const marginRate = net > 0 ? contribution / net : 0;
  const evidence: EvidenceFact[] = [
    fact(L("יחידות שנמכרו", "Units sold"), units.toLocaleString("en-US"), "shopify", L("הזמנות Shopify", "Shopify Orders"), "known", L("30 ימים", "30 days")),
    fact(L("שיעור הנחה", "Discount rate"), pct(discountRate), "shopify", L("הנחות ÷ מחיר מלא", "Discounts ÷ list price"), "calculated", L(`${ils(discounts)} הנחות`, `${ils(discounts)} in discounts`)),
    fact(L("תרומה", "Contribution"), ils(contribution), "profit", L("מכירות נטו − עלות", "Net sales − COGS"), "calculated", L(`${pct(marginRate)} מהמכירות נטו`, `${pct(marginRate)} of net sales`)),
    fact(L("כיסוי עלויות", "COGS coverage"), "100%", "profit", L("עלות מוצר אמיתית", "Real product cost on file"), "known"),
    fact(L("גמישות ביקוש", "Price sensitivity"), null, "shopify", L("ניסוי מחיר", "Price test"), "unavailable", L("לא ידוע כמה מהביקוש תלוי בהנחה", "unknown how much demand depends on the discount"))
  ];
  return finish(alert, {
    id: alert.id,
    kind: "decision_discount_tradeoff",
    status: "test",
    title: L(`${title} מוכר חזק — אבל ההנחה של ${pct(discountRate)} משאירה תרומה של ${pct(marginRate)} בלבד`, `${title} sells strongly — but the ${pct(discountRate)} discount leaves only ${pct(marginRate)} contribution`),
    whyNow: L(`${units} יחידות ב־30 יום · ${ilsK(discounts)} הנחות · תרומה ${ilsK(contribution)}`, `${units} units in 30 days · ${ilsK(discounts)} discounts · ${ilsK(contribution)} contribution`),
    question: L("האם להמשיך את ההנחה על מוצר שמוכר חזק, למרות שהיא מורידה את התרומה?", "Should the discount continue on a strong-selling product although it lowers contribution?"),
    trigger: L(`המוצר מכר ${units} יחידות ב־30 יום עם הנחה ממוצעת של ${pct(discountRate)}, והתרומה נשארה ${pct(marginRate)} מהמכירות נטו.`, `The product sold ${units} units in 30 days at an average ${pct(discountRate)} discount, leaving contribution at ${pct(marginRate)} of net sales.`),
    evidence,
    exposure: [
      dim(L("מכירות נטו / 30 יום", "Net sales / 30 days"), ilsK(net), "known"),
      dim(L("תרומה / 30 יום", "Contribution / 30 days"), ilsK(contribution), "calculated", L(`${pct(marginRate)} מרווח`, `${pct(marginRate)} margin`)),
      dim(L("הנחות שניתנו / 30 יום", "Discounts given / 30 days"), ilsK(discounts), "known")
    ],
    connected: {
      inputs: [L("מכירות", "Sales"), L("הנחות", "Discounts"), L("רווח", "Profit")],
      statement: L("מכירות חזקות + הנחה עמוקה + תרומה נמוכה", "Strong sales + deep discount + thin contribution"),
      conclusion: L("ההנחה קונה נפח, לא רווח", "The discount buys volume, not profit")
    },
    materiality: null,
    options: [
      { key: "keep", label: L("להשאיר את ההנחה", "Keep the discount"), recommended: false },
      { key: "test_smaller", label: L("לבדוק הנחה קטנה יותר על חלק מהתנועה", "Test a smaller discount on part of the traffic"), recommended: true },
      { key: "remove", label: L("להסיר את ההנחה", "Remove the discount"), recommended: false }
    ],
    recommendation: L("לבדוק הנחה קטנה יותר לפני שמחליטים: המוצר מוכר חזק, אבל ההנחה משאירה מעט תרומה.", "Test a smaller discount before deciding: the product sells strongly, but the discount leaves little contribution."),
    reason: L("אם הביקוש נשאר עם הנחה קטנה יותר, כל נקודת הנחה שנחסכת היא תרומה ישירה.", "If demand holds at a smaller discount, every discount point saved is direct contribution."),
    confidence: "medium",
    confidenceReason: L("המכירות, ההנחות והעלות ידועים; לא ידוע כמה מהביקוש תלוי בהנחה, ולכן זו בדיקה ולא שינוי.", "Sales, discounts and cost are known; how much demand depends on the discount is not, which is why this is a test, not a change."),
    missingEvidence: [L("גמישות ביקוש להנחה", "Demand sensitivity to the discount")],
    wouldChange: [L("המכירות יורדות ביותר מ־25% עם הנחה קטנה יותר — ההנחה נשארת.", "Sales drop by more than 25% at a smaller discount — the discount stays."), L("המוצר משמש כמוצר פיתוי בסלים רווחיים.", "The product acts as a loss leader in profitable baskets.")],
    unknown: null,
    primaryAction: "review",
    rank: discounts,
    entity: { type: "product", id: alert.relatedEntityId, label: title }
  });
}

// Campaign × Product: a campaign is still spending on a product that stopped
// selling. The management trade-off is reallocation, not "product is silent".
function reallocationDecision(alert: AlertRow, ctx: DecisionContext): Decision | null {
  const p = payloadOf(alert);
  const liveNames = Array.isArray(p.liveCampaigns) ? (p.liveCampaigns as string[]) : [];
  if (liveNames.length === 0) return null;
  const title = alert.title.replace(/^"|" — .*$/g, "");
  const baselineDaily = num(p.baselineDaily);
  const actualRecent = num(p.actualRecent);
  const expectedRecent = num(p.expectedRecent);
  const lost = num(p.lostEstimate);
  const live = alert.relatedEntityId ? (ctx.campaignsByProduct.get(alert.relatedEntityId) ?? []) : [];
  const spend7 = live.reduce((s, c) => s + num(c.spend), 0);
  const stock = p.stock == null ? null : num(p.stock);

  // Best alternative: a product with real cost, healthy contribution, and
  // more than 30 days of cover at its current rate. Unavailable when none.
  let candidate: { id: string; econ: ProductEcon; contribution: number; cover: number } | null = null;
  for (const [id, econ] of ctx.productEcon) {
    if (id === alert.relatedEntityId || !econ.realCost || econ.units14 <= 0) continue;
    const contribution = econ.net14 - econ.cogs14;
    const cover = econ.inventory / (econ.units14 / 14);
    if (contribution <= 0 || cover < 30) continue;
    if (!candidate || contribution > candidate.contribution) candidate = { id, econ, contribution, cover };
  }

  const evidence: EvidenceFact[] = [
    fact(L("קמפיין פעיל", "Live campaign"), liveNames.join(", "), "meta", L("Meta Ads × קישור קמפיין-מוצר", "Meta Ads × campaign-product link"), "known", spend7 > 0 ? L(`${ils(spend7)} / 7 ימים`, `${ils(spend7)} / 7 days`) : undefined),
    fact(L("מכירות בפועל", "Actual sales"), ils(actualRecent), "shopify", L("הזמנות Shopify, 14 ימים", "Shopify Orders, 14 days"), "known", L(`צפוי לפי הקצב: ${ils(expectedRecent)}`, `expected at baseline: ${ils(expectedRecent)}`)),
    fact(L("קצב בסיס", "Baseline rate"), ils(baselineDaily), "shopify", L("90 ימי בסיס", "90-day baseline"), "calculated", L("ליום", "per day")),
    fact(L("מלאי", "Inventory"), stock === null ? null : `${stock}`, "inventory", L("מלאי Shopify", "Shopify Inventory"), stock === null ? "unavailable" : "known", stock === null ? undefined : L("יחידות", "units")),
    candidate
      ? fact(L("מוצר חלופי", "Alternative SKU"), candidate.econ.title, "profit", L("תרומה 14 יום × כיסוי מלאי", "14-day contribution × stock cover"), "calculated", L(`${ils(candidate.contribution)} תרומה / 14 יום · ${Math.round(candidate.cover)} ימי כיסוי`, `${ils(candidate.contribution)} contribution / 14 days · ${Math.round(candidate.cover)} days cover`))
      : fact(L("מוצר חלופי", "Alternative SKU"), null, "profit", L("תרומה × מלאי", "Contribution × inventory"), "unavailable", L("אין מוצר עם עלות אמיתית, תרומה חיובית ומלאי ל־30 יום", "No product with a real cost, positive contribution and 30 days of cover"))
  ];
  return finish(alert, {
    id: alert.id,
    kind: "campaign_reallocation",
    status: "change_plan",
    title: L(`הקמפיין ${liveNames[0]} מקדם את ${title} — שהפסיק למכור`, `Campaign ${liveNames[0]} promotes ${title} — which stopped selling`),
    whyNow: L(`${ilsK(actualRecent)} מכירות מול ${ilsK(expectedRecent)} צפוי ב־14 יום${spend7 > 0 ? ` · ${ilsK(spend7)} הוצאה / 7 ימים` : ""}`, `${ilsK(actualRecent)} sales vs ${ilsK(expectedRecent)} expected in 14 days${spend7 > 0 ? ` · ${ilsK(spend7)} spend / 7 days` : ""}`),
    question: L("האם להעביר תקציב ממוצר שלא מגיב למוצר עם מלאי ומרווח טובים יותר?", "Should we move spend from a SKU that isn't responding to a SKU with better stock and margin?"),
    trigger: L(`המוצר מכר ${pct(expectedRecent > 0 ? actualRecent / expectedRecent : 0)} מהצפוי ב־14 הימים האחרונים בזמן שקמפיין מקושר ממשיך להוציא עליו.`, `The product sold ${pct(expectedRecent > 0 ? actualRecent / expectedRecent : 0)} of expected in the last 14 days while a linked campaign keeps spending on it.`),
    evidence,
    exposure: [
      dim(L("הכנסה שהוחמצה / 14 יום", "Missed revenue / 14 days"), ilsK(lost), "estimated", L("מול קצב הבסיס", "vs baseline rate")),
      spend7 > 0 ? dim(L("הוצאת קמפיין / 7 ימים", "Campaign spend / 7 days"), ilsK(spend7), "known") : dim(L("הוצאת קמפיין", "Campaign spend"), null, "unavailable", L("הקמפיין לא נמצא בחלון 7 הימים", "campaign not in the 7-day window")),
      candidate ? dim(L("תרומת החלופה / 14 יום", "Alternative's contribution / 14 days"), ilsK(candidate.contribution), "calculated", L(candidate.econ.title, candidate.econ.title)) : dim(L("תרומת החלופה", "Alternative's contribution"), null, "unavailable", L("אין חלופה מזוהה", "no alternative identified"))
    ],
    connected: {
      inputs: [L("Meta", "Meta"), L("מכירות", "Sales"), ...(candidate ? [L("מלאי", "Inventory"), L("רווח", "Profit")] : [])],
      statement: candidate
        ? L("קמפיין פעיל + מוצר שהשתתק + מוצר אחר עם מלאי ומרווח", "Active campaign + a product gone silent + another SKU with stock and margin")
        : L("קמפיין פעיל + מוצר שהשתתק", "Active campaign + a product gone silent"),
      conclusion: L("התקציב עובד על ביקוש שנעלם", "The budget is working on demand that disappeared")
    },
    materiality: null,
    options: [
      { key: "move", label: candidate ? L(`להעביר את התקציב ל־${candidate.econ.title}`, `Move the budget to ${candidate.econ.title}`) : L("להעביר את התקציב למוצר אחר", "Move the budget to another SKU"), recommended: candidate !== null },
      { key: "pause", label: L("להשהות את הקמפיין עד שהמוצר חוזר למכור", "Pause the campaign until the product sells again"), recommended: candidate === null },
      { key: "keep", label: L("להשאיר כמו שהוא", "Keep as is"), recommended: false }
    ],
    recommendation: candidate
      ? L(`להעביר את התקציב של ${liveNames[0]} ל־${candidate.econ.title}: תרומה חיובית ו־${Math.round(candidate.cover)} ימי מלאי.`, `Move ${liveNames[0]}'s budget to ${candidate.econ.title}: positive contribution and ${Math.round(candidate.cover)} days of stock.`)
      : L(`להשהות את ${liveNames[0]} עד שהמוצר חוזר למכור; לא זוהה מוצר חלופי עם עלות אמיתית ומלאי מספיק.`, `Pause ${liveNames[0]} until the product sells again; no alternative SKU with a real cost and enough stock was identified.`),
    reason: null,
    confidence: candidate ? "medium" : "low",
    confidenceReason: L("ההשתתקות ידועה מהזמנות; לא ידוע למה המוצר הפסיק למכור (דף מוצר, מלאי בווריאנטים, קריאייטיב).", "The silence is known from orders; why the product stopped selling (product page, variant stock, creative) is not."),
    missingEvidence: [L("סיבת ההשתתקות", "Cause of the silence"), L("ביצועי הקמפיין ברמת המוצר", "Campaign performance at the product level")],
    wouldChange: [L("המוצר חוזר ל־70% מקצב הבסיס תוך 7 ימים.", "The product returns to 70% of its baseline rate within 7 days."), L("הקמפיין מוכר מוצרים אחרים בכמות שמצדיקה את ההוצאה.", "The campaign sells other products in volumes that justify the spend.")],
    unknown: null,
    primaryAction: "review",
    rank: lost + spend7,
    entity: { type: "product", id: alert.relatedEntityId, label: title }
  });
}

function competitorDecision(alert: AlertRow, ctx: DecisionContext): Decision {
  const p = payloadOf(alert);
  const competitorId = String(p.competitorId ?? "");
  const name = ctx.competitorNames.get(competitorId) ?? String(p.domain ?? alert.title);
  const discount = alert.currentValue == null ? null : num(alert.currentValue);
  const startedDays = Math.max(0, Math.round((ctx.now.getTime() - alert.createdAt.getTime()) / DAY_MS));
  const v = ctx.pulse.velocityChangePct;
  const demandHit = v !== null && v <= -0.12;
  const status: DecisionStatus = demandHit ? "act" : "watch";
  const velocityLabel = v === null ? null : Math.abs(v) < 0.05 ? L("יציב", "stable") : v > 0 ? L(`עלייה ${pct(v)}`, `up ${pct(v)}`) : L(`ירידה ${pct(Math.abs(v))}`, `down ${pct(Math.abs(v))}`);
  const market = marketSignalsFromJson({ market: p.market });
  const marketFacts: EvidenceFact[] = market
    ? [
        ...(market.markdowns.count > 0
          ? [fact(L("הורדות מחיר", "Price cuts"), `${market.markdowns.count}`, "market", L("מעקב קטלוג", "Catalog monitoring"), "known", market.markdowns.maxDropPct !== null ? L(`העמוקה ${Math.round(market.markdowns.maxDropPct)}%`, `deepest ${Math.round(market.markdowns.maxDropPct)}%`) : undefined)]
          : []),
        ...(market.outOfStock.count > 0
          ? [fact(L("אזל אצל המתחרה", "Out of stock at competitor"), `${market.outOfStock.count}`, "market", L("מעקב קטלוג", "Catalog monitoring"), "known", L("מוצרים — הזדמנות לביקוש שמחפש חלופה", "products — demand that may look for an alternative"))]
          : []),
        ...(market.adPresence
          ? [fact(L("מודעות פעילות", "Active ads"), `${market.adPresence.activeAds}`, "market", L("ספריית המודעות של Meta", "Meta ad library"), "known", L(`מתוך ${market.adPresence.totalAds} בסך הכול`, `of ${market.adPresence.totalAds} total`))]
          : []),
        ...(market.priceIndex && market.priceIndex.medianPrice !== null
          ? [fact(L("מחיר חציוני בקטלוג", "Catalog median price"), `₪${Math.round(market.priceIndex.medianPrice)}`, "market", L("מדד מחירים", "Price index"), "known", market.priceIndex.onSalePct !== null ? L(`${market.priceIndex.onSalePct}% מהקטלוג במבצע`, `${market.priceIndex.onSalePct}% of catalog on sale`) : undefined)]
          : [])
      ]
    : [];
  const evidence: EvidenceFact[] = [
    fact(L("מבצע מתחרה", "Competitor promotion"), discount === null ? L("מבצע פעיל", "Promotion active") : `${discount}%`, "market", L("מעקב מתחרים", "Competitor monitoring"), "known", L(`התחיל לפני ${startedDays} ימים`, `started ${startedDays} days ago`)),
    ...marketFacts,
    fact(L("מוצר תואם", "Matched product"), null, "market", L("התאמת מוצרים", "Product matching"), "unavailable", L("התאמה בין מוצרי המתחרה למוצרים שלכם עדיין לא זמינה", "Competitor ↔ your-SKU matching is not available yet")),
    fact(L("קצב מכירות", "Sales velocity"), velocityLabel, "shopify", L("הזמנות Shopify, 7 ימים מול 7 קודמים", "Shopify Orders, 7d vs prior 7d"), v === null ? "unavailable" : "calculated"),
    fact(L("המרה", "Conversion"), ctx.pulse.conversionRate === null ? null : pct(ctx.pulse.conversionRate, 1), "shopify", L("GA4", "GA4"), ctx.pulse.conversionQuality, ctx.pulse.conversionRate === null ? L("GA4 לא מחובר", "GA4 not connected") : undefined),
    fact(L("מרווח", "Margin"), ctx.pulse.marginRate === null ? null : pct(ctx.pulse.marginRate), "profit", L("מרווח תרומה, 30 ימים", "Contribution margin, 30 days"), ctx.pulse.marginQuality)
  ];
  return finish(alert, {
    id: alert.id,
    kind: "competitor_promo",
    status,
    title: demandHit
      ? L(`${name} השיקו מבצע${discount !== null ? ` של ${discount}%` : ""} — הביקוש שלכם נפגע`, `${name} launched a ${discount !== null ? `${discount}% ` : ""}promotion — your demand is affected`)
      : L(`${name} השיקו מבצע${discount !== null ? ` של ${discount}%` : ""} — עדיין אין הצדקה לתגובה`, `${name} launched a ${discount !== null ? `${discount}% ` : ""}promotion — no response justified yet`),
    whyNow: L(
      `${market && market.markdowns.count > 0 ? `${market.markdowns.count} הורדות מחיר${discount !== null ? ` עד ${discount}%` : ""}` : `מבצע${discount !== null ? ` ${discount}%` : ""}`} מלפני ${startedDays} ימים · המכירות שלכם: ${velocityLabel ? velocityLabel.he : "אין מדידה"}`,
      `${market && market.markdowns.count > 0 ? `${market.markdowns.count} price cuts${discount !== null ? ` up to ${discount}%` : ""}` : `${discount !== null ? `${discount}% ` : ""}promotion`} ${startedDays} days ago · your sales: ${velocityLabel ? velocityLabel.en : "not measurable"}`
    ),
    question: L("האם להשוות את ההנחה של המתחרה?", "Should we match the competitor's discount?"),
    trigger: L(`זוהה מבצע חדש אצל ${name}${discount !== null ? ` (עד ${discount}%)` : ""}.`, `A new promotion was detected at ${name}${discount !== null ? ` (up to ${discount}%)` : ""}.`),
    evidence,
    exposure: [
      ctx.pulse.sales7 === null ? dim(L("מכירות נטו / 7 ימים", "Net sales / 7 days"), null, "unavailable") : dim(L("מכירות נטו / 7 ימים", "Net sales / 7 days"), ilsK(ctx.pulse.sales7), "known", velocityLabel ?? undefined),
      ctx.pulse.marginRate === null ? dim(L("מרווח", "Margin"), null, "unavailable", L("כיסוי עלויות חסר", "cost coverage missing")) : dim(L("מרווח תרומה", "Contribution margin"), pct(ctx.pulse.marginRate), ctx.pulse.marginQuality),
      dim(L("משך המבצע", "Promotion age"), `${startedDays}`, "known", L("ימים", "days"))
    ],
    connected: {
      inputs: [L("שוק", "Market"), L("מכירות", "Sales"), L("רווח", "Profit")],
      statement: demandHit
        ? L("מבצע מתחרה + ירידה בקצב המכירות שלכם", "Competitor promotion + a drop in your sales velocity")
        : L("מבצע מתחרה + מכירות שלכם יציבות + מרווח בריא", "Competitor promotion + your sales stable + healthy margin"),
      conclusion: demandHit ? L("המבצע כנראה מזיז ביקוש ממכם", "The promotion is probably moving demand away from you") : L("אין ראיה פנימית שהמבצע משפיע — תגובת מחיר תעלה מרווח בלי סיבה", "No internal evidence the promotion bites — a price response would cost margin for nothing")
    },
    materiality: null,
    options: [
      { key: "match", label: L("להשוות את ההנחה", "Match the discount"), recommended: demandHit },
      { key: "targeted", label: L("הצעת־נגד ממוקדת למוצר התואם", "Targeted counter-offer on the matched product"), recommended: false },
      { key: "hold", label: L("לא להשוות עדיין — להמשיך במעקב", "Do not match yet — keep watching"), recommended: !demandHit }
    ],
    recommendation: demandHit
      ? L("לבחון תגובה ממוקדת: המכירות ירדו מאז שהמבצע התחיל.", "Consider a targeted response: sales have dropped since the promotion started.")
      : L("לא להשוות את ההנחה עדיין.", "Do not match the discount yet."),
    reason: demandHit
      ? L(`קצב המכירות ירד ב־${pct(Math.abs(v ?? 0))} מול השבוע הקודם.`, `Sales velocity is down ${pct(Math.abs(v ?? 0))} versus the prior week.`)
      : L("אין כרגע ראיה פנימית לכך שהמבצע של המתחרה משפיע על הביקוש.", "There is currently no internal evidence that the competitor promotion is affecting demand."),
    confidence: v === null ? "low" : "medium",
    confidenceReason: v === null
      ? L("אין מספיק מכירות בשני חלונות של 7 ימים כדי למדוד שינוי בקצב.", "Not enough sales in two 7-day windows to measure a velocity change.")
      : L("קצב המכירות נמדד; ההתאמה בין מוצרי המתחרה למוצרים שלכם והמרה לא זמינות.", "Sales velocity is measured; competitor-to-SKU matching and conversion are not available."),
    missingEvidence: [L("התאמת מוצר מתחרה ↔ מוצר שלכם", "Competitor SKU ↔ your SKU match"), ...(ctx.pulse.conversionRate === null ? [L("מגמת המרה (GA4)", "Conversion trend (GA4)")] : [])],
    wouldChange: [L("ההמרה יורדת ביותר מ־8%.", "Conversion drops >8%."), L("קצב המכירות יורד ביותר מ־12%.", "Sales velocity drops >12%."), L("המבצע נמשך יותר מ־7 ימים.", "Promotion continues >7 days.")],
    unknown: null,
    primaryAction: "review",
    rank: 0,
    entity: { type: "competitor", id: competitorId, label: name }
  });
}

function roasDecision(alert: AlertRow, ctx: DecisionContext): Decision {
  const p = payloadOf(alert);
  const campaign = String(p.campaignName ?? alert.title);
  const spend = num(p.spend);
  const roas = p.roas == null ? null : num(p.roas);
  const purchases = num(p.purchases);
  const breakeven = ctx.pulse.breakevenRoas;
  const belowBreakeven = roas !== null && breakeven !== null && roas < breakeven;
  const evidence: EvidenceFact[] = [
    fact(L("הוצאה", "Spend"), ils(spend), "meta", L("Meta Ads", "Meta Ads"), "known", L("בחלון הדוח", "in the report window")),
    fact(L("רכישות", "Purchases"), purchases.toLocaleString("en-US"), "meta", L("Meta Ads", "Meta Ads"), "known"),
    fact(L("ROAS", "ROAS"), roas === null ? null : `${roas.toFixed(1)}×`, "meta", L("Meta Ads", "Meta Ads"), roas === null ? "unavailable" : "known"),
    fact(L("ROAS נקודת איזון", "Breakeven ROAS"), breakeven === null ? null : `${breakeven.toFixed(1)}×`, "profit", L("1 ÷ שיעור מרווח תרומה", "1 ÷ contribution margin rate"), breakeven === null ? "unavailable" : ctx.pulse.marginQuality)
  ];
  return finish(alert, {
    id: alert.id,
    kind: "roas_collapse",
    status: "change_plan",
    title: L(`הקמפיין ${campaign} איבד יעילות`, `Campaign ${campaign} lost efficiency`),
    whyNow: L(`${ilsK(spend)} הוצאה · ROAS ${roas === null ? "לא ידוע" : `${roas.toFixed(1)}×`}${breakeven !== null ? ` מול נקודת איזון ${breakeven.toFixed(1)}×` : ""}`, `${ilsK(spend)} spend · ROAS ${roas === null ? "unknown" : `${roas.toFixed(1)}×`}${breakeven !== null ? ` vs breakeven ${breakeven.toFixed(1)}×` : ""}`),
    question: L("האם להמשיך להשקיע בקמפיין הזה במתכונת הנוכחית?", "Should this campaign keep running in its current form?"),
    trigger: L("ה־ROAS של הקמפיין ירד מתחת ליעד בחלון הדוח.", "The campaign's ROAS fell below target in the report window."),
    evidence,
    exposure: [
      dim(L("הוצאה בחלון", "Spend in window"), ilsK(spend), "known"),
      breakeven === null || roas === null
        ? dim(L("השפעה על רווח", "Profit impact"), null, "unavailable", L("נקודת איזון לא ידועה — כיסוי עלויות חסר", "breakeven unknown — cost coverage missing"))
        : dim(L("מול נקודת איזון", "vs breakeven"), `${roas.toFixed(1)}× / ${breakeven.toFixed(1)}×`, ctx.pulse.marginQuality, belowBreakeven ? L("מתחת לנקודת האיזון", "below breakeven") : L("מעל נקודת האיזון", "above breakeven")),
      dim(L("רכישות", "Purchases"), `${purchases}`, "known")
    ],
    connected: {
      inputs: [L("Meta", "Meta"), L("רווח", "Profit")],
      statement: belowBreakeven ? L("הוצאה נמשכת + ROAS מתחת לנקודת האיזון", "Continued spend + ROAS below breakeven") : L("הוצאה נמשכת + יעילות יורדת", "Continued spend + falling efficiency"),
      conclusion: belowBreakeven ? L("כל שקל בקמפיין מפסיד כרגע", "Every shekel in the campaign is currently losing") : L("הקמפיין עדיין מרוויח, אבל פחות מהתוכנית", "The campaign still earns, but less than planned")
    },
    materiality: null,
    options: [
      { key: "pause", label: L("להשהות את הקמפיין", "Pause the campaign"), recommended: belowBreakeven },
      { key: "cut_refresh", label: L("להקטין תקציב ולרענן קריאייטיב", "Cut budget and refresh creative"), recommended: !belowBreakeven },
      { key: "keep", label: L("להשאיר כמו שהוא", "Keep as is"), recommended: false }
    ],
    recommendation: belowBreakeven
      ? L("להשהות את הקמפיין עד שיש קריאייטיב חדש: כל שקל בו כרגע מפסיד.", "Pause the campaign until new creative is ready: every shekel in it is currently losing.")
      : L("להקטין את התקציב ולרענן קריאייטיב לפני שמגדילים שוב.", "Cut the budget and refresh creative before scaling again."),
    reason: null,
    confidence: breakeven === null ? "low" : "medium",
    confidenceReason: breakeven === null
      ? L("נקודת האיזון לא ידועה כי כיסוי העלויות חסר.", "Breakeven is unknown because cost coverage is missing.")
      : L("ההוצאה וה־ROAS ידועים; נקודת האיזון מבוססת על מרווח ממוצע ולא על המוצרים שהקמפיין מוכר.", "Spend and ROAS are known; breakeven uses the blended margin, not the margin of the products this campaign sells."),
    missingEvidence: breakeven === null ? [L("עלויות מוצרים", "Product costs")] : [L("מרווח ברמת המוצרים שהקמפיין מקדם", "Margin of the products this campaign promotes")],
    wouldChange: [L("ה־ROAS חוזר מעל נקודת האיזון לשלושה ימים רצופים.", "ROAS returns above breakeven for three consecutive days.")],
    unknown: null,
    primaryAction: "review",
    rank: spend,
    entity: { type: "campaign", id: alert.relatedEntityId, label: campaign }
  });
}

function decisionFromAlert(alert: AlertRow, ctx: DecisionContext): Decision | null {
  switch (alert.type) {
    case "stockout_imminent":
      return stockoutDecision(alert, ctx);
    case "commission_leakage":
      return affiliateDecision(alert, ctx);
    case "decision_standalone_loss":
      return standaloneLossDecision(alert, ctx);
    case "decision_discount_tradeoff":
      return discountTradeoffDecision(alert);
    case "product_gone_silent":
      return reallocationDecision(alert, ctx);
    case "competitor_promo":
      return competitorDecision(alert, ctx);
    case "roas_collapse":
      return roasDecision(alert, ctx);
    default:
      return null;
  }
}

// ── Derived engines (no upstream engine exists) ─────────────────────────

// DO NOT ACT: standalone loss on a product with a REAL cost, 90 days.
async function upsertStandaloneLossDecisions(storeId: string, now: Date): Promise<number> {
  const db = getDb() as any;
  const d90 = new Date(now.getTime() - 90 * DAY_MS);
  const rows = (await db.$queryRaw`
    SELECT
      p.id AS product_id, p.title AS title,
      COALESCE(SUM(li.quantity), 0)::int AS units,
      COALESCE(SUM(li."lineDiscountAmount"), 0)::float AS discounts,
      COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0)::float AS net,
      COALESCE(SUM(li."estimatedCostAmount"), 0)::float AS cogs
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "Product" p ON p.id = li."productId"
    WHERE li."storeId" = ${storeId}
      AND o."createdAt" >= ${d90} AND o."createdAt" <= ${now}
      AND o."cancelledAt" IS NULL AND o.test = false
      AND (p."costOverrideAmount" IS NOT NULL OR p."estimatedCost" > 0)
    GROUP BY p.id, p.title
    HAVING COALESCE(SUM(li.quantity), 0) >= 20
       AND COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0)
         - COALESCE(SUM(li."estimatedCostAmount"), 0) < 0
    ORDER BY (COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0)
         - COALESCE(SUM(li."estimatedCostAmount"), 0)) ASC
    LIMIT 3
  `.catch(() => [])) as Array<{ product_id: string; title: string; units: number; discounts: number; net: number; cogs: number }>;

  const keep: string[] = [];
  for (const r of rows) {
    const contribution = num(r.net) - num(r.cogs);
    const fp = `decision_standalone_loss:${r.product_id}`;
    keep.push(fp);
    await upsertAlert({
      storeId,
      type: "decision_standalone_loss",
      fingerprint: fp,
      severity: "low",
      source: "Calculated",
      detectedBy: "decision-inbox-service",
      title: `${r.title} נראה לא רווחי ברמת המוצר`,
      description: `${num(r.units)} יחידות ב־90 ימים · הנחות ${ils(num(r.discounts))} · תרומה ${ils(contribution)} עם עלות אמיתית ידועה. כלכלת הסל לא נמדדה.`,
      recommendedAction: "לא להסיר את ההצעה על סמך הכלכלה של המוצר בפני עצמו בלבד.",
      metricName: "product_contribution_90d",
      currentValue: contribution,
      relatedEntityType: "product",
      relatedEntityId: r.product_id,
      payloadJson: { title: r.title, units: num(r.units), discounts: num(r.discounts), net: num(r.net), cogs: num(r.cogs), contribution },
      periodLabel: `Trailing 90d → ${now.toISOString().slice(0, 10)}`
    }).catch(() => null);
  }
  await resolveStaleAlerts({ storeId, detectedBy: "decision-inbox-service", type: "decision_standalone_loss", keepFingerprints: keep }).catch(() => null);
  return rows.length;
}

// TEST: Discount × Profit — a strong seller (≥30 units / 30d) whose discount
// (≥15% of list) leaves thin contribution (<25% of net) despite a REAL cost.
// Products already negative belong to the standalone-loss decision.
async function upsertDiscountTradeoffDecisions(storeId: string, now: Date): Promise<number> {
  const db = getDb() as any;
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const rows = (await db.$queryRaw`
    SELECT
      p.id AS product_id, p.title AS title,
      COALESCE(SUM(li.quantity), 0)::int AS units,
      COALESCE(SUM(li."lineSubtotal"), 0)::float AS gross,
      COALESCE(SUM(li."lineDiscountAmount"), 0)::float AS discounts,
      COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0)::float AS net,
      COALESCE(SUM(li."estimatedCostAmount"), 0)::float AS cogs
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "Product" p ON p.id = li."productId"
    WHERE li."storeId" = ${storeId}
      AND o."createdAt" >= ${d30} AND o."createdAt" <= ${now}
      AND o."cancelledAt" IS NULL AND o.test = false
      AND (p."costOverrideAmount" IS NOT NULL OR p."estimatedCost" > 0)
    GROUP BY p.id, p.title
    HAVING COALESCE(SUM(li.quantity), 0) >= 30
       AND COALESCE(SUM(li."lineSubtotal"), 0) > 0
       AND COALESCE(SUM(li."lineDiscountAmount"), 0) / COALESCE(SUM(li."lineSubtotal"), 0) >= 0.15
       AND COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0) > 0
       AND (COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0) - COALESCE(SUM(li."estimatedCostAmount"), 0)) >= 0
       AND (COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0) - COALESCE(SUM(li."estimatedCostAmount"), 0))
         / COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal"), 0) < 0.25
    ORDER BY COALESCE(SUM(li."lineDiscountAmount"), 0) DESC
    LIMIT 2
  `.catch(() => [])) as Array<{ product_id: string; title: string; units: number; gross: number; discounts: number; net: number; cogs: number }>;

  const keep: string[] = [];
  for (const r of rows) {
    const contribution = num(r.net) - num(r.cogs);
    const fp = `decision_discount_tradeoff:${r.product_id}`;
    keep.push(fp);
    await upsertAlert({
      storeId,
      type: "decision_discount_tradeoff",
      fingerprint: fp,
      severity: "medium",
      source: "Calculated",
      detectedBy: "decision-inbox-service",
      title: `${r.title}: הנחה עמוקה משאירה תרומה נמוכה`,
      description: `${num(r.units)} יחידות ב־30 יום · הנחה ${pct(num(r.gross) > 0 ? num(r.discounts) / num(r.gross) : 0)} · תרומה ${ils(contribution)} (${pct(num(r.net) > 0 ? contribution / num(r.net) : 0)} מהמכירות נטו).`,
      recommendedAction: "לבדוק הנחה קטנה יותר על חלק מהתנועה לפני שמחליטים.",
      metricName: "product_discount_rate_30d",
      currentValue: num(r.gross) > 0 ? num(r.discounts) / num(r.gross) : 0,
      relatedEntityType: "product",
      relatedEntityId: r.product_id,
      payloadJson: { title: r.title, units: num(r.units), gross: num(r.gross), discounts: num(r.discounts), net: num(r.net), cogs: num(r.cogs), contribution },
      periodLabel: `Trailing 30d → ${now.toISOString().slice(0, 10)}`
    }).catch(() => null);
  }
  await resolveStaleAlerts({ storeId, detectedBy: "decision-inbox-service", type: "decision_discount_tradeoff", keepFingerprints: keep }).catch(() => null);
  return rows.length;
}

// ── Ledger state ────────────────────────────────────────────────────────

function snapshotMetrics(d: Decision): EvidenceSnapshot["metrics"] {
  const metrics: EvidenceSnapshot["metrics"] = {};
  for (const e of d.exposure) metrics[e.label.en] = e.value;
  for (const f of d.evidence.slice(0, 5)) {
    const v = f.value;
    metrics[f.label.en] = v === null ? null : typeof v === "string" ? v : v.en;
  }
  return metrics;
}

// Advance one decision's ledger state for this evaluation. Returns the next
// state and whether anything changed (so we only write when needed).
function advanceLedger(d: Decision, now: Date, surfaced: boolean): { next: DecisionLedgerState; changed: boolean } {
  const prev = d.ledger;
  const nowIso = now.toISOString();
  const wantsCall = d.status === "act" || d.status === "change_plan" || d.status === "test";
  let state: DecisionState = prev.state;
  if (d.human.choice !== "pending") state = "resolved";
  else if (prev.state === "watching" && wantsCall) state = "escalated";
  else if (prev.state === "open" && !wantsCall) state = "watching";
  else if (prev.state === "resolved") state = wantsCall ? "open" : "watching";

  const last = prev.snapshots[prev.snapshots.length - 1];
  const metrics = snapshotMetrics(d);
  const sameDay = last ? last.at.slice(0, 10) === nowIso.slice(0, 10) : false;
  const sameMetrics = last ? JSON.stringify(last.metrics) === JSON.stringify(metrics) && last.status === d.status : false;
  const snapshots = sameDay && sameMetrics ? prev.snapshots : [...prev.snapshots, { at: nowIso, status: d.status, metrics }].slice(-MAX_SNAPSHOTS);
  const surfacedAt = prev.surfacedAt ?? (surfaced ? nowIso : null);
  const changed = state !== prev.state || snapshots !== prev.snapshots || surfacedAt !== prev.surfacedAt || prev.snapshots.length === 0;
  return {
    next: { state, firstDetectedAt: prev.firstDetectedAt, lastEvaluatedAt: changed ? nowIso : prev.lastEvaluatedAt, surfacedAt, snapshots },
    changed
  };
}

async function persistLedger(alert: AlertRow, next: DecisionLedgerState): Promise<void> {
  const db = getDb();
  const prev = payloadOf(alert);
  await db.alert
    .update({ where: { id: alert.id }, data: { payloadJson: { ...prev, decision: next } as any } })
    .catch((e: unknown) => console.error("[decision-inbox] ledger write failed:", e));
}

// ── Inbox ───────────────────────────────────────────────────────────────

interface EngineCounts {
  productsReviewed: number;
  campaignsReviewed: number;
}

// Runs the idempotent engines the Command Center runs so the ledger is fresh
// before we read it. Failures are logged and ignored — a broken engine must
// not take the home screen down.
async function refreshLedger(storeId: string, now: Date): Promise<EngineCounts> {
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const swallow = <T,>(label: string, p: Promise<T>): Promise<T | null> =>
    p.catch((e) => {
      console.error(`[decision-inbox] ${label} failed:`, e);
      return null;
    });
  const [stockout, roas] = await Promise.all([
    swallow("stockout engine", buildStockoutImminentReport({ storeId, asOf: now })),
    swallow("roas engine", buildRoasCollapseReport({ storeId, start: d30, end: now })),
    swallow("competitor engine", upsertCompetitorResponseAlerts({ storeId, start: d7, end: now })),
    swallow("commission-leakage engine", upsertCommissionLeakageAlert(storeId)),
    swallow("silent-product engine", upsertSilentProductAlerts(storeId)),
    swallow("standalone-loss engine", upsertStandaloneLossDecisions(storeId, now)),
    swallow("discount-tradeoff engine", upsertDiscountTradeoffDecisions(storeId, now)),
    swallow("outcome measurement", measureOutcomesForResolvedAlerts({ storeId }))
  ]);
  return {
    productsReviewed:
      (stockout?.productsConsidered ?? 0) + (stockout?.productsSkippedNoVelocity ?? 0) + (stockout?.productsSkippedNoInventory ?? 0),
    campaignsReviewed: (roas?.campaignsConsidered ?? 0) + (roas?.campaignsBelowMinSpend ?? 0)
  };
}

const STATUS_ORDER: Record<DecisionStatus, number> = { act: 0, change_plan: 1, test: 2, do_not_act: 3, watch: 4 };

function watchItemFromDecision(d: Decision): WatchItem {
  return { id: `decision:${d.id}`, title: d.title, detail: d.reason ?? d.trigger, source: d.evidence[0]?.source ?? "shopify", since: d.detectedAt, decisionId: d.id };
}

function watchItemFromAlert(a: AlertRow): WatchItem {
  const text = a.description ?? a.recommendedAction ?? "";
  return {
    id: `alert:${a.id}`,
    title: L(a.title, a.title),
    detail: L(text, text),
    source: a.type.startsWith("competitor") ? "market" : a.type.includes("affiliate") ? "affiliate" : a.type.includes("campaign") || a.type.includes("roas") ? "meta" : "shopify",
    since: a.createdAt.toISOString(),
    decisionId: null
  };
}

function metaWatchItems(overview: MetaCampaignsOverview | null, pulse: InternalPulse, now: Date): WatchItem[] {
  if (!overview || overview.blendedRoas === null || pulse.breakevenRoas === null) return [];
  const be = pulse.breakevenRoas;
  return overview.campaigns
    .filter((c) => c.activeRecently && c.roas !== null && c.spend >= 200 && c.roas < overview.blendedRoas! * 0.8 && c.roas >= be)
    .slice(0, 3)
    .map((c) => ({
      id: `meta:${c.campaignId}`,
      title: L(`${c.campaignName}: ROAS ${c.roas!.toFixed(1)} — נמוך מממוצע החשבון, אבל עדיין רווחי`, `${c.campaignName}: ROAS ${c.roas!.toFixed(1)} — below the account average, but still profitable`),
      detail: L(`ממוצע החשבון ${overview.blendedRoas!.toFixed(1)}, נקודת האיזון של החנות ${be.toFixed(1)}. הקמפיין מרוויח, רק פחות מהאחרים. לא נדרשת פעולה כל עוד הוא מעל נקודת האיזון.`, `Account average ${overview.blendedRoas!.toFixed(1)}, store breakeven ${be.toFixed(1)}. The campaign earns, just less than the others. No action needed while it stays above breakeven.`),
      source: "meta" as const,
      since: now.toISOString(),
      decisionId: null
    }));
}

// Presentation cap: ≤ MAX_CARDS_PER_KIND per kind (a critical one may add a
// third), ≤ MAX_INBOX_CARDS overall. Everything else goes to the Watchlist.
function selectCards(all: Decision[]): { cards: Decision[]; overflow: Decision[] } {
  const perKind = new Map<string, number>();
  const cards: Decision[] = [];
  const overflow: Decision[] = [];
  for (const d of all) {
    const n = perKind.get(d.kind) ?? 0;
    const allowed = n < MAX_CARDS_PER_KIND || (d.critical && n < MAX_CARDS_PER_KIND + 1);
    if (allowed && cards.length < MAX_INBOX_CARDS) {
      cards.push(d);
      perKind.set(d.kind, n + 1);
    } else {
      overflow.push(d);
    }
  }
  return { cards, overflow };
}

export const buildDecisionInbox = cache(async (storeId: string): Promise<DecisionInbox> => {
  const now = new Date();
  const counts = await refreshLedger(storeId, now);
  const ctx = await getContext(storeId);
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const d7 = new Date(now.getTime() - 7 * DAY_MS);

  const [openAlerts, health, meta, competitorSnapshots] = await Promise.all([
    listOpenAlerts({ storeId, limit: 200 }) as Promise<AlertRow[]>,
    buildSetupHealth({ storeId }).catch(() => null),
    getMetaCampaignsOverview(storeId, { start: d30, end: now }).catch(() => null),
    (getDb() as any).competitorSnapshot.count({ where: { storeId, snapshotDate: { gte: d7 } } }).catch(() => 0) as Promise<number>
  ]);

  const built: Array<{ alert: AlertRow; decision: Decision }> = [];
  const otherAlerts: AlertRow[] = [];
  for (const a of openAlerts.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())) {
    const d = (DECISION_TYPES as readonly string[]).includes(a.type) ? decisionFromAlert(a, ctx) : null;
    if (d) built.push({ alert: a, decision: d });
    else otherAlerts.push(a);
  }

  // One card per situation: the commission-leakage engine keys its alert by
  // month, so at a month boundary two rows are open for the same question —
  // keep the newest.
  const seenSingleton = new Set<string>();
  const pending = built
    .filter(({ decision: d }) => d.human.choice === "pending")
    .filter(({ decision: d }) => {
      if (d.kind !== "commission_leakage") return true;
      if (seenSingleton.has(d.kind)) return false;
      seenSingleton.add(d.kind);
      return true;
    })
    .sort((a, b) => STATUS_ORDER[a.decision.status] - STATUS_ORDER[b.decision.status] || b.decision.rank - a.decision.rank);

  const { cards, overflow } = selectCards(pending.map((p) => p.decision));
  const cardIds = new Set(cards.map((c) => c.id));

  // Advance the ledger for every built decision (shown or not) and persist
  // only what changed. Runs after selection so `surfacedAt` is truthful.
  await Promise.all(
    built.map(async ({ alert, decision }) => {
      const { next, changed } = advanceLedger(decision, now, cardIds.has(decision.id));
      decision.ledger = next;
      if (changed) await persistLedger(alert, next);
    })
  );

  const watchlist: WatchItem[] = [
    ...overflow.map(watchItemFromDecision),
    ...cards.filter((d) => d.status === "watch").map(watchItemFromDecision),
    ...metaWatchItems(meta, ctx.pulse, now),
    ...otherAlerts.filter((a) => a.severity === "medium" || a.severity === "low").slice(0, 8).map(watchItemFromAlert)
  ];
  if (ctx.leakage && ctx.leakage.returningCustomer.commission > 0 && !pending.some((p) => p.decision.kind === "commission_leakage")) {
    watchlist.push({
      id: "affiliate:returning",
      title: L("עמלות שותפים על לקוחות חוזרים — מתחת לסף לבדיקה", "Affiliate commission on returning customers — below the review threshold"),
      detail: L(`${ils(ctx.leakage.returningCustomer.commission)} ב־30 יום (${pct(ctx.leakage.leakageRate)} מהעמלות).`, `${ils(ctx.leakage.returningCustomer.commission)} in 30 days (${pct(ctx.leakage.leakageRate)} of commission).`),
      source: "affiliate",
      since: now.toISOString(),
      decisionId: null
    });
  }

  const affiliateReviewed = ctx.leakage
    ? ctx.leakage.newCustomer.conversions + ctx.leakage.returningCustomer.conversions + ctx.leakage.unclassified.conversions
    : 0;
  const reviewed =
    counts.productsReviewed + Math.max(counts.campaignsReviewed, meta?.campaigns.length ?? 0) + affiliateReviewed + competitorSnapshots + openAlerts.length;
  const watchingDistinct = new Set(watchlist.map((w) => w.decisionId ?? w.id)).size;
  const byStatus = cards.reduce(
    (acc, d) => ({ ...acc, [d.status]: acc[d.status] + 1 }),
    { act: 0, watch: 0, do_not_act: 0, test: 0, change_plan: 0 } as Record<DecisionStatus, number>
  );
  // The Command Center reads this instead of re-running the engines, so its
  // "N decisions need your attention" is exactly what Today last showed.
  await writeDecisionInboxSummary(storeId, { decisions: cards.length, byStatus, watching: watchingDistinct, updatedAt: now.toISOString() });

  return {
    decisions: cards,
    watchlist,
    stats: {
      decisions: cards.length,
      byStatus,
      watching: watchingDistinct,
      reviewed,
      suppressed: Math.max(0, reviewed - cards.length - watchingDistinct),
      confidencePct: health ? health.score : null
    },
    updatedAt: now.toISOString()
  };
});

export async function getDecision(storeId: string, id: string): Promise<Decision | null> {
  const db = getDb();
  const row = (await db.alert.findFirst({ where: { id, storeId } }).catch(() => null)) as AlertRow | null;
  if (!row) return null;
  const ctx = await getContext(storeId);
  return decisionFromAlert(row, ctx);
}

// ── Human decision + judgment ───────────────────────────────────────────

export type HumanChoiceInput = "approve" | "alternative" | "ignore";

export async function recordHumanDecision(input: {
  storeId: string;
  id: string;
  choice: HumanChoiceInput;
  optionKey?: string;
  by: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const db = getDb();
  const existing = await db.alert.findFirst({ where: { id: input.id, storeId: input.storeId }, select: { id: true, payloadJson: true } });
  if (!existing) return { ok: false, reason: "not_found" };
  const status = input.choice === "approve" ? "resolved" : input.choice === "ignore" ? "ignored" : "acknowledged";
  const choice: HumanDecision["choice"] = input.choice === "approve" ? "approved" : input.choice === "ignore" ? "ignored" : "alternative";
  const prev = existing.payloadJson && typeof existing.payloadJson === "object" ? (existing.payloadJson as Record<string, unknown>) : {};
  const humanDecision: HumanDecision = { choice, optionKey: input.optionKey, decidedAt: new Date().toISOString(), decidedBy: input.by };
  const prevLedger = prev.decision && typeof prev.decision === "object" ? (prev.decision as DecisionLedgerState) : null;
  const decision = prevLedger ? { ...prevLedger, state: "resolved" as const, lastEvaluatedAt: humanDecision.decidedAt } : undefined;
  await db.alert.update({
    where: { id: input.id },
    data: {
      status,
      resolvedAt: new Date(),
      resolvedBy: `user:${input.by}`,
      payloadJson: { ...prev, humanDecision, ...(decision ? { decision } : {}) } as any
    }
  });
  return { ok: true };
}

export async function recordJudgment(input: {
  storeId: string;
  id: string;
  tags: JudgmentTag[];
  changedDecision: boolean | null;
  by: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const db = getDb();
  const existing = await db.alert.findFirst({ where: { id: input.id, storeId: input.storeId }, select: { id: true, payloadJson: true } });
  if (!existing) return { ok: false, reason: "not_found" };
  const prev = existing.payloadJson && typeof existing.payloadJson === "object" ? (existing.payloadJson as Record<string, unknown>) : {};
  const judgment: Judgment = { tags: input.tags, changedDecision: input.changedDecision, at: new Date().toISOString(), by: input.by };
  await db.alert.update({ where: { id: input.id }, data: { payloadJson: { ...prev, judgment } as any } });
  return { ok: true };
}

// ── Memory ──────────────────────────────────────────────────────────────

const KIND_STATUS: Record<string, DecisionStatus> = {
  stockout_imminent: "act",
  commission_leakage: "test",
  decision_standalone_loss: "do_not_act",
  decision_discount_tradeoff: "test",
  product_gone_silent: "change_plan",
  competitor_promo: "watch",
  roas_collapse: "change_plan"
};

export interface DecisionMemory {
  entries: MemoryEntry[];
  learnings: Localized[];
}

async function loadDecisionRows(storeId: string, since: Date, take: number): Promise<AlertRow[]> {
  const db = getDb();
  return (await db.alert
    .findMany({ where: { storeId, type: { in: [...DECISION_TYPES] }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take })
    .catch(() => [])) as AlertRow[];
}

export const listDecisionMemory = cache(async (storeId: string): Promise<DecisionMemory> => {
  const rows = await loadDecisionRows(storeId, new Date(Date.now() - 90 * DAY_MS), 60);
  const ctx = await getContext(storeId);

  const entries: MemoryEntry[] = rows
    .map((a): MemoryEntry | null => {
      const d = decisionFromAlert(a, ctx);
      // Silent-product rows without a live campaign never were decisions.
      if (!d && a.type === "product_gone_silent") return null;
      return {
        id: a.id,
        kind: d?.kind ?? a.type,
        status: d?.status ?? KIND_STATUS[a.type] ?? "watch",
        state: d?.ledger.state ?? (a.status === "open" ? "open" : "resolved"),
        title: d?.title ?? L(a.title, a.title),
        recommendation: d?.recommendation ?? L(a.recommendedAction ?? "", a.recommendedAction ?? ""),
        createdAt: a.createdAt.toISOString(),
        detectedAt: d?.detectedAt ?? a.createdAt.toISOString(),
        human: humanOf(a),
        judgment: judgmentOf(a),
        outcome: outcomeOf(a),
        crossDomain: (d?.domains.length ?? 0) >= 2
      };
    })
    .filter((e): e is MemoryEntry => e !== null);

  // Learnings are only stated when the ledger holds evidence for them.
  const learnings: Localized[] = [];
  const competitorClosed = entries.filter((e) => e.kind === "competitor_promo" && e.human.choice !== "pending");
  const competitorNoAction = competitorClosed.filter((e) => e.human.choice === "ignored" || e.human.optionKey === "hold");
  if (competitorClosed.length >= 2 && competitorNoAction.length >= 2) {
    learnings.push(L(`מבצעי מתחרים לא תמיד דרשו תגובת מחיר: ${competitorNoAction.length} מתוך ${competitorClosed.length} מקרים ב־90 הימים האחרונים נסגרו ללא פעולה.`, `Competitor promotions have not always required a price response: ${competitorNoAction.length} of ${competitorClosed.length} cases in the last 90 days closed without action.`));
  }
  const stockouts = entries.filter((e) => e.kind === "stockout_imminent");
  if (stockouts.length >= 2) {
    learnings.push(L(`הפרעות מלאי במוצרי־עוגן חוזרות על עצמן: ${stockouts.length} מקרים ב־90 הימים האחרונים.`, `Hero-SKU inventory interruptions recur: ${stockouts.length} cases in the last 90 days.`));
  }
  const affiliateMonths = new Set(entries.filter((e) => e.kind === "commission_leakage").map((e) => e.createdAt.slice(0, 7)));
  if (affiliateMonths.size >= 2) {
    learnings.push(L(`עמלת שותפים על לקוחות חוזרים היא נושא חוזר לבדיקה: עלה ב־${affiliateMonths.size} חודשים שונים.`, `Returning-customer affiliate commission is a recurring area for review: raised in ${affiliateMonths.size} different months.`));
  }
  const judged = entries.filter((e) => e.judgment);
  const changed = judged.filter((e) => e.judgment!.changedDecision === true).length;
  if (judged.length >= 5) {
    learnings.push(L(`מתוך ${judged.length} החלטות שדורגו, ${changed} שינו את ההחלטה או תשומת הלב של ההנהלה.`, `Of ${judged.length} judged decisions, ${changed} changed a management decision or where attention went.`));
  }
  const measured = entries.filter((e) => e.outcome);
  const wins = measured.filter((e) => e.outcome!.verdict === "win").length;
  if (measured.length >= 3) {
    learnings.push(L(`מתוך ${measured.length} החלטות שנמדדו, ${wins} הסתיימו בשיפור מדיד.`, `Of ${measured.length} measured decisions, ${wins} ended in a measurable improvement.`));
  }
  return { entries, learnings };
});

// ── Wedge report (the 14-day review table) ──────────────────────────────

export interface DecisionReport {
  storeId: string;
  since: string;
  until: string;
  generated: number;
  surfaced: number;
  crossDomain: number;
  byKind: Record<string, number>;
  byStatus: Record<DecisionStatus, number>;
  byState: Record<DecisionState, number>;
  judged: number;
  judgments: Record<JudgmentTag, number>;
  changedDecision: number;
  human: Record<HumanDecision["choice"], number>;
  outcomes: Record<DecisionOutcome["verdict"], number>;
  rows: Array<{
    id: string;
    kind: string;
    status: DecisionStatus;
    state: DecisionState;
    domains: EvidenceSource[];
    detectedAt: string;
    surfacedAt: string | null;
    human: HumanDecision["choice"];
    judgment: JudgmentTag[];
    changedDecision: boolean | null;
    outcome: DecisionOutcome["verdict"] | null;
    title: string;
  }>;
}

export async function buildDecisionReport(storeId: string, days = 14): Promise<DecisionReport> {
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = await loadDecisionRows(storeId, since, 500);
  const ctx = await getContext(storeId);
  const report: DecisionReport = {
    storeId,
    since: since.toISOString(),
    until: now.toISOString(),
    generated: 0,
    surfaced: 0,
    crossDomain: 0,
    byKind: {},
    byStatus: { act: 0, watch: 0, do_not_act: 0, test: 0, change_plan: 0 },
    byState: { open: 0, watching: 0, escalated: 0, resolved: 0 },
    judged: 0,
    judgments: { useful: 0, obvious: 0, wrong: 0, missing_context: 0 },
    changedDecision: 0,
    human: { pending: 0, approved: 0, alternative: 0, ignored: 0, auto_closed: 0 },
    outcomes: { win: 0, neutral: 0, miss: 0, no_data: 0 },
    rows: []
  };
  for (const a of rows) {
    const d = decisionFromAlert(a, ctx);
    if (!d) continue;
    report.generated += 1;
    if (d.ledger.surfacedAt) report.surfaced += 1;
    if (d.domains.length >= 2) report.crossDomain += 1;
    report.byKind[d.kind] = (report.byKind[d.kind] ?? 0) + 1;
    report.byStatus[d.status] += 1;
    report.byState[d.ledger.state] += 1;
    report.human[d.human.choice] += 1;
    if (d.judgment) {
      report.judged += 1;
      for (const t of d.judgment.tags) report.judgments[t] += 1;
      if (d.judgment.changedDecision) report.changedDecision += 1;
    }
    if (d.outcome) report.outcomes[d.outcome.verdict] += 1;
    report.rows.push({
      id: d.id,
      kind: d.kind,
      status: d.status,
      state: d.ledger.state,
      domains: d.domains,
      detectedAt: d.detectedAt,
      surfacedAt: d.ledger.surfacedAt,
      human: d.human.choice,
      judgment: d.judgment?.tags ?? [],
      changedDecision: d.judgment?.changedDecision ?? null,
      outcome: d.outcome?.verdict ?? null,
      title: d.title.en
    });
  }
  return report;
}

// ── Market ──────────────────────────────────────────────────────────────

export interface MarketEvent {
  competitorId: string;
  name: string;
  domain: string;
  changeKind: string;
  summary: Localized;
  maxDiscountPct: number | null;
  activePromoCount: number;
  homepageMessage: string | null;
  market: CompetitorMarketSignals | null;
  decisionId: string | null;
  decisionStatus: DecisionStatus | null;
}

export interface MarketView {
  tracked: number;
  detected: number;
  relevant: number;
  suppressed: number;
  events: MarketEvent[];
  quiet: Array<{ name: string; domain: string; summary: Localized; market: CompetitorMarketSignals | null }>;
  pulse: InternalPulse;
  crawl: { at: string; source: string } | null;
  section: CompetitorWeekSection | null;
}

export const buildMarketView = cache(async (storeId: string): Promise<MarketView> => {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const db = getDb() as any;
  const [section, crawl, competitors, ctx, openAlerts, detected] = await Promise.all([
    buildCompetitorWeekSection({ storeId, start: d7, end: now }).catch(() => null),
    getCompetitorCrawlSummary(storeId).catch(() => null),
    listCompetitors(storeId).catch(() => []),
    getContext(storeId),
    listOpenAlerts({ storeId, type: "competitor_promo", limit: 50 }) as Promise<AlertRow[]>,
    // Raw SQL: Prisma's Json filters need DbNull/AnyNull sentinels for
    // IS NOT NULL, which is easier to get right in SQL.
    (db.$queryRaw`
      SELECT COUNT(*)::int AS n FROM "CompetitorSnapshot"
      WHERE "storeId" = ${storeId} AND "snapshotDate" >= ${d7}
        AND ("activePromoCount" > 0 OR "signalsJson" IS NOT NULL)
    `
      .then((rows: Array<{ n: number }>) => num(rows[0]?.n))
      .catch(() => 0)) as Promise<number>
  ]);
  const byCompetitor = new Map<string, AlertRow>();
  for (const a of openAlerts) {
    const cid = String(payloadOf(a).competitorId ?? "");
    if (cid) byCompetitor.set(cid, a);
  }
  const entries = section?.competitors ?? [];
  const relevantEntries = entries.filter((e) => e.change.kind === "opened_promo" || e.change.kind === "deepened_discount");
  const events: MarketEvent[] = relevantEntries.map((e) => {
    const alert = byCompetitor.get(e.competitorId);
    const decision = alert ? decisionFromAlert(alert, ctx) : null;
    return {
      competitorId: e.competitorId,
      name: e.name,
      domain: e.domain,
      changeKind: e.change.kind,
      summary: e.change.summary,
      maxDiscountPct: e.current.maxDiscountPct,
      activePromoCount: e.current.activePromoCount,
      homepageMessage: e.current.homepageMessage,
      market: e.current.market,
      decisionId: decision?.id ?? null,
      decisionStatus: decision?.status ?? null
    };
  });
  const quiet = entries.filter((e) => !relevantEntries.includes(e)).map((e) => ({ name: e.name, domain: e.domain, summary: e.change.summary, market: e.current.market }));
  const detectedCount = Math.max(detected, events.length);
  return {
    tracked: competitors.filter((c) => c.status === "active").length,
    detected: detectedCount,
    relevant: events.length,
    suppressed: Math.max(0, detectedCount - events.length),
    events,
    quiet,
    pulse: ctx.pulse,
    crawl: crawl ? { at: crawl.at, source: crawl.source } : null,
    section
  };
});

// ── Data health ─────────────────────────────────────────────────────────

export type HealthState = "healthy" | "partial" | "missing";

export interface DataHealthRow {
  key: string;
  label: Localized;
  state: HealthState;
  detail: Localized;
  fixHref: string | null;
}

export interface DataHealth {
  rows: DataHealthRow[];
  score: number | null;
  confidence: SetupHealthReport["confidenceLevel"] | null;
  costCoveragePct: number;
  productsMissingCost: number;
  suppressedDecisions: number;
  // Today's AI spend (estimate) against the per-store daily budget.
  ai: { calls: number; estimatedUsd: number; budgetUsd: number; byFeature: Array<{ feature: string; calls: number; estimatedUsd: number }> };
}

export const buildDataHealth = cache(async (storeId: string): Promise<DataHealth> => {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const db = getDb() as any;
  const [health, cost, crawl, competitors, ganttSheets, leakage, llm, llmGlobal, googleAdsConn] = await Promise.all([
    buildSetupHealth({ storeId }).catch(() => null),
    computeCostCoverage(storeId, d30, now),
    getCompetitorCrawlSummary(storeId).catch(() => null),
    listCompetitors(storeId).catch(() => []),
    db.ganttSheet.count({ where: { storeId } }).catch(() => 0) as Promise<number>,
    getCommissionLeakageSummary({ storeId, start: d30, end: now }).catch(() => null),
    getLlmUsageToday(storeId),
    getLlmUsageToday(LLM_GLOBAL_BUCKET),
    db.platformConnection
      .findUnique({ where: { storeId_platform: { storeId, platform: "googleAds" } }, select: { status: true, lastSyncAt: true } })
      .catch(() => null) as Promise<{ status: string; lastSyncAt: Date | null } | null>
  ]);
  const check = (id: string) => health?.checks.find((c) => c.id === id) ?? null;
  const stateOf = (status: "pass" | "fail" | "warning" | undefined | null): HealthState =>
    status === "pass" ? "healthy" : status === "warning" ? "partial" : "missing";

  const shopify = check("shopify_connected");
  const sync = check("sync_recent");
  const metaC = check("meta_connected");
  const affiliate = check("affiliate_tracking");
  const activeCompetitors = competitors.filter((c) => c.status === "active").length;
  const crawlOk = crawl?.outcomes.filter((o) => o.result === "ok").length ?? 0;

  const rows: DataHealthRow[] = [
    {
      key: "shopify",
      label: L("Shopify", "Shopify"),
      state: shopify?.status === "pass" ? stateOf(sync?.status ?? "pass") : "missing",
      detail: shopify?.status === "pass" ? (sync?.description ?? L("מחובר", "Connected")) : (shopify?.description ?? L("לא מחובר", "Not connected")),
      fixHref: shopify?.status === "pass" ? null : (shopify?.fixHref ?? "/settings")
    },
    { key: "meta", label: L("Meta", "Meta"), state: stateOf(metaC?.status), detail: metaC?.description ?? L("לא נבדק", "Not checked"), fixHref: metaC?.status === "pass" ? null : (metaC?.fixHref ?? "/settings") },
    {
      key: "google_ads",
      label: L("Google Ads", "Google Ads"),
      state: googleAdsConn?.status === "connected" ? (googleAdsConn.lastSyncAt ? "healthy" : "partial") : "missing",
      detail:
        googleAdsConn?.status === "connected"
          ? googleAdsConn.lastSyncAt
            ? L("מחובר ומסונכרן", "Connected and synced")
            : L("מחובר — עדיין לא סונכרן; בחרו חשבון מודעות ולחצו סנכרון", "Connected — not synced yet; pick an ad account and press sync")
          : L("לא מחובר — הוצאות Google לא נכללות ברווח ובהחלטות", "Not connected — Google spend is missing from profit and decisions"),
      fixHref: "/settings"
    },
    {
      key: "inventory",
      label: L("מלאי", "Inventory"),
      state: shopify?.status === "pass" ? stateOf(sync?.status ?? "pass") : "missing",
      detail: sync?.description ?? L("מסונכרן עם Shopify", "Synced with Shopify"),
      fixHref: null
    },
    {
      key: "affiliate",
      label: L("שותפים", "Affiliate"),
      state: stateOf(affiliate?.status),
      detail:
        leakage && leakage.unclassified.conversions > 0
          ? L(`${leakage.unclassified.conversions} המרות עדיין לא סווגו (חדש/חוזר)`, `${leakage.unclassified.conversions} conversions not yet classified (new/returning)`)
          : (affiliate?.description ?? L("לא נבדק", "Not checked")),
      fixHref: affiliate?.status === "pass" ? null : (affiliate?.fixHref ?? "/affiliate-portal")
    },
    {
      key: "cogs",
      label: L("עלויות (COGS)", "COGS"),
      state: cost.coverage >= 0.9 ? "healthy" : cost.coverage > 0 ? "partial" : "missing",
      detail: L(`${pct(cost.coverage)} מההכנסות ב־30 יום מגובות בעלות אמיתית · ${cost.productsMissing} מוצרים ללא עלות`, `${pct(cost.coverage)} revenue coverage over 30 days · ${cost.productsMissing} products without a cost`),
      fixHref: cost.coverage >= 0.9 ? null : "/products/costs"
    },
    {
      key: "competitors",
      label: L("מתחרים", "Competitors"),
      state: activeCompetitors === 0 ? "missing" : crawlOk >= activeCompetitors ? "healthy" : "partial",
      detail:
        activeCompetitors === 0
          ? L("לא הוגדרו מתחרים למעקב", "No competitors are being monitored")
          : L(`${crawlOk} מתוך ${activeCompetitors} מתחרים החזירו נתונים בסריקה האחרונה`, `${crawlOk} of ${activeCompetitors} competitors returned data in the last crawl`),
      fixHref: activeCompetitors === 0 || crawlOk < activeCompetitors ? "/settings" : null
    },
    {
      key: "plan",
      label: L("תוכנית מסחרית", "Commercial plan"),
      state: ganttSheets > 0 ? "partial" : "missing",
      detail:
        ganttSheets > 0
          ? L(`${ganttSheets} גיליונות תכנון נטענו; ההחלטות עדיין לא מקושרות ליוזמות בתוכנית`, `${ganttSheets} plan sheets loaded; decisions are not yet linked to plan initiatives`)
          : L("לא נטענה תוכנית חודשית", "No monthly plan loaded"),
      fixHref: "/marketing-planner"
    }
  ];

  return {
    rows,
    score: health?.score ?? null,
    confidence: health?.confidenceLevel ?? null,
    costCoveragePct: cost.coverage,
    productsMissingCost: cost.productsMissing,
    // Every product sold this month without a real cost is a profit decision
    // Hiloomy refuses to make — that is the honest count of what is
    // suppressed for lack of financial evidence.
    suppressedDecisions: cost.productsMissing,
    ai: {
      calls: llm.calls + llmGlobal.calls,
      estimatedUsd: Math.round((llm.estimatedUsd + llmGlobal.estimatedUsd) * 100) / 100,
      budgetUsd: llmDailyBudgetUsd(),
      byFeature: [
        ...Object.entries(llm.byFeature).map(([feature, f]) => ({ feature, calls: f.calls, estimatedUsd: f.estimatedUsd })),
        ...Object.entries(llmGlobal.byFeature).map(([feature, f]) => ({ feature: `${feature} (all stores)`, calls: f.calls, estimatedUsd: f.estimatedUsd }))
      ].sort((a, b) => b.estimatedUsd - a.estimatedUsd)
    }
  };
});
