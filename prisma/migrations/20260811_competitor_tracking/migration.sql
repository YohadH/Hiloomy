-- Competitor tracking for the weekly report's "what did competitors do this
-- week" section (RivalSweeper Feed A / mock provider). Competitor = the
-- store's tracked comp set (max 5 active, service-enforced);
-- CompetitorSnapshot = one promo/pricing row per competitor per day, upserted
-- by the refresh-all cron.
-- Idempotent so it is safe to apply on the already-schema-pushed live DB.

CREATE TABLE IF NOT EXISTS "Competitor" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "igHandle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Competitor_storeId_domain_key"
    ON "Competitor"("storeId", "domain");
CREATE INDEX IF NOT EXISTS "Competitor_storeId_status_idx"
    ON "Competitor"("storeId", "status");

DO $$ BEGIN
    ALTER TABLE "Competitor"
        ADD CONSTRAINT "Competitor_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "Store"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CompetitorSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "activePromoCount" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountPct" DECIMAL(5,2),
    "freeShippingThreshold" DECIMAL(12,2),
    "homepageMessage" TEXT,
    "signalsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorSnapshot_storeId_competitorId_snapshotDate_key"
    ON "CompetitorSnapshot"("storeId", "competitorId", "snapshotDate");
CREATE INDEX IF NOT EXISTS "CompetitorSnapshot_storeId_snapshotDate_idx"
    ON "CompetitorSnapshot"("storeId", "snapshotDate" DESC);

DO $$ BEGIN
    ALTER TABLE "CompetitorSnapshot"
        ADD CONSTRAINT "CompetitorSnapshot_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "Store"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "CompetitorSnapshot"
        ADD CONSTRAINT "CompetitorSnapshot_competitorId_fkey"
        FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
