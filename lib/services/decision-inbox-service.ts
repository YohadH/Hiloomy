// Decision Inbox — composes the existing detection engines into Decision
// Objects (lib/domain/decision.ts) for the Today / Watchlist / Market /
// Memory / Data Health screens.
//
// Ledger: the Alert table. Every decision maps 1:1 to an alert row — the
// engines (stockout, ROAS collapse, competitor promo, commission leakage)
// already write rows with stable fingerprints, and the two derived kinds
// that have no engine (standalone-loss product) are upserted here with the
// same discipline. Human decisions land in Alert.status + payloadJson.
//
// Honesty rules enforced here, not in the UI:
//   - a fact that does not exist is `unavailable`, never guessed;
//   - exposure is labelled by what it is (recent revenue attached, commission
//     paid), never "money at risk";
//   - a product is only called unprofitable when its cost is REAL (override or
//     Shopify-supplied) — estimated costs cannot support a DO NOT ACT card;
//   - ranking is by ₪ exposure, not by severity label.

import { cache } from "react";
import { getDb } from "@/lib/server/db";
import { listOpenAlerts, upsertAlert, resolveStaleAlerts } from "@/lib/services/alert-writer-service";
import { getActiveCampaignsByProduct, type LiveCampaignForProduct } from "@/lib/services/campaign-product-link-service";
import { getCommissionLeakageSummary, upsertCommissionLeakageAlert, type LeakageSummary } from "@/lib/services/affiliate-leakage-service";
import { buildStockoutImminentReport } from "@/lib/services/stockout-imminent-service";
import { buildRoasCollapseReport } from "@/lib/services/roas-collapse-service";
import { measureOutcomesForResolvedAlerts } from "@/lib/services/alert-outcome-service";
import {
  buildCompetitorWeekSection,
  getCompetitorCrawlSummary,
  listCompetitors,
  upsertCompetitorResponseAlerts,
  type CompetitorWeekSection
} from "@/lib/services/competitor-intel-service";
import { getShopifySalesSummaryForWindow } from "@/lib/data/prisma-analytics-repository";
import { buildTrafficSearchSummary } from "@/lib/services/traffic-search-summary-service";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";
import { computeCostCoverage } from "@/lib/services/cost-coverage";
import { buildSetupHealth, type SetupHealthReport } from "@/lib/services/setup-health-service";
import { getMetaCampaignsOverview, type MetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";
import { getBundleOverview } from "@/lib/services/bundle-profitability-service";
import type {
  Confidence,
  Decision,
  DecisionInbox,
  DecisionOutcome,
  DecisionStatus,
  EvidenceFact,
  EvidenceQuality,
  HumanDecision,
  Localized,
  MemoryEntry,
  WatchItem
} from "@/lib/domain/decision";

const DAY_MS = 86_400_000;
const MAX_INBOX_CARDS = 5;

// Alert types that are rendered as decisions. Anything else stays an alert.
const DECISION_TYPES = [
  "stockout_imminent",
  "commission_leakage",
  "competitor_promo",
  "roas_collapse",
  "decision_standalone_loss"
] as const;

const L = (he: string, en: string): Localized => ({ he, en });
const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
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
  // Net sales, last 7 days vs the 7 before. null when either window is empty.
  velocityChangePct: number | null;
  sales7: number | null;
  conversionRate: number | null;
  conversionQuality: EvidenceQuality;
  marginRate: number | null;
  marginQuality: EvidenceQuality;
  breakevenRoas: number | null;
}

interface DecisionContext {
  storeId: string;
  now: Date;
  campaignsByProduct: Map<string, LiveCampaignForProduct[]>;
  campaignLinksExist: boolean;
  leakage: LeakageSummary | null;
  pulse: InternalPulse;
  bundleComponentIds: Set<string>;
  bundlesDefined: boolean;
  competitorNames: Map<string, string>;
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

const getContext = cache(async (storeId: string): Promise<DecisionContext> => {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const [campaignsByProduct, leakage, pulse, bundles, competitors] = await Promise.all([
    getActiveCampaignsByProduct(storeId).catch(() => new Map<string, LiveCampaignForProduct[]>()),
    getCommissionLeakageSummary({ storeId, start: d30, end: now }).catch(() => null),
    buildPulse(storeId, now),
    getBundleOverview(storeId).catch(() => null),
    listCompetitors(storeId).catch(() => [])
  ]);
  const linkCount = await getDb()
    .campaignProductLink.count({ where: { storeId } })
    .catch(() => 0);
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
    bundlesDefined: (bundles?.bundles.length ?? 0) > 0,
    competitorNames: new Map(competitors.map((c) => [c.id, c.name]))
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
    return {
      choice: raw.choice,
      optionKey: raw.optionKey,
      decidedAt: raw.decidedAt,
      decidedBy: raw.decidedBy
    };
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

// ── Decision builders (one per kind) ────────────────────────────────────

function stockoutDecision(alert: AlertRow, ctx: DecisionContext): Decision {
  const p = payloadOf(alert);
  const title = alert.relatedEntityId
    ? alert.title.replace(/ עומד להיגמר במלאי$/, "")
    : alert.title;
  const inventory = num(p.currentInventory);
  const days = num(p.daysToStockout);
  const revenue14 = num(p.trailingRevenue);
  const fromPayload = Array.isArray(p.activeCampaigns) ? (p.activeCampaigns as LiveCampaignForProduct[]) : [];
  const live = fromPayload.length
    ? fromPayload
    : alert.relatedEntityId
      ? (ctx.campaignsByProduct.get(alert.relatedEntityId) ?? [])
      : [];
  const spend7 = live.reduce((s, c) => s + num(c.spend), 0);
  const paidTraffic = live.length > 0;
  const status: DecisionStatus = paidTraffic ? "act" : "watch";

  const metaFact: EvidenceFact = paidTraffic
    ? fact(
        L("קמפיין", "Campaign"),
        L("עדיין פעיל", "Still active"),
        "meta",
        L("Meta Ads", "Meta Ads"),
        "known",
        L(`${ils(spend7)} הוצאה / 7 ימים · ${live.map((c) => c.campaignName).join(", ")}`, `${ils(spend7)} spend / last 7 days · ${live.map((c) => c.campaignName).join(", ")}`)
      )
    : ctx.campaignLinksExist
      ? fact(L("קמפיין", "Campaign"), L("אין קמפיין מקושר פעיל", "No linked campaign active"), "meta", L("Meta Ads", "Meta Ads"), "known")
      : fact(
          L("קמפיין", "Campaign"),
          null,
          "meta",
          L("Meta Ads", "Meta Ads"),
          "unavailable",
          L("לא קושרו קמפיינים למוצרים — לא ניתן לדעת אם תנועה ממומנת מופנית למוצר", "No campaigns are linked to products — paid traffic exposure cannot be determined")
        );

  const evidence: EvidenceFact[] = [
    fact(L("מלאי", "Inventory"), `${inventory.toLocaleString("en-US")}`, "inventory", L("מלאי Shopify", "Shopify Inventory"), "known", L("יחידות נותרו", "units remaining")),
    fact(L("כיסוי מלאי", "Stock cover"), `${days.toFixed(1)}`, "inventory", L("מחושב מקצב 14 יום", "Calculated from 14-day velocity"), "calculated", L("ימים", "days cover")),
    fact(L("מכירות", "Sales"), ils(revenue14), "shopify", L("הזמנות Shopify", "Shopify Orders"), "known", L("הכנסה / 14 ימים אחרונים", "revenue / last 14 days")),
    metaFact
  ];

  const options = paidTraffic
    ? [
        { key: "replenish_continue", label: L("לחדש מלאי ולהמשיך בקמפיינים", "Replenish + continue ads"), recommended: true },
        { key: "reroute", label: L("להסיט זמנית את התנועה הממומנת", "Temporarily reroute traffic"), recommended: false },
        { key: "none", label: L("לא לפעול", "Take no action"), recommended: false }
      ]
    : [
        { key: "replenish", label: L("לאשר חידוש מלאי היום", "Confirm replenishment today"), recommended: true },
        { key: "let_run_out", label: L("לתת למלאי להיגמר", "Let it run out"), recommended: false },
        { key: "none", label: L("לא לפעול", "Take no action"), recommended: false }
      ];

  return {
    id: alert.id,
    kind: "stockout_imminent",
    status,
    title: L(`${title} צפוי להיגמר במלאי`, `${title} is likely to stock out`),
    question: paidTraffic
      ? L("האם להמשיך לשלוח תנועה ממומנת כשהמלאי כל כך נמוך?", "Should we continue sending paid traffic while inventory is this low?")
      : L("האם לחדש מלאי עכשיו, לפני שהמוצר נעלם מהמדף?", "Should we replenish now, before the product disappears?"),
    trigger: L(
      `כיסוי המלאי ירד ל־${days.toFixed(1)} ימים לפי קצב המכירה ב־14 הימים האחרונים${paidTraffic ? ", וקמפיין ממומן עדיין מפנה תנועה למוצר" : ""}.`,
      `Stock cover fell to ${days.toFixed(1)} days at the last-14-day sales rate${paidTraffic ? ", and a paid campaign is still sending traffic to it" : ""}.`
    ),
    evidence,
    exposure: {
      label: L("הכנסה אחרונה שקשורה למוצר", "Recent revenue attached to this SKU"),
      value: ils(revenue14),
      quality: "known"
    },
    connected: {
      inputs: paidTraffic
        ? [L("מלאי", "Inventory"), L("מכירות", "Sales"), L("Meta", "Meta")]
        : [L("מלאי", "Inventory"), L("מכירות", "Sales")],
      conclusion: paidTraffic
        ? L("אזילת מלאי + חשיפה של תנועה ממומנת", "Stockout + paid traffic exposure")
        : L("אזילת מלאי של מוצר מוכר", "Stockout of a selling product")
    },
    options,
    recommendation: paidTraffic
      ? L(
          "לאשר חידוש מלאי היום. אם זמן האספקה של הספק ארוך מכיסוי המלאי הנותר — להסיט זמנית את התנועה הממומנת.",
          "Confirm replenishment today. If supplier lead time exceeds remaining stock cover, temporarily reroute paid traffic."
        )
      : L("לאשר חידוש מלאי היום. אין תנועה ממומנת מקושרת, כך שלא נדרשת הסטה.", "Confirm replenishment today. No paid traffic is attached, so no reroute is needed."),
    reason: null,
    confidence: "medium",
    confidenceReason: L(
      "המלאי, קצב המכירה וההוצאה ידועים; זמן אספקה ועלות רכש חסרים, ולכן לא ניתן לקבוע אם ההסטה נדרשת בפועל.",
      "Inventory, sales rate and spend are known; supplier lead time and purchase cost are missing, so whether a reroute is actually required cannot be settled."
    ),
    missingEvidence: [L("זמן אספקה של הספק", "Supplier lead time"), L("עלות רכש / חידוש מלאי", "Purchase / replenishment cost")],
    wouldChange: [
      L(`הספק מאשר שהמלאי מגיע בתוך ${Math.max(1, Math.floor(days))} ימים.`, `Supplier confirms stock arrives within ${Math.max(1, Math.floor(days))} days.`),
      L("קצב המכירה השבועי יורד ביותר מ־50%.", "Seven-day sales velocity falls by more than 50%.")
    ],
    unknown: null,
    primaryAction: "review",
    rank: revenue14,
    createdAt: alert.createdAt.toISOString(),
    human: humanOf(alert),
    outcome: outcomeOf(alert),
    entity: { type: "product", id: alert.relatedEntityId, label: title }
  };
}

function affiliateDecision(alert: AlertRow, ctx: DecisionContext): Decision {
  const s = ctx.leakage;
  const returningCommission = s?.returningCustomer.commission ?? num(alert.currentValue);
  const returningConversions = s?.returningCustomer.conversions ?? 0;
  const share = s ? s.leakageRate : null;
  const top = (s?.topLeakyAffiliates ?? []).slice(0, 3);
  const evidence: EvidenceFact[] = [
    fact(L("עמלות על לקוחות חוזרים", "Commissions on returning customers"), ils(returningCommission), "affiliate", L("ייחוס שותפים", "Affiliate attribution"), "known", L("30 הימים האחרונים", "last 30 days")),
    fact(L("לקוחות קיימים", "Existing customers"), `${returningConversions.toLocaleString("en-US")}`, "affiliate", L("ייחוס שותפים × הזמנות Shopify", "Affiliate attribution × Shopify Orders"), "known", L("המרות של לקוחות חוזרים", "returning-customer conversions")),
    fact(L("חלק מכלל העמלות", "Share of affiliate commissions"), share === null ? null : pct(share), "affiliate", L("מחושב", "Calculated"), share === null ? "unavailable" : "calculated"),
    ...top.map((t) =>
      fact(L("חשיפה גבוהה", "Highest exposure"), ils(t.returningCommission), "affiliate", L("ייחוס שותפים", "Affiliate attribution"), "known", L(t.name, t.name))
    )
  ];
  return {
    id: alert.id,
    kind: "commission_leakage",
    status: "test",
    title: L("האם אנחנו משלמים עמלת שותפים מיותרת?", "Are we overpaying affiliate commission?"),
    question: L("האם לקוחות חוזרים צריכים לייצר עמלת שותפים מלאה?", "Should returning customers generate full affiliate commission?"),
    trigger: L(
      `${share === null ? "חלק משמעותי" : pct(share)} מעמלות השותפים ב־30 הימים האחרונים שולמו על רכישות של לקוחות קיימים.`,
      `${share === null ? "A significant share" : pct(share)} of affiliate commission in the last 30 days was paid on purchases by existing customers.`
    ),
    evidence,
    exposure: {
      label: L("עמלות ששולמו על לקוחות חוזרים", "Commission paid on returning customers"),
      value: ils(returningCommission),
      quality: "known"
    },
    connected: {
      inputs: [L("שותפים", "Affiliate"), L("היסטוריית לקוחות", "Customer history")],
      conclusion: L("עמלה מלאה על רכישות חוזרות ללא הוכחת תוספתיות", "Full commission on repeat purchases without proof of incrementality")
    },
    options: [
      { key: "keep", label: L("להשאיר את המדיניות", "Keep the current policy"), recommended: false },
      { key: "review_returning", label: L("לבחון מדיניות עמלה ללקוחות חוזרים לפני שינוי גלובלי", "Review the commission policy for returning customers before changing the program globally"), recommended: true },
      { key: "remove_returning", label: L("לבטל עמלה על לקוחות חוזרים", "Remove commission on returning customers"), recommended: false }
    ],
    recommendation: L(
      "לבחון את מדיניות העמלה עבור לקוחות קיימים שרכשו לאחרונה, לפני שינוי התוכנית לכולם.",
      "Review the commission policy for recent existing customers before changing the program globally."
    ),
    reason: null,
    confidence: "medium",
    confidenceReason: L(
      "הסכומים והלקוחות ידועים. לא ידוע אילו מהרכישות החוזרות נגרמו באמת על ידי השותף.",
      "The amounts and customers are known. It is not known which of the repeat purchases were genuinely caused by the affiliate."
    ),
    missingEvidence: [L("תוספתיות — כמה מהרכישות החוזרות לא היו קורות בלי השותף", "Incrementality — how many repeat purchases would not have happened without the affiliate")],
    wouldChange: [
      L("ראיה שהרכישות החוזרות הגיעו דרך השותף (קופון/קליק ראשון) ולא מלקוח שחזר בעצמו.", "Evidence that the repeat purchases came through the affiliate (coupon / first touch) rather than a customer returning on their own.")
    ],
    unknown: L(
      "לא ניתן כרגע לקבוע כמה מהרכישות החוזרות האלה נגרמו באמת בזכות השותף.",
      "We cannot currently determine how many of these repeat purchases were genuinely caused by the affiliate."
    ),
    primaryAction: "review",
    rank: returningCommission,
    createdAt: alert.createdAt.toISOString(),
    human: humanOf(alert),
    outcome: outcomeOf(alert),
    entity: null
  };
}

function standaloneLossDecision(alert: AlertRow, ctx: DecisionContext): Decision {
  const p = payloadOf(alert);
  const title = String(p.title ?? alert.title);
  const units = num(p.units);
  const discounts = num(p.discounts);
  const contribution = num(p.contribution);
  const inBundle = alert.relatedEntityId ? ctx.bundleComponentIds.has(alert.relatedEntityId) : false;
  const basketQuality: EvidenceQuality = inBundle ? "estimated" : "unavailable";
  const evidence: EvidenceFact[] = [
    fact(L("יחידות שנמכרו", "Units sold"), units.toLocaleString("en-US"), "shopify", L("הזמנות Shopify", "Shopify Orders"), "known", L("90 ימים", "90 days")),
    fact(L("הנחות", "Discounts"), ils(discounts), "shopify", L("הזמנות Shopify", "Shopify Orders"), "known", L("90 ימים", "90 days")),
    fact(L("תרומת המוצר", "Product contribution"), ils(contribution), "profit", L("מכירות נטו − עלות", "Net sales − COGS"), "calculated", L("90 ימים, ברמת המוצר בלבד", "90 days, SKU standalone")),
    fact(L("כיסוי עלויות", "COGS coverage"), "100%", "profit", L("עלות מוצר אמיתית", "Real product cost on file"), "known"),
    fact(
      L("כלכלת הסל", "Basket-level economics"),
      inBundle ? L("מוגדר כרכיב בחבילה", "Defined as a bundle component") : null,
      "profit",
      L("מבנה סלים", "Basket structure"),
      basketQuality,
      inBundle ? undefined : L("לא זמין כרגע", "currently unavailable")
    )
  ];
  return {
    id: alert.id,
    kind: "decision_standalone_loss",
    status: "do_not_act",
    title: L(`${title} נראה לא רווחי — אבל עדיין לא להסיר את ההצעה`, `${title} looks unprofitable — but don't remove the offer yet`),
    question: L("האם להסיר את ההצעה על סמך הכלכלה של המוצר בפני עצמו?", "Should the offer be removed based on the SKU's standalone economics?"),
    trigger: L(
      `תרומת המוצר ב־90 הימים האחרונים שלילית (${ils(contribution)}) עם עלות אמיתית ידועה.`,
      `The SKU's contribution in the last 90 days is negative (${ils(contribution)}) with a real cost on file.`
    ),
    evidence,
    exposure: { label: L("הנחות שניתנו על המוצר", "Discounts given on this SKU"), value: ils(discounts), quality: "known" },
    connected: {
      inputs: [L("מכירות", "Sales"), L("הנחות", "Discounts"), L("עלות", "COGS")],
      conclusion: L("הפסד ברמת המוצר, ללא ראיה ברמת ההזמנה", "Standalone loss, no order-level evidence")
    },
    options: [
      { key: "remove", label: L("להסיר את ההצעה", "Remove the offer"), recommended: false },
      { key: "keep_measure", label: L("להשאיר ולמדוד תרומה ברמת הסל", "Keep and measure basket-level contribution"), recommended: true },
      { key: "reduce_discount", label: L("להקטין את ההנחה", "Reduce the discount"), recommended: false }
    ],
    recommendation: L("לא להסיר את ההצעה על סמך הכלכלה של המוצר בפני עצמו בלבד.", "Do not remove the offer based only on the SKU's standalone economics."),
    reason: L("ייתכן שהמוצר משמש כמוצר פיתוי בתוך סלים רב־מוצריים רווחיים.", "This product may function as a loss leader inside profitable multi-product baskets."),
    confidence: "low",
    confidenceReason: L(
      "הכלכלה ברמת המוצר ידועה, אבל תרומת ההזמנות שבהן הוא נמכר לא נמדדה — וזה מה שמכריע.",
      "The SKU-level economics are known, but the contribution of the orders it sells in has not been measured — and that is what decides."
    ),
    missingEvidence: [L("תרומה ברמת ההזמנה / הסל", "Order / basket-level contribution")],
    wouldChange: [L("אישור של תרומה שלילית ברמת ההזמנה / הסל המלא.", "Confirmed negative contribution at the full order / basket level.")],
    unknown: null,
    primaryAction: "see_evidence",
    rank: Math.abs(contribution),
    createdAt: alert.createdAt.toISOString(),
    human: humanOf(alert),
    outcome: outcomeOf(alert),
    entity: { type: "product", id: alert.relatedEntityId, label: title }
  };
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
  const evidence: EvidenceFact[] = [
    fact(L("מבצע מתחרה", "Competitor promotion"), discount === null ? L("מבצע פעיל", "Promotion active") : `${discount}%`, "market", L("מעקב מתחרים", "Competitor monitoring"), "known", L(`התחיל לפני ${startedDays} ימים`, `started ${startedDays} days ago`)),
    fact(L("מוצר תואם", "Matched product"), null, "market", L("התאמת מוצרים", "Product matching"), "unavailable", L("התאמה בין מוצרי המתחרה למוצרים שלכם עדיין לא זמינה", "Competitor ↔ your-SKU matching is not available yet")),
    fact(L("קצב מכירות", "Sales velocity"), velocityLabel, "shopify", L("הזמנות Shopify, 7 ימים מול 7 קודמים", "Shopify Orders, 7d vs prior 7d"), v === null ? "unavailable" : "calculated"),
    fact(L("המרה", "Conversion"), ctx.pulse.conversionRate === null ? null : pct(ctx.pulse.conversionRate, 1), "shopify", L("GA4", "GA4"), ctx.pulse.conversionQuality, ctx.pulse.conversionRate === null ? L("GA4 לא מחובר", "GA4 not connected") : undefined),
    fact(L("מרווח", "Margin"), ctx.pulse.marginRate === null ? null : pct(ctx.pulse.marginRate), "profit", L("מרווח תרומה, 30 ימים", "Contribution margin, 30 days"), ctx.pulse.marginQuality)
  ];
  return {
    id: alert.id,
    kind: "competitor_promo",
    status,
    title: demandHit
      ? L(`${name} השיקו מבצע${discount !== null ? ` של ${discount}%` : ""} — הביקוש שלכם נפגע`, `${name} launched a ${discount !== null ? `${discount}% ` : ""}promotion — your demand is affected`)
      : L(`${name} השיקו מבצע${discount !== null ? ` של ${discount}%` : ""} — עדיין אין הצדקה לתגובה`, `${name} launched a ${discount !== null ? `${discount}% ` : ""}promotion — no response justified yet`),
    question: L("האם להשוות את ההנחה של המתחרה?", "Should we match the competitor's discount?"),
    trigger: L(`זוהה מבצע חדש אצל ${name}${discount !== null ? ` (עד ${discount}%)` : ""}.`, `A new promotion was detected at ${name}${discount !== null ? ` (up to ${discount}%)` : ""}.`),
    evidence,
    exposure: ctx.pulse.sales7 === null ? null : { label: L("מכירות נטו, 7 ימים אחרונים", "Net sales, last 7 days"), value: ils(ctx.pulse.sales7), quality: "known" },
    connected: {
      inputs: [L("שוק", "Market"), L("מכירות", "Sales"), L("רווח", "Profit")],
      conclusion: demandHit ? L("מבצע מתחרה + ירידה בביקוש", "Competitor promotion + demand drop") : L("מבצע מתחרה ללא השפעה פנימית נמדדת", "Competitor promotion with no measured internal impact")
    },
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
    missingEvidence: [
      L("התאמת מוצר מתחרה ↔ מוצר שלכם", "Competitor SKU ↔ your SKU match"),
      ...(ctx.pulse.conversionRate === null ? [L("מגמת המרה (GA4)", "Conversion trend (GA4)")] : [])
    ],
    wouldChange: [
      L("ההמרה יורדת ביותר מ־8%.", "Conversion drops >8%."),
      L("קצב המכירות יורד ביותר מ־12%.", "Sales velocity drops >12%."),
      L("המבצע נמשך יותר מ־7 ימים.", "Promotion continues >7 days.")
    ],
    unknown: null,
    primaryAction: "review",
    rank: 0,
    createdAt: alert.createdAt.toISOString(),
    human: humanOf(alert),
    outcome: outcomeOf(alert),
    entity: { type: "competitor", id: competitorId, label: name }
  };
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
  return {
    id: alert.id,
    kind: "roas_collapse",
    status: "change_plan",
    title: L(`הקמפיין ${campaign} איבד יעילות`, `Campaign ${campaign} lost efficiency`),
    question: L("האם להמשיך להשקיע בקמפיין הזה במתכונת הנוכחית?", "Should this campaign keep running in its current form?"),
    trigger: L("ה־ROAS של הקמפיין ירד מתחת ליעד בחלון הדוח.", "The campaign's ROAS fell below target in the report window."),
    evidence,
    exposure: { label: L("הוצאה בקמפיין", "Campaign spend"), value: ils(spend), quality: "known" },
    connected: {
      inputs: [L("Meta", "Meta"), L("רווח", "Profit")],
      conclusion: belowBreakeven ? L("הוצאה מתחת לנקודת האיזון", "Spend below breakeven") : L("יעילות יורדת", "Falling efficiency")
    },
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
    createdAt: alert.createdAt.toISOString(),
    human: humanOf(alert),
    outcome: outcomeOf(alert),
    entity: { type: "campaign", id: alert.relatedEntityId, label: campaign }
  };
}

function decisionFromAlert(alert: AlertRow, ctx: DecisionContext): Decision | null {
  switch (alert.type) {
    case "stockout_imminent":
      return stockoutDecision(alert, ctx);
    case "commission_leakage":
      return affiliateDecision(alert, ctx);
    case "decision_standalone_loss":
      return standaloneLossDecision(alert, ctx);
    case "competitor_promo":
      return competitorDecision(alert, ctx);
    case "roas_collapse":
      return roasDecision(alert, ctx);
    default:
      return null;
  }
}

// ── Derived engine: standalone-loss product (DO NOT ACT) ────────────────

async function upsertStandaloneLossDecisions(storeId: string, now: Date): Promise<number> {
  const db = getDb() as any;
  const d90 = new Date(now.getTime() - 90 * DAY_MS);
  const rows = (await db.$queryRaw`
    SELECT
      p.id AS product_id,
      p.title AS title,
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
      payloadJson: {
        title: r.title,
        units: num(r.units),
        discounts: num(r.discounts),
        net: num(r.net),
        cogs: num(r.cogs),
        contribution
      },
      periodLabel: `Trailing 90d → ${now.toISOString().slice(0, 10)}`
    }).catch(() => null);
  }
  await resolveStaleAlerts({
    storeId,
    detectedBy: "decision-inbox-service",
    type: "decision_standalone_loss",
    keepFingerprints: keep
  }).catch(() => null);
  return rows.length;
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
    swallow("standalone-loss engine", upsertStandaloneLossDecisions(storeId, now)),
    swallow("outcome measurement", measureOutcomesForResolvedAlerts({ storeId }))
  ]);
  return {
    productsReviewed:
      (stockout?.productsConsidered ?? 0) +
      (stockout?.productsSkippedNoVelocity ?? 0) +
      (stockout?.productsSkippedNoInventory ?? 0),
    campaignsReviewed: (roas?.campaignsConsidered ?? 0) + (roas?.campaignsBelowMinSpend ?? 0)
  };
}

const STATUS_ORDER: Record<DecisionStatus, number> = { act: 0, change_plan: 1, test: 2, do_not_act: 3, watch: 4 };

function watchItemFromDecision(d: Decision): WatchItem {
  return {
    id: `decision:${d.id}`,
    title: d.title,
    detail: d.reason ?? d.trigger,
    source: d.evidence[0]?.source ?? "shopify",
    since: d.createdAt,
    decisionId: d.id
  };
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
      title: L(`היעילות של ${c.campaignName} נחלשת — עדיין מעל סף העסק`, `${c.campaignName} efficiency weakening — still above business threshold`),
      detail: L(
        `ROAS ${c.roas!.toFixed(1)}× מול ${overview.blendedRoas!.toFixed(1)}× ממוצע החשבון; נקודת איזון ${be.toFixed(1)}×.`,
        `ROAS ${c.roas!.toFixed(1)}× vs ${overview.blendedRoas!.toFixed(1)}× account blended; breakeven ${be.toFixed(1)}×.`
      ),
      source: "meta" as const,
      since: now.toISOString(),
      decisionId: null
    }));
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

  const decisionAlerts = openAlerts.filter((a) => (DECISION_TYPES as readonly string[]).includes(a.type));
  const otherAlerts = openAlerts.filter((a) => !(DECISION_TYPES as readonly string[]).includes(a.type));

  const all = decisionAlerts
    .map((a) => decisionFromAlert(a, ctx))
    .filter((d): d is Decision => d !== null)
    // Pending decisions only — a decision the manager already made leaves
    // the inbox and lives in Memory.
    .filter((d) => d.human.choice === "pending")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.rank - a.rank);

  const decisions = all.slice(0, MAX_INBOX_CARDS);
  const overflow = all.slice(MAX_INBOX_CARDS);

  const watchlist: WatchItem[] = [
    ...overflow.map(watchItemFromDecision),
    ...decisions.filter((d) => d.status === "watch").map(watchItemFromDecision),
    ...metaWatchItems(meta, ctx.pulse, now),
    ...otherAlerts.filter((a) => a.severity === "medium" || a.severity === "low").slice(0, 8).map(watchItemFromAlert)
  ];
  if (ctx.leakage && ctx.leakage.returningCustomer.commission > 0 && !all.some((d) => d.kind === "commission_leakage")) {
    watchlist.push({
      id: "affiliate:returning",
      title: L("עמלות שותפים על לקוחות חוזרים — מתחת לסף לבדיקה", "Affiliate commission on returning customers — below the review threshold"),
      detail: L(
        `${ils(ctx.leakage.returningCustomer.commission)} ב־30 ימים (${pct(ctx.leakage.leakageRate)} מהעמלות).`,
        `${ils(ctx.leakage.returningCustomer.commission)} in 30 days (${pct(ctx.leakage.leakageRate)} of commission).`
      ),
      source: "affiliate",
      since: now.toISOString(),
      decisionId: null
    });
  }

  const affiliateReviewed = ctx.leakage
    ? ctx.leakage.newCustomer.conversions + ctx.leakage.returningCustomer.conversions + ctx.leakage.unclassified.conversions
    : 0;
  const reviewed =
    counts.productsReviewed +
    Math.max(counts.campaignsReviewed, meta?.campaigns.length ?? 0) +
    affiliateReviewed +
    competitorSnapshots +
    openAlerts.length;
  const watchingDistinct = new Set(watchlist.map((w) => w.decisionId ?? w.id)).size;

  return {
    decisions,
    watchlist,
    stats: {
      decisions: decisions.length,
      watching: watchingDistinct,
      reviewed,
      suppressed: Math.max(0, reviewed - decisions.length - watchingDistinct),
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

// ── Human decision ──────────────────────────────────────────────────────

export type HumanChoiceInput = "approve" | "alternative" | "ignore";

export async function recordHumanDecision(input: {
  storeId: string;
  id: string;
  choice: HumanChoiceInput;
  optionKey?: string;
  by: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const db = getDb();
  const existing = await db.alert.findFirst({
    where: { id: input.id, storeId: input.storeId },
    select: { id: true, payloadJson: true }
  });
  if (!existing) return { ok: false, reason: "not_found" };
  const status = input.choice === "approve" ? "resolved" : input.choice === "ignore" ? "ignored" : "acknowledged";
  const choice: HumanDecision["choice"] =
    input.choice === "approve" ? "approved" : input.choice === "ignore" ? "ignored" : "alternative";
  const prev = existing.payloadJson && typeof existing.payloadJson === "object" ? (existing.payloadJson as Record<string, unknown>) : {};
  const humanDecision: HumanDecision = {
    choice,
    optionKey: input.optionKey,
    decidedAt: new Date().toISOString(),
    decidedBy: input.by
  };
  await db.alert.update({
    where: { id: input.id },
    data: {
      status,
      resolvedAt: new Date(),
      resolvedBy: `user:${input.by}`,
      payloadJson: { ...prev, humanDecision } as any
    }
  });
  return { ok: true };
}

// ── Memory ──────────────────────────────────────────────────────────────

const KIND_STATUS: Record<string, DecisionStatus> = {
  stockout_imminent: "act",
  commission_leakage: "test",
  decision_standalone_loss: "do_not_act",
  competitor_promo: "watch",
  roas_collapse: "change_plan"
};

export interface DecisionMemory {
  entries: MemoryEntry[];
  learnings: Localized[];
}

export const listDecisionMemory = cache(async (storeId: string): Promise<DecisionMemory> => {
  const db = getDb();
  const d90 = new Date(Date.now() - 90 * DAY_MS);
  const rows = (await db.alert
    .findMany({
      where: { storeId, type: { in: [...DECISION_TYPES] }, createdAt: { gte: d90 } },
      orderBy: { createdAt: "desc" },
      take: 60
    })
    .catch(() => [])) as AlertRow[];
  const ctx = await getContext(storeId);

  const entries: MemoryEntry[] = rows.map((a) => {
    const d = decisionFromAlert(a, ctx);
    return {
      id: a.id,
      kind: a.type,
      status: d?.status ?? KIND_STATUS[a.type] ?? "watch",
      title: d?.title ?? L(a.title, a.title),
      recommendation: d?.recommendation ?? L(a.recommendedAction ?? "", a.recommendedAction ?? ""),
      createdAt: a.createdAt.toISOString(),
      human: humanOf(a),
      outcome: outcomeOf(a)
    };
  });

  // Learnings are only stated when the ledger holds evidence for them.
  const learnings: Localized[] = [];
  const competitorClosed = entries.filter((e) => e.kind === "competitor_promo" && e.human.choice !== "pending");
  const competitorNoAction = competitorClosed.filter((e) => e.human.choice === "ignored" || e.human.optionKey === "hold");
  if (competitorClosed.length >= 2 && competitorNoAction.length >= 2) {
    learnings.push(
      L(
        `מבצעי מתחרים לא תמיד דרשו תגובת מחיר: ${competitorNoAction.length} מתוך ${competitorClosed.length} מקרים ב־90 הימים האחרונים נסגרו ללא פעולה.`,
        `Competitor promotions have not always required a price response: ${competitorNoAction.length} of ${competitorClosed.length} cases in the last 90 days closed without action.`
      )
    );
  }
  const stockouts = entries.filter((e) => e.kind === "stockout_imminent");
  if (stockouts.length >= 2) {
    learnings.push(
      L(
        `הפרעות מלאי במוצרי־עוגן חוזרות על עצמן: ${stockouts.length} מקרים ב־90 הימים האחרונים.`,
        `Hero-SKU inventory interruptions recur: ${stockouts.length} cases in the last 90 days.`
      )
    );
  }
  const affiliateMonths = new Set(entries.filter((e) => e.kind === "commission_leakage").map((e) => e.createdAt.slice(0, 7)));
  if (affiliateMonths.size >= 2) {
    learnings.push(
      L(
        `עמלת שותפים על לקוחות חוזרים היא נושא חוזר לבדיקה: עלה ב־${affiliateMonths.size} חודשים שונים.`,
        `Returning-customer affiliate commission is a recurring area for review: raised in ${affiliateMonths.size} different months.`
      )
    );
  }
  const measured = entries.filter((e) => e.outcome);
  const wins = measured.filter((e) => e.outcome!.verdict === "win").length;
  if (measured.length >= 3) {
    learnings.push(
      L(
        `מתוך ${measured.length} החלטות שנמדדו, ${wins} הסתיימו בשיפור מדיד.`,
        `Of ${measured.length} measured decisions, ${wins} ended in a measurable improvement.`
      )
    );
  }
  return { entries, learnings };
});

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
  decisionId: string | null;
  decisionStatus: DecisionStatus | null;
}

export interface MarketView {
  tracked: number;
  detected: number;
  relevant: number;
  suppressed: number;
  events: MarketEvent[];
  quiet: Array<{ name: string; domain: string; summary: Localized }>;
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
      decisionId: decision?.id ?? null,
      decisionStatus: decision?.status ?? null
    };
  });
  const quiet = entries
    .filter((e) => !relevantEntries.includes(e))
    .map((e) => ({ name: e.name, domain: e.domain, summary: e.change.summary }));
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
}

export const buildDataHealth = cache(async (storeId: string): Promise<DataHealth> => {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const db = getDb() as any;
  const [health, cost, crawl, competitors, ganttSheets, leakage] = await Promise.all([
    buildSetupHealth({ storeId }).catch(() => null),
    computeCostCoverage(storeId, d30, now),
    getCompetitorCrawlSummary(storeId).catch(() => null),
    listCompetitors(storeId).catch(() => []),
    db.ganttSheet.count({ where: { storeId } }).catch(() => 0) as Promise<number>,
    getCommissionLeakageSummary({ storeId, start: d30, end: now }).catch(() => null)
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
    {
      key: "meta",
      label: L("Meta", "Meta"),
      state: stateOf(metaC?.status),
      detail: metaC?.description ?? L("לא נבדק", "Not checked"),
      fixHref: metaC?.status === "pass" ? null : (metaC?.fixHref ?? "/settings")
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
      detail: L(
        `${pct(cost.coverage)} מההכנסות ב־30 יום מגובות בעלות אמיתית · ${cost.productsMissing} מוצרים ללא עלות`,
        `${pct(cost.coverage)} revenue coverage over 30 days · ${cost.productsMissing} products without a cost`
      ),
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
    suppressedDecisions: cost.productsMissing
  };
});
