-- Discount mechanism columns (F-043).
--
-- schema.prisma gained these on 2026-08-24 with NO accompanying migration,
-- so production (which only ever gets manual schema steps — see render.yaml)
-- was left without them. Every prisma.discountUsage.create() carrying the
-- new fields then failed on live with:
--   "The column `applicationType` does not exist in the current database."
-- which also broke the historical returns sync — its pipeline writes
-- discount rows on the way through.
--
-- All statements are additive and idempotent (IF NOT EXISTS) so this is
-- safe to run on a database in any of the drift states: never-migrated
-- production, or a dev DB already aligned via `prisma db push`.

ALTER TABLE "DiscountUsage" ADD COLUMN IF NOT EXISTS "applicationType" TEXT;
ALTER TABLE "DiscountUsage" ADD COLUMN IF NOT EXISTS "allocationMethod" TEXT;
ALTER TABLE "DiscountUsage" ADD COLUMN IF NOT EXISTS "targetSelection" TEXT;
ALTER TABLE "DiscountUsage" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "DiscountUsage" ADD COLUMN IF NOT EXISTS "valueType" TEXT;
ALTER TABLE "DiscountUsage" ADD COLUMN IF NOT EXISTS "valuePercent" DECIMAL(6,2);
ALTER TABLE "DiscountUsage" ADD COLUMN IF NOT EXISTS "valueAmount" DECIMAL(12,2);
ALTER TABLE "DiscountUsage" ADD COLUMN IF NOT EXISTS "title" TEXT;

CREATE INDEX IF NOT EXISTS "DiscountUsage_storeId_applicationType_idx"
  ON "DiscountUsage"("storeId", "applicationType");
