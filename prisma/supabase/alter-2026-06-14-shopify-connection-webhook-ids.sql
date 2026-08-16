-- SA-HIGH-01: ShopifyConnection now records the webhook subscription IDs that
-- were registered with Shopify after the OAuth callback (orders/create,
-- orders/updated, orders/cancelled), plus when they were registered. Apply on
-- the live DB. Idempotent; safe to re-run.

ALTER TABLE "ShopifyConnection"
  ADD COLUMN IF NOT EXISTS "webhookIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ShopifyConnection"
  ADD COLUMN IF NOT EXISTS "webhooksRegisteredAt" TIMESTAMP(3);
