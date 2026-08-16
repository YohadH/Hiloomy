// In-process cron that fires the daily owner digest at ~08:00 Asia/Jerusalem.
// Polls every 5 minutes; the window is 07:50–09:00 so multiple ticks can
// retry if the first one fails.
//
// Architecture mirrors weekly-report-cron.ts:
//   • setInterval tick checks the local Israel time.
//   • When in the fire window, POSTs to /api/daily-report/cron/run.
//   • Exponential backoff on failures; only the first successful run per day
//     actually generates + sends (the route is idempotent within a calendar
//     day by design — Telegram will receive at most one PDF per day).
//
// Idempotency note: unlike the weekly report (which writes a WeeklyReport row),
// the daily cron does not persist a run-record in the DB. Instead, it relies on
// a globalThis flag (`__dailyReportSentDate__`) that tracks the last date
// it successfully sent, so it never fires twice in the same day even across
// multiple tick windows.
//
// Env knobs:
//   ENABLE_DAILY_REPORT_CRON=1   → opt-in. Default OFF in development, ON in production.
//   DAILY_REPORT_CRON_DISABLED=1 → hard kill switch (overrides ENABLE_*)
//   DAILY_REPORT_CRON_MS=<ms>    → override polling interval (default 5 min)
//   DAILY_REPORT_CRON_URL=<url>  → override endpoint (default http://127.0.0.1:{PORT}/...)

import { isCronEnabled, fetchWithTimeout, computeBackoffMs } from "./cron-util";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const BOOT_DELAY_MS = 45_000; // slightly after weekly-report-cron's 30s to stagger load
const FETCH_TIMEOUT_MS = 4 * 60 * 1000; // PDF render + Telegram upload can take time
const GLOBAL_KEY = "__dailyReportCronHandle__";
const SENT_DATE_KEY = "__dailyReportSentDate__"; // YYYY-MM-DD in Israel TZ
const ISRAEL_TZ = "Asia/Jerusalem";

function resolveCronUrl(): string {
  if (process.env.DAILY_REPORT_CRON_URL) return process.env.DAILY_REPORT_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/daily-report/cron/run`;
}

function getIsraelDateParts(now = new Date()): { hour: number; minute: number; dateStr: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const year = parts.find((p) => p.type === "year")?.value ?? "2000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return { hour, minute, dateStr: `${year}-${month}-${day}` };
}

// Fire window: 07:50–09:00 Israel time.
// Wide enough for retries; narrow enough to not fire at midnight.
function isInDailyWindow(now = new Date()): boolean {
  const { hour, minute } = getIsraelDateParts(now);
  const totalMin = hour * 60 + minute;
  return totalMin >= 7 * 60 + 50 && totalMin < 9 * 60;
}

export function startDailyReportCron(): void {
  if (!isCronEnabled("DAILY_REPORT")) {
    console.log("[daily-report-cron] DISABLED (set ENABLE_DAILY_REPORT_CRON=1 to enable)");
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
    [SENT_DATE_KEY]?: string;
  };
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.DAILY_REPORT_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();

  let running = false;
  let failures = 0;
  let backoffUntil = 0;

  const tick = async () => {
    if (running) return;
    if (Date.now() < backoffUntil) return;
    if (!isInDailyWindow()) return;

    // Skip if already sent today (Israel date).
    const { dateStr } = getIsraelDateParts();
    if (globalScope[SENT_DATE_KEY] === dateStr) return;

    running = true;
    try {
      const response = await fetchWithTimeout(url, { method: "POST" }, FETCH_TIMEOUT_MS);
      if (!response.ok) {
        failures += 1;
        const backoff = computeBackoffMs(failures, intervalMs);
        backoffUntil = Date.now() + backoff;
        console.warn(
          `[daily-report-cron] tick failed: HTTP ${response.status} (attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`
        );
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { ran?: string[]; errors?: string[] };
      if (body.errors?.length) {
        console.warn(`[daily-report-cron] errors: ${body.errors.join(", ")}`);
      }
      // Mark as sent even if some stores errored — we don't want to spam Telegram
      // with retries. Errors are visible in Render logs.
      globalScope[SENT_DATE_KEY] = dateStr;
      failures = 0;
      backoffUntil = 0;
      console.log(`[daily-report-cron] sent daily digest for ${dateStr} (ran: ${body.ran?.join(", ") ?? "none"})`);
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(
        `[daily-report-cron] trigger failed (attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`,
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
    `[daily-report-cron] scheduled check every ${Math.round(intervalMs / 60000)} minutes via ${url} (daily 07:50–09:00 ${ISRAEL_TZ})`
  );

  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
