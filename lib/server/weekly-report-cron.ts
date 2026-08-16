// In-process cron that checks every 5 minutes whether the weekly report
// (Sunday 09:00 Asia/Jerusalem) or the monthly meta-report (1st of month,
// 09:00 Asia/Jerusalem) is due. When due, POSTs to the cron-run route which
// does the actual work — same architecture as the existing shopify-sync /
// creative-job crons.
//
// MULTI-TENANT LIMITATION (SA-MED-03): the schedule below is HARDCODED to
// Asia/Jerusalem. The cron fires ONCE for ALL stores at Jerusalem time,
// regardless of each Store's own `timezone` field. Per-store scheduling
// (firing each tenant's report at 09:00 in THEIR timezone) is a future
// enhancement and is NOT yet implemented — a tenant in another timezone
// will receive its weekly summary at 09:00 Jerusalem time, not 09:00 local.
//
// Idempotency: the route checks the WeeklyReport table for a row matching
// the period the cron is asking for. If one exists, it skips. So this cron
// is safe to fire multiple times within a window — only the first one will
// actually generate + send.
//
// Env knobs:
//   ENABLE_WEEKLY_REPORT_CRON=1     → opt-in. Default OFF in development, ON in
//                                     production. Set to start it locally.
//   WEEKLY_REPORT_CRON_DISABLED=1   → hard kill switch (overrides ENABLE_*)
//   WEEKLY_REPORT_CRON_MS=<ms>      → override the polling interval
//   WEEKLY_REPORT_CRON_URL=<url>    → override the endpoint pinged

import { isCronEnabled, fetchWithTimeout, computeBackoffMs } from "./cron-util";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BOOT_DELAY_MS = 30_000; // wait 30s after boot before the first tick
const FETCH_TIMEOUT_MS = 2 * 60 * 1000; // report generation can take a while
const GLOBAL_KEY = "__weeklyReportCronHandle__";
const ISRAEL_TZ = "Asia/Jerusalem";

function resolveCronUrl(): string {
  if (process.env.WEEKLY_REPORT_CRON_URL) return process.env.WEEKLY_REPORT_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/weekly-summary/cron/run`;
}

// Get Israel-local hour + weekday + day-of-month using Intl. We don't try to
// be clever with date math — let the formatter handle DST and locale shifts.
function getIsraelTimeParts(now = new Date()): {
  hour: number;
  weekday: number; // 0=Sunday, 1=Monday, ... 6=Saturday
  dayOfMonth: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    hour: "numeric",
    hour12: false,
    weekday: "short",
    day: "numeric"
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const dayPart = parts.find((p) => p.type === "day")?.value ?? "1";
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return {
    hour: Number(hourPart),
    weekday: weekdayMap[weekdayPart] ?? 0,
    dayOfMonth: Number(dayPart)
  };
}

// Decide whether ANY auto-report run is plausible right now. The cron route
// itself decides which kind (weekly/monthly) to actually generate.
function isDueWindow(now = new Date()): { weekly: boolean; monthly: boolean } {
  const { hour, weekday, dayOfMonth } = getIsraelTimeParts(now);
  // 9-10 AM Israel window gives us multiple ticks to catch the schedule
  // even if the first attempt fails or coincides with a DLL lock.
  const inWindow = hour >= 9 && hour < 11;
  return {
    weekly: inWindow && weekday === 0, // Sunday
    monthly: inWindow && dayOfMonth === 1 // 1st of month
  };
}

export function startWeeklyReportCron(): void {
  if (!isCronEnabled("WEEKLY_REPORT")) {
    console.log("[weekly-report-cron] DISABLED (set ENABLE_WEEKLY_REPORT_CRON=1 to enable)");
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
  };
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.WEEKLY_REPORT_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();

  let running = false;
  let failures = 0; // consecutive failures, drives backoff
  let backoffUntil = 0; // epoch ms; skip ticks before this
  const tick = async () => {
    if (running) return;
    if (Date.now() < backoffUntil) return;
    const due = isDueWindow();
    if (!due.weekly && !due.monthly) return;
    running = true;
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekly: due.weekly, monthly: due.monthly })
        },
        FETCH_TIMEOUT_MS
      );
      if (!response.ok) {
        failures += 1;
        const backoff = computeBackoffMs(failures, intervalMs);
        backoffUntil = Date.now() + backoff;
        console.warn(
          `[weekly-report-cron] tick failed: HTTP ${response.status} (attempt ${failures}, backing off ${Math.round(
            backoff / 1000
          )}s)`
        );
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        ran?: string[];
        skipped?: string[];
      };
      if (body.ran?.length) {
        console.log(`[weekly-report-cron] ran: ${body.ran.join(", ")}`);
      }
      failures = 0;
      backoffUntil = 0;
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(
        `[weekly-report-cron] trigger failed (attempt ${failures}, backing off ${Math.round(
          backoff / 1000
        )}s)`,
        error instanceof Error ? error.message : error
      );
    } finally {
      running = false;
    }
  };

  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  globalScope[GLOBAL_KEY] = handle;

  console.log(
    `[weekly-report-cron] scheduled check every ${Math.round(intervalMs / 60000)} minutes via ${url} (Sundays 09:00 ${ISRAEL_TZ})`
  );

  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
