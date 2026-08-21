-- GA4 daily traffic rows (store × day × default channel group).
-- Synced by lib/services/ga4-service.ts via the refresh-all cron.

CREATE TABLE "GaTrafficDaily" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "conversions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaTrafficDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GaTrafficDaily_storeId_date_channel_key"
    ON "GaTrafficDaily"("storeId", "date", "channel");

CREATE INDEX "GaTrafficDaily_storeId_date_idx"
    ON "GaTrafficDaily"("storeId", "date" DESC);

ALTER TABLE "GaTrafficDaily"
    ADD CONSTRAINT "GaTrafficDaily_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
