// In-process cron that pings /api/cron/decision-inbox once per day at
// 05:00 Asia/Jerusalem — after the 02:00 outcome measurement and the
// overnight data refresh, before the merchant's morning. Same shape as the
// other crons (cron-util reliability layer: timeout, backoff, enable gate —
// default OFF in dev, ON in prod).
//
// Env knobs:
//   ENABLE_DECISION_INBOX_CRON=1     → opt-in for development
//   DECISION_INBOX_CRON_DISABLED=1   → hard kill switch
//   DECISION_INBOX_CRON_MS=<ms>      → override polling interval
//   DECISION_INBOX_CRON_URL=<url>    → override the endpoint pinged

import { isCronEnabled, fetchWithTimeout, computeBackoffMs, cronSecretHeaders } from "./cron-util";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const BOOT_DELAY_MS = 90_000;
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;
const GLOBAL_KEY = "__decisionInboxCronHandle__";
const ISRAEL_TZ = "Asia/Jerusalem";

function resolveCronUrl(): string {
  if (process.env.DECISION_INBOX_CRON_URL) return process.env.DECISION_INBOX_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/cron/decision-inbox`;
}

function getIsraelHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ISRAEL_TZ, hour: "numeric", hour12: false }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

// 05:00–07:00 Israel window; polling every 10 minutes gives several chances
// inside it. The route is idempotent, so a repeat inside the window is safe;
// the per-day guard keeps the real work to once.
function isDueWindow(now = new Date()): boolean {
  const hour = getIsraelHour(now);
  return hour >= 5 && hour < 7;
}

function ymdKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ISRAEL_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function startDecisionInboxCron(): void {
  if (!isCronEnabled("DECISION_INBOX")) {
    console.log("[decision-inbox-cron] DISABLED (set ENABLE_DECISION_INBOX_CRON=1 to enable)");
    return;
  }
  const globalScope = globalThis as typeof globalThis & { [GLOBAL_KEY]?: NodeJS.Timeout };
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.DECISION_INBOX_CRON_MS);
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
    if (lastSuccessfulDay === today) return;

    running = true;
    try {
      const response = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json", ...cronSecretHeaders() } }, FETCH_TIMEOUT_MS);
      if (!response.ok) {
        failures += 1;
        const backoff = computeBackoffMs(failures, intervalMs);
        backoffUntil = Date.now() + backoff;
        console.warn(`[decision-inbox-cron] tick failed: HTTP ${response.status} (attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { stores?: number; results?: Array<{ decisions: number }> };
      const decisions = (body.results ?? []).reduce((sum, r) => sum + (r.decisions ?? 0), 0);
      console.log(`[decision-inbox-cron] daily pass complete · ${body.stores ?? 0} stores · ${decisions} decisions on Today`);
      failures = 0;
      backoffUntil = 0;
      lastSuccessfulDay = today;
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(`[decision-inbox-cron] trigger failed (attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`, error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };

  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  globalScope[GLOBAL_KEY] = handle;
  console.log(`[decision-inbox-cron] scheduled check every ${Math.round(intervalMs / 60000)} min via ${url} (daily 05:00 ${ISRAEL_TZ})`);
  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
