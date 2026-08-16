-- Phase 1A: Multi-tenant identity layer (User / Organization / Membership)
-- + orgId on Store. Run ONCE in Supabase SQL Editor.
--
-- orgId is nullable for now so existing rows don't break. The Phase 1F
-- backfill creates a default Organization for current data and sets
-- Store.orgId to it, after which orgId can be promoted to NOT NULL.

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "authUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'he',
  "lastSignInAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_authUserId_key" ON "User"("authUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'trial',
  "trialEndsAt" TIMESTAMP(3),
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'ILS',
  "locale" TEXT NOT NULL DEFAULT 'he',
  "billingCountry" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "Organization_plan_idx" ON "Organization"("plan");

CREATE TABLE IF NOT EXISTS "Membership" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "orgId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");
CREATE INDEX IF NOT EXISTS "Membership_orgId_idx" ON "Membership"("orgId");

-- Store gets a nullable orgId now; backfill happens in Phase 1F, then we
-- can ALTER COLUMN ... SET NOT NULL.
ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "orgId" TEXT REFERENCES "Organization"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "Store_orgId_idx" ON "Store"("orgId");
