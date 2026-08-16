-- Phase 1F: Backfill existing data with a default Organization.
--
-- For each Store that doesn't yet have an orgId, we create a single
-- Organization named "Legacy" + link the store to it. This is the
-- one-time bridge from single-tenant to multi-tenant.
--
-- After this, you can:
--   1. Sign up as yourself via /signup
--   2. SQL update the Membership table to add YOU as owner of the Legacy org
--      (the SQL at the bottom of this file shows the exact statement)
--   3. Optional: rename the Legacy org via /settings/organization once
--      that page lands.
--
-- Idempotent: re-runs do nothing if orgId is already set.

BEGIN;

-- Create the legacy org if any store is missing one.
INSERT INTO "Organization" (id, name, slug, plan, currency, locale, "createdAt", "updatedAt")
SELECT
  'org_legacy_default',
  'Legacy',
  'legacy',
  'trial',
  'ILS',
  'he',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Store" WHERE "orgId" IS NULL)
ON CONFLICT (id) DO NOTHING;

-- Link every unowned store to the legacy org.
UPDATE "Store"
SET "orgId" = 'org_legacy_default'
WHERE "orgId" IS NULL;

COMMIT;

-- ─── Manual step after you sign up via the new auth flow ──────────────
-- Once your User row exists, run this to grant yourself OWNER on the
-- Legacy org (replace the email below with the one you signed up with):
--
-- INSERT INTO "Membership" (id, "userId", "orgId", role, "createdAt", "updatedAt")
-- SELECT
--   'membership_' || substr(md5(random()::text), 1, 16),
--   "User".id,
--   'org_legacy_default',
--   'owner',
--   CURRENT_TIMESTAMP,
--   CURRENT_TIMESTAMP
-- FROM "User"
-- WHERE "User".email = 'YOUR_EMAIL_HERE'
-- ON CONFLICT ("userId", "orgId") DO NOTHING;
