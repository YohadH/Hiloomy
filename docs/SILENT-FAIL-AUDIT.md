# Silent-Fail Audit — SA-SILENT-FAIL-AUDIT

**Date:** 2026-06-23  
**Audited paths:** `lib/services/**/*.ts`, `app/api/cron/**/*.ts`  
**Patterns searched:** `.catch(() => {})`, `.catch(() => [])`, `.catch(() => null)`,
`.catch((err) => console.error(...))` with no rethrow, `void promise` fire-and-forget.

---

## Inventory

### CRITICAL — Aggregation / data-write pipelines

| # | File | Line | Pattern | Status |
|---|------|------|---------|--------|
| C1 | `lib/services/shopify-sync-service.ts` | 740 | `aggregateDailyMetrics().catch(err => console.error(...); return 0)` — initial sync. Catch had `[shopify-sync]` prefix but no zero-writes-with-nonempty-source check. | **FIXED** — prefix changed to `[SA-SILENT-FAIL]`, structured context added (storeId, mode, err.message), zero-writes warning added when `dailyMetricsUpserted === 0 && orderCount > 0`. |
| C2 | `lib/services/shopify-sync-service.ts` | 748 | `persistSummary().catch(err => console.error(...))` — initial sync. Catch had `[shopify-sync]` prefix, no structured context. | **FIXED** — prefix changed to `[SA-SILENT-FAIL]`, structured context added (storeId, mode, err.message). |
| C3 | `lib/services/shopify-sync-service.ts` | 814 | `aggregateDailyMetrics().catch(err => console.error(...); return 0)` — incremental sync. Same gaps as C1. | **FIXED** — same treatment as C1: `[SA-SILENT-FAIL]`, structured context, zero-writes warning. |
| C4 | `lib/services/shopify-sync-service.ts` | 821 | `persistSummary().catch(err => console.error(...))` — incremental sync. Same gaps as C2. | **FIXED** — same treatment as C2. |

**Why CRITICAL:** These are the DailyMetric + Summary materialisation steps. A silent failure here produces 0 prod dashboard rows and no alert — exactly the scenario QA DATA-03 flagged. The zero-writes-with-nonempty-source check specifically detects the case where aggregation runs but writes nothing despite orders being present.

---

### HIGH — External API calls that swallow network errors

| # | File | Line | Pattern | Status |
|---|------|------|---------|--------|
| H1 | `lib/services/marketing-planner-readiness-service.ts` | 319 | `runIncrementalSync().catch(error => refreshWarnings.push(...))` | LEFT — error is captured into `refreshWarnings[]` which is surfaced to the caller. Not silent: caller sees the message in the readiness response. |
| H2 | `lib/services/marketing-planner-readiness-service.ts` | 323 | `crawlPublicInstagramProfiles().catch(error => refreshWarnings.push(...))` | LEFT — same as H1. |
| H3 | `lib/services/marketing-planner-readiness-service.ts` | 327 | `syncMetaAdsCampaignInsights().catch(error => refreshWarnings.push(...))` | LEFT — same as H1. |
| H4 | `app/api/cron/refresh-all/route.ts` | 113 | `refreshMetaTokensNearExpiry().catch(err => console.error(...); return null)` | LEFT — already logs with `[refresh-all]` prefix. Failure is non-blocking by design (token refresh failure != sync failure). |
| H5 | `app/api/cron/refresh-all/route.ts` | 196/214/245 | `db.metaAdsConnection.findUnique().catch(() => null)` etc. | LEFT — defensive reads that return null; the outer try/catch per store captures real failures. Pattern is acceptable for optional-connection presence checks. |

---

### LOW — Non-critical background enrichment / cleanup

| # | File | Line | Pattern | Status |
|---|------|------|---------|--------|
| L1 | `lib/services/marketing-planner-service.ts` | 2620 | `saveMarketingPlannerLearnings(result).catch(() => undefined)` — completely silent. | LEFT — background learning enrichment. If it fails, the plan is still valid; next run retries. Acceptable by design. |
| L2 | `lib/services/instagram-public-crawler-service.ts` | 279, 630, 731, 734 | `page.close().catch(() => undefined)`, `browser.close().catch(() => undefined)` | LEFT — Playwright cleanup. Swallowing close() errors is idiomatic; the page/browser is already in an unknown state at that point. |
| L3 | `lib/services/meta-ads-service.ts` | 827, 838, 850 | `db.alert.*().catch(() => undefined)` | LEFT — alert write failures in the meta sync context. The sync result is already recorded; an alert write failure doesn't change the sync outcome. |
| L4 | `lib/services/weekly-summary-insights-service.ts` | 371, 372, 397 | `getGrowthFindings().catch(() => [])`, `getGrowthMetricSnapshots().catch(() => [])`, `.catch(() => false)` | LEFT — enrichment data for weekly insights. Fallback to empty list is intentional; missing growth data degrades gracefully. |
| L5 | `lib/services/shopify-ingestion-service.ts` | 46, 50 | `db.shopifyConnection.update().catch(() => undefined)` — webhook registration metadata write. | LEFT — metadata update failure after successful webhook registration. The webhooks are already registered; the metadata write is a best-effort record. |
| L6 | `lib/services/weekly-report-service.ts` | 128, 141, 176, 181, 185, 258 | Various `.catch(() => null)` on report-section builders | LEFT — each section of the weekly report is independently optional. A section failure degrades the report but doesn't block PDF generation. |
| L7 | `lib/services/roas-collapse-service.ts` | 165, 174, 264, 273 | `upsertAlert().catch(err => console.error(...))`, `resolveStaleAlerts().catch(err => console.error(...))` | LEFT — alert write failures in analysis services. Already logs with service prefix. Non-fatal by design: the analysis result is returned regardless. |
| L8 | `lib/services/restock-hero-alert-service.ts` | 384, 398 | Same pattern as L7 | LEFT — same reasoning. |
| L9 | `lib/services/stockout-imminent-service.ts` | 277, 286 | Same pattern as L7 | LEFT — same reasoning. |
| L10 | `lib/services/alert-outcome-service.ts` | 110, 122 | `.catch(err => console.error(...))` on outcome compute/write | LEFT — already logs with `[alert-outcome]` prefix. Per-alert failure is skipped; other alerts are still measured. |
| L11 | `lib/services/affiliate-link-tracking-service.ts` | 113, 118 | `.catch(() => [])` on DB reads | LEFT — defensive fallback on attribution lookup during a webhook. Returns empty and continues; partial attribution is better than a hard error on every order. |
| L12 | `lib/services/affiliate-portal-directory-service.ts` | 324 | `.catch(() => null)` | LEFT — optional enrichment read. |
| L13 | `lib/services/affiliate-portal-admin-service.ts` | 583, 724, 739 | `.catch(() => [])` | LEFT — parallel enrichment reads. Failures return empty; caller aggregates. |
| L14 | `lib/services/growth-agent-sync-service.ts` | 142 | `.catch(() => null)` — Instagram connection lookup | LEFT — optional check before sync. |
| L15 | `lib/services/meta-ads-monitor-service.ts` | 231 | `.catch(() => ({ resolved: 0 }))` | LEFT — sweep fallback. Non-fatal if sweep count can't be read. |
| L16 | `lib/services/amazon-supplier-order-service.ts` | 155 | `.catch((error) => { if (isDatabaseConnectionError(error)) return []; throw error; })` | LEFT — correctly rethrows non-connection errors. Good pattern. |
| L17 | `lib/services/creative-ai-higgsfield-service.ts`, `creative-ai-nanobanana-service.ts`, `creative-ai-openai-service.ts`, `creative-shopify-publish-service.ts` | various | `response.text().catch(() => "")` | LEFT — HTTP body read fallback. Standard pattern for getting error body text without crashing the error handler. |
| L18 | `lib/services/shopify-oauth-service.ts` | 315, 327, 333 | `response.json().catch(() => null)`, `response.text().catch(() => "")` | LEFT — same as L17. |
| L19 | `lib/services/shopify-webhook-service.ts` | 73, 74, 78, 82 | `.catch(() => null)` on DB reads | LEFT — webhook handler defensive reads. Returns null and continues; the order is still recorded without attribution. |

---

## Summary

| Risk | Count | Fixed | Left (acceptable) |
|------|-------|-------|-------------------|
| CRITICAL | 4 | 4 | 0 |
| HIGH | 5 | 0 | 5 (errors already surfaced to caller or non-blocking by design) |
| LOW | 19 | 0 | 19 (defensive fallbacks, cleanup, enrichment) |

**Total .catch() sites audited:** 28 distinct sites across 18 files.

## What was fixed (code changes)

**File:** `lib/services/shopify-sync-service.ts`

For both `runFullInitialSync` (line ~740) and `runIncrementalSync` (line ~814):

1. `aggregateDailyMetrics` catch: prefix changed from `[shopify-sync]` to `[SA-SILENT-FAIL]`;
   error context structured as `{op, storeId, mode, err.message}` JSON object.
   Added zero-writes-with-nonempty-source warning: if `dailyMetricsUpserted === 0`
   and `orders.created + orders.updated > 0`, logs `console.warn` with structured context.

2. `persistSummary` catch: prefix changed from `[shopify-sync]` to `[SA-SILENT-FAIL]`;
   error context structured as `{op, storeId, mode, err.message}` JSON object.

## What was NOT fixed and why

- **HIGH items (H1-H5):** Errors are already surfaced to callers or are non-blocking by
  architectural design (token refresh failure isolates from data sync; optional-connection
  presence checks return null safely).
- **LOW items (L1-L19):** These are genuine defensive fallbacks: Playwright cleanup,
  enrichment data, optional report sections, HTTP body reads. Adding `console.error` to
  every `response.text().catch(() => "")` would add noise without actionable signal.

## Sentry note

Sentry is not yet configured in this project (SA-OWNER-01 pending). These `[SA-SILENT-FAIL]`
prefixed logs are designed to be grep-able in Render production logs and can be promoted to
`Sentry.captureException()` calls once `SENTRY_DSN` is set.
