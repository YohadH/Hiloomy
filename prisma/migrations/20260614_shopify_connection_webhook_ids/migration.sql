-- SA-HIGH-01: store the Shopify webhook subscription IDs registered after the
-- OAuth callback (orders/create, orders/updated, orders/cancelled) so they can
-- be reconciled / deleted later, plus the timestamp they were registered at.
-- Idempotent so it is safe to apply on the already-schema-pushed live DB.
ALTER TABLE "ShopifyConnection"
  ADD COLUMN IF NOT EXISTS "webhookIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ShopifyConnection"
  ADD COLUMN IF NOT EXISTS "webhooksRegisteredAt" TIMESTAMP(3);
