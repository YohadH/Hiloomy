// Unified data-refresh cron — replaces the old Shopify-only sync cron.
//
// Every 2 hours (default) it pings /api/cron/refresh-all which fans out
// per-store sync to ALL connected sources in parallel:
//
//   - Shopify (orders, products, customers, refunds)
//   - Meta Ads (campaign insights, ad creative)
//   - Instagram (creator posts, engagement)
//   - BixGrow (placeholder; CSV upload path stays preferred)
//
// Architecturally identical to the prior shopify-sync-cron: a Node.js
// setInterval started from instrumentation.ts on server boot, isolated
// per-source so a Meta failure doesn't block Shopify or Instagram.
//
// Env knobs:
//   ENABLE_DATA_REFRESH_CRON=1     opt-in. Default OFF in dev, ON in prod.
//   DATA_REFRESH_CRON_DISABLED=1   hard kill switch (wins over ENABLE_*).
//   DATA_REFRESH_CRON_MS=<ms>      override interval (default 2h).
//   DATA_REFRESH_CRON_URL=<url>    override the ping endpoint.
//
// Backwards compat: if the legacy ENABLE_SHOPIFY_SYNC_CRON is set and the
// new flag isn't, we treat it as enabling this cron too. This way existing
// .env files don't silently turn off all syncing during the rename.

import { isCronEnabled, fetchWithTimeout, computeBackoffMs, cronSecretHeaders } from "./cron-util";

const DEFAULT_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const BOOT_DELAY_MS = 30_000; // first run 30s after server boots — long enough
//                              for the app to be ready, short enough that data
//                              is fresh by the time the founder opens the page
const FETCH_TIMEOUT_MS = 10 * 60 * 1000; // 10 min — multi-source fan-out is slower
const GLOBAL_KEY = "__dataRefreshCronHandle__";

function resolveCronUrl(): string {
  if (process.env.DATA_REFRESH_CRON_URL) return process.env.DATA_REFRESH_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/cron/refresh-all`;
}

function isEnabled(): boolean {
  // Primary new flag
  if (isCronEnabled("DATA_REFRESH")) return true;
  // Back-compat: legacy SHOPIFY_SYNC flag still turns this on, since this
  // cron supersedes the old one functionally.
  if (
    process.env.ENABLE_SHOPIFY_SYNC_CRON === "1" ||
    String(process.env.ENABLE_SHOPIFY_SYNC_CRON ?? "").toLowerCase() === "true"
  ) {
    return true;
  }
  return false;
}

export function startDataRefreshCron(): void {
  if (!isEnabled()) {
    console.log(
      "[data-refresh-cron] DISABLED (set ENABLE_DATA_REFRESH_CRON=1 to enable)"
    );
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: NodeJS.Timeout;
  };
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.DATA_REFRESH_CRON_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  const url = resolveCronUrl();

  let running = false;
  let failures = 0;
  let backoffUntil = 0;

  const tick = async () => {
    if (running) return;
    if (Date.now() < backoffUntil) return;
    running = true;
    try {
      const response = await fetchWithTimeout(url, { method: "POST", headers: cronSecretHeaders() }, FETCH_TIMEOUT_MS);
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        stores?: number;
        summary?: { allOk?: number; withFailures?: number };
        message?: string;
      };
      if (body.stores === 0) {
        console.log("[data-refresh-cron] tick: no connected stores");
      } else if (response.ok && body.ok) {
        console.log(
          `[data-refresh-cron] tick: ${body.summary?.allOk ?? 0}/${body.stores} stores synced clean`
        );
      } else {
        const failed = body.summary?.withFailures ?? "?";
        const total = body.stores ?? "?";
        console.warn(
          `[data-refresh-cron] tick had partial failures: ${failed}/${total} stores hit at least one source error`
        );
      }
      failures = 0;
      backoffUntil = 0;
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(
        `[data-refresh-cron] trigger failed (attempt ${failures}, backing off ${Math.round(
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
    `[data-refresh-cron] scheduled multi-source refresh every ${Math.round(
      intervalMs / 60000
    )} min via ${url}`
  );

  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
