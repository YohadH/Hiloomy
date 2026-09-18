-- Inventory movement by location (see schema.prisma):
--  * Order.shopifyLocationId / locationName / locationSource — where a POS
--    order was taken ("pos") or an online order was fulfilled from
--    ("fulfillment"), so units sold count per location without calling a
--    fulfilled online order a store sale.
--  * InventoryLevelSnapshot — daily per-variant per-location levels, the
--    history Shopify does not expose. Series starts when this is applied.
--  * InventoryMovementEvent — movements with a known cause: Shopify transfer
--    legs, Hiloomy PO receipts, adjustments with a source. Exact vs derived.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopifyLocationId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "locationName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "locationSource" TEXT;
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

CREATE TABLE IF NOT EXISTS "InventoryMovementEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "locationId" TEXT NOT NULL,
    "locationName" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "precision" TEXT NOT NULL DEFAULT 'exact',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovementEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovementEvent_storeId_sourceType_sourceId_key" ON "InventoryMovementEvent"("storeId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "InventoryMovementEvent_storeId_occurredAt_idx" ON "InventoryMovementEvent"("storeId", "occurredAt");
CREATE INDEX IF NOT EXISTS "InventoryMovementEvent_storeId_shopifyVariantId_occurredAt_idx" ON "InventoryMovementEvent"("storeId", "shopifyVariantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "InventoryMovementEvent_storeId_locationId_occurredAt_idx" ON "InventoryMovementEvent"("storeId", "locationId", "occurredAt");
