// Traffic & organic search summary for the dashboard — the "reflection"
// layer over GaTrafficDaily (GA4) and the SearchConsole rollups (GSC).
// Both halves are independently optional; returns null when neither has
// data so the dashboard section can hide entirely.

import { getDb } from "@/lib/server/db";

export interface TrafficSummaryHalf {
  // Last 30 full days.
  sessions: number;
  priorSessions: number | null;
  sessionsChangePct: number | null;
  conversions: number;
  conversionRate: number | null; // conversions / sessions
  revenue: number;
  topChannels: Array<{ channel: string; sessions: number; sharePct: number }>;
}

export interface SearchSummaryHalf {
  // Windowed (last 28 available days), NOT lifetime — the earlier version
  // summed the SearchConsoleQuery lifetime rollups, which barely move
  // between syncs and made the dashboard section look frozen.
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

async function buildGa4Half(storeId: string): Promise<TrafficSummaryHalf | null> {
  const db = getDb() as any;
  const since = new Date(Date.now() - 60 * 86_400_000);
  const rows = (await db.gaTrafficDaily.findMany({
    where: { storeId, date: { gte: since } },
    select: { date: true, channel: true, sessions: true, conversions: true, revenue: true }
  })) as Array<{ date: Date; channel: string; sessions: number; conversions: unknown; revenue: unknown }>;
  if (rows.length === 0) return null;

  const cutoff = Date.now() - 30 * 86_400_000;
  let sessions = 0;
  let priorSessions = 0;
  let priorHasData = false;
  let conversions = 0;
  let revenue = 0;
  const channels = new Map<string, number>();
  for (const row of rows) {
    if (row.date.getTime() >= cutoff) {
      sessions += row.sessions;
      conversions += num(row.conversions);
      revenue += num(row.revenue);
      channels.set(row.channel, (channels.get(row.channel) ?? 0) + row.sessions);
    } else {
      priorSessions += row.sessions;
      priorHasData = true;
    }
  }

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
    topChannels: [...channels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([channel, count]) => ({
        channel,
        sessions: count,
        sharePct: sessions > 0 ? Math.round((count / sessions) * 100) : 0
      }))
  };
}

const GSC_WINDOW_DAYS = 28;

async function buildGscHalf(storeId: string): Promise<SearchSummaryHalf | null> {
  const db = getDb() as any;

  // Anchor the window on the LATEST date GSC actually has (Google's data
  // lags 2-3 days) — anchoring on "today" would silently shave days off
  // the window and make totals drift for no real reason.
  const latest = (await db.searchConsoleMetric.findFirst({
    where: { storeId },
    orderBy: { date: "desc" },
    select: { date: true }
  })) as { date: Date } | null;
  if (!latest) return null;

  const windowStart = new Date(latest.date.getTime() - (GSC_WINDOW_DAYS - 1) * 86_400_000);
  const priorStart = new Date(windowStart.getTime() - GSC_WINDOW_DAYS * 86_400_000);

  const [current, prior, topQueryRows] = await Promise.all([
    db.searchConsoleMetric.aggregate({
      where: { storeId, date: { gte: windowStart, lte: latest.date } },
      _sum: { clicks: true, impressions: true }
    }),
    db.searchConsoleMetric.aggregate({
      where: { storeId, date: { gte: priorStart, lt: windowStart } },
      _sum: { clicks: true, impressions: true }
    }),
    db.searchConsoleMetric.groupBy({
      by: ["query"],
      where: { storeId, query: { not: null }, date: { gte: windowStart, lte: latest.date } },
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
    windowDays: GSC_WINDOW_DAYS,
    dataThrough: latest.date.toISOString().slice(0, 10),
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
  storeId: string
): Promise<TrafficSearchSummary | null> {
  const [ga4, gsc] = await Promise.all([
    buildGa4Half(storeId).catch(() => null),
    buildGscHalf(storeId).catch(() => null)
  ]);
  if (!ga4 && !gsc) return null;
  return { ga4, gsc };
}
