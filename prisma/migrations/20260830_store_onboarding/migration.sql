-- Admin-managed store onboarding (design partners / multi-brand, 2026
-- custom-distribution OAuth model). Holds per-store Shopify app credentials
-- and the target org a store lands in, registered before install.
CREATE TABLE "StoreOnboarding" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "appClientId" TEXT NOT NULL,
    "appClientSecretEnc" TEXT NOT NULL,
    "targetOrgId" TEXT NOT NULL,
    "invitedEmail" TEXT,
    "createdByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreOnboarding_shopDomain_key" ON "StoreOnboarding"("shopDomain");
CREATE INDEX "StoreOnboarding_targetOrgId_idx" ON "StoreOnboarding"("targetOrgId");
CREATE INDEX "StoreOnboarding_status_idx" ON "StoreOnboarding"("status");

ALTER TABLE "StoreOnboarding"
    ADD CONSTRAINT "StoreOnboarding_targetOrgId_fkey"
    FOREIGN KEY ("targetOrgId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
