// Portfolio-level analytics — aggregates KPIs across every brand in the
// signed-in user's active org. Different audience than the per-brand
// Overview: this view is for the operator running multiple brands or a
// board reviewing all properties at once. The shape mirrors what a CFO /
// portfolio manager would actually open at 9 AM:
//
//   • Total $ this period (with comparison to prior period)
//   • Per-brand breakdown of revenue, orders, AOV, refund rate
//   • Which brands are pulling weight, which are sliding
//   • Sync health per brand so stale numbers don't sneak in
//
// Implementation: fan out `getShopifySalesSummaryForWindow` across every
// store in the org, sum + weight at the JS layer. Same parity layer the
// per-brand Overview uses, so the portfolio numbers reconcile to Shopify
// Admin's Sales report row-by-row.

import { getDb } from "@/lib/server/db";
import { getShopifySalesSummaryForWindow } from "@/lib/data/prisma-analytics-repository";
import { listAllStoresForSwitcher } from "@/lib/services/offline-sales-service";
import type { ShopifySalesSummary } from "@/lib/data/prisma-analytics-repository";

export interface PortfolioBrandRow {
  storeId: string;
  storeName: string;
  domain: string;
  currency: string;
  connected: boolean;
  // Sync freshness — how old is the latest Shopify data we have? Surfaces
  // stale brands so the board doesn't read stale numbers as truth.
  lastSyncedAt: string | null;
  syncAgeHours: number | null;
  // Current-period KPIs (computed from the Shopify-parity layer).
  totalSales: number;
  orders: number;
  averageOrderValue: number;
  returningCustomerRate: number; // percentage
  refundRate: number; // percentage
  discountRate: number; // percentage
  // Previous-period KPIs for delta computation.
  previousTotalSales: number;
  previousOrders: number;
  // % change in totalSales vs the previous window. null when prior was 0.
  totalSalesChange: number | null;
  // Has *any* sales data in the current window (helps gray-out unactivated).
  isActive: boolean;
  // Demo store — synthetic data. Participates fully in totals and
  // highlights (operator preference: treat it as a real brand so the
  // portfolio shows the combined picture); the row badge marks its origin.
  isDemo: boolean;
}

// CEO-grade per-brand story: WHAT moved this brand's number this window.
// The driver/drag are the products whose revenue delta vs the previous
// window was the largest up / down — "the push" behind the growth line.
export interface BrandStory {
  storeId: string;
  storeName: string;
  isDemo: boolean;
  revenue: number;
  revenueChange: number | null; // % vs previous window, null = no base
  ordersChangePercent: number | null;
  aovChangePercent: number | null;
  topDriver: { title: string; delta: number } | null;
  topDrag: { title: string; delta: number } | null;
}

export interface PortfolioOverview {
  // Window the rollup covers, ISO date strings (start of day → end of day).
  windowStart: string;
  windowEnd: string;
  previousWindowStart: string;
  previousWindowEnd: string;
  windowDays: number;
  // Currency of the aggregation. If brands use different currencies, we
  // fall back to the most common one and flag mixed-currency in `note`.
  currency: string;
  currencyNote: string | null;
  // Portfolio-wide rollups.
  totals: {
    totalSales: number;
    orders: number;
    averageOrderValue: number;
    returningCustomerRate: number;
    refundRate: number;
    discountRate: number;
    activeBrands: number;
    connectedBrands: number;
  };
  // Same shape for the previous window so the UI can compute deltas.
  previousTotals: {
    totalSales: number;
    orders: number;
  };
  // % change in totals.totalSales vs previousTotals.totalSales. null when
  // prior was 0 (e.g. first month).
  totalSalesChange: number | null;
  // Per-brand rows, sorted by current-window totalSales desc.
  brands: PortfolioBrandRow[];
  // Per-brand growth stories (same order as `brands`, active brands only).
  stories: BrandStory[];
  // Highlights — pre-computed insights so the UI doesn't reinvent ranking.
  highlights: {
    topBrand: { storeId: string; storeName: string; totalSales: number } | null;
    biggestMover: {
      storeId: string;
      storeName: string;
      changePercent: number;
      direction: "up" | "down";
    } | null;
    staleData: { storeId: string; storeName: string; ageHours: number }[];
    // Brands with zero current-period sales but a sync that ran recently —
    // candidates for review (broken? deactivated?).
    quietBrands: { storeId: string; storeName: string }[];
  };
}

const DEFAULT_WINDOW_DAYS = 30;

export async function buildPortfolioOverview(input?: {
  windowDays?: number;
  asOf?: Date;
}): Promise<PortfolioOverview> {
  const windowDays = input?.windowDays ?? DEFAULT_WINDOW_DAYS;
  const asOf = input?.asOf ?? new Date();
  const windowEnd = new Date(asOf);
  windowEnd.setUTCHours(23, 59, 59, 999);
  const windowStart = new Date(windowEnd);
  windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1));
  windowStart.setUTCHours(0, 0, 0, 0);

  // Previous window of equal length, ending the day before windowStart.
  const previousWindowEnd = new Date(windowStart);
  previousWindowEnd.setUTCDate(previousWindowEnd.getUTCDate() - 1);
  previousWindowEnd.setUTCHours(23, 59, 59, 999);
  const previousWindowStart = new Date(previousWindowEnd);
  previousWindowStart.setUTCDate(
    previousWindowStart.getUTCDate() - (windowDays - 1)
  );
  previousWindowStart.setUTCHours(0, 0, 0, 0);

  // Stores in the active org (scoped via listAllStoresForSwitcher which
  // already honors the user's auth context).
  const allStores = await listAllStoresForSwitcher();

  // Pull per-store metadata we need beyond name/domain (currency + sync
  // freshness). Single query, indexed by id. Also fetches isDemo so demo
  // stores can be excluded from the rollup below.
  const db = getDb();
  const storeMeta = await db.store.findMany({
    where: { id: { in: allStores.map((s) => s.id) } },
    select: {
      id: true,
      currency: true,
      isDemo: true,
      connection: { select: { lastSuccessfulSyncAt: true, lastSyncAt: true } }
    }
  });
  // Demo stores are flagged (row badge) but participate fully in the
  // rollup — the operator wants the combined two-store picture while the
  // demo brand stands in for a second real brand.
  const demoIds = new Set(
    (storeMeta as Array<{ id: string; isDemo?: boolean }>)
      .filter((m) => m.isDemo)
      .map((m) => m.id)
  );
  const stores = allStores;
  const metaById = new Map(
    (storeMeta as Array<{
      id: string;
      currency: string;
      connection: { lastSuccessfulSyncAt: Date | null; lastSyncAt: Date | null } | null;
    }>).map((m) => [m.id, m])
  );

  // Parity summaries per store, current + previous window, in parallel.
  const summaries = await Promise.all(
    stores.map(async (s) => {
      const [current, previous] = await Promise.all([
        getShopifySalesSummaryForWindow(s.id, windowStart, windowEnd),
        getShopifySalesSummaryForWindow(s.id, previousWindowStart, previousWindowEnd)
      ]);
      return { store: s, current, previous };
    })
  );

  // Build per-brand rows.
  const brands: PortfolioBrandRow[] = summaries.map(({ store, current, previous }) => {
    const meta = metaById.get(store.id);
    const cur = current ?? emptySummary();
    const prev = previous ?? emptySummary();
    const lastSync =
      meta?.connection?.lastSuccessfulSyncAt ?? meta?.connection?.lastSyncAt ?? null;
    const syncAgeHours = lastSync
      ? Math.max(0, (asOf.getTime() - lastSync.getTime()) / (60 * 60 * 1000))
      : null;
    return {
      storeId: store.id,
      storeName: store.name,
      domain: store.domain,
      currency: meta?.currency ?? "USD",
      connected: store.connected,
      lastSyncedAt: lastSync ? lastSync.toISOString() : null,
      syncAgeHours,
      totalSales: cur.totalSales,
      orders: cur.orders,
      averageOrderValue: cur.averageOrderValue,
      returningCustomerRate: cur.returningCustomerRate,
      refundRate: cur.refundRate,
      discountRate: cur.discountRate,
      previousTotalSales: prev.totalSales,
      previousOrders: prev.orders,
      totalSalesChange: percentChange(cur.totalSales, prev.totalSales),
      isActive: cur.orders > 0 || cur.totalSales > 0,
      isDemo: demoIds.has(store.id)
    };
  });

  // Sort brands by current totalSales descending — biggest first.
  brands.sort((a, b) => b.totalSales - a.totalSales);

  // Portfolio-wide totals — sum numerators, derive rates as
  // sum(numer) / sum(denom). Avoids the "average of daily rates" trap
  // we fixed in the analytics audit (Pattern B).
  const totalSales = sumBy(brands, (b) => b.totalSales);
  const orders = sumBy(brands, (b) => b.orders);
  // Reconstruct returning-orders count from each row's rate × orders. The
  // ShopifySalesSummary only surfaces the rate, not the raw count, so this
  // is a faithful approximation that respects the per-brand denominators.
  const totalReturningOrders = brands.reduce(
    (acc, b) => acc + Math.round(b.orders * (b.returningCustomerRate / 100)),
    0
  );
  const totalRefundAmount = brands.reduce(
    (acc, b) => acc + (b.totalSales * b.refundRate) / 100,
    0
  );
  const totalDiscountAmount = brands.reduce(
    (acc, b) => acc + (b.totalSales * b.discountRate) / 100,
    0
  );
  const previousTotalSales = sumBy(brands, (b) => b.previousTotalSales);

  // Currency — if all brands match, use that; otherwise pick the most
  // common and flag mixed-currency for the UI to warn about.
  const currencyCounts = new Map<string, number>();
  for (const b of brands) {
    currencyCounts.set(b.currency, (currencyCounts.get(b.currency) ?? 0) + 1);
  }
  const sortedCurrencies = Array.from(currencyCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const currency = sortedCurrencies[0]?.[0] ?? "USD";
  const currencyNote =
    sortedCurrencies.length > 1
      ? `Mixed currencies — totals shown in ${currency} but ${
          sortedCurrencies.length - 1
        } brand(s) report in other currencies.`
      : null;

  // Highlights.
  const topBrand =
    brands[0] && brands[0].totalSales > 0
      ? {
          storeId: brands[0].storeId,
          storeName: brands[0].storeName,
          totalSales: brands[0].totalSales
        }
      : null;
  // Biggest mover: brand with the largest |totalSalesChange|, requiring
  // a meaningful prior-period base so a $0 → $5 doesn't read as "+∞".
  const moverCandidates = brands.filter(
    (b) => b.totalSalesChange !== null && b.previousTotalSales >= 100
  );
  moverCandidates.sort(
    (a, b) =>
      Math.abs(b.totalSalesChange ?? 0) - Math.abs(a.totalSalesChange ?? 0)
  );
  const mover = moverCandidates[0];
  const biggestMover = mover
    ? {
        storeId: mover.storeId,
        storeName: mover.storeName,
        changePercent: mover.totalSalesChange as number,
        direction:
          (mover.totalSalesChange ?? 0) >= 0 ? ("up" as const) : ("down" as const)
      }
    : null;
  // Stale data: brands whose latest sync is older than 24 hours.
  const STALE_HOURS = 24;
  const staleData = brands
    .filter((b) => !b.isDemo && b.syncAgeHours !== null && b.syncAgeHours > STALE_HOURS)
    .sort((a, b) => (b.syncAgeHours ?? 0) - (a.syncAgeHours ?? 0))
    .slice(0, 5)
    .map((b) => ({
      storeId: b.storeId,
      storeName: b.storeName,
      ageHours: Math.round(b.syncAgeHours as number)
    }));
  // Per-brand growth stories — the product-level "why" behind each line.
  // One line-item scan per brand per window, aggregated in JS (row count is
  // bounded by the window; Prisma can't filter groupBy on a relation).
  const stories: BrandStory[] = (
    await Promise.all(
      brands
        .filter((b) => b.totalSales > 0 || b.previousTotalSales > 0)
        .map(async (b) => {
          const [currentByProduct, previousByProduct] = await Promise.all([
            productRevenueByTitle(b.storeId, windowStart, windowEnd),
            productRevenueByTitle(b.storeId, previousWindowStart, previousWindowEnd)
          ]);
          const titles = new Set([...currentByProduct.keys(), ...previousByProduct.keys()]);
          let topDriver: BrandStory["topDriver"] = null;
          let topDrag: BrandStory["topDrag"] = null;
          for (const title of titles) {
            const delta = (currentByProduct.get(title) ?? 0) - (previousByProduct.get(title) ?? 0);
            if (delta > 0 && (topDriver === null || delta > topDriver.delta)) {
              topDriver = { title, delta };
            }
            // Ignore sub-₪100 dips — noise, not a story.
            if (delta < -100 && (topDrag === null || delta < topDrag.delta)) {
              topDrag = { title, delta };
            }
          }
          const prevAov = b.previousOrders > 0 ? b.previousTotalSales / b.previousOrders : null;
          return {
            storeId: b.storeId,
            storeName: b.storeName,
            isDemo: b.isDemo,
            revenue: b.totalSales,
            revenueChange: b.totalSalesChange,
            ordersChangePercent: percentChange(b.orders, b.previousOrders),
            aovChangePercent:
              prevAov !== null ? percentChange(b.averageOrderValue, prevAov) : null,
            topDriver,
            topDrag
          };
        })
    )
  ).sort((a, b) => b.revenue - a.revenue);

  // Quiet brands: connected + recent sync + zero sales this window.
  const quietBrands = brands
    .filter(
      (b) =>
        b.connected &&
        b.syncAgeHours !== null &&
        b.syncAgeHours <= STALE_HOURS &&
        !b.isActive
    )
    .slice(0, 5)
    .map((b) => ({ storeId: b.storeId, storeName: b.storeName }));

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    previousWindowStart: previousWindowStart.toISOString(),
    previousWindowEnd: previousWindowEnd.toISOString(),
    windowDays,
    currency,
    currencyNote,
    totals: {
      totalSales,
      orders,
      averageOrderValue: orders > 0 ? totalSales / orders : 0,
      returningCustomerRate:
        orders > 0 ? (totalReturningOrders / orders) * 100 : 0,
      refundRate: totalSales > 0 ? (totalRefundAmount / totalSales) * 100 : 0,
      discountRate: totalSales > 0 ? (totalDiscountAmount / totalSales) * 100 : 0,
      activeBrands: brands.filter((b) => b.isActive).length,
      connectedBrands: brands.filter((b) => b.connected).length
    },
    previousTotals: {
      totalSales: previousTotalSales,
      orders: sumBy(brands, (b) => b.previousOrders)
    },
    totalSalesChange: percentChange(totalSales, previousTotalSales),
    brands,
    stories,
    highlights: { topBrand, biggestMover, staleData, quietBrands }
  };
}

// Revenue per product title inside a window, computed from line items joined
// to their (non-cancelled, non-test) orders by processedAt.
async function productRevenueByTitle(
  storeId: string,
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  const db = getDb();
  const rows = (await db.orderLineItem.findMany({
    where: {
      storeId,
      order: {
        processedAt: { gte: start, lte: end },
        cancelledAt: null,
        test: false
      }
    },
    select: { title: true, lineSubtotal: true }
  })) as Array<{ title: string | null; lineSubtotal: unknown }>;
  const byTitle = new Map<string, number>();
  for (const row of rows) {
    const title = (row.title ?? "Unknown product").trim();
    byTitle.set(title, (byTitle.get(title) ?? 0) + Number(row.lineSubtotal ?? 0));
  }
  return byTitle;
}

function sumBy<T>(items: T[], pick: (t: T) => number): number {
  let total = 0;
  for (const item of items) total += pick(item);
  return total;
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function emptySummary(): ShopifySalesSummary {
  return {
    orders: 0,
    grossSales: 0,
    discounts: 0,
    returns: 0,
    returnsLineItems: 0,
    netSales: 0,
    shipping: 0,
    taxes: 0,
    totalSales: 0,
    cogs: 0,
    estimatedProfit: 0,
    unitsSold: 0,
    returningOrders: 0,
    returningCustomerRate: 0,
    discountRate: 0,
    refundRate: 0,
    averageOrderValue: 0
  };
}
