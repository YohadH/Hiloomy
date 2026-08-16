// Data reconciliation for the executive weekly report.
//
// Pairs Meta Ads spend (from MetaAdsCampaignInsight) with Shopify revenue
// (from Order) over the same date range, calculates the blended ROAS, and
// runs validation checks that surface to the PDF as honest warnings:
//   • Does Meta have synced rows for every day in the report window?
//   • Does Meta-attributed purchase count match Shopify order count?
//   • Are there cancelled/test orders skewing the picture?
//
// Output shape is consumed by:
//   • Page 1 (Executive Summary) — the bottom-line numbers
//   • Page 3 (Data Reconciliation) — the source-by-source table
//   • Blended-ROAS narrative used in the AI insights prompt
//
// Source-of-truth principle:
//   Shopify is authoritative for revenue/orders/customers.
//   Meta is authoritative for spend/clicks/impressions/CTR/CPC/CPM.
//   Anything mixed is labeled "Calc" or "Blended".

import { getDb } from "@/lib/server/db";

export type DataSource = "meta" | "shopify" | "calc" | "blended";

export interface SourcedNumber {
  value: number | null;
  source: DataSource;
}

export interface ReconciliationReport {
  dateRange: { start: string; end: string; daysInRange: number };
  meta: {
    spend: number;
    attributedPurchases: number;
    impressions: number;
    clicks: number;
    daysWithData: number;
    expectedDays: number;
  };
  shopify: {
    revenue: number;
    orders: number;
    refunds: number;
    netRevenue: number;
    aov: number;
    newCustomers: number;
    returningCustomers: number;
    // Orders where the buyer didn't log in or otherwise didn't get linked
    // to a Customer row. They count toward total orders + revenue but can't
    // be classified as new/returning. Surfacing this lets the founder see
    // why newCustomers + returningCustomers may not equal total orders.
    guestOrders: number;
    daysWithOrders: number;
  };
  blended: {
    roas: number | null; // Shopify net revenue / Meta spend
    cpa: number | null; // Meta spend / Shopify orders
    label: string; // Hebrew narrative explaining the blended numbers
  };
  validation: {
    ok: boolean;
    warnings: Array<{
      severity: "info" | "warning" | "error";
      // "data" — pipeline / sync / gap warnings. Belong to the reconciliation
      //          section, NOT the executive top-risk card.
      // "business" — ROAS drops, attribution gaps, purchase-count mismatches.
      //              These deserve founder attention on page 1.
      kind: "data" | "business";
      messageHe: string;
      messageEn: string;
    }>;
    purchaseDelta: {
      metaPurchases: number;
      shopifyOrders: number;
      diff: number;
      pctDiff: number | null; // null if either side is 0
    };
  };
}

export interface BuildReconciliationInput {
  storeId: string;
  start: Date;
  end: Date;
}

function diffInDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function pctChange(current: number, base: number): number | null {
  if (base === 0) return null;
  return ((current - base) / base) * 100;
}

function buildBlendedNarrative(input: {
  metaSpend: number;
  shopifyNetRevenue: number;
  shopifyOrders: number;
  roas: number | null;
  cpa: number | null;
  purchaseDeltaPct: number | null;
}): string {
  if (input.metaSpend <= 0) {
    return "אין הוצאת מדיה בMeta בטווח התאריכים שנבחר — לא ניתן לחשב ROAS משוקלל.";
  }
  if (input.shopifyOrders === 0) {
    return "לא נמצאו הזמנות בShopify בטווח התאריכים שנבחר. ROAS משוקלל אינו רלוונטי.";
  }
  const parts: string[] = [];
  if (input.roas != null) {
    parts.push(`ROAS משוקלל (הכנסות Shopify / הוצאת Meta) עומד על ${input.roas.toFixed(2)}x`);
  }
  if (input.cpa != null) {
    parts.push(`CPA משוקלל הוא ₪${input.cpa.toFixed(2)} להזמנה`);
  }
  if (input.purchaseDeltaPct != null && Math.abs(input.purchaseDeltaPct) > 10) {
    parts.push(
      `קיים פער של ${input.purchaseDeltaPct.toFixed(1)}% בין מספר הרכישות לפי Meta לבין הזמנות Shopify — שיוך לקמפיין אינו זהה למקור ההזמנה`
    );
  }
  return parts.join(". ") + ".";
}

export async function buildReconciliationReport(
  input: BuildReconciliationInput
): Promise<ReconciliationReport> {
  const db = getDb();

  const daysInRange = diffInDays(input.start, input.end);
  const dateRange = {
    start: input.start.toISOString().slice(0, 10),
    end: input.end.toISOString().slice(0, 10),
    daysInRange
  };

  // ── Meta side ────────────────────────────────────────────────────────
  const connection = await db.metaAdsConnection.findUnique({
    where: { storeId: input.storeId }
  });

  let metaSpend = 0;
  let metaPurchases = 0;
  let metaImpressions = 0;
  let metaClicks = 0;
  let metaDaysWithData = 0;

  if (connection) {
    // Filter by dateStart only — Meta's `dateStop` is the EXCLUSIVE
    // start of the next day; `dateStop <= end` drops the last day.
    const metaRows = await db.metaAdsCampaignInsight.findMany({
      where: {
        storeId: input.storeId,
        adAccountId: connection.adAccountId,
        level: "campaign",
        dateStart: { gte: input.start, lte: input.end }
      },
      select: {
        spend: true,
        impressions: true,
        clicks: true,
        purchases: true,
        dateStart: true
      }
    });
    const distinctDays = new Set<string>();
    for (const row of metaRows as any[]) {
      metaSpend += Number(row.spend ?? 0);
      metaImpressions += Number(row.impressions ?? 0);
      metaClicks += Number(row.clicks ?? 0);
      metaPurchases += Number(row.purchases ?? 0);
      const day = row.dateStart instanceof Date ? row.dateStart.toISOString().slice(0, 10) : String(row.dateStart);
      distinctDays.add(day);
    }
    metaDaysWithData = distinctDays.size;
  }

  // ── Shopify side ─────────────────────────────────────────────────────
  // Filter out test orders + cancelled. We count revenue from totalPrice
  // (the gross the customer paid) and subtract totalRefunds explicitly so
  // the executive number reflects what actually came in.
  const orders = await db.order.findMany({
    where: {
      storeId: input.storeId,
      createdAt: { gte: input.start, lte: input.end },
      test: false,
      cancelledAt: null
    },
    select: {
      totalPrice: true,
      totalRefunds: true,
      customerId: true,
      createdAt: true
    }
  });

  let shopifyRevenueGross = 0;
  let shopifyRefunds = 0;
  let guestOrders = 0;
  const customerIds = new Set<string>();
  const orderDays = new Set<string>();
  for (const o of orders as any[]) {
    shopifyRevenueGross += Number(o.totalPrice ?? 0);
    shopifyRefunds += Number(o.totalRefunds ?? 0);
    if (o.customerId) customerIds.add(String(o.customerId));
    else guestOrders += 1;
    orderDays.add(new Date(o.createdAt).toISOString().slice(0, 10));
  }
  const shopifyOrders = orders.length;
  const shopifyNetRevenue = shopifyRevenueGross - shopifyRefunds;

  // New vs returning split — Customer.isReturning is already computed by the
  // Shopify sync from full historical order count, which is exactly what we
  // want (not "did they order twice in the report week").
  let newCustomers = 0;
  let returningCustomers = 0;
  if (customerIds.size > 0) {
    const customers = await db.customer.findMany({
      where: { id: { in: Array.from(customerIds) } },
      select: { isReturning: true }
    });
    for (const c of customers as any[]) {
      if (c.isReturning) returningCustomers += 1;
      else newCustomers += 1;
    }
  }

  // ── Blended ─────────────────────────────────────────────────────────
  const roas = metaSpend > 0 ? shopifyNetRevenue / metaSpend : null;
  const cpa = metaSpend > 0 && shopifyOrders > 0 ? metaSpend / shopifyOrders : null;
  const purchaseDeltaPct = pctChange(metaPurchases, shopifyOrders);
  const blendedNarrative = buildBlendedNarrative({
    metaSpend,
    shopifyNetRevenue,
    shopifyOrders,
    roas,
    cpa,
    purchaseDeltaPct
  });

  // ── Validation ──────────────────────────────────────────────────────
  const warnings: ReconciliationReport["validation"]["warnings"] = [];

  if (!connection) {
    warnings.push({
      severity: "error",
      kind: "data",
      messageHe: "לא קיים חיבור Meta Ads לחנות הפעילה — נתוני המדיה חסרים בדוח.",
      messageEn: "No Meta Ads connection for the active store — media data is missing from the report."
    });
  } else if (metaDaysWithData < daysInRange) {
    warnings.push({
      severity: "warning",
      kind: "data",
      messageHe: `אזהרת נתונים: טווח הדוח הוא ${daysInRange} ימים, אך לMeta יש נתונים מסונכרנים רק ל${metaDaysWithData} מתוכם.`,
      messageEn: `Data warning: report range is ${daysInRange} days but Meta has synced data for only ${metaDaysWithData} of them.`
    });
  }

  if (orderDays.size < daysInRange) {
    // Not always an error — a small store might have orderless days. Info only.
    warnings.push({
      severity: "info",
      kind: "data",
      messageHe: `קיימות הזמנות ב${orderDays.size} מתוך ${daysInRange} ימי הדוח. הימים ללא הזמנות עשויים להיות תקינים בחנות קטנה.`,
      messageEn: `Orders exist on ${orderDays.size} of the ${daysInRange} report days. Zero-order days may be normal for a small store.`
    });
  }

  if (purchaseDeltaPct != null && Math.abs(purchaseDeltaPct) > 25) {
    warnings.push({
      severity: "warning",
      kind: "business",
      messageHe: `פער משמעותי בין רכישות Meta (${metaPurchases}) לבין הזמנות Shopify (${shopifyOrders}). הסיבות האפשריות: חלון ייחוס שונה, הזמנות שלא הגיעו מMeta, או רכישות שלא שויכו לקמפיין.`,
      messageEn: `Significant gap: Meta purchases (${metaPurchases}) vs Shopify orders (${shopifyOrders}). Likely causes: different attribution window, non-Meta orders, or unattributed purchases.`
    });
  }

  return {
    dateRange,
    meta: {
      spend: metaSpend,
      attributedPurchases: metaPurchases,
      impressions: metaImpressions,
      clicks: metaClicks,
      daysWithData: metaDaysWithData,
      expectedDays: daysInRange
    },
    shopify: {
      revenue: shopifyRevenueGross,
      orders: shopifyOrders,
      refunds: shopifyRefunds,
      netRevenue: shopifyNetRevenue,
      aov: shopifyOrders > 0 ? shopifyNetRevenue / shopifyOrders : 0,
      newCustomers,
      returningCustomers,
      guestOrders,
      daysWithOrders: orderDays.size
    },
    blended: {
      roas,
      cpa,
      label: blendedNarrative
    },
    validation: {
      ok: warnings.every((w) => w.severity !== "error"),
      warnings,
      purchaseDelta: {
        metaPurchases,
        shopifyOrders,
        diff: metaPurchases - shopifyOrders,
        pctDiff: purchaseDeltaPct
      }
    }
  };
}
