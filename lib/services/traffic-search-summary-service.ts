// Traffic & organic search summary for the dashboard — the "reflection"
// layer over GaTrafficDaily (GA4) and SearchConsoleMetric (GSC).
//
// WINDOW-AWARE (2026-08-23): both halves follow the dashboard's selected
// date range instead of hardcoded 30d/28d windows — a founder on "last 7
// days" sees 7 days of traffic, matching every other section. The prior-
// period comparison uses the same window length immediately before.
// Google's data lags 2-3 days, so each half also reports the latest date
// it actually has (`dataThrough`) and the UI shows it.
//
// Both halves are independently optional; returns null when neither has
// data so the dashboard section can hide entirely.

import { getDb } from "@/lib/server/db";

/** One row of "which link works" — same shape for source/campaign/landing. */
export interface TrafficBreakdownRow {
  key: string;
  sessions: number;
  transactions: number;
  revenue: number;
  /** purchases / sessions, as a percentage. Null when no sessions. */
  conversionRate: number | null;
}

export interface TrafficSummaryHalf {
  sessions: number;
  priorSessions: number | null;
  sessionsChangePct: number | null;
  conversions: number;
  conversionRate: number | null; // purchases / sessions (see ga4-service metric note)
  revenue: number;
  windowDays: number;
  dataThrough: string | null;
  topChannels: Array<{ channel: string; sessions: number; sharePct: number }>;
  /** Populated once the breakdown sync has run (GA4 "Sync now"). */
  topSources: TrafficBreakdownRow[];
  topCampaigns: TrafficBreakdownRow[];
  topLandingPages: TrafficBreakdownRow[];
}

export interface SearchSummaryHalf {
  totalClicks: number;
  totalImpressions: number;
  priorClicks: number | null;
  clicksChangePct: number | null;
  windowDays: number;
  /** Latest date GSC actually has data for (Google lags 2-3 days). */
  dataThrough: string | null;
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
}

export interface TrafficSearchSummary {
  ga4: TrafficSummaryHalf | null;
  gsc: SearchSummaryHalf | null;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DAY_MS = 86_400_000;

function windowDayCount(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

async function buildGa4Half(storeId: string, start: Date, end: Date): Promise<TrafficSummaryHalf | null> {
  const db = getDb() as any;
  const days = windowDayCount(start, end);
  const priorStart = new Date(start.getTime() - days * DAY_MS);

  const rows = (await db.gaTrafficDaily.findMany({
    where: { storeId, date: { gte: priorStart, lte: end } },
    select: { date: true, channel: true, sessions: true, conversions: true, revenue: true }
  })) as Array<{ date: Date; channel: string; sessions: number; conversions: unknown; revenue: unknown }>;
  if (rows.length === 0) return null;

  let sessions = 0;
  let priorSessions = 0;
  let priorHasData = false;
  let conversions = 0;
  let revenue = 0;
  let latest: Date | null = null;
  const channels = new Map<string, number>();
  for (const row of rows) {
    if (row.date.getTime() >= start.getTime()) {
      sessions += row.sessions;
      conversions += num(row.conversions);
      revenue += num(row.revenue);
      channels.set(row.channel, (channels.get(row.channel) ?? 0) + row.sessions);
      if (!latest || row.date > latest) latest = row.date;
    } else {
      priorSessions += row.sessions;
      priorHasData = true;
    }
  }
  if (sessions === 0 && conversions === 0) return null;

  const [topSources, topCampaigns, topLandingPages] = await Promise.all([
    topBreakdown(db, storeId, "source", start, end),
    topBreakdown(db, storeId, "campaign", start, end),
    topBreakdown(db, storeId, "landing", start, end)
  ]);

  return {
    sessions,
    priorSessions: priorHasData ? priorSessions : null,
    sessionsChangePct:
      priorHasData && priorSessions > 0
        ? Math.round(((sessions - priorSessions) / priorSessions) * 1000) / 10
        : null,
    conversions: Math.round(conversions),
    conversionRate: sessions > 0 ? Math.round((conversions / sessions) * 10000) / 100 : null,
    revenue: Math.round(revenue),
    windowDays: days,
    dataThrough: latest ? latest.toISOString().slice(0, 10) : null,
    topChannels: [...channels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([channel, count]) => ({
        channel,
        sessions: count,
        sharePct: sessions > 0 ? Math.round((count / sessions) * 100) : 0
      })),
    topSources,
    topCampaigns,
    topLandingPages
  };
}

// Top rows of one breakdown kind for the window, ranked by revenue (the
// panel answers "which link makes money" — ordering by sessions made the
// revenue bars read as random noise), with sessions as the tiebreak so
// high-traffic zero-purchase rows still surface at the bottom as a warning.
// "(not set)" / "(direct)" campaigns are dropped from the campaign list —
// they're the absence of a campaign, not a campaign worth reporting.
async function topBreakdown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  storeId: string,
  kind: "source" | "campaign" | "landing",
  start: Date,
  end: Date
): Promise<TrafficBreakdownRow[]> {
  if (!db?.gaTrafficBreakdown) return [];
  const rows = (await db.gaTrafficBreakdown
    .groupBy({
      by: ["key"],
      where: {
        storeId,
        kind,
        date: { gte: start, lte: end },
        ...(kind === "campaign" ? { key: { notIn: ["(not set)", "(direct)", "(organic)"] } } : {})
      },
      _sum: { sessions: true, transactions: true, revenue: true },
      // Over-fetch by sessions, rank by revenue in JS — Prisma orders null
      // sums unpredictably and a top-revenue row is virtually always inside
      // the top 12 by traffic.
      orderBy: { _sum: { sessions: "desc" } },
      take: 12
    })
    .catch(() => [])) as Array<{
    key: string;
    _sum: { sessions: unknown; transactions: unknown; revenue: unknown };
  }>;

  return rows
    .map((r) => {
      const sessions = num(r._sum.sessions);
      const transactions = num(r._sum.transactions);
      return {
        key: r.key,
        sessions,
        transactions: Math.round(transactions),
        revenue: Math.round(num(r._sum.revenue)),
        conversionRate: sessions > 0 ? Math.round((transactions / sessions) * 10000) / 100 : null
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions)
    .slice(0, 6);
}

async function buildGscHalf(storeId: string, start: Date, end: Date): Promise<SearchSummaryHalf | null> {
  const db = getDb() as any;

  // Google's data lags 2-3 days — clamp the effective end to the latest
  // date GSC actually delivered so short windows don't silently lose days.
  const latest = (await db.searchConsoleMetric.findFirst({
    where: { storeId },
    orderBy: { date: "desc" },
    select: { date: true }
  })) as { date: Date } | null;
  if (!latest) return null;

  const effectiveEnd = latest.date.getTime() < end.getTime() ? latest.date : end;
  if (effectiveEnd.getTime() < start.getTime()) return null;
  const days = windowDayCount(start, effectiveEnd);
  const priorStart = new Date(start.getTime() - days * DAY_MS);

  const [current, prior, topQueryRows] = await Promise.all([
    db.searchConsoleMetric.aggregate({
      where: { storeId, date: { gte: start, lte: effectiveEnd } },
      _sum: { clicks: true, impressions: true }
    }),
    db.searchConsoleMetric.aggregate({
      where: { storeId, date: { gte: priorStart, lt: start } },
      _sum: { clicks: true, impressions: true }
    }),
    db.searchConsoleMetric.groupBy({
      by: ["query"],
      where: { storeId, query: { not: null }, date: { gte: start, lte: effectiveEnd } },
      _sum: { clicks: true, impressions: true },
      _avg: { position: true },
      orderBy: { _sum: { clicks: "desc" } },
      take: 5
    })
  ]);

  const totalClicks = num(current._sum?.clicks);
  const totalImpressions = num(current._sum?.impressions);
  if (totalClicks === 0 && totalImpressions === 0) return null;
  const priorClicks = num(prior._sum?.clicks);
  const priorHasData = priorClicks > 0;

  return {
    totalClicks,
    totalImpressions,
    priorClicks: priorHasData ? priorClicks : null,
    clicksChangePct: priorHasData
      ? Math.round(((totalClicks - priorClicks) / priorClicks) * 1000) / 10
      : null,
    windowDays: days,
    dataThrough: effectiveEnd.toISOString().slice(0, 10),
    topQueries: (topQueryRows as Array<{
      query: string | null;
      _sum: { clicks: unknown; impressions: unknown };
      _avg: { position: unknown };
    }>).map((q) => ({
      query: q.query ?? "—",
      clicks: num(q._sum.clicks),
      impressions: num(q._sum.impressions),
      position: Math.round(num(q._avg.position) * 10) / 10
    }))
  };
}

export async function buildTrafficSearchSummary(
  storeId: string,
  window?: { start: Date; end: Date }
): Promise<TrafficSearchSummary | null> {
  const end = window?.end ?? new Date();
  const start = window?.start ?? new Date(end.getTime() - 30 * DAY_MS);
  const [ga4, gsc] = await Promise.all([
    buildGa4Half(storeId, start, end).catch(() => null),
    buildGscHalf(storeId, start, end).catch(() => null)
  ]);
  if (!ga4 && !gsc) return null;
  return { ga4, gsc };
}
