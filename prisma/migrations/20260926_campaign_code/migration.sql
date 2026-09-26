-- Campaign-aware short links (ported from the Creators project, 2026-09-26).
-- Additive, idempotent.
ALTER TABLE "AttributionSession" ADD COLUMN IF NOT EXISTS "campaignCode" TEXT;
CREATE INDEX IF NOT EXISTS "AttributionSession_storeId_campaignCode_idx" ON "AttributionSession"("storeId", "campaignCode");
ALTER TABLE "AffiliateAttribution" ADD COLUMN IF NOT EXISTS "campaignCode" TEXT;
