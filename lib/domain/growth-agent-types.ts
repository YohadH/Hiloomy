export type GrowthAgentMode = "recommendation_only" | "approval_required" | "auto_execute";
export type GrowthFindingSeverity = "info" | "warning" | "critical";
export type GrowthActionStatus = "recommended" | "pending_approval" | "approved" | "executed" | "rejected" | "blocked" | "failed";
export type GrowthRiskLevel = "low" | "medium" | "high";
export type GrowthPlatform = "shopify" | "amazon" | "metaAds" | "instagram" | "facebook" | "tiktok" | "googleAnalytics" | "googleSearchConsole" | "productCrawler";
export type GrowthMetricStatus = "normal" | "warning" | "critical";
export type GrowthActionType =
  | "SEND_ALERT"
  | "CREATE_RECOMMENDATION"
  | "GENERATE_CREATIVE_BRIEF"
  | "DRAFT_SOCIAL_POST"
  | "PUBLISH_SOCIAL_POST"
  | "CREATE_AD_DRAFT"
  | "LAUNCH_AD_CAMPAIGN"
  | "SCALE_CAMPAIGN"
  | "PAUSE_CAMPAIGN";

export interface GrowthAgentThresholds {
  sessionsDropPercent: number;
  ordersDropPercent: number;
  conversionRateDropPercent: number;
  aovDropPercent: number;
  returningCustomerDropPercent: number;
  trafficSourceDropPercent: number;
}

export interface GrowthAgentComparisonWindows {
  compareToYesterday: boolean;
  compareToLast7Days: boolean;
  compareToSameWeekdayLastWeek: boolean;
}

export interface GrowthAgentChannels {
  shopify: boolean;
  metaAds: boolean;
  instagram: boolean;
  facebook: boolean;
  tiktok: boolean;
  googleAnalytics: boolean;
}

export interface GrowthAgentNotifications {
  email: boolean;
  inApp: boolean;
  slack: boolean;
  webhook: boolean;
}

export interface GrowthAgentGuardrails {
  maxDailyAdBudget: number;
  maxSingleActionBudget: number;
  minConfidenceScore: number;
  requireInventoryAvailable: boolean;
  minimumInventoryThreshold: number;
  blockIfTrackingConfidenceLow: boolean;
  cooldownMinutesBetweenActions: number;
}

export interface GrowthAgentAllowedActions {
  sendAlert: boolean;
  createRecommendation: boolean;
  createCreativeBrief: boolean;
  draftOrganicPost: boolean;
  publishOrganicPost: boolean;
  createAdCampaignDraft: boolean;
  launchAdCampaign: boolean;
  scaleExistingCampaign: boolean;
  pauseCampaign: boolean;
}

export interface GrowthAgentApprovalRules {
  requireApprovalAboveBudget: number;
  requireApprovalForCampaignLaunch: boolean;
  requireApprovalForScaling: boolean;
  requireApprovalForPublishingPost: boolean;
}

export interface GrowthAgentProductResearchSettings {
  enabled: boolean;
  sourceUrls: string;
  nicheKeywords: string;
  maxRecommendations: number;
}

export interface GrowthAgentSettings {
  agentEnabled: boolean;
  agentMode: GrowthAgentMode;
  checkFrequencyMinutes: number;
  thresholds: GrowthAgentThresholds;
  comparisonWindows: GrowthAgentComparisonWindows;
  channels: GrowthAgentChannels;
  notifications: GrowthAgentNotifications;
  guardrails: GrowthAgentGuardrails;
  allowedActions: GrowthAgentAllowedActions;
  approvalRules: GrowthAgentApprovalRules;
  productResearch: GrowthAgentProductResearchSettings;
}

export interface GrowthMetricValue {
  current: number;
  previousDayDelta: number;
  last7DaysDelta: number;
  status: GrowthMetricStatus;
  confidence: number;
}

export interface GrowthTrafficChannel {
  channel: string;
  sessions: number;
  revenue: number;
  delta: number;
  confidence: number;
  status: GrowthMetricStatus;
}

export interface GrowthMonitoringCard {
  key: string;
  label: string;
  unit: "number" | "currency" | "percent";
  data: GrowthMetricValue;
}

export interface GrowthFinding {
  id: string;
  findingType: string;
  severity: GrowthFindingSeverity;
  metricName: string;
  summary: string;
  possibleCauses: string[];
  recommendedActions: string[];
  confidenceScore: number;
  timestamp: string;
  sourceData?: Record<string, unknown> | null;
}

export interface GrowthAction {
  id: string;
  actionType: GrowthActionType;
  status: GrowthActionStatus;
  title: string;
  reason: string;
  payload: Record<string, unknown>;
  estimatedImpact?: Record<string, unknown> | null;
  riskLevel: GrowthRiskLevel;
  confidenceScore: number;
  approvalRequired: boolean;
  approvedBy?: string | null;
  executedAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
}

export interface GrowthPlatformConnection {
  id: string;
  platform: GrowthPlatform;
  status: "connected" | "not_connected" | "degraded" | "stub" | "needs_oauth";
  config?: Record<string, unknown> | null;
  healthMessage?: string | null;
  tokenLastFour?: string | null;
  lastSyncAt?: string | null;
}

export interface GrowthMetricSnapshot {
  id: string;
  source: string;
  bucketedAt: string;
  metrics: Record<string, unknown>;
  confidenceScore?: number | null;
}

export interface GrowthProductRecommendation {
  id: string;
  title: string;
  sourceUrl: string;
  sourceDomain: string;
  supplier?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  score: number;
  summary: string;
  matchedKeywords: string[];
  importedProductId?: string | null;
  importedAt?: string | null;
}

export interface AmazonSupplierProductMapping {
  recommendationId: string;
  recommendationTitle: string;
  shopifyProductTitle?: string | null;
  shopifyProductId?: string | null;
  amazonAsin?: string | null;
  supplierUrl: string;
  notes?: string | null;
  sourceDomain?: string | null;
  updatedAt: string;
}

export interface AmazonSupplierOrderDraft {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName?: string | null;
  lineItemId: string;
  lineItemTitle: string;
  quantity: number;
  recommendationId: string;
  recommendationTitle: string;
  amazonAsin?: string | null;
  supplierUrl: string;
  notes?: string | null;
  status: "draft" | "approved";
  createdAt: string;
  approvedAt?: string | null;
}

export interface AmazonSupplierOrderCandidate {
  orderId: string;
  orderNumber: string;
  customerName?: string | null;
  customerEmail?: string | null;
  createdAt: string;
  fulfillmentStatus?: string | null;
  financialStatus?: string | null;
  lineItems: Array<{
    id: string;
    title: string;
    quantity: number;
    productId?: string | null;
    productTitle?: string | null;
  }>;
}

export interface AmazonSupplierOrdersWorkspace {
  recommendations: GrowthProductRecommendation[];
  mappings: AmazonSupplierProductMapping[];
  drafts: AmazonSupplierOrderDraft[];
  recentOrders: AmazonSupplierOrderCandidate[];
}

export interface GrowthDataProvenance {
  storeId: string;
  storeName: string;
  storeDomain: string;
  reportingLabel: string;
  reportingWindow: string;
  comparisonLabel: string;
  comparisonWindow: string | null;
  ordersAnalyzed: number;
  productsAnalyzed: number;
  snapshotCount: number;
  connectionCount: number;
  lastSnapshotSource: string | null;
}

export interface GrowthOverviewPayload {
  status: "active" | "paused";
  lastSyncTime?: string | null;
  currentMode: GrowthAgentMode;
  connectedPlatforms: GrowthPlatformConnection[];
  activeRulesCount: number;
  alertsLast7Days: number;
  recentActionsTaken: number;
  topDetectedIssues: GrowthFinding[];
  monitoringCards: GrowthMonitoringCard[];
  trafficChannels: GrowthTrafficChannel[];
  findings: GrowthFinding[];
  actions: GrowthAction[];
  productRecommendations: GrowthProductRecommendation[];
  provenance: GrowthDataProvenance;
}


