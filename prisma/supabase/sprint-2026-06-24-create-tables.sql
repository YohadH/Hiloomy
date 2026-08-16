-- Creative Sprint — create CreativeSprint + SprintAd tables.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Equivalent to `npx prisma db push` for just these two tables. Safe to
-- re-run: every statement is wrapped in IF NOT EXISTS guards.
--
-- After running this:
--   1. Open Supabase Dashboard → Table editor → confirm "CreativeSprint"
--      and "SprintAd" exist
--   2. Restart your Render service so the new Prisma client (generated
--      at build time) picks up the new tables — actually you don't need
--      a restart if you redeploy after `npx prisma generate` ran, which
--      it does on every Render build.

-- ── CreativeSprint ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CreativeSprint" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT,
    "targetCount" INTEGER NOT NULL DEFAULT 100,
    "dailyBudgetPerAd" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "approvalMode" TEXT NOT NULL DEFAULT 'review_both',
    "cascadeJson" JSONB NOT NULL,
    "currentStage" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metaCampaignId" TEXT,
    "targetingJson" JSONB,
    "estimatedHiggsfieldUsd" DECIMAL(10,4),
    "actualHiggsfieldUsd" DECIMAL(10,4),
    "estimatedAdSpend" DECIMAL(12,2),
    "actualAdSpend" DECIMAL(12,2),
    "notes" TEXT,
    "errorMessage" TEXT,
    "briefsGeneratedAt" TIMESTAMP(3),
    "briefsApprovedAt" TIMESTAMP(3),
    "assetsGeneratedAt" TIMESTAMP(3),
    "assetsApprovedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeSprint_pkey" PRIMARY KEY ("id")
);

-- ── SprintAd ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SprintAd" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "briefJson" JSONB NOT NULL,
    "briefApprovedAt" TIMESTAMP(3),
    "briefRejectedAt" TIMESTAMP(3),
    "higgsfieldJobId" TEXT,
    "higgsfieldAssetUrl" TEXT,
    "assetStorageKey" TEXT,
    "assetMimeType" TEXT,
    "assetWidth" INTEGER,
    "assetHeight" INTEGER,
    "assetDurationMs" INTEGER,
    "assetApprovedAt" TIMESTAMP(3),
    "assetRejectedAt" TIMESTAMP(3),
    "higgsfieldCostUsd" DECIMAL(10,4),
    "metaAdsetId" TEXT,
    "metaCreativeId" TEXT,
    "metaAdId" TEXT,
    "decisionsJson" JSONB NOT NULL DEFAULT '[]',
    "finalStatus" TEXT NOT NULL DEFAULT 'alive',
    "killedReason" TEXT,
    "killedAt" TIMESTAMP(3),
    "lastImpressions" INTEGER NOT NULL DEFAULT 0,
    "lastClicks" INTEGER NOT NULL DEFAULT 0,
    "lastSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lastPurchases" INTEGER NOT NULL DEFAULT 0,
    "lastPurchaseValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lastCtr" DECIMAL(8,6),
    "lastCpc" DECIMAL(12,2),
    "lastCpa" DECIMAL(12,2),
    "lastRoas" DECIMAL(8,4),
    "lastSyncedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SprintAd_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "CreativeSprint_storeId_status_idx" ON "CreativeSprint"("storeId", "status");
CREATE INDEX IF NOT EXISTS "CreativeSprint_storeId_createdAt_idx" ON "CreativeSprint"("storeId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CreativeSprint_status_idx" ON "CreativeSprint"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "SprintAd_sprintId_slotIndex_key" ON "SprintAd"("sprintId", "slotIndex");
CREATE INDEX IF NOT EXISTS "SprintAd_sprintId_status_idx" ON "SprintAd"("sprintId", "status");
CREATE INDEX IF NOT EXISTS "SprintAd_sprintId_finalStatus_idx" ON "SprintAd"("sprintId", "finalStatus");
CREATE INDEX IF NOT EXISTS "SprintAd_storeId_createdAt_idx" ON "SprintAd"("storeId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SprintAd_metaAdsetId_idx" ON "SprintAd"("metaAdsetId");

-- ── Foreign keys ────────────────────────────────────────────────────
-- Wrap in DO blocks so re-runs don't fail with "constraint already exists".
DO $$ BEGIN
    ALTER TABLE "CreativeSprint" ADD CONSTRAINT "CreativeSprint_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SprintAd" ADD CONSTRAINT "SprintAd_sprintId_fkey"
      FOREIGN KEY ("sprintId") REFERENCES "CreativeSprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SprintAd" ADD CONSTRAINT "SprintAd_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Done ────────────────────────────────────────────────────────────
-- Verify:
--   SELECT COUNT(*) FROM "CreativeSprint";   -- should return 0
--   SELECT COUNT(*) FROM "SprintAd";         -- should return 0
