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
  totalClicks: number;
  totalImpressions: number;
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

async function buildGscHalf(storeId: string): Promise<SearchSummaryHalf | null> {
  const db = getDb() as any;
  const queries = (await db.searchConsoleQuery.findMany({
    where: { storeId },
    orderBy: { totalClicks: "desc" },
    take: 5,
    select: { query: true, totalClicks: true, totalImpressions: true, avgPosition: true }
  })) as Array<{ query: string; totalClicks: number; totalImpressions: number; avgPosition: number }>;
  if (queries.length === 0) return null;

  const totals = (await db.searchConsoleQuery.aggregate({
    where: { storeId },
    _sum: { totalClicks: true, totalImpressions: true }
  })) as { _sum: { totalClicks: number | null; totalImpressions: number | null } };

  return {
    totalClicks: totals._sum.totalClicks ?? 0,
    totalImpressions: totals._sum.totalImpressions ?? 0,
    topQueries: queries.map((q) => ({
      query: q.query,
      clicks: q.totalClicks,
      impressions: q.totalImpressions,
      position: Math.round(q.avgPosition * 10) / 10
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
