-- SA-CRIT-06: capture the clicked product on affiliate redirect sessions so
-- affiliate funnel/conversion metrics can break down by product.
-- Idempotent so it is safe to apply on the already-schema-pushed live DB.
ALTER TABLE "AttributionSession"
  ADD COLUMN IF NOT EXISTS "productId" TEXT;
