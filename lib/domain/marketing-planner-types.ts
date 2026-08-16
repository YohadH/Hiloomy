export type MarketingBrand = "Incense" | "After";
export type MarketingPlannerMode = "heuristic" | "ai";
export type RecommendationImpact = "High" | "Med" | "Low";
export type MarketingPlannerDirection = "rtl" | "ltr";
export type MarketingPlannerLocale = "he" | "en" | "mixed";
export type MarketingPlannerFocus = "site" | "influencers" | "paid_ads" | "retention" | "balanced";
export type MarketingPlannerExecutionMode = "recommend_only" | "allow_create";
export type MarketingPlannerDiscountSeverity = "high" | "med" | "low";
export type MarketingPlannerDiscountValueType = "percent" | "fixed";
export type MarketingPlannerCustomerVoiceSentiment = "positive" | "negative";
export type MarketingPlannerInfluencerActionImpact = "High" | "Med" | "Low";
export type MarketingPlannerDataReadinessStatus = "ready" | "warning" | "missing";
export type MarketingPlannerDataReadinessSourceId =
  | "shopify_previous_month"
  | "affiliate_portal"
  | "meta_ads"
  | "instagram_brand"
  | "instagram_affiliates"
  | "flashy_reviews";

export interface MarketingPlannerRequest {
  brand: MarketingBrand;
  planningMonth: string;
  briefText: string;
  storeId?: string | null;
  focusChannels?: string | null;
  focusMode?: MarketingPlannerFocus | null;
  /** Additional secondary focus channels; comma-separated or array of MarketingPlannerFocus values */
  secondaryFocusModes?: string | null;
  executionMode?: MarketingPlannerExecutionMode | null;
  sourceFileName?: string | null;
}

export interface MarketingCampaign {
  id: string;
  rowLabel: string;
  startDate: string;
  endDate: string;
  title: string;
  detailLines: string[];
  sourceExcerpt: string;
  couponCodes: string[];
  confidence: number;
}

export interface MarketingSpecialDay {
  date: string;
  label: string;
  source: "brief" | "calendar";
  category: "holiday" | "retail" | "seasonal" | "operational";
}

export interface MarketingRecommendation {
  impact: RecommendationImpact;
  recommendation: string;
  why: string;
  ganttPlacement: string;
  /** Short phrase explaining the data basis, e.g. "על סמך נתוני החודש הקודם" */
  dataSource?: string | null;
}

export interface MarketingPlannerStoreScope {
  storeId: string | null;
  storeName: string;
  storeDomain: string;
  connected: boolean;
}

export interface MarketingPlannerPreviousMonthBaseline {
  monthLabel: string;
  revenue: number;
  orders: number;
  averageOrderValue: number;
  discountRate: number;
  refundRate: number;
  returningCustomerRate: number;
  topProducts: string[];
  topDiscountCodes: string[];
  summaryLines: string[];
}

export interface MarketingPlannerDiscountDiagnostic {
  severity: MarketingPlannerDiscountSeverity;
  title: string;
  detail: string;
  relatedCodes: string[];
  ganttPlacement: string;
}

export interface MarketingPlannerDiscountProposal {
  id: string;
  title: string;
  code: string;
  rowLabel: string;
  startDate: string;
  endDate: string;
  valueType: MarketingPlannerDiscountValueType | null;
  value: number | null;
  summary: string;
  appliesOncePerCustomer: boolean;
  combinePolicy: {
    productDiscounts: boolean;
    orderDiscounts: boolean;
    shippingDiscounts: boolean;
  };
  canCreate: boolean;
  alreadyExists: boolean;
  createDisabledReason?: string | null;
}

export interface MarketingPlannerCustomerVoiceTopic {
  key: string;
  label: string;
  sentiment: MarketingPlannerCustomerVoiceSentiment;
  mentions: number;
  summary: string;
}

export interface MarketingPlannerCustomerVoiceProduct {
  shopifyProductId: string;
  title: string;
  sampleReviewCount: number;
  averageRating: number | null;
}

export interface MarketingPlannerCustomerVoice {
  source: "flashy";
  accountId: string;
  sampledReviews: number;
  sampledProducts: number;
  averageRating: number | null;
  verifiedShare: number;
  positiveTopics: MarketingPlannerCustomerVoiceTopic[];
  negativeTopics: MarketingPlannerCustomerVoiceTopic[];
  topProducts: MarketingPlannerCustomerVoiceProduct[];
  summaryLines: string[];
}

export interface MarketingPlannerInfluencerCreator {
  id: string;
  name: string;
  affiliateCode: string;
  couponCode?: string | null;
  status: string;
  clicks: number;
  orders: number;
  sales: number;
  commission: number;
  conversionRate: number | null;
  score: number;
  role: "scale" | "test" | "watch";
  reason: string;
}

export interface MarketingPlannerInfluencerContent {
  id: string;
  creatorName: string;
  platform: string;
  title: string;
  contentType: string;
  postedAt: string;
  views: number;
  likes: number;
  comments: number;
  clicks: number;
  orders: number;
  sales: number;
}

export interface MarketingPlannerInstagramCrawlProfile {
  username: string;
  profileUrl: string;
  role: "brand" | "creator";
  affiliateName?: string | null;
  postsScanned: number;
  postsFound: number;
  postsSaved: number;
  postsUpdated: number;
  postsSkippedUnrelated: number;
  postsStored: number;
  lastPostAt?: string | null;
  lastCrawledAt?: string | null;
  status: "stored" | "scanned" | "handle_saved" | "missing";
  note: string;
}

export interface MarketingPlannerInstagramCrawlPost {
  id: string;
  username: string;
  creatorName: string;
  role: "brand" | "creator";
  permalink?: string | null;
  mediaType: string;
  postedAt: string;
  views: number;
  likes: number;
  comments: number;
  captionPreview: string;
}

export interface MarketingPlannerInstagramCrawlEvidence {
  source: "instagram_public";
  lastRunAt: string | null;
  lastRunStatus: string | null;
  profilesRequested: number;
  profilesCrawled: number;
  postsSaved: number;
  postsUpdated: number;
  brandProfile: MarketingPlannerInstagramCrawlProfile | null;
  affiliateProfiles: MarketingPlannerInstagramCrawlProfile[];
  recentPosts: MarketingPlannerInstagramCrawlPost[];
  warnings: string[];
}

export interface MarketingPlannerInfluencerAction {
  impact: MarketingPlannerInfluencerActionImpact;
  action: string;
  why: string;
  ganttPlacement: string;
}

export interface MarketingPlannerInfluencerIntelligence {
  source: "affiliate_portal";
  brandInstagramUrl: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  totalCreators: number;
  activeCreators: number;
  creatorsWithSales: number;
  creatorsWithClicks: number;
  totalSales: number;
  totalOrders: number;
  totalClicks: number;
  topCreators: MarketingPlannerInfluencerCreator[];
  trafficCreators: MarketingPlannerInfluencerCreator[];
  watchCreators: MarketingPlannerInfluencerCreator[];
  contentWinners: MarketingPlannerInfluencerContent[];
  instagramCrawl: MarketingPlannerInstagramCrawlEvidence;
  suggestedActions: MarketingPlannerInfluencerAction[];
  summaryLines: string[];
  dataWarnings: string[];
}

export interface MarketingPlannerMetaAdsCampaign {
  id: string;
  campaignId: string;
  campaignName: string;
  adsetId?: string | null;
  adsetName?: string | null;
  adId?: string | null;
  adName?: string | null;
  creativeId?: string | null;
  creativeName?: string | null;
  creativeTitle?: string | null;
  creativeBody?: string | null;
  creativeThumbnailUrl?: string | null;
  creativePreviewUrl?: string | null;
  creativePermalinkUrl?: string | null;
  creativeObjectUrl?: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchaseRoas: number | null;
  dateStart: string;
  dateStop: string;
}

export interface MarketingPlannerMetaAds {
  source: "meta_ads";
  adAccountId: string;
  adAccountName?: string | null;
  currency?: string | null;
  timezoneName?: string | null;
  lastSyncAt?: string | null;
  dateStart: string;
  dateStop: string;
  totalSpend: number;
  totalPurchases: number;
  totalClicks: number;
  averagePurchaseRoas: number | null;
  topCampaigns: MarketingPlannerMetaAdsCampaign[];
  watchCampaigns: MarketingPlannerMetaAdsCampaign[];
  topCreatives: MarketingPlannerMetaAdsCampaign[];
  dailyBreakdown: MarketingPlannerMetaAdsCampaign[];
  campaigns: MarketingPlannerMetaAdsCampaign[];
  summaryLines: string[];
  dataWarnings: string[];
}

export interface MarketingPlannerDataReadinessSource {
  id: MarketingPlannerDataReadinessSourceId;
  label: string;
  status: MarketingPlannerDataReadinessStatus;
  headline: string;
  details: string[];
  lastUpdatedAt?: string | null;
  metrics: Record<string, number | string | null>;
}

export interface MarketingPlannerDataReadiness {
  ok: true;
  storeScope: MarketingPlannerStoreScope;
  planningMonth: string;
  generatedAt: string;
  refreshed: boolean;
  sources: MarketingPlannerDataReadinessSource[];
  summaryLines: string[];
  warnings: string[];
}

export interface MarketingPlannerInsights {
  briefSummary: string[];
  calendarCheck: string[];
  liveTrends: string[];
  issues: string[];
  recommendations: MarketingRecommendation[];
  openQuestions: string[];
}

export interface MarketingPlannerResult {
  ok: true;
  brand: MarketingBrand;
  planningMonth: string;
  sheetName: string;
  fileName: string;
  workbookBase64: string;
  workbookMimeType: string;
  parserMode: MarketingPlannerMode;
  contentDirection: MarketingPlannerDirection;
  contentLocale: MarketingPlannerLocale;
  plannerFocus: MarketingPlannerFocus;
  /** Secondary focus channels that were active during generation */
  plannerSecondaryFocuses?: MarketingPlannerFocus[] | null;
  executionMode: MarketingPlannerExecutionMode;
  storeScope: MarketingPlannerStoreScope;
  previousMonthBaseline: MarketingPlannerPreviousMonthBaseline | null;
  customerVoice: MarketingPlannerCustomerVoice | null;
  influencerIntelligence: MarketingPlannerInfluencerIntelligence | null;
  metaAds: MarketingPlannerMetaAds | null;
  discountDiagnostics: MarketingPlannerDiscountDiagnostic[];
  discountProposals: MarketingPlannerDiscountProposal[];
  campaigns: MarketingCampaign[];
  specialDays: MarketingSpecialDay[];
  insights: MarketingPlannerInsights;
  unplacedItems: string[];
  rowLabels: string[];
  extractedBriefText: string;
  sourceFileName?: string | null;
}
