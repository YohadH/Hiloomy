// In-process cron that pings /api/cron/measure-outcomes once per day at
// 02:00 Asia/Jerusalem (off-hours, no contention with the 09:00 weekly
// report cron). Same shape as the existing crons (shopify-sync, weekly-
// report, creative-job) so it shares the cron-util reliability layer:
// AbortController timeout, exponential backoff on failure, opt-in enable
// gate (default OFF in dev, ON in prod).
//
// Env knobs:
//   ENABLE_OUTCOME_MEASUREMENT_CRON=1     → opt-in for development
//   OUTCOME_MEASUREMENT_CRON_DISABLED=1   → hard kill switch
//   OUTCOME_MEASUREMENT_CRON_MS=<ms>      → override polling interval
//   OUTCOME_MEASUREMENT_CRON_URL=<url>    → override the endpoint pinged

import { isCronEnabled, fetchWithTimeout, computeBackoffMs, cronSecretHeaders } from "./cron-util";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // poll every 10 minutes
const BOOT_DELAY_MS = 60_000; // wait 1 minute after boot before first tick
const FETCH_TIMEOUT_MS = 5 * 60 * 1000; // measurement can iterate many stores
const GLOBAL_KEY = "__outcomeMeasurementCronHandle__";
const ISRAEL_TZ = "Asia/Jerusalem";

function resolveCronUrl(): string {
  if (process.env.OUTCOME_MEASUREMENT_CRON_URL) return process.env.OUTCOME_MEASUREMENT_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/cron/measure-outcomes`;
}

function getIsraelHour(now = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    hour: "numeric",
    hour12: false
  });
  const parts = fmt.formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

// 02:00-04:00 Israel window. Polling every 10 minutes gives us multiple
// chances inside this window to catch the schedule even if a tick fails.
// The route is idempotent (skips already-measured), so multiple fires are
// safe; we use a per-day guard to keep the actual work to once.
function isDueWindow(now = new Date()): boolean {
  const hour = getIsraelHour(now);
  return hour >= 2 && hour < 4;
}

function ymdKey(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(date); // "YYYY-MM-DD" in Israel TZ
}

export function startOutcomeMeasurementCron(): void {
  if (!isCronEnabled("OUTCOME_MEASUREMENT")) {
    console.log(
      "[outcome-measurement-cron] DISABLED (set ENABLE_OUTCOME_MEASUREMENT_CRON=1 to enable)"
    );
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
  };
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.OUTCOME_MEASUREMENT_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();

  let running = false;
  let failures = 0;
  let backoffUntil = 0;
  let lastSuccessfulDay: string | null = null;

  const tick = async () => {
    if (running) return;
    if (Date.now() < backoffUntil) return;
    if (!isDueWindow()) return;
    const today = ymdKey(new Date());
    if (lastSuccessfulDay === today) return; // already ran today

    running = true;
    try {
      const response = await fetchWithTimeout(
        url,
        { method: "POST", headers: { "Content-Type": "application/json", ...cronSecretHeaders() } },
        FETCH_TIMEOUT_MS
      );
      if (!response.ok) {
        failures += 1;
        const backoff = computeBackoffMs(failures, intervalMs);
        backoffUntil = Date.now() + backoff;
        console.warn(
          `[outcome-measurement-cron] tick failed: HTTP ${response.status} (attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`
        );
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        stores?: number;
        results?: Array<{ measured: number; skipped: number }>;
      };
      const totalMeasured = (body.results ?? []).reduce((sum, r) => sum + (r.measured ?? 0), 0);
      console.log(
        `[outcome-measurement-cron] daily pass complete · ${body.stores ?? 0} stores · ${totalMeasured} outcomes measured`
      );
      failures = 0;
      backoffUntil = 0;
      lastSuccessfulDay = today;
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(
        `[outcome-measurement-cron] trigger failed (attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`,
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
    `[outcome-measurement-cron] scheduled check every ${Math.round(intervalMs / 60000)} min via ${url} (daily 02:00 ${ISRAEL_TZ})`
  );

  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
