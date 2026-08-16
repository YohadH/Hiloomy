import { isCronEnabled, fetchWithTimeout, computeBackoffMs } from "./cron-util";

const DEFAULT_INTERVAL_MS = 5_000; // 5s — frequent so the UI doesn't lag perceptibly
const BOOT_DELAY_MS = 8_000;
const FETCH_TIMEOUT_MS = 30_000; // worker route should answer quickly
const GLOBAL_KEY = "__creativeJobCronHandle__";

function resolveCronUrl() {
  if (process.env.CREATIVE_JOB_CRON_URL) return process.env.CREATIVE_JOB_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/creative/jobs/worker`;
}

/**
 * In-process tick that POSTs to the creative worker route every few seconds.
 * Same shape as `startShopifySyncCron` so the operational model stays
 * uniform. Skips if a previous tick is still in flight.
 *
 * Env knobs:
 *   - ENABLE_CREATIVE_JOB_CRON=1     → opt-in. Default OFF in development,
 *                                      ON in production. Set to start locally.
 *   - CREATIVE_JOB_CRON_DISABLED=1   → hard kill switch (overrides ENABLE_*)
 *   - CREATIVE_JOB_CRON_MS=<ms>      → override interval (default 5s)
 *   - CREATIVE_JOB_CRON_URL=<url>    → override the endpoint it pings
 *   - CREATIVE_WORKER_SECRET=<str>   → header value sent to the worker
 */
export function startCreativeJobCron() {
  if (!isCronEnabled("CREATIVE_JOB")) {
    console.log("[creative-job-cron] DISABLED (set ENABLE_CREATIVE_JOB_CRON=1 to enable)");
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
  };
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.CREATIVE_JOB_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();
  const secret = process.env.CREATIVE_WORKER_SECRET?.trim();

  let running = false;
  let failures = 0; // consecutive failures, drives backoff
  let backoffUntil = 0; // epoch ms; skip ticks before this
  const tick = async () => {
    if (running) return;
    if (Date.now() < backoffUntil) return;
    running = true;
    try {
      const headers: Record<string, string> = {};
      if (secret) headers["x-creative-worker-secret"] = secret;
      const response = await fetchWithTimeout(url, { method: "POST", headers }, FETCH_TIMEOUT_MS);
      if (!response.ok) {
        // HTTP error is a "soft" failure: count it for backoff so a broken
        // route doesn't get hammered every 5s, but don't spam a stack trace.
        failures += 1;
        const backoff = computeBackoffMs(failures, intervalMs);
        backoffUntil = Date.now() + backoff;
        console.warn(
          `[creative-job-cron] tick failed: HTTP ${response.status} (attempt ${failures}, backing off ${Math.round(
            backoff / 1000
          )}s)`
        );
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { ranJob?: boolean; jobId?: string };
      if (body.ranJob) {
        console.log(`[creative-job-cron] ran job ${body.jobId ?? "?"}`);
      }
      failures = 0;
      backoffUntil = 0;
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(
        `[creative-job-cron] trigger failed (attempt ${failures}, backing off ${Math.round(
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
    `[creative-job-cron] scheduled creative worker every ${Math.round(intervalMs / 1000)}s via ${url}`
  );

  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
