-- Adds four missing indexes flagged in the 2026-07 product strategy review.
-- All CONCURRENTLY-safe if you want; keeping plain for editor simplicity.
-- Idempotent (IF NOT EXISTS) so re-running is safe.
--
-- Query shapes each index covers:
--
--   Order.orderNumber
--     WHERE storeId = $1 AND orderNumber IN (...)
--     — affiliate-conversion-import + affiliate-attribution-reconciler,
--       every BixGrow re-delivery of an existing order.
--
--   AffiliateAttribution.couponCode
--     WHERE storeId = $1 AND couponCode = $2
--     — coupon ownership lookup + Gantt customer-service PDF export.
--
--   WebhookEvent.(platform, externalId)
--     WHERE storeId = $1 AND platform = $2 AND externalId IN (...)
--     — webhook dedup on ingestion. Without this the dedup does a
--       sequential scan of every webhook event for the store.
--
--   SprintAd.metaAdId
--     WHERE metaAdId = $1
--     — Meta reconciler + sprint cascade evaluator linking Meta insights
--       back to the sprint slot that produced each ad.

CREATE INDEX IF NOT EXISTS "Order_storeId_orderNumber_idx"
  ON "Order"("storeId", "orderNumber");

CREATE INDEX IF NOT EXISTS "AffiliateAttribution_storeId_couponCode_idx"
  ON "AffiliateAttribution"("storeId", "couponCode");

CREATE INDEX IF NOT EXISTS "WebhookEvent_storeId_platform_externalId_idx"
  ON "WebhookEvent"("storeId", "platform", "externalId");

CREATE INDEX IF NOT EXISTS "SprintAd_metaAdId_idx"
  ON "SprintAd"("metaAdId");
