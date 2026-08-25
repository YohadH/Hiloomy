import type { AnalyticsRepository } from "@/lib/domain/repository";
import type {
  Alert,
  CollectionPerformanceRow,
  DailyMetric,
  Order,
  ProductPerformanceRow,
  ProductStockRow,
  StockFlag,
  Store,
  Summary
} from "@/lib/domain/types";
import { withOptionalDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";
import { buildDailyMetrics, buildDiscountUsage, buildProductPerformance } from "@/lib/server/analytics";
import { pickAnalyticsDiscountCode, shouldIgnoreOrderForAnalytics } from "@/lib/server/analytics-order-rules";
import { getReportingDateRangeSelection, getStoreTimeZone } from "@/lib/server/reporting-date-range";

const DISCONNECTED_PREVIEW_STORE: Store = {
  id: "local-preview-store",
  name: "Hiloomy Preview",
  domain: "setup-required.local",
  currency: "USD",
  connected: false,
  timezone: "UTC",
  dateRangePreset: "30d",
  estimatedCostMode: "margin_profile",
  defaultCostRatio: 0.35
};

function mapStore(store: any): Store {
  return {
    id: store.id,
    name: store.name,
    domain: store.domain,
    currency: store.currency,
    connected: store.connected,
    timezone: store.timezone,
    planName: store.planName ?? undefined,
    dateRangePreset: store.dateRangePreset,
    estimatedCostMode: store.estimatedCostMode,
    defaultCostRatio: toNumber(store.defaultCostRatio),
    isDemo: Boolean(store.isDemo)
  };
}

function mapOrders(records: any[]): Order[] {
  return records
    .filter((order) => !shouldIgnoreOrderForAnalytics(order))
    .map((order) => ({
      id: order.id,
      customerId: order.customerId,
      createdAt: order.createdAt.toISOString(),
      orderNumber: order.orderNumber,
      isRefunded: toNumber(order.totalRefunds) > 0,
      refundAmount: toNumber(order.totalRefunds),
      discountCode: pickAnalyticsDiscountCode(order.discountUsages?.map((discount: any) => discount.code) ?? []),
      totalPrice: toNumber(order.totalPrice),
      totalDiscounts: toNumber(order.totalDiscounts),
      lineItems: order.lineItems.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        title: item.title ?? null,
        quantity: item.quantity,
        unitPrice: item.quantity ? toNumber(item.lineSubtotal) / item.quantity : 0,
        discountAmount: toNumber(item.lineDiscountAmount),
        estimatedCost: toNumber(item.estimatedCostAmount),
        refundedQuantity: Number(item.refundedQuantity ?? 0),
        refundedSubtotal: toNumber(item.refundedSubtotal ?? 0)
      }))
    }));
}

function withAnalyticsOrderFilters(where: Record<string, unknown>) {
  // Exclude cancelled and test orders. Shopify Admin's Sales report excludes
  // both — counting them in our analytics is what made the Overview-fallback
  // and Profit pages disagree with Shopify Admin for stores that had any
  // cancellations or were created with test mode on. The reference correct
  // pattern is `computeSalesSummary` which has always applied this filter.
  // (NOTE: this was previously a no-op; the prior comment said "Shopify's
  // reports count every order" but Shopify's reports DON'T — they explicitly
  // exclude cancelled+test. The previous behavior was the bug, not a feature.)
  return {
    ...where,
    cancelledAt: null,
    test: false
  };
}

function mapSummary(summary: any): Summary {
  return {
    id: summary.id,
    headline: summary.headline,
    generatedAt: summary.generatedAt.toISOString(),
    sections: Array.isArray(summary.contentJson) ? summary.contentJson : []
  };
}

function mapStoredAlert(alert: any): Alert {
  // The Alert model now has both legacy columns (explanation / suggestedAction
  // / periodLabel / timestamp) and the canonical fields written by the
  // alert-writer (description / recommendedAction / createdAt). Prefer legacy
  // when present (rows from before the push-model migration), fall back to
  // canonical (rows from new writers).
  const explanation = alert.explanation ?? alert.description ?? "";
  const suggestedAction = alert.suggestedAction ?? alert.recommendedAction ?? "";
  const periodLabel = alert.periodLabel ?? "";
  const timestamp = (alert.timestamp ?? alert.createdAt) as Date;
  return {
    id: alert.id,
    severity: alert.severity,
    title: alert.title,
    explanation,
    suggestedAction,
    periodLabel,
    timestamp: timestamp.toISOString()
  };
}

async function getConnectedStoreRecord(): Promise<any | null> {
  return withOptionalDb(
    (db) =>
      db.store.findFirst({
        where: { connected: true, connection: { isNot: null } },
        orderBy: { updatedAt: "desc" }
      }),
    null
  );
}

async function getStoreRecord(storeId?: string): Promise<any | null> {
  if (storeId) {
    return withOptionalDb((db) => db.store.findUnique({ where: { id: storeId } }), null);
  }

  // Honor the operator's active-store pick (StoreSwitcher cookie / org
  // context) before the legacy "first store with a Shopify connection"
  // fallback. The legacy pick silently ignored the switcher and made any
  // store WITHOUT a ShopifyConnection row (e.g. the demo store) impossible
  // to view — the switch POST succeeded, the cookie was set, and the
  // dashboard still rendered the connected store. Session-less contexts
  // (crons, webhooks) throw inside resolveActiveStoreId's cookie read and
  // fall through to the legacy behavior unchanged.
  try {
    const { resolveActiveStoreId } = await import("@/lib/services/offline-sales-service");
    const activeId = await resolveActiveStoreId();
    if (activeId) {
      const active = await withOptionalDb(
        (db) => db.store.findUnique({ where: { id: activeId } }),
        null
      );
      if (active) return active;
    }
  } catch {
    // No request/auth context — use the legacy fallback below.
  }

  return getConnectedStoreRecord();
}

async function getOrdersForRange(storeId: string, start: Date, end: Date): Promise<any[]> {
  return withOptionalDb(
    (db) =>
      db.order.findMany({
        where: withAnalyticsOrderFilters({
          storeId,
          createdAt: {
            gte: start,
            lte: end
          }
        }),
        include: {
          lineItems: true,
          discountUsages: true
        },
        orderBy: { createdAt: "asc" }
      }),
    []
  );
}

async function getCustomerOrderHistory(storeId: string): Promise<Map<string, string[]>> {
  return withOptionalDb(async (db) => {
    const orders = await db.order.findMany({
      where: withAnalyticsOrderFilters({ storeId, customerId: { not: null } }),
      select: { id: true, customerId: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    });

    const history = new Map<string, string[]>();
    for (const order of orders) {
      if (!order.customerId) continue;
      const current = history.get(order.customerId) ?? [];
      current.push(order.id);
      history.set(order.customerId, current);
    }
    return history;
  }, () => new Map<string, string[]>());
}

async function getActiveRange() {
  const selection = await getReportingDateRangeSelection();
  return {
    current: { start: selection.start, end: selection.end },
    previous: { start: selection.comparison.start, end: selection.comparison.end }
  };
}

/**
 * Shopify-parity sales numbers for a window. Mirrors Shopify's Sales report:
 *  - gross / discounts / COGS / units come from line items (ex-tax), attributed
 *    by the ORDER date.
 *  - returns come from Refund rows, attributed by the REFUND date (this is the
 *    key difference from the old logic, which subtracted refunds on the order
 *    date and never reconciled with Shopify).
 *  - netSales = gross − discounts − returns
 *  - totalSales = netSales + shipping + taxes (Shopify's Total sales
 *    formula — see comment at the totalSales calc)
 */
export interface ShopifySalesSummary {
  orders: number;
  grossSales: number;
  discounts: number;
  // Full refund amount (line items + shipping + tax) — used in the
  // Shopify Total Sales formula: gross − discounts − returns + tax + ship.
  returns: number;
  // Line-items-only refund amount — used by contribution margin, where
  // the gross sales base also excludes shipping + tax. Mixing the two
  // (deducting shipping/tax refunds from a base that lacks shipping/tax
  // revenue) would under-state margin.
  returnsLineItems: number;
  netSales: number;
  shipping: number;
  taxes: number;
  totalSales: number;
  cogs: number;
  // Window commission net of refunds (shared computeWindowAffiliateCommission).
  affiliateCommission: number;
  // Contribution profit: net product sales − COGS − affiliate commission.
  // The ONE profit number every dashboard surface shows.
  estimatedProfit: number;
  unitsSold: number;
  returningOrders: number;
  returningCustomerRate: number;
  discountRate: number;
  refundRate: number;
  averageOrderValue: number;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Affiliate commission for a window, net of refunds — THE one shared
// implementation (SA clarity fix 2026-08-23). Both the overview KPI's
// estimated profit and the contribution-margin snapshot deduct THIS
// number, so the dashboard shows a single profit figure instead of two
// engines disagreeing by the commission amount. Refund-fraction deduction
// matches the affiliate portal (see DISC-FIX): a refunded order claws its
// commission back proportionally.
export async function computeWindowAffiliateCommission(
  db: any,
  storeId: string,
  start: Date,
  end: Date
): Promise<number> {
  if (!db?.affiliateAttribution) return 0;
  const rows = (await db.affiliateAttribution.findMany({
    where: { storeId, occurredAt: { gte: start, lte: end } },
    select: {
      commissionAmount: true,
      order: { select: { totalPrice: true, totalRefunds: true } }
    }
  })) as Array<{
    commissionAmount: unknown;
    order: { totalPrice?: unknown; totalRefunds?: unknown } | null;
  }>;
  return rows.reduce((sum, row) => {
    const commission = Number(row.commissionAmount ?? 0);
    const total = Number(row.order?.totalPrice ?? 0);
    const refunds = Number(row.order?.totalRefunds ?? 0);
    const refundFraction = total > 0 && refunds > 0 ? Math.min(refunds / total, 1) : 0;
    return sum + commission * (1 - refundFraction);
  }, 0);
}

async function computeSalesSummary(
  db: any,
  storeId: string,
  start: Date,
  end: Date
): Promise<ShopifySalesSummary> {
  const [orderAgg, lineAgg, refundAgg, returningRows, affiliateCommission] = await Promise.all([
    db.order.aggregate({
      // Shopify's Sales report excludes cancelled and test orders.
      where: { storeId, createdAt: { gte: start, lte: end }, cancelledAt: null, test: false },
      _count: { _all: true },
      _sum: { totalShipping: true, totalTax: true }
    }),
    db.orderLineItem.aggregate({
      where: { storeId, order: { createdAt: { gte: start, lte: end }, cancelledAt: null, test: false } },
      _sum: { lineSubtotal: true, lineDiscountAmount: true, estimatedCostAmount: true, quantity: true }
    }),
    db.refund.aggregate({
      // Attribute refunds to the REFUND date, not the original order's
      // date. Shopify Analytics records a return as negative sales on the
      // day the refund was created — a February refund of a January order
      // reduces FEBRUARY totals in Shopify's dashboard. The previous
      // order-date attribution here (a) mismatched Shopify's numbers on
      // any window containing cross-window refunds and (b) disagreed with
      // our own daily series, which already buckets returns by refund day.
      //
      // Sum BOTH the full refund (refundedAmount, includes shipping + tax
      // portions) for the Total Sales formula and the line-items-only sum
      // (refundedLineItemsAmount) for contribution margin. See comment on
      // ShopifySalesSummary.returnsLineItems for why these can't share.
      where: {
        storeId,
        createdAt: { gte: start, lte: end },
        order: { cancelledAt: null, test: false }
      },
      _sum: { refundedAmount: true, refundedLineItemsAmount: true }
    }),
    // Set-based: one grouped scan for each customer's first-ever order, then a
    // hash join. (A per-row correlated EXISTS here took 60-190s on 31k orders.)
    db.$queryRaw`
      WITH firsts AS (
        SELECT "customerId", MIN("createdAt") AS first_at
        FROM "Order"
        WHERE "storeId" = ${storeId} AND "customerId" IS NOT NULL
          AND "cancelledAt" IS NULL AND "test" = false
        GROUP BY "customerId"
      )
      SELECT COUNT(*)::bigint AS count
      FROM "Order" o
      JOIN firsts f ON f."customerId" = o."customerId"
      WHERE o."storeId" = ${storeId}
        AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
        AND o."cancelledAt" IS NULL AND o."test" = false
        AND o."createdAt" > f.first_at`,
    computeWindowAffiliateCommission(db, storeId, start, end).catch(() => 0)
  ]);

  const orders = num(orderAgg._count?._all);
  const grossSales = num(lineAgg._sum?.lineSubtotal);
  const discounts = num(lineAgg._sum?.lineDiscountAmount);
  const cogs = num(lineAgg._sum?.estimatedCostAmount);
  const unitsSold = num(lineAgg._sum?.quantity);
  const returns = num(refundAgg._sum?.refundedAmount);
  const returnsLineItems = num(refundAgg._sum?.refundedLineItemsAmount);
  const shipping = num(orderAgg._sum?.totalShipping);
  const taxes = num(orderAgg._sum?.totalTax);
  const netSales = grossSales - discounts - returns;
  // Shopify parity (SA reconciliation 2026-08-22, per Sidekick's formula):
  //   Total sales = Gross − Discounts − Returns + Shipping + Taxes
  //                 (+ Duties + Additional fees, which we don't track — ~0)
  // Verified against the store's own Analytics: 1,109,159 net + 20,139
  // shipping + 202,753 taxes = 1,332,051 Total sales — Shopify DOES add
  // taxes back, tax-inclusive stores included. The previous "don't add
  // taxes" rule here was compensating for the mapper bug that left
  // lineSubtotal partially tax-inclusive; with amounts now properly
  // ex-VAT (rate-based strip + shipping netting + prod repair), adding
  // `taxes` is the correct walk.
  //
  // Refund nuance that makes this exact: `returns` is the FULL refunded
  // amount (product + its VAT), while `taxes` is the full tax CHARGED
  // (not reduced by refunds). The refunded VAT is thus subtracted once
  // inside `returns` and added once inside `taxes` — netting out to
  // Shopify's convention (net product returns + net tax column).
  const totalSales = netSales + shipping + taxes;
  // Bug audit #7 (docs/ANALYTICS-AUDIT-2026-06-16.md) — profit must subtract
  // ONLY the line-item portion of refunds against ONLY the line-item COGS.
  // Using `netSales` (which subtracts the FULL refund, incl. shipping+tax)
  // over-deducts on any partial-refund order and makes refund days look
  // worse than they are. Matches contribution-margin-service.
  const netLineItemSales = grossSales - discounts - returnsLineItems;
  const returningOrders = num(returningRows?.[0]?.count);
  // ONE profit definition across the app (SA clarity fix 2026-08-23):
  // estimated profit = contribution profit = net product sales − COGS −
  // affiliate commissions. Previously the KPI skipped commissions while
  // the money-snapshot panel deducted them, so the dashboard showed two
  // "profits" a few thousand ₪ apart with no explanation.
  const estimatedProfit = netLineItemSales - cogs - affiliateCommission;

  return {
    orders,
    grossSales,
    discounts,
    returns,
    returnsLineItems,
    netSales,
    shipping,
    taxes,
    totalSales,
    cogs,
    affiliateCommission,
    estimatedProfit,
    unitsSold,
    returningOrders,
    returningCustomerRate: orders ? (returningOrders / orders) * 100 : 0,
    discountRate: grossSales ? (discounts / grossSales) * 100 : 0,
    refundRate: grossSales ? (returns / grossSales) * 100 : 0,
    // Shopify's dashboard AOV = net line-item sales / orders (no
    // shipping, no tax). Previously we used totalSales/orders which
    // inflated AOV by ~20% on stores where customers pay for shipping.
    // The founder writes AOV in their manual summary using Shopify's
    // definition, so we should match it exactly.
    averageOrderValue: orders ? netSales / orders : 0
  };
}

async function computeDailySeries(
  db: any,
  storeId: string,
  start: Date,
  end: Date,
  timeZone: string
): Promise<DailyMetric[]> {
  // (1) sales by ORDER day, (2) shipping/tax/orders/returning by ORDER day,
  // (3) returns by REFUND day. Timestamps are stored UTC; reinterpret as UTC
  // then convert to the store timezone before bucketing to a calendar day.
  const [sales, ship, refunds] = await Promise.all([
    db.$queryRawUnsafe(
      `SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(li."lineSubtotal") AS gross,
              SUM(li."lineDiscountAmount") AS disc,
              SUM(li."estimatedCostAmount") AS cogs,
              SUM(li."quantity") AS units
       FROM "Order" o JOIN "OrderLineItem" li ON li."orderId" = o."id"
       WHERE o."storeId" = $1 AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId,
      start,
      end,
      timeZone
    ),
    db.$queryRawUnsafe(
      `WITH firsts AS (
         SELECT "customerId", MIN("createdAt") AS first_at
         FROM "Order"
         WHERE "storeId" = $1 AND "customerId" IS NOT NULL
           AND "cancelledAt" IS NULL AND "test" = false
         GROUP BY "customerId"
       )
       SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(o."totalShipping") AS ship,
              SUM(o."totalTax") AS tax,
              COUNT(*) AS orders,
              COUNT(*) FILTER (
                WHERE f."customerId" IS NOT NULL AND o."createdAt" > f.first_at
              ) AS returning_orders
       FROM "Order" o
       LEFT JOIN firsts f ON f."customerId" = o."customerId"
       WHERE o."storeId" = $1 AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId,
      start,
      end,
      timeZone
    ),
    db.$queryRawUnsafe(
      // Bucket refunds by the ORIGINAL order date (not the refund date) to
      // match Shopify Admin's "Sales report" attribution. A Jan order refunded
      // in Feb reduces January's revenue — same as Shopify's UI. Previously we
      // bucketed by r."createdAt" (refund date), which matched Shopify's
      // "Payments / Cashflow" report instead and showed a different daily total.
      //
      // Also use refundedAmount (full refund, including refunded shipping +
      // tax portions) rather than refundedLineItemsAmount (line items only).
      // refundedLineItemsAmount under-counted returns whenever a customer got
      // a partial shipping or tax refund, leaving our daily total slightly
      // above Shopify's. refundedAmount is what Shopify deducts.
      //
      // The window filter uses o."createdAt" too — that's the bucketing key,
      // so the result set must align with it. (A refund created today for an
      // order from 2 months ago is correctly excluded from this window.)
      // Pull BOTH the full refund (for revenue reporting — matches Shopify
      // Sales report) and the line-item-only refund (for profit math —
      // Pattern A / bug #8). Consumer subtracts full from revenue, line-item
      // from COGS.
      `SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(r."refundedAmount") AS returns,
              SUM(r."refundedLineItemsAmount") AS returns_line_items
       FROM "Refund" r
       JOIN "Order" o ON o."id" = r."orderId"
       WHERE r."storeId" = $1 AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId,
      start,
      end,
      timeZone
    )
  ]);

  type Bucket = {
    gross: number; disc: number; cogs: number; units: number;
    ship: number; tax: number; orders: number; returningOrders: number;
    returns: number; returnsLineItems: number;
  };
  const byDay = new Map<string, Bucket>();
  const keyOf = (d: any) => new Date(d).toISOString().slice(0, 10);
  const get = (k: string) => {
    let b = byDay.get(k);
    if (!b) { b = { gross: 0, disc: 0, cogs: 0, units: 0, ship: 0, tax: 0, orders: 0, returningOrders: 0, returns: 0, returnsLineItems: 0 }; byDay.set(k, b); }
    return b;
  };
  for (const r of sales) { const b = get(keyOf(r.d)); b.gross += num(r.gross); b.disc += num(r.disc); b.cogs += num(r.cogs); b.units += num(r.units); }
  for (const r of ship) { const b = get(keyOf(r.d)); b.ship += num(r.ship); b.tax += num(r.tax); b.orders += num(r.orders); b.returningOrders += num(r.returning_orders); }
  for (const r of refunds) { const b = get(keyOf(r.d)); b.returns += num(r.returns); b.returnsLineItems += num(r.returns_line_items); }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, b]) => {
      const net = b.gross - b.disc - b.returns;
      const total = net + b.ship + b.tax;
      // Bug audit #8 — profit uses line-item refunds against line-item
      // COGS. Full refunds (returns) still drive the revenue line to
      // match Shopify's Sales report.
      const netLineItems = b.gross - b.disc - b.returnsLineItems;
      return {
        date: new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        // ISO date key — required for the EnrichedRevenueChart to overlay
        // per-day Meta / IG / discount context. Without this field the
        // chart tooltip always says "No events tracked on this day" even
        // when sync data exists. `key` is already YYYY-MM-DD from keyOf().
        isoDate: key,
        revenue: total,
        estimatedProfit: netLineItems - b.cogs,
        returningCustomerRate: b.orders ? (b.returningOrders / b.orders) * 100 : 0,
        averageOrderValue: b.orders ? total / b.orders : 0,
        discountRate: b.gross ? (b.disc / b.gross) * 100 : 0,
        refundRate: b.gross ? (b.returns / b.gross) * 100 : 0,
        orders: b.orders
      } satisfies DailyMetric;
    });
}

export interface ShopifyParityOverview {
  current: ShopifySalesSummary;
  previous: ShopifySalesSummary;
  daily: DailyMetric[];
}

/**
 * Same Shopify-parity sales summary as `getShopifyParityOverview`, but for
 * any arbitrary window — used by services that need the reconciled numbers
 * for a custom range (contribution margin, weekly report bundle, etc.)
 * rather than the active reporting window.
 *
 * Returns null if the store has no DB connection (preview mode).
 */
export async function getShopifySalesSummaryForWindow(
  storeId: string,
  start: Date,
  end: Date
): Promise<ShopifySalesSummary | null> {
  return withOptionalDb(
    async (db) => computeSalesSummary(db, storeId, start, end),
    null
  );
}

/**
 * Single source of truth for the headline numbers, computed to reconcile with
 * Shopify's Sales report for the active reporting window.
 */
export async function getShopifyParityOverview(): Promise<ShopifyParityOverview | null> {
  // Active-store aware — must resolve the SAME store as the מצב פיננסי card,
  // or the two "רווח תרומה" figures on the dashboard can diverge (F-010).
  const store = await getStoreRecord(undefined);
  if (!store) return null;
  const [range, timeZone] = await Promise.all([getActiveRange(), getStoreTimeZone()]);

  return withOptionalDb(
    async (db) => {
      const [current, previous, daily] = await Promise.all([
        computeSalesSummary(db, store.id, range.current.start, range.current.end),
        computeSalesSummary(db, store.id, range.previous.start, range.previous.end),
        computeDailySeries(db, store.id, range.current.start, range.current.end, timeZone)
      ]);
      return { current, previous, daily };
    },
    null
  );
}

export const STOCK_FLAG_THRESHOLDS = { critical: 5, red: 20, yellow: 50 } as const;

export function classifyStock(quantity: number | null): StockFlag {
  if (quantity === null) return "unknown";
  if (quantity < STOCK_FLAG_THRESHOLDS.critical) return "critical";
  if (quantity < STOCK_FLAG_THRESHOLDS.red) return "red";
  if (quantity < STOCK_FLAG_THRESHOLDS.yellow) return "yellow";
  return "green";
}

/**
 * For each product in the store, return every Shopify collection title it
 * belongs to (smart + manual collections, sorted alphabetically). Empty array
 * means the product has no collection memberships yet.
 */
async function buildProductCollectionsLookup(storeId: string): Promise<Map<string, string[]>> {
  const memberships = await withOptionalDb(
    (db) =>
      db.productCollectionMembership.findMany({
        where: { storeId },
        select: {
          productId: true,
          collection: { select: { title: true } }
        }
      }),
    [] as Array<{ productId: string; collection: { title: string } }>
  );

  const lookup = new Map<string, Set<string>>();
  for (const m of memberships) {
    const set = lookup.get(m.productId) ?? new Set<string>();
    set.add(m.collection.title);
    lookup.set(m.productId, set);
  }

  const result = new Map<string, string[]>();
  for (const [productId, titles] of lookup.entries()) {
    result.set(productId, Array.from(titles).sort((a, b) => a.localeCompare(b)));
  }
  return result;
}

type CollectionMembershipRow = { productId: string; collection: { id: string; title: string } };

async function fetchCollectionMemberships(storeId: string): Promise<CollectionMembershipRow[]> {
  return withOptionalDb(
    (db) =>
      db.productCollectionMembership.findMany({
        where: { storeId },
        select: {
          productId: true,
          collection: { select: { id: true, title: true } }
        }
      }),
    [] as CollectionMembershipRow[]
  );
}

/**
 * Group product performance rows into per-collection rows. A product in N
 * collections contributes 1/N of its revenue/profit to each (so the column
 * stays additive); products with no membership fall back to the vendor-based
 * "collection" string bucket. Extracted so the profit payload can reuse its
 * already-fetched orders instead of re-hydrating them (pool pressure was
 * rendering /profit empty on the starter instance).
 */
function groupCollectionPerformance(
  performance: ProductPerformanceRow[],
  memberships: CollectionMembershipRow[]
): CollectionPerformanceRow[] {
  if (memberships.length > 0) {
    // Map productId -> [{ id, title }]
    const productToCollections = new Map<string, Array<{ id: string; title: string }>>();
    for (const m of memberships) {
      const arr = productToCollections.get(m.productId) ?? [];
      arr.push({ id: m.collection.id, title: m.collection.title });
      productToCollections.set(m.productId, arr);
    }

    const grouped = new Map<string, CollectionPerformanceRow>();
    for (const row of performance) {
      const productCollections = productToCollections.get(row.productId);
      if (productCollections && productCollections.length > 0) {
        // A product can belong to multiple collections — split contribution evenly so
        // we don't double-count revenue across them.
        const share = 1 / productCollections.length;
        for (const collection of productCollections) {
          const current = grouped.get(collection.id) ?? {
            collection: collection.title,
            revenue: 0,
            estimatedProfit: 0
          };
          current.revenue += row.revenue * share;
          current.estimatedProfit += row.estimatedProfit * share;
          grouped.set(collection.id, current);
        }
      } else {
        const key = `__uncategorized__:${row.collection || "Uncategorized"}`;
        const current = grouped.get(key) ?? {
          collection: row.collection || "Uncategorized",
          revenue: 0,
          estimatedProfit: 0
        };
        current.revenue += row.revenue;
        current.estimatedProfit += row.estimatedProfit;
        grouped.set(key, current);
      }
    }
    return Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
  }

  // Fallback: case-insensitive + whitespace-stripped bucket key on the vendor-based
  // "collection" string. "Incense Parfums" and "incenseparfums" collapse into one row.
  const buckets = new Map<
    string,
    { row: CollectionPerformanceRow; displayCounts: Map<string, number> }
  >();

  for (const row of performance) {
    const key = String(row.collection ?? "Uncategorized")
      .toLowerCase()
      .replace(/\s+/g, "");
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.row.revenue += row.revenue;
      bucket.row.estimatedProfit += row.estimatedProfit;
      bucket.displayCounts.set(row.collection, (bucket.displayCounts.get(row.collection) ?? 0) + 1);
    } else {
      const counts = new Map<string, number>();
      counts.set(row.collection, 1);
      buckets.set(key, {
        row: { collection: row.collection, revenue: row.revenue, estimatedProfit: row.estimatedProfit },
        displayCounts: counts
      });
    }
  }

  // Pick the most-used original casing per bucket (with length tie-break)
  for (const bucket of buckets.values()) {
    let bestName = bucket.row.collection;
    let bestCount = -1;
    for (const [name, count] of bucket.displayCounts.entries()) {
      if (
        count > bestCount ||
        (count === bestCount && name.length > bestName.length)
      ) {
        bestName = name;
        bestCount = count;
      }
    }
    bucket.row.collection = bestName;
  }

  return Array.from(buckets.values())
    .map((b) => b.row)
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Returns a map of productId → days since the product last appeared in a
 * non-cancelled, non-test order. Products that have never sold return no entry
 * (caller can treat as null = "never sold"). Uses the order's createdAt as the
 * sale date proxy (same as every other metric in this codebase).
 */
async function buildLastSaleLookup(storeId: string): Promise<Map<string, number>> {
  const rows = await withOptionalDb(
    (db) =>
      db.orderLineItem.findMany({
        where: {
          storeId,
          productId: { not: null },
          order: {
            storeId,
            cancelledAt: null,
            test: false
          }
        },
        select: {
          productId: true,
          order: { select: { createdAt: true } }
        }
      }),
    [] as Array<{ productId: string | null; order: { createdAt: Date } }>
  );

  const latest = new Map<string, Date>();
  for (const row of rows) {
    if (!row.productId) continue;
    const prev = latest.get(row.productId);
    if (!prev || row.order.createdAt > prev) {
      latest.set(row.productId, row.order.createdAt);
    }
  }

  const now = Date.now();
  const result = new Map<string, number>();
  for (const [productId, lastDate] of latest.entries()) {
    const diffMs = now - lastDate.getTime();
    result.set(productId, Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24))));
  }
  return result;
}

/**
 * Sum variant inventoryQuantity per product. A product with all-null variants
 * gets `null` (unknown / not tracked). A product with at least one tracked
 * variant returns the sum of the tracked ones.
 */
async function buildProductStockLookup(storeId: string): Promise<
  Map<string, { quantity: number | null; variantCount: number }>
> {
  const variants = await withOptionalDb(
    (db) =>
      db.productVariant.findMany({
        where: { storeId },
        select: { productId: true, inventoryQuantity: true }
      }),
    [] as Array<{ productId: string; inventoryQuantity: number | null }>
  );

  const lookup = new Map<string, { quantity: number | null; variantCount: number }>();
  for (const variant of variants) {
    const entry = lookup.get(variant.productId) ?? { quantity: null, variantCount: 0 };
    entry.variantCount += 1;
    if (variant.inventoryQuantity !== null && variant.inventoryQuantity !== undefined) {
      entry.quantity = (entry.quantity ?? 0) + Number(variant.inventoryQuantity);
    }
    lookup.set(variant.productId, entry);
  }
  return lookup;
}

export const prismaAnalyticsRepository: AnalyticsRepository = {
  async getStore(storeId) {
    const store = await getStoreRecord(storeId);
    return store ? mapStore(store) : DISCONNECTED_PREVIEW_STORE;
  },

  async getProducts(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    // 5000-product ceiling — every downstream consumer is O(all products),
    // so ballooning past this without warning starts eating memory + turning
    // simple pages into 10s renders. Merchants north of 5k SKUs are rare
    // among our target segment; we surface a warning and let them opt into
    // a paginated view later if that changes.
    const products = await withOptionalDb(
      (db) => db.product.findMany({ where: { storeId: store.id }, take: 5000 }),
      []
    );
    if (products.length === 5000) {
      console.warn("[prisma-analytics-repository] getProducts hit 5000-row cap for store", store.id);
    }
    return products.map((product: any) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      collection: product.collection,
      vendor: product.vendor ?? undefined,
      productType: product.productType ?? undefined,
      price: toNumber(product.price),
      estimatedCost: toNumber(product.estimatedCost),
      costOverrideAmount: product.costOverrideAmount ? toNumber(product.costOverrideAmount) : null,
      marginProfile: product.marginProfile
    }));
  },

  async getCustomers(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    // 10 000-customer ceiling. Retention analytics compute over ALL customers
    // so the cap is a soft limit that keeps the page responsive; stores over
    // this will need warehouse-backed retention (see cohortPlaceholder in
    // getRetentionAnalyticsFromDb).
    const customers = await withOptionalDb(
      (db) =>
        db.customer.findMany({
          where: { storeId: store.id },
          take: 10000,
          orderBy: { totalOrders: "desc" }
        }),
      []
    );
    if (customers.length === 10000) {
      console.warn("[prisma-analytics-repository] getCustomers hit 10000-row cap for store", store.id);
    }
    return customers.map((customer: any) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      firstOrderDate: customer.firstOrderDate?.toISOString() ?? null,
      totalOrders: customer.totalOrders,
      lifetimeValue: toNumber(customer.lifetimeValue),
      isReturning: customer.isReturning
    }));
  },

  async getOrders(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const range = await getActiveRange();
    const orders = await getOrdersForRange(store.id, range.current.start, range.current.end);
    return mapOrders(orders);
  },

  async getDailyMetrics(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const range = await getActiveRange();
    const [orders, history] = await Promise.all([
      getOrdersForRange(store.id, range.current.start, range.current.end),
      getCustomerOrderHistory(store.id)
    ]);
    return buildDailyMetrics(mapOrders(orders), history);
  },

  async getPreviousPeriodMetrics(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const range = await getActiveRange();
    const [orders, history] = await Promise.all([
      getOrdersForRange(store.id, range.previous.start, range.previous.end),
      getCustomerOrderHistory(store.id)
    ]);
    return buildDailyMetrics(mapOrders(orders), history);
  },

  async getDiscountUsage(storeId) {
    const orders = await this.getOrders(storeId);
    return buildDiscountUsage(orders);
  },

  async getCollectionPerformance(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const range = await getActiveRange();
    const orderRecords = await getOrdersForRange(store.id, range.current.start, range.current.end);
    const orders = mapOrders(orderRecords);
    const products = await withOptionalDb(
      (db) => db.product.findMany({ where: { storeId: store.id }, take: 5000 }),
      []
    );
    const [stockLookup, collectionsLookup] = await Promise.all([
      buildProductStockLookup(store.id),
      buildProductCollectionsLookup(store.id)
    ]);
    const lookup = new Map<
      string,
      { title: string; collection: string; inventoryQuantity: number | null; collections: string[] }
    >(
      products.map((product: any) => [
        product.id as string,
        {
          title: product.title,
          collection: product.collection,
          inventoryQuantity: stockLookup.get(product.id as string)?.quantity ?? null,
          collections: collectionsLookup.get(product.id as string) ?? []
        }
      ])
    );
    const performance = buildProductPerformance(orders, lookup);

    // Prefer real Shopify collections (smart/manual) when memberships exist.
    // Fall back to the vendor/productType-based "collection" string on the Product row.
    const memberships = await fetchCollectionMemberships(store.id);
    return groupCollectionPerformance(performance, memberships);
  },

  async getProductStock(storeId): Promise<ProductStockRow[]> {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const [stockLookup, collectionsLookup, lastSaleLookup] = await Promise.all([
      buildProductStockLookup(store.id),
      buildProductCollectionsLookup(store.id),
      buildLastSaleLookup(store.id)
    ]);
    // Only ACTIVE products belong in the restock queue. DRAFT and ARCHIVED
    // products aren't visible to customers, so flagging them as low-stock
    // would be noise. Case-insensitive in case Shopify ever changes the
    // casing convention.
    const products = await withOptionalDb(
      (db) =>
        db.product.findMany({
          where: {
            storeId: store.id,
            status: { equals: "ACTIVE", mode: "insensitive" }
          },
          select: {
            id: true,
            title: true,
            collection: true,
            vendor: true
          }
        }),
      [] as Array<{ id: string; title: string; collection: string; vendor: string | null }>
    );

    return products
      .map((product) => {
        const stock = stockLookup.get(product.id);
        const quantity = stock?.quantity ?? null;
        return {
          productId: product.id,
          productTitle: product.title,
          collection: product.collection,
          collections: collectionsLookup.get(product.id) ?? [],
          vendor: product.vendor ?? null,
          inventoryQuantity: quantity,
          variantCount: stock?.variantCount ?? 0,
          flag: classifyStock(quantity),
          daysSinceLastSale: lastSaleLookup.get(product.id) ?? null
        };
      })
      .sort((a, b) => {
        // unknown last, otherwise lowest stock first
        const orderFlag = (f: StockFlag) => (f === "unknown" ? 99 : f === "critical" ? 0 : f === "red" ? 1 : f === "yellow" ? 2 : 3);
        const flagDiff = orderFlag(a.flag) - orderFlag(b.flag);
        if (flagDiff !== 0) return flagDiff;
        const aq = a.inventoryQuantity ?? Number.POSITIVE_INFINITY;
        const bq = b.inventoryQuantity ?? Number.POSITIVE_INFINITY;
        return aq - bq;
      });
  },

  async getAlerts(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const alerts = await withOptionalDb(
      (db) =>
        db.alert.findMany({
          // Only surface alerts that haven't been resolved/ignored yet — the
          // alert-writer marks rows resolved when the underlying condition
          // clears or via the sweep on a no-longer-detected fingerprint.
          where: { storeId: store.id, status: "open" },
          orderBy: [
            // critical first → low last, then newest first within a tier
            { severity: "asc" },
            { createdAt: "desc" }
          ]
        }),
      []
    );
    return alerts.map(mapStoredAlert);
  },

  async getSummaries(storeId) {
    const store = await getStoreRecord(storeId);
    if (!store) return [];
    const summaries = await withOptionalDb(
      (db) =>
        db.summary.findMany({
          where: { storeId: store.id },
          orderBy: { generatedAt: "desc" }
        }),
      []
    );
    return summaries.map(mapSummary);
  }
};

export async function hasPrismaAnalyticsData() {
  const store = await getConnectedStoreRecord();
  return Boolean(store);
}

export async function getRetentionAnalyticsFromDb(locale: "he" | "en" = "he") {
  const lang = (he: string, en: string) => (locale === "he" ? he : en);
  // Active-store aware — the legacy connected-store pick could resolve a
  // DIFFERENT store than the cohort section on the same page (SYS-001).
  const store = await getStoreRecord(undefined);
  if (!store) return null;
  const range = await getActiveRange();

  // AGGREGATE-FIRST (SYS-001): the old path hydrated up to 20 000 lifetime
  // orders WITH all their line items just to answer four questions the
  // database can answer itself. On production that starved the 5-connection
  // pool, the timeouts were swallowed, and this page rendered "0 customers"
  // while the cohort section (one cheap scalar query) filled fine — the
  // owner's cleanest SYS-001 reproduction. The snapshot and the 1st/2nd
  // order panels are now single SQL passes with window functions.
  const snapshotRows = await withOptionalDb(
    (db) =>
      db.$queryRaw`
        WITH ranked AS (
          SELECT "customerId", "createdAt",
                 ROW_NUMBER() OVER (PARTITION BY "customerId" ORDER BY "createdAt") AS rn
          FROM "Order"
          WHERE "storeId" = ${store.id}
            AND "customerId" IS NOT NULL
            AND "cancelledAt" IS NULL
            AND test = false
        ),
        cust AS (
          SELECT "customerId",
                 MIN("createdAt") AS first_at,
                 MIN(CASE WHEN rn = 2 THEN "createdAt" END) AS second_at,
                 COUNT(*)::int AS orders_total,
                 BOOL_OR("createdAt" >= ${range.current.start} AND "createdAt" <= ${range.current.end}) AS in_window
          FROM ranked
          GROUP BY "customerId"
        )
        SELECT
          COUNT(*) FILTER (WHERE in_window)::int AS customers_in_period,
          COUNT(*) FILTER (WHERE in_window AND orders_total > 1)::int AS returning_customers,
          COUNT(*) FILTER (WHERE first_at >= ${range.current.start} AND first_at <= ${range.current.end})::int AS first_time_in_window,
          COUNT(*) FILTER (WHERE first_at >= ${range.current.start} AND first_at <= ${range.current.end} AND orders_total >= 2)::int AS first_time_came_back,
          COUNT(*) FILTER (WHERE second_at >= ${range.current.start} AND second_at <= ${range.current.end})::int AS second_in_window,
          COALESCE(SUM(EXTRACT(EPOCH FROM (second_at - first_at)) / 86400)
                   FILTER (WHERE second_at >= ${range.current.start} AND second_at <= ${range.current.end}), 0)::float AS days_to_second_sum
        FROM cust
      `,
    [] as Array<{
      customers_in_period: number;
      returning_customers: number;
      first_time_in_window: number;
      first_time_came_back: number;
      second_in_window: number;
      days_to_second_sum: number;
    }>
  );
  const snapRow = (snapshotRows as Array<Record<string, number>>)[0];
  const customersInPeriod = Number(snapRow?.customers_in_period ?? 0);
  const returningCustomers = Number(snapRow?.returning_customers ?? 0);
  const firstTimeInWindow = Number(snapRow?.first_time_in_window ?? 0);
  const firstTimeCameBack = Number(snapRow?.first_time_came_back ?? 0);
  const secondInWindow = Number(snapRow?.second_in_window ?? 0);
  const snapshot = {
    newCustomers: Math.max(customersInPeriod - returningCustomers, 0),
    returningCustomers,
    repeatPurchaseRate: customersInPeriod > 0 ? (returningCustomers / customersInPeriod) * 100 : 0,
    secondOrderRate: firstTimeInWindow > 0 ? (firstTimeCameBack / firstTimeInWindow) * 100 : 0,
    averageDaysToSecondOrder:
      secondInWindow > 0 ? Number(snapRow?.days_to_second_sum ?? 0) / secondInWindow : 0
  };

  // 1st vs 2nd order product panels — line titles of every customer's
  // first and second lifetime orders, aggregated in SQL.
  const panelRows = await withOptionalDb(
    (db) =>
      db.$queryRaw`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY "customerId" ORDER BY "createdAt") AS rn
          FROM "Order"
          WHERE "storeId" = ${store.id}
            AND "customerId" IS NOT NULL
            AND "cancelledAt" IS NULL
            AND test = false
        )
        SELECT r.rn::int AS rn, COALESCE(NULLIF(TRIM(li.title), ''), '—') AS title,
               SUM(li.quantity)::int AS qty
        FROM ranked r
        JOIN "OrderLineItem" li ON li."orderId" = r.id
        WHERE r.rn <= 2
        GROUP BY r.rn, COALESCE(NULLIF(TRIM(li.title), ''), '—')
      `,
    [] as Array<{ rn: number; title: string; qty: number }>
  );
  const firstOrderProducts = new Map<string, number>();
  const secondOrderProducts = new Map<string, number>();
  for (const row of panelRows as Array<{ rn: number; title: string; qty: number }>) {
    const target = Number(row.rn) === 1 ? firstOrderProducts : secondOrderProducts;
    target.set(row.title, (target.get(row.title) ?? 0) + Number(row.qty));
  }

  // Daily trend — light scalar orders only (no line items, no discount
  // rows) for the two windows, plus the scalar per-customer history map
  // for the returning-order flag.
  const lightOrders = (gte: Date, lte: Date) =>
    withOptionalDb(
      (db) =>
        db.order.findMany({
          where: withAnalyticsOrderFilters({ storeId: store.id, createdAt: { gte, lte } }),
          select: {
            id: true,
            customerId: true,
            createdAt: true,
            orderNumber: true,
            totalPrice: true,
            totalDiscounts: true,
            totalRefunds: true
          },
          orderBy: { createdAt: "asc" }
        }),
      []
    );
  const [orders, prevOrders, history] = await Promise.all([
    lightOrders(range.current.start, range.current.end),
    lightOrders(range.previous.start, range.previous.end),
    getCustomerOrderHistory(store.id)
  ]);
  const toLightOrder = (o: any): Order => ({
    id: o.id,
    customerId: o.customerId,
    createdAt: o.createdAt.toISOString(),
    orderNumber: o.orderNumber,
    isRefunded: toNumber(o.totalRefunds) > 0,
    refundAmount: toNumber(o.totalRefunds),
    totalPrice: toNumber(o.totalPrice),
    totalDiscounts: toNumber(o.totalDiscounts),
    // No line items on the light path — buildDailyMetrics only falls back
    // to them when the order-level totals are missing, which they never
    // are (non-nullable columns). The retention chart shows revenue /
    // orders / returning-share, not COGS-based profit.
    lineItems: []
  });
  const normalizedOrders = (orders as any[]).map(toLightOrder);
  const normalizedPrevOrders = (prevOrders as any[]).map(toLightOrder);

  return {
    snapshot,
    dailyMetrics: buildDailyMetrics(normalizedOrders, history),
    previousDailyMetrics: buildDailyMetrics(normalizedPrevOrders, history),
    firstOrderProducts: Array.from(firstOrderProducts.entries()).map(([title, orders]) => ({ title, orders })).sort((a, b) => b.orders - a.orders).slice(0, 5),
    secondOrderProducts: Array.from(secondOrderProducts.entries()).map(([title, orders]) => ({ title, orders })).sort((a, b) => b.orders - a.orders).slice(0, 5),
    cohortPlaceholder: lang(
      "מודל קוהורטות השימור מוכן לתצוגה עשירה יותר מבוססת מחסן נתונים ברגע שWebhooks וסנכרון אירועי לקוח אינקרמנטלי יהיו במקום.",
      "Cohort retention modeling is ready for a richer warehouse-backed view once webhooks and incremental customer event sync are in place."
    )
  };
}

export async function getProfitAnalyticsFromDb() {
  // Active-store aware (was the legacy connected-store pick, which ignores
  // the store switcher and can disagree with every sibling section).
  const store = await getStoreRecord(undefined);
  if (!store) return null;
  const range = await getActiveRange();

  // AGGREGATE-FIRST (SYS-001): the old path hydrated every order in BOTH
  // windows with all line items + discount rows, plus an uncapped product
  // scan — enough concurrent weight to starve the production DB pool, and
  // a starved pool rendered this whole page as "₪0 / no data" while the
  // dashboard's cheap aggregate cards stayed correct. groupBy returns the
  // same numbers without materializing a single order row. Two query
  // waves, so the pool never sees everything at once.
  const lineOrderScope = (start: Date, end: Date) => ({
    storeId: store.id,
    order: {
      storeId: store.id,
      createdAt: { gte: start, lte: end },
      cancelledAt: null,
      test: false
    }
  });

  const [lineGroups, prevAgg, currCommission, prevCommission] = await Promise.all([
    withOptionalDb(
      (db) =>
        db.orderLineItem.groupBy({
          by: ["productId", "title"],
          where: lineOrderScope(range.current.start, range.current.end),
          _sum: {
            quantity: true,
            lineSubtotal: true,
            lineDiscountAmount: true,
            estimatedCostAmount: true,
            refundedQuantity: true,
            refundedSubtotal: true
          }
        }),
      [] as Array<{
        productId: string | null;
        title: string | null;
        _sum: {
          quantity: number | null;
          lineSubtotal: unknown;
          lineDiscountAmount: unknown;
          estimatedCostAmount: unknown;
          refundedQuantity: number | null;
          refundedSubtotal: unknown;
        };
      }>
    ),
    withOptionalDb(
      (db) =>
        db.orderLineItem.aggregate({
          where: lineOrderScope(range.previous.start, range.previous.end),
          _sum: {
            lineSubtotal: true,
            lineDiscountAmount: true,
            estimatedCostAmount: true,
            refundedSubtotal: true
          }
        }),
      null as {
        _sum: {
          lineSubtotal: unknown;
          lineDiscountAmount: unknown;
          estimatedCostAmount: unknown;
          refundedSubtotal: unknown;
        };
      } | null
    ),
    withOptionalDb(
      (db) => computeWindowAffiliateCommission(db, store.id, range.current.start, range.current.end),
      0
    ),
    withOptionalDb(
      (db) => computeWindowAffiliateCommission(db, store.id, range.previous.start, range.previous.end),
      0
    )
  ]);

  const [products, stockLookup, collectionsLookup, memberships] = await Promise.all([
    withOptionalDb(
      (db) =>
        db.product.findMany({
          where: { storeId: store.id },
          select: { id: true, title: true, collection: true },
          take: 5000
        }),
      []
    ),
    buildProductStockLookup(store.id),
    buildProductCollectionsLookup(store.id),
    fetchCollectionMemberships(store.id)
  ]);

  const productLookup = new Map<
    string,
    { title: string; collection: string; inventoryQuantity: number | null; collections: string[] }
  >(
    products.map((product: any) => [
      product.id as string,
      {
        title: product.title,
        collection: product.collection,
        inventoryQuantity: stockLookup.get(product.id as string)?.quantity ?? null,
        collections: collectionsLookup.get(product.id as string) ?? []
      }
    ])
  );

  // Rows straight from the aggregate — identical math to
  // buildProductPerformance (revenue = Σ lineSubtotal; profit = revenue −
  // discount − refund − cost), including the title fallback for lines
  // whose Product row is missing (they must never vanish from the table).
  const grouped = new Map<string, ProductPerformanceRow>();
  for (const g of lineGroups) {
    const product = g.productId ? productLookup.get(g.productId) : undefined;
    const key =
      product && g.productId ? g.productId : `title:${(g.title ?? "").trim() || "—"}`;
    const revenue = toNumber(g._sum.lineSubtotal);
    const discount = toNumber(g._sum.lineDiscountAmount);
    const refund = toNumber(g._sum.refundedSubtotal);
    const cost = toNumber(g._sum.estimatedCostAmount);
    const units = Math.max(
      0,
      Number(g._sum.quantity ?? 0) - Number(g._sum.refundedQuantity ?? 0)
    );
    const current = grouped.get(key) ?? {
      productId: key,
      productTitle: product?.title ?? ((g.title ?? "").trim() || "—"),
      collection: product?.collection ?? "",
      collections: product && g.productId ? collectionsLookup.get(g.productId) ?? [] : [],
      unitsSold: 0,
      revenue: 0,
      estimatedProfit: 0,
      discountImpact: 0,
      refundImpact: 0,
      inventoryQuantity:
        product && g.productId ? stockLookup.get(g.productId)?.quantity ?? null : null
    };
    current.unitsSold += units;
    current.revenue += revenue;
    current.discountImpact += discount;
    current.refundImpact += refund;
    current.estimatedProfit += revenue - discount - refund - cost;
    grouped.set(key, current);
  }
  const productPerformance = [...grouped.values()].sort((a, b) => b.revenue - a.revenue);

  // Affiliate commission — allocated pro-rata by product revenue share so
  // "Estimated profit" means "what the brand keeps". (The old per-order
  // exact split needed full order hydration; pro-rata keeps the same total
  // with a small per-product approximation.)
  const totalRevenueForCommission = productPerformance.reduce((s, r) => s + r.revenue, 0);
  if (currCommission > 0 && totalRevenueForCommission > 0) {
    for (const row of productPerformance) {
      row.estimatedProfit -= currCommission * (row.revenue / totalRevenueForCommission);
    }
  }

  const collectionPerformance = groupCollectionPerformance(productPerformance, memberships);

  // Discount table in ONE SQL pass over DiscountUsage — per-code order
  // counts and amounts without hydrating orders. Also fixes the old
  // single-code attribution: an order carrying two codes was previously
  // booked entirely to whichever code pickAnalyticsDiscountCode preferred.
  const discountRows = await withOptionalDb(
    (db) =>
      db.$queryRaw`
        SELECT t.code,
               COUNT(*)::int AS order_count,
               COALESCE(SUM(t.total_price), 0)::float AS revenue_influenced,
               COALESCE(SUM(t.discount_amount), 0)::float AS discount_amount
        FROM (
          SELECT du.code, du."orderId",
                 SUM(du.amount) AS discount_amount,
                 MAX(o."totalPrice") AS total_price
          FROM "DiscountUsage" du
          JOIN "Order" o ON o.id = du."orderId"
          WHERE du."storeId" = ${store.id}
            AND o."createdAt" >= ${range.current.start}
            AND o."createdAt" <= ${range.current.end}
            AND o."cancelledAt" IS NULL
            AND o.test = false
          GROUP BY du.code, du."orderId"
        ) t
        GROUP BY t.code
        ORDER BY discount_amount DESC
      `,
    [] as Array<{
      code: string;
      order_count: number;
      revenue_influenced: number;
      discount_amount: number;
    }>
  );
  const discountUsage = (discountRows as Array<{
    code: string;
    order_count: number;
    revenue_influenced: number;
    discount_amount: number;
  }>).map((r) => ({
    code: r.code,
    orderCount: r.order_count,
    revenueInfluenced: r.revenue_influenced,
    discountAmount: r.discount_amount
  }));

  // MoM profit delta from the previous window's single aggregate (same
  // formula as the rows, minus that window's commission).
  const currentTotalProfit = productPerformance.reduce((sum, row) => sum + row.estimatedProfit, 0);
  const prevTotalProfit = prevAgg
    ? toNumber(prevAgg._sum.lineSubtotal) -
      toNumber(prevAgg._sum.lineDiscountAmount) -
      toNumber(prevAgg._sum.refundedSubtotal) -
      toNumber(prevAgg._sum.estimatedCostAmount) -
      prevCommission
    : 0;
  const momProfitDelta: number | null =
    prevTotalProfit !== 0
      ? ((currentTotalProfit - prevTotalProfit) / Math.abs(prevTotalProfit)) * 100
      : null;

  // Sorted product slices (top 5 most profitable / least profitable).
  const sortedByProfit = [...productPerformance].sort((a, b) => b.estimatedProfit - a.estimatedProfit);
  const topProfitableProducts = sortedByProfit.slice(0, 5);
  const leastProfitableProducts = [...productPerformance]
    .sort((a, b) => a.estimatedProfit - b.estimatedProfit)
    .slice(0, 5);

  return {
    productPerformance,
    collectionPerformance,
    discountUsage,
    topProducts: productPerformance.slice(0, 4),
    lowProducts: [...productPerformance].sort((a, b) => a.estimatedProfit - b.estimatedProfit).slice(0, 4),
    momProfitDelta,
    topProfitableProducts,
    leastProfitableProducts
  };
}
