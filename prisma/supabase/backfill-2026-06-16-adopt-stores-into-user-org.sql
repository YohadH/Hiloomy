-- One-time backfill to fix multi-store visibility for yohad@brandzp.co.il.
--
-- Problem: ShopifyConnection save paths historically didn't set Store.orgId.
-- The earlier 2026-06-12 backfill moved those orphans into a single
-- "org_legacy_default" org. But the user's personal org (created on first
-- sign-in via createDefaultOrgFor) is a DIFFERENT org with 0 stores —
-- which is why the StoreSwitcher shows nothing and "I can't connect
-- another store" looks true even when stores ARE connected.
--
-- This script: for the founder's user, find their owner-role org, then
-- move every Store from `org_legacy_default` (and any unassigned orphan)
-- into that personal org.
--
-- Idempotent: safe to re-run. Targets a single email so it can't sweep
-- other tenants' stores by accident.
--
-- AFTER RUNNING THIS:
--   1. Hard-refresh the app (clears any cached active-store cookie).
--   2. StoreSwitcher should list every connected brand.
--   3. New connections will auto-bind to your org going forward
--      (code fix in shopify-connection-service.ts + shopify-oauth-service.ts).

BEGIN;

-- Find the founder's owned org. There should be exactly one — they're
-- the owner of their default org created on first sign-in.
WITH founder AS (
  SELECT u.id AS user_id, m."orgId" AS org_id
  FROM "User" u
  JOIN "Membership" m ON m."userId" = u.id
  WHERE u.email = 'yohad@brandzp.co.il'
    AND m.role = 'owner'
  ORDER BY m."createdAt" ASC
  LIMIT 1
)
-- Move every store currently in org_legacy_default OR with NULL orgId
-- into the founder's personal org.
UPDATE "Store" s
SET "orgId" = founder.org_id
FROM founder
WHERE s."orgId" IS NULL
   OR s."orgId" = 'org_legacy_default';

-- Diagnostic: list what now belongs to the founder's org.
-- Comment this back in to verify after running.
-- SELECT s.id, s.name, s.domain, s.connected, s."orgId"
-- FROM "Store" s
-- JOIN "User" u ON u.email = 'yohad@brandzp.co.il'
-- JOIN "Membership" m ON m."userId" = u.id AND m.role = 'owner'
-- WHERE s."orgId" = m."orgId";

COMMIT;
