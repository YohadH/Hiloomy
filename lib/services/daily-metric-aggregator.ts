/**
 * daily-metric-aggregator.ts
 *
 * Aggregates Order / OrderLineItem / Refund rows into daily buckets and
 * upserts them into the DailyMetric table. Called after every Shopify sync
 * so the DailyMetric table always has fresh data for dashboard queries.
 *
 * DATA-03: This was the missing pipeline step — the table existed in the
 * schema but was never written to. The repository computed daily metrics
 * on-the-fly from raw Orders for every dashboard request; this service
 * materialises them so they survive the 30-second Render serverless timeout
 * and are available for future batch jobs, exports, and heavy queries.
 *
 * Algorithm (mirrors computeDailySeries in prisma-analytics-repository.ts):
 *  - gross / discounts / COGS attributed by ORDER date
 *  - returns attributed by ORIGINAL ORDER date (matches Shopify Sales report)
 *  - revenue = gross − discounts − returns + shipping + tax
 *  - estimatedProfit = (gross − discounts − returns) − COGS
 *  - returningCustomerRate = returningOrders / orders (per day)
 *  - averageOrderValue = revenue / orders (per day)
 *  - discountRate = discounts / gross (per day)
 *  - refundRate = returns / gross (per day)
 *
 * Coverage window: defaults to last COVERAGE_DAYS calendar days (90). On an
 * incremental sync, pass syncFrom to narrow the window.
 */
import { getDb } from "@/lib/server/db";

// Re-aggregate the last N days even when only a few recent orders changed.
// Keeps the table current without requiring a full-history rebuild every sync.
const COVERAGE_DAYS = 90;

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

interface DayBucket {
  gross: number;
  disc: number;
  cogs: number;
  ship: number;
  tax: number;
  orders: number;
  returningOrders: number;
  newCustomers: number;
  returns: number;
}

/**
 * Aggregates daily metrics for a store over the given window and upserts
 * each day into the DailyMetric table.
 *
 * @param storeId   Internal store id (Prisma row id, not Shopify domain)
 * @param syncFrom  Optional lower bound — when provided, the coverage window
 *                  starts at the earlier of (syncFrom − 1 day) or the default
 *                  COVERAGE_DAYS cutoff. Always covers at least the changed days.
 * @returns         Number of DailyMetric rows upserted.
 */
export async function aggregateDailyMetrics(
  storeId: string,
  syncFrom?: Date | null
): Promise<number> {
  const db = getDb();

  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - COVERAGE_DAYS);
  defaultStart.setHours(0, 0, 0, 0);

  // If syncFrom is provided, include one extra day of headroom to capture any
  // order that crept into the boundary during the previous window.
  let start = defaultStart;
  if (syncFrom) {
    const syncDay = new Date(syncFrom);
    syncDay.setDate(syncDay.getDate() - 1);
    syncDay.setHours(0, 0, 0, 0);
    if (syncDay < defaultStart) start = syncDay;
  }

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  // Retrieve the store's timezone for day-bucketing. Falls back to UTC so
  // the result is still meaningful if the store hasn't set a timezone yet.
  const storeRow = await db.store.findUnique({
    where: { id: storeId },
    select: { timezone: true, defaultCostRatio: true }
  });
  const timeZone = storeRow?.timezone ?? "UTC";

  // ── Three parallel scans (mirrors computeDailySeries) ─────────────────
  const [sales, orderMeta, refunds] = await Promise.all([
    // (1) Line-item aggregates bucketed by order date (in store timezone)
    db.$queryRawUnsafe(
      `SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(li."lineSubtotal") AS gross,
              SUM(li."lineDiscountAmount") AS disc,
              SUM(li."estimatedCostAmount") AS cogs
       FROM "Order" o
       JOIN "OrderLineItem" li ON li."orderId" = o."id"
       WHERE o."storeId" = $1
         AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId, start, end, timeZone
    ),

    // (2) Order-level shipping/tax/counts/returning bucketed by order date
    db.$queryRawUnsafe(
      `WITH firsts AS (
         SELECT "customerId", MIN("createdAt") AS first_at
         FROM "Order"
         WHERE "storeId" = $1
           AND "customerId" IS NOT NULL
           AND "cancelledAt" IS NULL AND "test" = false
         GROUP BY "customerId"
       )
       SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(o."totalShipping") AS ship,
              SUM(o."totalTax") AS tax,
              COUNT(*) AS orders,
              COUNT(*) FILTER (
                WHERE f."customerId" IS NOT NULL AND o."createdAt" > f.first_at
              ) AS returning_orders,
              COUNT(*) FILTER (
                WHERE f."customerId" IS NULL OR o."createdAt" = f.first_at
              ) AS new_customers
       FROM "Order" o
       LEFT JOIN firsts f ON f."customerId" = o."customerId"
       WHERE o."storeId" = $1
         AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId, start, end, timeZone
    ),

    // (3) Returns attributed by original order date (Shopify Sales report parity)
    db.$queryRawUnsafe(
      `SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(r."refundedAmount") AS returns
       FROM "Refund" r
       JOIN "Order" o ON o."id" = r."orderId"
       WHERE r."storeId" = $1
         AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId, start, end, timeZone
    )
  ]);

  // ── Merge three result sets into per-day buckets ───────────────────────
  const byDay = new Map<string, DayBucket>();
  const keyOf = (d: unknown) => new Date(d as string | Date).toISOString().slice(0, 10);
  const getBucket = (k: string): DayBucket => {
    let b = byDay.get(k);
    if (!b) {
      b = { gross: 0, disc: 0, cogs: 0, ship: 0, tax: 0, orders: 0, returningOrders: 0, newCustomers: 0, returns: 0 };
      byDay.set(k, b);
    }
    return b;
  };

  for (const r of sales as any[]) {
    const b = getBucket(keyOf(r.d));
    b.gross += num(r.gross);
    b.disc += num(r.disc);
    b.cogs += num(r.cogs);
  }
  for (const r of orderMeta as any[]) {
    const b = getBucket(keyOf(r.d));
    b.ship += num(r.ship);
    b.tax += num(r.tax);
    b.orders += num(r.orders);
    b.returningOrders += num(r.returning_orders);
    b.newCustomers += num(r.new_customers);
  }
  for (const r of refunds as any[]) {
    const b = getBucket(keyOf(r.d));
    b.returns += num(r.returns);
  }

  if (byDay.size === 0) return 0;

  // ── Upsert one DailyMetric row per day ────────────────────────────────
  let upserted = 0;
  for (const [isoDate, b] of byDay) {
    const net = b.gross - b.disc - b.returns;
    // Match Shopify's dashboard revenue: net sales + shipping, NO tax
    // addback. For tax-included stores (Israel/EU) the tax is already
    // inside the price the customer paid — adding it back on top of
    // the tax-stripped line subtotal double-counts VAT. Same rationale
    // as computeSalesSummary in prisma-analytics-repository.
    const revenue = net + b.ship;
    const estimatedProfit = net - b.cogs;
    const returningCustomerRate = b.orders > 0 ? b.returningOrders / b.orders : 0;
    // Match Shopify's dashboard AOV: net line-item sales / orders. No
    // shipping, no tax — otherwise a store with expensive shipping shows
    // a higher AOV than what the founder writes in their manual summary.
    const averageOrderValue = b.orders > 0 ? net / b.orders : 0;
    const discountRate = b.gross > 0 ? b.disc / b.gross : 0;
    const refundRate = b.gross > 0 ? b.returns / b.gross : 0;

    // Store midday UTC so Prisma never shifts the date across a timezone boundary.
    const date = new Date(`${isoDate}T12:00:00.000Z`);

    await db.dailyMetric.upsert({
      where: { storeId_date: { storeId, date } },
      update: {
        revenue,
        estimatedProfit,
        returningCustomerRate,
        averageOrderValue,
        discountRate,
        refundRate,
        ordersCount: b.orders,
        newCustomers: b.newCustomers,
        returningCustomers: b.returningOrders
      },
      create: {
        storeId,
        date,
        revenue,
        estimatedProfit,
        returningCustomerRate,
        averageOrderValue,
        discountRate,
        refundRate,
        ordersCount: b.orders,
        newCustomers: b.newCustomers,
        returningCustomers: b.returningOrders
      }
    });
    upserted++;
  }

  return upserted;
}

/**
 * Persists a Summary row for the store based on the current analytics state.
 * Summary.contentJson stores the sections array. The headline is generated
 * deterministically (falling back gracefully when OpenAI is not configured).
 *
 * Keeps the two most recent Summary rows (one per call). Older rows are
 * pruned so the table stays bounded.
 */
export async function persistSummary(storeId: string): Promise<void> {
  const db = getDb();

  try {
    // Build the summary from the live analytics service. This function is
    // already resilient — it falls back through multiple layers without throwing.
    const { regenerateSummary } = await import("@/lib/services/summary-service");
    const summary = await regenerateSummary();

    await db.summary.create({
      data: {
        storeId,
        headline: summary.headline,
        contentJson: summary.sections as any,
        generatedAt: new Date()
      }
    });

    // Prune: keep at most 5 rows per store (newest first), delete the rest.
    const existing = await db.summary.findMany({
      where: { storeId },
      orderBy: { generatedAt: "desc" },
      select: { id: true }
    });
    if (existing.length > 5) {
      const toDelete = existing.slice(5).map((r: any) => r.id);
      await db.summary.deleteMany({ where: { id: { in: toDelete } } });
    }
  } catch (err) {
    // Never let summary persistence crash the sync. Log and continue.
    console.warn("[daily-metric-aggregator] persistSummary failed (non-fatal):", err);
  }
}
