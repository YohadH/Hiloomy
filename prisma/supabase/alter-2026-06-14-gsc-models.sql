-- ─────────────────────────────────────────────────────────────────────
-- DATA-01 — Google Search Console models
-- Generated 2026-06-14 from prisma/schema.prisma via `prisma migrate diff`.
--
-- Adds three tables that hold synced GSC Search Analytics data, all scoped
-- to a Store via storeId (ON DELETE CASCADE), matching the rest of the schema.
--
-- HOW TO APPLY (owner action — NOT applied automatically):
--   Run this against the Supabase DIRECT connection (port 5432), e.g. paste
--   into the Supabase SQL editor, or:
--     psql "$DIRECT_URL" -f prisma/supabase/alter-2026-06-14-gsc-models.sql
--
--   Equivalent: `npx prisma db push` from the project root will also create
--   these tables (it diffs schema.prisma against the live DB).
--
-- Safe to re-run: every statement uses IF NOT EXISTS / a guarded DO block.
-- ─────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE IF NOT EXISTS "SearchConsoleMetric" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "url" TEXT NOT NULL,
    "query" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchConsoleMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SearchConsolePage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "totalImpressions" INTEGER NOT NULL DEFAULT 0,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "avgPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "SearchConsolePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SearchConsoleQuery" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "totalImpressions" INTEGER NOT NULL DEFAULT 0,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "avgPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "SearchConsoleQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchConsoleMetric_storeId_date_idx" ON "SearchConsoleMetric"("storeId", "date" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchConsoleMetric_storeId_url_idx" ON "SearchConsoleMetric"("storeId", "url");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchConsoleMetric_storeId_query_idx" ON "SearchConsoleMetric"("storeId", "query");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SearchConsoleMetric_storeId_date_url_query_key" ON "SearchConsoleMetric"("storeId", "date", "url", "query");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchConsolePage_storeId_totalImpressions_idx" ON "SearchConsolePage"("storeId", "totalImpressions" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SearchConsolePage_storeId_url_key" ON "SearchConsolePage"("storeId", "url");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SearchConsoleQuery_storeId_totalImpressions_idx" ON "SearchConsoleQuery"("storeId", "totalImpressions" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SearchConsoleQuery_storeId_query_key" ON "SearchConsoleQuery"("storeId", "query");

-- AddForeignKey (guarded — ADD CONSTRAINT has no IF NOT EXISTS in Postgres)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SearchConsoleMetric_storeId_fkey') THEN
    ALTER TABLE "SearchConsoleMetric" ADD CONSTRAINT "SearchConsoleMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SearchConsolePage_storeId_fkey') THEN
    ALTER TABLE "SearchConsolePage" ADD CONSTRAINT "SearchConsolePage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SearchConsoleQuery_storeId_fkey') THEN
    ALTER TABLE "SearchConsoleQuery" ADD CONSTRAINT "SearchConsoleQuery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
