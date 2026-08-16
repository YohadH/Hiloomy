/**
 * Next.js calls register() once when the server process starts. We use it to
 * launch the background crons. Guarded to the Node.js runtime so it never tries
 * to run on the Edge runtime or during the build.
 *
 * Each start* function self-gates on its enable flag (see lib/server/cron-util
 * isCronEnabled): crons are OFF by default in development and must be turned on
 * with ENABLE_SHOPIFY_SYNC_CRON / ENABLE_CREATIVE_JOB_CRON /
 * ENABLE_WEEKLY_REPORT_CRON / ENABLE_OUTCOME_MEASUREMENT_CRON. In production
 * they default ON. They each apply an AbortController fetch timeout and
 * exponential backoff on failure so a flaky tick can't tight-loop or crash
 * the process.
 */
export async function register() {
  // Sentry — must be initialized per-runtime via dedicated configs.
  // Picking the right one based on NEXT_RUNTIME avoids the "edge runtime
  // doesn't support node module X" errors that come from importing the
  // wrong config.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Fail fast at boot if critical secrets are missing, so a misconfigured
  // deploy dies loudly here instead of silently 500-ing on the first
  // Supabase Auth / credential-decryption request. See lib/server/startup-check.
  const { assertRequiredEnv, warnOptionalEnv } = await import("@/lib/server/startup-check");
  assertRequiredEnv();
  // Non-fatal: warn (don't throw) when optional integration secrets like
  // RESEND_API_KEY are absent, so the weekly-report cron's email delivery
  // degrading to a no-op is visible at boot instead of failing silently.
  warnOptionalEnv();

  // Unified 2-hour multi-source refresh (Shopify + Meta + Instagram + BixGrow).
  // Supersedes the old Shopify-only cron; the back-compat enable flag in
  // data-refresh-cron.ts means existing .env files keep working.
  const { startDataRefreshCron } = await import("@/lib/server/data-refresh-cron");
  startDataRefreshCron();
  const { startCreativeJobCron } = await import("@/lib/server/creative-job-cron");
  startCreativeJobCron();
  const { startWeeklyReportCron } = await import("@/lib/server/weekly-report-cron");
  startWeeklyReportCron();
  const { startOutcomeMeasurementCron } = await import("@/lib/server/outcome-measurement-cron");
  startOutcomeMeasurementCron();
  const { startDailyReportCron } = await import("@/lib/server/daily-report-cron");
  startDailyReportCron();
  const { startMetaAdsTokenCheckCron } = await import("@/lib/server/meta-ads-token-check-cron");
  startMetaAdsTokenCheckCron();
  const { startCreativeSprintCron } = await import("@/lib/server/creative-sprint-cron");
  startCreativeSprintCron();
}
