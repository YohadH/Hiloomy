-- Inventory movement by location (see schema.prisma):
--  * Order.shopifyLocationId / locationName — where a POS order was taken or
--    an online order was fulfilled from, so units sold count per location.
--  * InventoryLevelSnapshot — daily per-variant per-location levels, the
--    history Shopify does not expose. Series starts when this is applied.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyLocationId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "locationName" TEXT;
CREATE INDEX IF NOT EXISTS "Order_storeId_shopifyLocationId_idx" ON "Order"("storeId", "shopifyLocationId");

CREATE TABLE IF NOT EXISTS "InventoryLevelSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "shopifyLocationId" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryLevelSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryLevelSnapshot_storeId_date_shopifyVariantId_shopifyLocationId_key"
    ON "InventoryLevelSnapshot"("storeId", "date", "shopifyVariantId", "shopifyLocationId");
CREATE INDEX IF NOT EXISTS "InventoryLevelSnapshot_storeId_date_idx" ON "InventoryLevelSnapshot"("storeId", "date");
CREATE INDEX IF NOT EXISTS "InventoryLevelSnapshot_storeId_shopifyVariantId_idx" ON "InventoryLevelSnapshot"("storeId", "shopifyVariantId");
