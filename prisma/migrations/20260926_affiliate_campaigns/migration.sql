-- Campaigns + briefs for affiliates (ported from the Creators project into our
-- models, 2026-09-26). Additive, idempotent.
CREATE TABLE IF NOT EXISTS "AffiliateCampaign" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "promoText" TEXT,
  "couponCode" TEXT,
  "destinationPath" TEXT NOT NULL DEFAULT '/',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AffiliateCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AffiliateCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateCampaign_storeId_code_key" ON "AffiliateCampaign"("storeId", "code");
CREATE INDEX IF NOT EXISTS "AffiliateCampaign_storeId_status_idx" ON "AffiliateCampaign"("storeId", "status");

CREATE TABLE IF NOT EXISTS "AffiliateBrief" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "affiliateMemberId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'post',
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "postedAt" TIMESTAMP(3),
  "postUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AffiliateBrief_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AffiliateBrief_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AffiliateBrief_affiliateMemberId_fkey" FOREIGN KEY ("affiliateMemberId") REFERENCES "AffiliateMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AffiliateBrief_storeId_affiliateMemberId_dueDate_idx" ON "AffiliateBrief"("storeId", "affiliateMemberId", "dueDate");
CREATE INDEX IF NOT EXISTS "AffiliateBrief_campaignId_idx" ON "AffiliateBrief"("campaignId");

ALTER TABLE "AttributionSession" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
ALTER TABLE "AttributionSession" ADD COLUMN IF NOT EXISTS "briefId" TEXT;
ALTER TABLE "AffiliateAttribution" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttributionSession_campaignId_fkey') THEN
    ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttributionSession_briefId_fkey') THEN
    ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "AffiliateBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateAttribution_campaignId_fkey') THEN
    ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "AttributionSession_storeId_campaignId_idx" ON "AttributionSession"("storeId", "campaignId");
CREATE INDEX IF NOT EXISTS "AffiliateAttribution_storeId_campaignId_idx" ON "AffiliateAttribution"("storeId", "campaignId");
