-- Add external order number + coupon code to AffiliateAttribution so the
-- conversions page can show what BixGrow sent us even when the matching
-- Shopify Order hasn't synced yet.

ALTER TABLE "AffiliateAttribution"
  ADD COLUMN IF NOT EXISTS "externalOrderNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
