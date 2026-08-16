// In-process daily cron that fires the Meta Ads token expiry check at
// ~09:00 UTC. Polls every hour; the check itself is idempotent (upserts
// open alerts and resolves stale ones) so multiple runs are safe.
//
// Architecture mirrors daily-report-cron.ts:
//   • setInterval tick fires once per hour.
//   • When in the fire window, POSTs to /api/cron/meta-ads-token-check.
//   • Exponential backoff on failures.
//   • globalThis flag prevents double-firing within the same UTC day.
//
// Env knobs:
//   ENABLE_META_ADS_TOKEN_CHECK_CRON=1   → opt-in. Default OFF in dev, ON in production.
//   META_ADS_TOKEN_CHECK_CRON_DISABLED=1 → hard kill switch (overrides ENABLE_*)
//   META_ADS_TOKEN_CHECK_CRON_MS=<ms>    → override polling interval (default 60 min)
//   META_ADS_TOKEN_CHECK_CRON_URL=<url>  → override endpoint

import { isCronEnabled, fetchWithTimeout, computeBackoffMs, cronSecretHeaders } from "./cron-util";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour polling
const BOOT_DELAY_MS = 60_000; // 1 min after boot to let the server warm up
const FETCH_TIMEOUT_MS = 60_000; // 60s — check is fast (DB scan only)
const GLOBAL_KEY = "__metaAdsTokenCheckCronHandle__";
const SENT_DATE_KEY = "__metaAdsTokenCheckSentDate__"; // YYYY-MM-DD UTC

// Fire window: 09:00–11:00 UTC daily (covers timezone drift; avoids midnight spikes)
function isInDailyWindow(now = new Date()): boolean {
  const hour = now.getUTCHours();
  return hour >= 9 && hour < 11;
}

function getTodayUtcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function resolveCronUrl(): string {
  if (process.env.META_ADS_TOKEN_CHECK_CRON_URL) return process.env.META_ADS_TOKEN_CHECK_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/cron/meta-ads-token-check`;
}

export function startMetaAdsTokenCheckCron(): void {
  if (!isCronEnabled("META_ADS_TOKEN_CHECK")) {
    console.log(
      "[meta-ads-token-check-cron] DISABLED (set ENABLE_META_ADS_TOKEN_CHECK_CRON=1 to enable)"
    );
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
    [SENT_DATE_KEY]?: string;
  };
  if (globalScope[GLOBAL_KEY]) return; // already running

  const parsed = Number(process.env.META_ADS_TOKEN_CHECK_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();

  let running = false;
  let failures = 0;
  let backoffUntil = 0;

  const tick = async () => {
    if (running) return;
    if (Date.now() < backoffUntil) return;
    if (!isInDailyWindow()) return;

    const dateStr = getTodayUtcDate();
    if (globalScope[SENT_DATE_KEY] === dateStr) return; // already ran today

    running = true;
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...cronSecretHeaders()
          }
        },
        FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        failures += 1;
        const backoff = computeBackoffMs(failures, intervalMs);
        backoffUntil = Date.now() + backoff;
        console.warn(
          `[meta-ads-token-check-cron] tick failed: HTTP ${response.status} ` +
            `(attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`
        );
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        scanned?: number;
        issues?: unknown[];
        alertsUpserted?: number;
      };

      globalScope[SENT_DATE_KEY] = dateStr;
      failures = 0;
      backoffUntil = 0;
      console.log(
        `[meta-ads-token-check-cron] completed for ${dateStr}: ` +
          `scanned=${body.scanned ?? "?"} issues=${body.issues?.length ?? "?"} ` +
          `alertsUpserted=${body.alertsUpserted ?? "?"}`
      );
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(
        `[meta-ads-token-check-cron] trigger failed ` +
          `(attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`,
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
    `[meta-ads-token-check-cron] scheduled — polls every ${Math.round(intervalMs / 60000)} minute(s) ` +
      `via ${url} (fires daily 09:00–11:00 UTC)`
  );

  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
