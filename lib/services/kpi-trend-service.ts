// KPI trend — bucketed time-series over the DailyMetric aggregates, built
// for the BI analyst's get_kpi_trend tool ("the shape of the line, not two
// dots"). Everything derives from rows the daily aggregation cron already
// writes; no new ingestion.
//
// Beyond the raw series it computes what the persona's method needs:
//   - per-bucket change vs the prior bucket
//   - outlier flags (revenue / margin outside mean ± 2σ of the series)
//   - the revenue-vs-margin divergence check (first half vs second half)
//   - a `partial` flag on a trailing incomplete bucket

import { getDb } from "@/lib/server/db";

export type TrendGranularity = "day" | "week" | "month";

export interface KpiTrendBucket {
  // day → YYYY-MM-DD; week → YYYY-MM-DD of the ISO-week Monday; month → YYYY-MM
  bucket: string;
  revenue: number;
  estimatedMargin: number;
  marginRate: number | null; // estimatedMargin / revenue
  orders: number;
  aov: number | null;
  // Revenue-weighted averages of the daily rates.
  discountRate: number | null;
  refundRate: number | null;
  newCustomers: number;
  returningCustomers: number;
  // vs the previous bucket, in percent (null on the first bucket / zero base)
  revenueChangePct: number | null;
  marginChangePct: number | null;
  // Bucket sits outside mean ± 2σ of the series for revenue or margin.
  outlier: boolean;
  // Trailing bucket that hasn't finished yet — don't read it as a drop.
  partial: boolean;
}

export interface KpiTrendReport {
  granularity: TrendGranularity;
  windowStart: string;
  windowEnd: string;
  buckets: KpiTrendBucket[];
  // First-half vs second-half movement of the series — the persona's
  // highest-value pattern is revenue up while margin flat/down.
  divergence: {
    revenueChangePct: number | null;
    marginChangePct: number | null;
    diverging: boolean;
  };
  // How many days in the window actually have metric rows — coverage, so
  // the model can caveat a thin series instead of trusting it.
  daysWithData: number;
  daysInWindow: number;
}

interface DailyRow {
  date: Date;
  revenue: unknown;
  estimatedProfit: unknown;
  averageOrderValue: unknown;
  discountRate: unknown;
  refundRate: unknown;
  ordersCount: number;
  newCustomers: number;
  returningCustomers: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bucketKey(date: Date, granularity: TrendGranularity): string {
  const iso = date.toISOString().slice(0, 10);
  if (granularity === "day") return iso;
  if (granularity === "month") return iso.slice(0, 7);
  // ISO-week Monday.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function pctChange(current: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export async function buildKpiTrend(input: {
  storeId: string;
  granularity?: TrendGranularity;
  days?: number;
}): Promise<KpiTrendReport> {
  const granularity = input.granularity ?? "week";
  const days = Math.min(730, Math.max(14, input.days ?? 90));
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);

  const db = getDb() as any;
  const rows = (await db.dailyMetric.findMany({
    where: { storeId: input.storeId, date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
    select: {
      date: true,
      revenue: true,
      estimatedProfit: true,
      averageOrderValue: true,
      discountRate: true,
      refundRate: true,
      ordersCount: true,
      newCustomers: true,
      returningCustomers: true
    }
  })) as DailyRow[];

  // ── Bucket the days ─────────────────────────────────────────────────
  const acc = new Map<
    string,
    {
      revenue: number;
      margin: number;
      orders: number;
      newCustomers: number;
      returningCustomers: number;
      // Revenue-weighted rate accumulators.
      discountRateWeighted: number;
      refundRateWeighted: number;
    }
  >();
  for (const row of rows) {
    const key = bucketKey(row.date, granularity);
    const bucket = acc.get(key) ?? {
      revenue: 0,
      margin: 0,
      orders: 0,
      newCustomers: 0,
      returningCustomers: 0,
      discountRateWeighted: 0,
      refundRateWeighted: 0
    };
    const revenue = num(row.revenue);
    bucket.revenue += revenue;
    bucket.margin += num(row.estimatedProfit);
    bucket.orders += row.ordersCount;
    bucket.newCustomers += row.newCustomers;
    bucket.returningCustomers += row.returningCustomers;
    bucket.discountRateWeighted += num(row.discountRate) * revenue;
    bucket.refundRateWeighted += num(row.refundRate) * revenue;
    acc.set(key, bucket);
  }

  const keys = [...acc.keys()].sort();
  const todayKey = bucketKey(end, granularity);
  const round = (v: number) => Math.round(v * 100) / 100;

  const buckets: KpiTrendBucket[] = keys.map((key, i) => {
    const b = acc.get(key)!;
    const prior = i > 0 ? acc.get(keys[i - 1])! : null;
    return {
      bucket: key,
      revenue: round(b.revenue),
      estimatedMargin: round(b.margin),
      marginRate: b.revenue > 0 ? round((b.margin / b.revenue) * 100) / 100 : null,
      orders: b.orders,
      aov: b.orders > 0 ? round(b.revenue / b.orders) : null,
      discountRate: b.revenue > 0 ? round((b.discountRateWeighted / b.revenue) * 100) / 100 : null,
      refundRate: b.revenue > 0 ? round((b.refundRateWeighted / b.revenue) * 100) / 100 : null,
      newCustomers: b.newCustomers,
      returningCustomers: b.returningCustomers,
      revenueChangePct: prior ? pctChange(b.revenue, prior.revenue) : null,
      marginChangePct: prior ? pctChange(b.margin, prior.margin) : null,
      outlier: false, // filled below
      partial: granularity !== "day" && key === todayKey
    };
  });

  // ── Outliers: outside mean ± 2σ (needs a real series) ───────────────
  const complete = buckets.filter((b) => !b.partial);
  if (complete.length >= 4) {
    for (const metric of ["revenue", "estimatedMargin"] as const) {
      const values = complete.map((b) => b[metric]);
      const mean = values.reduce((a, v) => a + v, 0) / values.length;
      const sigma = Math.sqrt(
        values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
      );
      if (sigma > 0) {
        for (const b of complete) {
          if (Math.abs(b[metric] - mean) > 2 * sigma) b.outlier = true;
        }
      }
    }
  }

  // ── Divergence: first half vs second half of complete buckets ───────
  let divergence: KpiTrendReport["divergence"] = {
    revenueChangePct: null,
    marginChangePct: null,
    diverging: false
  };
  if (complete.length >= 4) {
    const mid = Math.floor(complete.length / 2);
    const sum = (list: KpiTrendBucket[], k: "revenue" | "estimatedMargin") =>
      list.reduce((a, b) => a + b[k], 0);
    const revenueChangePct = pctChange(
      sum(complete.slice(mid), "revenue"),
      sum(complete.slice(0, mid), "revenue")
    );
    const marginChangePct = pctChange(
      sum(complete.slice(mid), "estimatedMargin"),
      sum(complete.slice(0, mid), "estimatedMargin")
    );
    divergence = {
      revenueChangePct,
      marginChangePct,
      diverging:
        revenueChangePct !== null &&
        marginChangePct !== null &&
        revenueChangePct > 5 &&
        marginChangePct < revenueChangePct - 10
    };
  }

  return {
    granularity,
    windowStart: start.toISOString().slice(0, 10),
    windowEnd: end.toISOString().slice(0, 10),
    buckets,
    divergence,
    daysWithData: rows.length,
    daysInWindow: days
  };
}
