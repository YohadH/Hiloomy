-- Per-location inventory levels (Shopify inventoryLevels) so a store can
-- follow one warehouse instead of the grand total. See schema.prisma.
CREATE TABLE "VariantInventoryLevel" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "shopifyLocationId" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VariantInventoryLevel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VariantInventoryLevel_storeId_shopifyVariantId_shopifyLocationId_key"
    ON "VariantInventoryLevel"("storeId", "shopifyVariantId", "shopifyLocationId");
CREATE INDEX "VariantInventoryLevel_storeId_shopifyLocationId_idx"
    ON "VariantInventoryLevel"("storeId", "shopifyLocationId");
