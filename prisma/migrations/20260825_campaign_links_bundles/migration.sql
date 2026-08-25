-- Campaign↔product links (F-013/F-004) + bundle composition (F-036).
-- Authored WITH the schema change (lesson of F-043: schema edits without a
-- migration left production drifted and crashing). Idempotent — safe on a
-- dev DB already aligned via `prisma db push`.

CREATE TABLE IF NOT EXISTS "CampaignProductLink" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignProductLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignProductLink_storeId_campaignId_productId_key"
  ON "CampaignProductLink"("storeId", "campaignId", "productId");
CREATE INDEX IF NOT EXISTS "CampaignProductLink_storeId_productId_idx"
  ON "CampaignProductLink"("storeId", "productId");

CREATE TABLE IF NOT EXISTS "BundleComponent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bundleProductId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BundleComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BundleComponent_storeId_bundleProductId_componentProductId_key"
  ON "BundleComponent"("storeId", "bundleProductId", "componentProductId");
CREATE INDEX IF NOT EXISTS "BundleComponent_storeId_bundleProductId_idx"
  ON "BundleComponent"("storeId", "bundleProductId");

-- Foreign keys, guarded for idempotency (Postgres has no IF NOT EXISTS for
-- ADD CONSTRAINT).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CampaignProductLink_storeId_fkey') THEN
    ALTER TABLE "CampaignProductLink" ADD CONSTRAINT "CampaignProductLink_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CampaignProductLink_productId_fkey') THEN
    ALTER TABLE "CampaignProductLink" ADD CONSTRAINT "CampaignProductLink_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BundleComponent_storeId_fkey') THEN
    ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BundleComponent_bundleProductId_fkey') THEN
    ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_bundleProductId_fkey"
      FOREIGN KEY ("bundleProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BundleComponent_componentProductId_fkey') THEN
    ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_componentProductId_fkey"
      FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
