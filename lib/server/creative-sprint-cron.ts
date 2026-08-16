// In-process cron that fires cascade evaluations for live sprints.
//
// Approach: poll every 10 minutes. On each tick, POST to
// /api/creative-sprint/cron/evaluate-due. That endpoint queries:
//
//   for every sprint with status in ("running", "measuring"):
//     for every cascade stage that:
//       - hasn't been evaluated yet (sprint.currentStage < stage)
//       - is due now (publishedAt + hoursAfterLaunch hours <= NOW())
//     → run evaluateCascadeStage(sprintId, stage)
//
// Why 10min interval: cascade stages are at +6h / +24h / +72h. A 10min
// resolution means stages fire within ~5min of their target time, which
// is plenty accurate. Tighter polling would just burn CPU.
//
// Env knobs (same pattern as the other crons):
//   ENABLE_CREATIVE_SPRINT_CRON=1
//   CREATIVE_SPRINT_CRON_DISABLED=1  → hard kill switch
//   CREATIVE_SPRINT_CRON_MS=<ms>
//   CREATIVE_SPRINT_CRON_URL=<url>

import { isCronEnabled, fetchWithTimeout, computeBackoffMs, cronSecretHeaders } from "./cron-util";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const BOOT_DELAY_MS = 60_000; // stagger after other crons
const FETCH_TIMEOUT_MS = 3 * 60 * 1000;
const GLOBAL_KEY = "__creativeSprintCronHandle__";

function resolveCronUrl(): string {
  if (process.env.CREATIVE_SPRINT_CRON_URL) return process.env.CREATIVE_SPRINT_CRON_URL;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/creative-sprint/cron/evaluate-due`;
}

export function startCreativeSprintCron(): void {
  if (!isCronEnabled("CREATIVE_SPRINT")) {
    console.log("[creative-sprint-cron] DISABLED (set ENABLE_CREATIVE_SPRINT_CRON=1 to enable)");
    return;
  }
  const globalScope = globalThis as typeof globalThis & { [GLOBAL_KEY]?: NodeJS.Timeout };
  if (globalScope[GLOBAL_KEY]) return;

  const parsed = Number(process.env.CREATIVE_SPRINT_CRON_MS);
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
      const response = await fetchWithTimeout(
        url,
        { method: "POST", headers: cronSecretHeaders() },
        FETCH_TIMEOUT_MS
      );
      if (!response.ok) {
        failures += 1;
        const backoff = computeBackoffMs(failures, intervalMs);
        backoffUntil = Date.now() + backoff;
        console.warn(
          `[creative-sprint-cron] tick failed: HTTP ${response.status} (attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`
        );
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { evaluated?: Array<{ sprintId: string; stage: number; killed: number; kept: number; alive: number }> };
      failures = 0;
      backoffUntil = 0;
      if (body.evaluated?.length) {
        for (const ev of body.evaluated) {
          console.log(
            `[creative-sprint-cron] sprint=${ev.sprintId} stage=${ev.stage} killed=${ev.killed} kept=${ev.kept} alive=${ev.alive}`
          );
        }
      }
    } catch (error) {
      failures += 1;
      const backoff = computeBackoffMs(failures, intervalMs);
      backoffUntil = Date.now() + backoff;
      console.error(
        `[creative-sprint-cron] trigger failed (attempt ${failures}, backing off ${Math.round(backoff / 1000)}s)`,
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
    `[creative-sprint-cron] scheduled cascade evaluator every ${Math.round(intervalMs / 60000)} minutes via ${url}`
  );

  setTimeout(tick, BOOT_DELAY_MS).unref?.();
}
