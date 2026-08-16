import type { GrowthAgentSettings, GrowthPlatformConnection } from "@/lib/domain/growth-agent-types";

export const defaultGrowthAgentSettings: GrowthAgentSettings = {
  agentEnabled: true,
  agentMode: "approval_required",
  checkFrequencyMinutes: 60,
  thresholds: {
    sessionsDropPercent: 20,
    ordersDropPercent: 15,
    conversionRateDropPercent: 12,
    aovDropPercent: 10,
    returningCustomerDropPercent: 10,
    trafficSourceDropPercent: 25
  },
  comparisonWindows: {
    compareToYesterday: true,
    compareToLast7Days: true,
    compareToSameWeekdayLastWeek: true
  },
  channels: {
    shopify: true,
    metaAds: false,
    instagram: true,
    facebook: false,
    tiktok: false,
    googleAnalytics: false
  },
  notifications: {
    email: true,
    inApp: true,
    slack: false,
    webhook: false
  },
  guardrails: {
    maxDailyAdBudget: 250,
    maxSingleActionBudget: 80,
    minConfidenceScore: 0.72,
    requireInventoryAvailable: true,
    minimumInventoryThreshold: 8,
    blockIfTrackingConfidenceLow: true,
    cooldownMinutesBetweenActions: 180
  },
  allowedActions: {
    sendAlert: true,
    createRecommendation: true,
    createCreativeBrief: true,
    draftOrganicPost: true,
    publishOrganicPost: false,
    createAdCampaignDraft: true,
    launchAdCampaign: false,
    scaleExistingCampaign: false,
    pauseCampaign: true
  },
  approvalRules: {
    requireApprovalAboveBudget: 40,
    requireApprovalForCampaignLaunch: true,
    requireApprovalForScaling: true,
    requireApprovalForPublishingPost: true
  },
  productResearch: {
    enabled: false,
    sourceUrls: "",
    nicheKeywords: "",
    maxRecommendations: 6
  }
};

export const defaultPlatformConnections: Omit<GrowthPlatformConnection, "id">[] = [
  { platform: "shopify", status: "connected", healthMessage: "Store data is available through the Shopify ingestion pipeline.", lastSyncAt: null, tokenLastFour: null },
  { platform: "productCrawler", status: "stub", healthMessage: "Product crawler is ready. Add supplier, catalog, or product-listing URLs to let AI discover products.", lastSyncAt: null, tokenLastFour: null },
  { platform: "amazon", status: "stub", healthMessage: "Amazon supplier drafting is ready. Save ASINs or supplier URLs to prepare manual dropship order drafts.", lastSyncAt: null, tokenLastFour: null },
  // metaAds / instagram statuses below are SEED defaults for the "no token stored yet" case.
  // ensureGrowthAgentDefaults() reconciles them at runtime against the real MetaAdsConnection /
  // InstagramConnection tokens (see growth-agent-service.ts) — when a token exists the row flips
  // to "connected"/"degraded" automatically. (SA-MED-01)
  { platform: "metaAds", status: "needs_oauth", healthMessage: "Meta Ads is not connected yet. Connect your Meta ad account at /settings to enable paid-media monitoring.", lastSyncAt: null, tokenLastFour: null },
  { platform: "instagram", status: "needs_oauth", healthMessage: "Instagram is not connected yet. Connect Instagram at /settings to monitor organic creator signals.", lastSyncAt: null, tokenLastFour: null },
  { platform: "facebook", status: "needs_oauth", healthMessage: "Facebook page/traffic signals are not connected yet. Connect Meta at /settings.", lastSyncAt: null, tokenLastFour: null },
  { platform: "tiktok", status: "needs_oauth", healthMessage: "TikTok Ads is not connected yet. OAuth connection is not available in-app yet — contact support to connect TikTok.", lastSyncAt: null, tokenLastFour: null },
  { platform: "googleAnalytics", status: "needs_oauth", healthMessage: "Google Analytics (GA4) is not connected yet. OAuth connection is not available in-app yet — contact support to connect GA4.", lastSyncAt: null, tokenLastFour: null }
];
