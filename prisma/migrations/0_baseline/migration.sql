-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "shopifyShopId" TEXT,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "planName" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "dateRangePreset" TEXT NOT NULL DEFAULT '30d',
    "estimatedCostMode" TEXT NOT NULL DEFAULT 'margin_profile',
    "defaultCostRatio" DECIMAL(5,4) NOT NULL DEFAULT 0.35,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "adminAccessTokenEnc" TEXT NOT NULL,
    "tokenLastFour" TEXT NOT NULL,
    "apiVersion" TEXT NOT NULL DEFAULT '2025-01',
    "lastSyncAt" TIMESTAMP(3),
    "lastProductsSyncAt" TIMESTAMP(3),
    "lastCustomersSyncAt" TIMESTAMP(3),
    "lastOrdersSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BixGrowConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "portalDomain" TEXT NOT NULL,
    "apiKeyEnc" TEXT,
    "tokenLastFour" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "exportMode" TEXT NOT NULL DEFAULT 'manual_export',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BixGrowConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "username" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenLastFour" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdsConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adAccountName" TEXT,
    "accountStatus" INTEGER,
    "currency" TEXT,
    "timezoneName" TEXT,
    "appId" TEXT,
    "appSecretEnc" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenLastFour" TEXT NOT NULL,
    "tokenType" TEXT,
    "tokenIssuedAt" TIMESTAMP(3),
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenScopes" JSONB,
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdsCampaignInsight" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "metaConnectionId" TEXT,
    "adAccountId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "adsetId" TEXT,
    "adsetName" TEXT,
    "adId" TEXT,
    "adName" TEXT,
    "creativeId" TEXT,
    "creativeName" TEXT,
    "creativeTitle" TEXT,
    "creativeBody" TEXT,
    "creativeThumbnailUrl" TEXT,
    "creativePreviewUrl" TEXT,
    "creativePermalinkUrl" TEXT,
    "creativeObjectUrl" TEXT,
    "objectStoryId" TEXT,
    "effectiveObjectStoryId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'campaign',
    "datePreset" TEXT,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "dateStop" TIMESTAMP(3) NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "landingPageViews" INTEGER NOT NULL DEFAULT 0,
    "addToCart" INTEGER NOT NULL DEFAULT 0,
    "initiateCheckout" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "cpc" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "cpm" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "purchaseRoas" DECIMAL(12,4),
    "actionsJson" JSONB,
    "purchaseRoasJson" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdsCampaignInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "syncFrom" TIMESTAMP(3),
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "detailsJson" JSONB,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "vendor" TEXT,
    "productType" TEXT,
    "status" TEXT,
    "collection" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costOverrideAmount" DECIMAL(10,2),
    "marginProfile" TEXT NOT NULL DEFAULT 'core',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyCollection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyCollectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "productsCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifyCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCollectionMembership" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCollectionMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "title" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "compareAtPrice" DECIMAL(10,2),
    "inventoryQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstOrderDate" TIMESTAMP(3),
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "lifetimeValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isReturning" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "shopifyOrderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "subtotalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDiscounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalTax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalShipping" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalRefunds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxesIncluded" BOOLEAN NOT NULL DEFAULT false,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "test" BOOLEAN NOT NULL DEFAULT false,
    "sourceName" TEXT,
    "landingSiteRef" TEXT,
    "referringSite" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "shopifyLineItemId" TEXT,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "originalUnitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountedUnitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedQuantity" INTEGER NOT NULL DEFAULT 0,
    "refundedSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimatedCostAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountUsage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopifyRefundId" TEXT,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedLineItemsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimatedProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returningCustomerRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "averageOrderValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "refundRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "returningCustomers" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summary" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'weekly',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dataJson" JSONB NOT NULL,
    "insightsJson" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "sentToJson" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReportRecipient" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReportRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'legacy',
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "source" TEXT NOT NULL DEFAULT 'Calculated',
    "detectedBy" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recommendedAction" TEXT,
    "metricName" TEXT,
    "currentValue" DECIMAL(14,4),
    "previousValue" DECIMAL(14,4),
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "fingerprint" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "explanation" TEXT,
    "suggestedAction" TEXT,
    "periodLabel" TEXT,
    "timestamp" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "profileUrl" TEXT,
    "affiliateCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorPost" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "instagramConnectionId" TEXT,
    "creatorProfileId" TEXT,
    "externalPostId" TEXT NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "permalink" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "attributedSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "attributedOrders" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorAttribution" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "creatorProfileId" TEXT,
    "creatorPostId" TEXT,
    "orderId" TEXT,
    "sourcePlatform" TEXT NOT NULL,
    "affiliateCode" TEXT,
    "salesAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "periodLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateProgram" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "signUpLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateMember" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "country" TEXT,
    "affiliateCode" TEXT NOT NULL,
    "couponCode" TEXT,
    "referralLink" TEXT,
    "shortLink" TEXT,
    "instagramUsername" TEXT,
    "instagramProfileUrl" TEXT,
    "clicksTotal" INTEGER NOT NULL DEFAULT 0,
    "ordersTotal" INTEGER NOT NULL DEFAULT 0,
    "salesTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCoupon" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "affiliateMemberId" TEXT,
    "shopifyDiscountId" TEXT,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "appliesOncePerCustomer" BOOLEAN NOT NULL DEFAULT true,
    "applyLink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCouponAssignment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "affiliateMemberId" TEXT NOT NULL,
    "affiliateCouponId" TEXT,
    "couponCode" TEXT NOT NULL,
    "couponTitle" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "applyLink" TEXT,
    "assignmentMode" TEXT NOT NULL DEFAULT 'single',
    "connectionSource" TEXT NOT NULL DEFAULT 'shopify_create',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCouponAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateAttribution" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "affiliateMemberId" TEXT NOT NULL,
    "orderId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'coupon',
    "trackingMethod" TEXT,
    "sourceUrl" TEXT,
    "contentTitle" TEXT,
    "salesAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSettings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'recommendation_only',
    "checkFrequencyMinutes" INTEGER NOT NULL DEFAULT 60,
    "thresholds" JSONB NOT NULL,
    "comparisonWindows" JSONB NOT NULL,
    "channels" JSONB NOT NULL,
    "notifications" JSONB NOT NULL,
    "guardrails" JSONB NOT NULL,
    "allowedActions" JSONB NOT NULL,
    "approvalRules" JSONB NOT NULL,
    "productResearch" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentFinding" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "possibleCauses" JSONB NOT NULL,
    "recommendedActions" JSONB NOT NULL,
    "confidenceScore" DECIMAL(4,2) NOT NULL DEFAULT 0.65,
    "sourceData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estimatedImpact" JSONB,
    "riskLevel" TEXT NOT NULL,
    "confidenceScore" DECIMAL(4,2) NOT NULL DEFAULT 0.65,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "executedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "config" JSONB,
    "tokenLastFour" TEXT,
    "healthMessage" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "bucketedAt" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "confidenceScore" DECIMAL(4,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributionSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "affiliateMemberId" TEXT,
    "clickId" TEXT NOT NULL,
    "visitorToken" TEXT,
    "sourcePlatform" TEXT,
    "sourceUrl" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "landingPath" TEXT,
    "couponCode" TEXT,
    "affiliateCode" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSalesImport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sheetTitle" TEXT,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "totalQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineSalesImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSalesRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "barcode" TEXT,
    "couponCode" TEXT,
    "quantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "matchedVariantId" TEXT,
    "matchedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineSalesRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeProject" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT,
    "creativeType" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "provider" TEXT NOT NULL DEFAULT 'replicate',
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "briefJson" JSONB,
    "styleJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeSource" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobId" TEXT,
    "assetType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storageKey" TEXT,
    "rawStorageKey" TEXT,
    "thumbStorageKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "promptUsed" TEXT,
    "providerName" TEXT,
    "providerJobId" TEXT,
    "overlaysJson" JSONB,
    "metaJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeGenerationJob" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" JSONB NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "providerName" TEXT,
    "costEstimateUsd" DECIMAL(10,4),
    "costActualUsd" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_domain_key" ON "Store"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Store_shopifyShopId_key" ON "Store"("shopifyShopId");

-- CreateIndex
CREATE INDEX "Store_connected_idx" ON "Store"("connected");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_storeId_key" ON "ShopifyConnection"("storeId");

-- CreateIndex
CREATE INDEX "ShopifyConnection_shopDomain_idx" ON "ShopifyConnection"("shopDomain");

-- CreateIndex
CREATE INDEX "ShopifyConnection_syncStatus_idx" ON "ShopifyConnection"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BixGrowConnection_storeId_key" ON "BixGrowConnection"("storeId");

-- CreateIndex
CREATE INDEX "BixGrowConnection_portalDomain_idx" ON "BixGrowConnection"("portalDomain");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_storeId_key" ON "InstagramConnection"("storeId");

-- CreateIndex
CREATE INDEX "InstagramConnection_instagramUserId_idx" ON "InstagramConnection"("instagramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdsConnection_storeId_key" ON "MetaAdsConnection"("storeId");

-- CreateIndex
CREATE INDEX "MetaAdsConnection_adAccountId_idx" ON "MetaAdsConnection"("adAccountId");

-- CreateIndex
CREATE INDEX "MetaAdsConnection_syncStatus_idx" ON "MetaAdsConnection"("syncStatus");

-- CreateIndex
CREATE INDEX "MetaAdsCampaignInsight_storeId_dateStart_dateStop_idx" ON "MetaAdsCampaignInsight"("storeId", "dateStart", "dateStop");

-- CreateIndex
CREATE INDEX "MetaAdsCampaignInsight_storeId_adAccountId_idx" ON "MetaAdsCampaignInsight"("storeId", "adAccountId");

-- CreateIndex
CREATE INDEX "MetaAdsCampaignInsight_campaignId_idx" ON "MetaAdsCampaignInsight"("campaignId");

-- CreateIndex
CREATE INDEX "MetaAdsCampaignInsight_adId_idx" ON "MetaAdsCampaignInsight"("adId");

-- CreateIndex
CREATE INDEX "MetaAdsCampaignInsight_creativeId_idx" ON "MetaAdsCampaignInsight"("creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdsCampaignInsight_storeId_adAccountId_level_entityId_d_key" ON "MetaAdsCampaignInsight"("storeId", "adAccountId", "level", "entityId", "dateStart", "dateStop");

-- CreateIndex
CREATE INDEX "SyncRun_storeId_startedAt_idx" ON "SyncRun"("storeId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "SyncRun_status_idx" ON "SyncRun"("status");

-- CreateIndex
CREATE INDEX "Product_storeId_updatedAt_idx" ON "Product"("storeId", "updatedAt");

-- CreateIndex
CREATE INDEX "Product_storeId_productType_idx" ON "Product"("storeId", "productType");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_shopifyProductId_key" ON "Product"("storeId", "shopifyProductId");

-- CreateIndex
CREATE INDEX "ShopifyCollection_storeId_title_idx" ON "ShopifyCollection"("storeId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyCollection_storeId_shopifyCollectionId_key" ON "ShopifyCollection"("storeId", "shopifyCollectionId");

-- CreateIndex
CREATE INDEX "ProductCollectionMembership_storeId_collectionId_idx" ON "ProductCollectionMembership"("storeId", "collectionId");

-- CreateIndex
CREATE INDEX "ProductCollectionMembership_storeId_productId_idx" ON "ProductCollectionMembership"("storeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCollectionMembership_productId_collectionId_key" ON "ProductCollectionMembership"("productId", "collectionId");

-- CreateIndex
CREATE INDEX "ProductVariant_storeId_sku_idx" ON "ProductVariant"("storeId", "sku");

-- CreateIndex
CREATE INDEX "ProductVariant_storeId_barcode_idx" ON "ProductVariant"("storeId", "barcode");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_storeId_shopifyVariantId_key" ON "ProductVariant"("storeId", "shopifyVariantId");

-- CreateIndex
CREATE INDEX "Customer_storeId_email_idx" ON "Customer"("storeId", "email");

-- CreateIndex
CREATE INDEX "Customer_storeId_updatedAt_idx" ON "Customer"("storeId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_storeId_shopifyCustomerId_key" ON "Customer"("storeId", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_storeId_updatedAt_idx" ON "Order"("storeId", "updatedAt");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_shopifyOrderId_key" ON "Order"("storeId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "OrderLineItem_storeId_productId_idx" ON "OrderLineItem"("storeId", "productId");

-- CreateIndex
CREATE INDEX "OrderLineItem_storeId_variantId_idx" ON "OrderLineItem"("storeId", "variantId");

-- CreateIndex
CREATE INDEX "OrderLineItem_orderId_idx" ON "OrderLineItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineItem_storeId_orderId_shopifyLineItemId_key" ON "OrderLineItem"("storeId", "orderId", "shopifyLineItemId");

-- CreateIndex
CREATE INDEX "DiscountUsage_storeId_code_idx" ON "DiscountUsage"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountUsage_storeId_orderId_code_key" ON "DiscountUsage"("storeId", "orderId", "code");

-- CreateIndex
CREATE INDEX "Refund_storeId_createdAt_idx" ON "Refund"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_storeId_shopifyRefundId_key" ON "Refund"("storeId", "shopifyRefundId");

-- CreateIndex
CREATE INDEX "DailyMetric_storeId_date_idx" ON "DailyMetric"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_storeId_date_key" ON "DailyMetric"("storeId", "date");

-- CreateIndex
CREATE INDEX "Summary_storeId_generatedAt_idx" ON "Summary"("storeId", "generatedAt" DESC);

-- CreateIndex
CREATE INDEX "WeeklyReport_storeId_periodEnd_idx" ON "WeeklyReport"("storeId", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "WeeklyReport_storeId_kind_periodEnd_idx" ON "WeeklyReport"("storeId", "kind", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "WeeklyReportRecipient_storeId_active_idx" ON "WeeklyReportRecipient"("storeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReportRecipient_storeId_email_key" ON "WeeklyReportRecipient"("storeId", "email");

-- CreateIndex
CREATE INDEX "Alert_storeId_status_severity_idx" ON "Alert"("storeId", "status", "severity");

-- CreateIndex
CREATE INDEX "Alert_storeId_type_status_idx" ON "Alert"("storeId", "type", "status");

-- CreateIndex
CREATE INDEX "Alert_storeId_createdAt_idx" ON "Alert"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_storeId_relatedEntityType_relatedEntityId_idx" ON "Alert"("storeId", "relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE INDEX "Alert_storeId_timestamp_idx" ON "Alert"("storeId", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Alert_storeId_fingerprint_status_key" ON "Alert"("storeId", "fingerprint", "status");

-- CreateIndex
CREATE INDEX "CreatorProfile_storeId_platform_idx" ON "CreatorProfile"("storeId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_storeId_platform_externalId_key" ON "CreatorProfile"("storeId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "CreatorPost_storeId_postedAt_idx" ON "CreatorPost"("storeId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorPost_storeId_externalPostId_key" ON "CreatorPost"("storeId", "externalPostId");

-- CreateIndex
CREATE INDEX "CreatorAttribution_storeId_sourcePlatform_idx" ON "CreatorAttribution"("storeId", "sourcePlatform");

-- CreateIndex
CREATE INDEX "CreatorAttribution_creatorProfileId_idx" ON "CreatorAttribution"("creatorProfileId");

-- CreateIndex
CREATE INDEX "CreatorAttribution_creatorPostId_idx" ON "CreatorAttribution"("creatorPostId");

-- CreateIndex
CREATE INDEX "AffiliateProgram_storeId_status_idx" ON "AffiliateProgram"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateMember_affiliateCode_key" ON "AffiliateMember"("affiliateCode");

-- CreateIndex
CREATE INDEX "AffiliateMember_storeId_status_idx" ON "AffiliateMember"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateMember_storeId_email_key" ON "AffiliateMember"("storeId", "email");

-- CreateIndex
CREATE INDEX "AffiliateCoupon_storeId_affiliateMemberId_idx" ON "AffiliateCoupon"("storeId", "affiliateMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCoupon_storeId_code_key" ON "AffiliateCoupon"("storeId", "code");

-- CreateIndex
CREATE INDEX "AffiliateCouponAssignment_storeId_affiliateMemberId_created_idx" ON "AffiliateCouponAssignment"("storeId", "affiliateMemberId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AffiliateCouponAssignment_affiliateCouponId_idx" ON "AffiliateCouponAssignment"("affiliateCouponId");

-- CreateIndex
CREATE INDEX "AffiliateAttribution_storeId_occurredAt_idx" ON "AffiliateAttribution"("storeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateAttribution_affiliateMemberId_orderId_key" ON "AffiliateAttribution"("affiliateMemberId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSettings_storeId_key" ON "AgentSettings"("storeId");

-- CreateIndex
CREATE INDEX "AgentFinding_storeId_createdAt_idx" ON "AgentFinding"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentFinding_storeId_severity_idx" ON "AgentFinding"("storeId", "severity");

-- CreateIndex
CREATE INDEX "AgentAction_storeId_createdAt_idx" ON "AgentAction"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentAction_storeId_status_idx" ON "AgentAction"("storeId", "status");

-- CreateIndex
CREATE INDEX "AgentAction_storeId_actionType_idx" ON "AgentAction"("storeId", "actionType");

-- CreateIndex
CREATE INDEX "PlatformConnection_storeId_status_idx" ON "PlatformConnection"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_storeId_platform_key" ON "PlatformConnection"("storeId", "platform");

-- CreateIndex
CREATE INDEX "MetricSnapshot_storeId_bucketedAt_idx" ON "MetricSnapshot"("storeId", "bucketedAt" DESC);

-- CreateIndex
CREATE INDEX "MetricSnapshot_storeId_source_idx" ON "MetricSnapshot"("storeId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "AttributionSession_clickId_key" ON "AttributionSession"("clickId");

-- CreateIndex
CREATE INDEX "AttributionSession_storeId_createdAt_idx" ON "AttributionSession"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AttributionSession_storeId_affiliateCode_idx" ON "AttributionSession"("storeId", "affiliateCode");

-- CreateIndex
CREATE INDEX "AttributionSession_storeId_couponCode_idx" ON "AttributionSession"("storeId", "couponCode");

-- CreateIndex
CREATE INDEX "WebhookEvent_storeId_topic_createdAt_idx" ON "WebhookEvent"("storeId", "topic", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookEvent_storeId_status_idx" ON "WebhookEvent"("storeId", "status");

-- CreateIndex
CREATE INDEX "OfflineSalesImport_storeId_createdAt_idx" ON "OfflineSalesImport"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSalesImport_storeId_periodYear_periodMonth_key" ON "OfflineSalesImport"("storeId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "OfflineSalesRow_importId_idx" ON "OfflineSalesRow"("importId");

-- CreateIndex
CREATE INDEX "OfflineSalesRow_barcode_idx" ON "OfflineSalesRow"("barcode");

-- CreateIndex
CREATE INDEX "OfflineSalesRow_couponCode_idx" ON "OfflineSalesRow"("couponCode");

-- CreateIndex
CREATE INDEX "CreativeProject_storeId_createdAt_idx" ON "CreativeProject"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CreativeProject_storeId_creativeType_idx" ON "CreativeProject"("storeId", "creativeType");

-- CreateIndex
CREATE INDEX "CreativeProject_status_idx" ON "CreativeProject"("status");

-- CreateIndex
CREATE INDEX "CreativeSource_projectId_idx" ON "CreativeSource"("projectId");

-- CreateIndex
CREATE INDEX "CreativeSource_storeId_createdAt_idx" ON "CreativeSource"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CreativeAsset_projectId_createdAt_idx" ON "CreativeAsset"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CreativeAsset_status_idx" ON "CreativeAsset"("status");

-- CreateIndex
CREATE INDEX "CreativeAsset_providerJobId_idx" ON "CreativeAsset"("providerJobId");

-- CreateIndex
CREATE INDEX "CreativeGenerationJob_status_createdAt_idx" ON "CreativeGenerationJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeGenerationJob_storeId_status_idx" ON "CreativeGenerationJob"("storeId", "status");

-- CreateIndex
CREATE INDEX "CreativeGenerationJob_lockedAt_idx" ON "CreativeGenerationJob"("lockedAt");

-- AddForeignKey
ALTER TABLE "ShopifyConnection" ADD CONSTRAINT "ShopifyConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BixGrowConnection" ADD CONSTRAINT "BixGrowConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramConnection" ADD CONSTRAINT "InstagramConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdsConnection" ADD CONSTRAINT "MetaAdsConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdsCampaignInsight" ADD CONSTRAINT "MetaAdsCampaignInsight_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdsCampaignInsight" ADD CONSTRAINT "MetaAdsCampaignInsight_metaConnectionId_fkey" FOREIGN KEY ("metaConnectionId") REFERENCES "MetaAdsConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyCollection" ADD CONSTRAINT "ShopifyCollection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollectionMembership" ADD CONSTRAINT "ProductCollectionMembership_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollectionMembership" ADD CONSTRAINT "ProductCollectionMembership_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollectionMembership" ADD CONSTRAINT "ProductCollectionMembership_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ShopifyCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReportRecipient" ADD CONSTRAINT "WeeklyReportRecipient_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPost" ADD CONSTRAINT "CreatorPost_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPost" ADD CONSTRAINT "CreatorPost_instagramConnectionId_fkey" FOREIGN KEY ("instagramConnectionId") REFERENCES "InstagramConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPost" ADD CONSTRAINT "CreatorPost_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorAttribution" ADD CONSTRAINT "CreatorAttribution_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorAttribution" ADD CONSTRAINT "CreatorAttribution_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorAttribution" ADD CONSTRAINT "CreatorAttribution_creatorPostId_fkey" FOREIGN KEY ("creatorPostId") REFERENCES "CreatorPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorAttribution" ADD CONSTRAINT "CreatorAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateProgram" ADD CONSTRAINT "AffiliateProgram_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateMember" ADD CONSTRAINT "AffiliateMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateMember" ADD CONSTRAINT "AffiliateMember_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AffiliateProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCoupon" ADD CONSTRAINT "AffiliateCoupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCoupon" ADD CONSTRAINT "AffiliateCoupon_affiliateMemberId_fkey" FOREIGN KEY ("affiliateMemberId") REFERENCES "AffiliateMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCouponAssignment" ADD CONSTRAINT "AffiliateCouponAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCouponAssignment" ADD CONSTRAINT "AffiliateCouponAssignment_affiliateMemberId_fkey" FOREIGN KEY ("affiliateMemberId") REFERENCES "AffiliateMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCouponAssignment" ADD CONSTRAINT "AffiliateCouponAssignment_affiliateCouponId_fkey" FOREIGN KEY ("affiliateCouponId") REFERENCES "AffiliateCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_affiliateMemberId_fkey" FOREIGN KEY ("affiliateMemberId") REFERENCES "AffiliateMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSettings" ADD CONSTRAINT "AgentSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFinding" ADD CONSTRAINT "AgentFinding_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformConnection" ADD CONSTRAINT "PlatformConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_affiliateMemberId_fkey" FOREIGN KEY ("affiliateMemberId") REFERENCES "AffiliateMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSalesImport" ADD CONSTRAINT "OfflineSalesImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSalesRow" ADD CONSTRAINT "OfflineSalesRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "OfflineSalesImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeProject" ADD CONSTRAINT "CreativeProject_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeSource" ADD CONSTRAINT "CreativeSource_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeSource" ADD CONSTRAINT "CreativeSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CreativeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CreativeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CreativeGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeGenerationJob" ADD CONSTRAINT "CreativeGenerationJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeGenerationJob" ADD CONSTRAINT "CreativeGenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CreativeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

