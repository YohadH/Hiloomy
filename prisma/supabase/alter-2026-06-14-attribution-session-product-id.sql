-- SA-CRIT-06: AttributionSession now stores the clicked product id captured
-- from the affiliate redirect endpoint (?product=...). Apply on the live DB.
-- Idempotent; safe to re-run.

ALTER TABLE "AttributionSession"
  ADD COLUMN IF NOT EXISTS "productId" TEXT;
