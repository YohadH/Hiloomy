-- Incremental schema patch for Supabase — applies only the bixgrowSlug
-- addition without wiping data. Run this ONCE in the Supabase SQL Editor.
--
-- After this runs, the BixGrow webhook URL system works:
--   /api/webhooks/bixgrow/<bixgrowSlug>

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "bixgrowSlug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Store_bixgrowSlug_key"
  ON "Store"("bixgrowSlug");
