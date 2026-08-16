// Cache layer for the weekly-report insights.
//
// The print page (/print/meta-ads-weekly) and the scheduled weekly-report
// email each regenerate three expensive artifacts:
//
//   • biCommentary   — BI agent, ~60s per render
//   • brandInsights  — OpenAI, per-brand, ~5-10s each
//   • igInsights     — OpenAI + BI agent, ~15s
//
// Combined, that turns a re-open of the same PDF from cached-instant into
// a 90-second Playwright render. The WeeklyReport model already has an
// `insightsJson` field for exactly this purpose; we just weren't reading
// it back.
//
// Contract:
//   • Read: matches on (storeId, kind, periodEnd within a 1-day window)
//     ordered by generatedAt desc. Returns null if the freshest row is
//     older than `ttlHours` (default 24).
//   • Write: only UPDATES an existing WeeklyReport row's insightsJson;
//     never creates one. This keeps the report list tidy (rows are still
//     created only by the scheduled cron / persistWeeklyReport call).

import { getDb } from "@/lib/server/db";
import type { BrandInsights } from "@/lib/services/meta-ads-report-insights-service";
import type { InstagramInsights } from "@/lib/services/instagram-report-insights-service";
import type { BiWeeklyCommentary } from "@/lib/services/weekly-report-bi-commentary-service";

export interface CachedWeeklyInsights {
  biCommentary?: BiWeeklyCommentary | null;
  brandInsights?: Record<string, BrandInsights> | null;
  igInsights?: InstagramInsights | null;
  // ISO string so consumers can display "insights from N hours ago".
  cachedAt?: string;
}

const DEFAULT_TTL_HOURS = 24;

// Read cached insights for the given window. Freshness is measured on the
// row's `generatedAt`, not `cachedAt` inside the JSON, so a freshly-persisted
// scheduled report counts as cached even before the print page has ever
// written the biCommentary back into it.
export async function readCachedInsights(
  storeId: string,
  periodStart: Date,
  periodEnd: Date,
  kind: "weekly" | "monthly" = "weekly",
  ttlHours: number = DEFAULT_TTL_HOURS
): Promise<CachedWeeklyInsights | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  // ±1 day fuzziness on periodEnd — the scheduled cron may land the row
  // a few minutes after midnight; strict equality would miss it.
  const oneDayMs = 24 * 60 * 60 * 1000;
  const endMin = new Date(periodEnd.getTime() - oneDayMs);
  const endMax = new Date(periodEnd.getTime() + oneDayMs);
  const row = await db.weeklyReport.findFirst({
    where: {
      storeId,
      kind,
      periodEnd: { gte: endMin, lte: endMax }
    },
    orderBy: { generatedAt: "desc" },
    select: { id: true, insightsJson: true, generatedAt: true }
  });
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.generatedAt).getTime();
  if (ageMs > ttlHours * 60 * 60 * 1000) return null;
  const insights = row.insightsJson as CachedWeeklyInsights | null;
  if (!insights) return null;
  return { ...insights, cachedAt: new Date(row.generatedAt).toISOString() };
}

// Write / merge insights into the most recent existing WeeklyReport row
// for this window. Never inserts a row — that's persistWeeklyReport's job
// during the scheduled cron.
export async function writeCachedInsights(
  storeId: string,
  periodStart: Date,
  periodEnd: Date,
  insights: CachedWeeklyInsights,
  kind: "weekly" | "monthly" = "weekly"
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const endMin = new Date(periodEnd.getTime() - oneDayMs);
  const endMax = new Date(periodEnd.getTime() + oneDayMs);
  const row = await db.weeklyReport.findFirst({
    where: {
      storeId,
      kind,
      periodEnd: { gte: endMin, lte: endMax }
    },
    orderBy: { generatedAt: "desc" },
    select: { id: true, insightsJson: true }
  });
  if (!row) return; // Ad-hoc render; nothing to cache to.
  const existing = (row.insightsJson as CachedWeeklyInsights | null) ?? {};
  const merged: CachedWeeklyInsights = {
    biCommentary: insights.biCommentary ?? existing.biCommentary ?? null,
    brandInsights: insights.brandInsights ?? existing.brandInsights ?? null,
    igInsights: insights.igInsights ?? existing.igInsights ?? null
  };
  await db.weeklyReport.update({
    where: { id: row.id },
    data: { insightsJson: merged as unknown as object }
  });
}
