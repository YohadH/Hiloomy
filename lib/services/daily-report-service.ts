// Builds the "yesterday" daily digest for the owner's morning Telegram PDF.
// Metrics: revenue, orders, AOV, refunds/return-rate, new-vs-returning customers,
// top products (by units), Meta ad spend + attributed purchases + blended ROAS.
//
// Data sources:
//   • Shopify orders / line items / refunds — Order.test=false; cancelledAt=null
//     (cancelled orders have net revenue 0 anyway via totalRefunds, but
//     excluding them keeps the order count clean).
//   • MetaAdsCampaignInsight at level="campaign" to avoid double-counting.
//   • SyncRun to stamp freshness.
//
// Sessions / conversion-rate are NOT included — AttributionSession is empty
// in production.
//
// Date handling:
//   "Yesterday" is always the previous calendar day in Asia/Jerusalem timezone.
//   For Shopify orders we use the precise UTC bounds derived from Israel midnight.
//   For Meta insights we use UTC-midnight-matched calendar date bounds (Meta
//   stores daily rows as dateStart = YYYY-MM-DDT00:00:00Z from the API string).

import { getDb } from "@/lib/server/db";

const ISRAEL_TZ = "Asia/Jerusalem";
const TOP_PRODUCTS_LIMIT = 5;

export interface DailyPeriodMetrics {
  revenue: number;
  orders: number;
  aov: number;
  refundAmount: number;
  returnRate: number;
  newCustomers: number;
  returningCustomers: number;
  guestOrders: number;
}

export interface DailyTopProduct {
  title: string;
  units: number;
  revenue: number;
}

export interface DailyMetaMetrics {
  spend: number;
  attributedPurchases: number;
  blendedRoas: number | null;
}

export interface DailyFreshness {
  syncedAt: string | null;
  stale: boolean;
}

export interface DailyReportBundle {
  storeId: string;
  reportDate: string;
  today: DailyPeriodMetrics;
  prior: DailyPeriodMetrics;
  topProducts: DailyTopProduct[];
  meta: DailyMetaMetrics | null;
  freshness: DailyFreshness;
}

// Returns the Israel date parts for a given moment.
function getIsraelDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? "2000"),
    month: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
    day: Number(parts.find((p) => p.type === "day")?.value ?? "1")
  };
}

// Convert an Israel calendar date (year/month/day) to a [start, end] UTC window.
// Method: find the UTC timestamp that corresponds to midnight Israel time by
// taking UTC midnight of the same calendar date, reading back the Israel hour,
// and subtracting that offset. Works for both UTC+2 (winter) and UTC+3 (summer).
function israelDateToUTCBounds(year: number, month: number, day: number): { start: Date; end: Date } {
  const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const israelHourAtUTCMidnight =
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: ISRAEL_TZ,
        hour: "numeric",
        hour12: false
      }).format(utcMidnight)
    ) % 24;
  const start = new Date(utcMidnight.getTime() - israelHourAtUTCMidnight * 3600_000);
  const end = new Date(start.getTime() + 86_400_000 - 1);
  return { start, end };
}

// Build the date arithmetic for "yesterday" and "day before yesterday" in Israel TZ.
export function getDailyReportDates(now: Date = new Date()): {
  reportDateStr: string;
  yesterday: { start: Date; end: Date; metaStart: Date; metaEnd: Date };
  prior: { start: Date; end: Date; metaStart: Date; metaEnd: Date };
} {
  const { year, month, day } = getIsraelDateParts(now);
  // yesterday = today - 1 day
  const yd = new Date(Date.UTC(year, month - 1, day - 1));
  const yYear = yd.getUTCFullYear();
  const yMonth = yd.getUTCMonth() + 1;
  const yDay = yd.getUTCDate();
  const reportDateStr = `${yYear}-${String(yMonth).padStart(2, "0")}-${String(yDay).padStart(2, "0")}`;

  const yesterday = {
    ...israelDateToUTCBounds(yYear, yMonth, yDay),
    metaStart: new Date(Date.UTC(yYear, yMonth - 1, yDay, 0, 0, 0, 0)),
    metaEnd: new Date(Date.UTC(yYear, yMonth - 1, yDay, 23, 59, 59, 999))
  };

  // day before yesterday
  const pd = new Date(Date.UTC(yYear, yMonth - 1, yDay - 1));
  const pYear = pd.getUTCFullYear();
  const pMonth = pd.getUTCMonth() + 1;
  const pDay = pd.getUTCDate();
  const prior = {
    ...israelDateToUTCBounds(pYear, pMonth, pDay),
    metaStart: new Date(Date.UTC(pYear, pMonth - 1, pDay, 0, 0, 0, 0)),
    metaEnd: new Date(Date.UTC(pYear, pMonth - 1, pDay, 23, 59, 59, 999))
  };

  return { reportDateStr, yesterday, prior };
}

async function queryPeriodMetrics(
  db: ReturnType<typeof getDb>,
  storeId: string,
  start: Date,
  end: Date
): Promise<DailyPeriodMetrics> {
  const orders = await db.order.findMany({
    where: {
      storeId,
      createdAt: { gte: start, lte: end },
      test: false,
      cancelledAt: null
    },
    select: {
      totalPrice: true,
      totalRefunds: true,
      customerId: true,
      customer: { select: { isReturning: true } }
    }
  });

  let revenue = 0;
  let newCustomers = 0;
  let returningCustomers = 0;
  let guestOrders = 0;

  for (const o of orders as Array<{
    totalPrice: unknown;
    totalRefunds: unknown;
    customerId: string | null;
    customer: { isReturning: boolean } | null;
  }>) {
    const net = Math.max(0, Number(o.totalPrice) - Number(o.totalRefunds));
    revenue += net;
    if (!o.customerId) {
      guestOrders += 1;
    } else if (o.customer?.isReturning) {
      returningCustomers += 1;
    } else {
      newCustomers += 1;
    }
  }

  const orderCount = orders.length;
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  // Refunds processed in this window (not just refunds on orders placed in window).
  const refundAgg = await db.refund.aggregate({
    where: { storeId, createdAt: { gte: start, lte: end } },
    _sum: { refundedAmount: true }
  });
  const refundAmount = Number(refundAgg._sum.refundedAmount ?? 0);
  const returnRate = revenue > 0 ? refundAmount / revenue : 0;

  return { revenue, orders: orderCount, aov, refundAmount, returnRate, newCustomers, returningCustomers, guestOrders };
}

async function queryTopProducts(
  db: ReturnType<typeof getDb>,
  storeId: string,
  start: Date,
  end: Date
): Promise<DailyTopProduct[]> {
  const items = await db.orderLineItem.findMany({
    where: {
      storeId,
      order: {
        createdAt: { gte: start, lte: end },
        test: false,
        cancelledAt: null
      }
    },
    select: { title: true, quantity: true, lineSubtotal: true }
  });

  const map = new Map<string, { units: number; revenue: number }>();
  for (const item of items as Array<{ title: string; quantity: number; lineSubtotal: unknown }>) {
    const entry = map.get(item.title) ?? { units: 0, revenue: 0 };
    entry.units += item.quantity;
    entry.revenue += Number(item.lineSubtotal);
    map.set(item.title, entry);
  }

  return Array.from(map.entries())
    .map(([title, s]) => ({ title, units: s.units, revenue: s.revenue }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, TOP_PRODUCTS_LIMIT);
}

async function queryMetaMetrics(
  db: ReturnType<typeof getDb>,
  storeId: string,
  metaStart: Date,
  metaEnd: Date,
  shopifyRevenue: number
): Promise<DailyMetaMetrics | null> {
  const agg = await db.metaAdsCampaignInsight.aggregate({
    where: {
      storeId,
      level: "campaign",
      dateStart: { gte: metaStart, lte: metaEnd }
    },
    _sum: { spend: true, purchases: true }
  });

  const spend = Number(agg._sum.spend ?? 0);
  if (spend === 0 && Number(agg._sum.purchases ?? 0) === 0) return null;

  const attributedPurchases = Number(agg._sum.purchases ?? 0);
  const blendedRoas = spend > 0 ? shopifyRevenue / spend : null;

  return { spend, attributedPurchases, blendedRoas };
}

async function queryFreshness(
  db: ReturnType<typeof getDb>,
  storeId: string,
  periodStart: Date
): Promise<DailyFreshness> {
  const sync = await db.syncRun.findFirst({
    where: { storeId, status: "completed" },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true }
  });
  if (!sync?.completedAt) return { syncedAt: null, stale: true };
  const syncedAt = (sync.completedAt as Date).toISOString();
  // Stale if the last completed sync finished before yesterday's window start.
  const stale = (sync.completedAt as Date) < periodStart;
  return { syncedAt, stale };
}

export async function buildDailyReport(
  storeId: string,
  now: Date = new Date()
): Promise<DailyReportBundle> {
  const db = getDb();
  const dates = getDailyReportDates(now);

  const [todayMetrics, priorMetrics, topProducts, freshness] = await Promise.all([
    queryPeriodMetrics(db, storeId, dates.yesterday.start, dates.yesterday.end),
    queryPeriodMetrics(db, storeId, dates.prior.start, dates.prior.end),
    queryTopProducts(db, storeId, dates.yesterday.start, dates.yesterday.end),
    queryFreshness(db, storeId, dates.yesterday.start)
  ]);

  const meta = await queryMetaMetrics(
    db,
    storeId,
    dates.yesterday.metaStart,
    dates.yesterday.metaEnd,
    todayMetrics.revenue
  );

  return {
    storeId,
    reportDate: dates.reportDateStr,
    today: todayMetrics,
    prior: priorMetrics,
    topProducts,
    meta,
    freshness
  };
}
