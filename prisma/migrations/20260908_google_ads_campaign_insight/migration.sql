-- Google Ads daily campaign metrics. See google-ads-service.ts.
CREATE TABLE "GoogleAdsCampaignInsight" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "campaignStatus" TEXT,
    "channelType" TEXT,
    "date" DATE NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "conversionsValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleAdsCampaignInsight_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleAdsCampaignInsight_storeId_customerId_campaignId_date_key"
    ON "GoogleAdsCampaignInsight"("storeId", "customerId", "campaignId", "date");
CREATE INDEX "GoogleAdsCampaignInsight_storeId_date_idx" ON "GoogleAdsCampaignInsight"("storeId", "date" DESC);
CREATE INDEX "GoogleAdsCampaignInsight_storeId_customerId_idx" ON "GoogleAdsCampaignInsight"("storeId", "customerId");
ALTER TABLE "GoogleAdsCampaignInsight" ADD CONSTRAINT "GoogleAdsCampaignInsight_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
