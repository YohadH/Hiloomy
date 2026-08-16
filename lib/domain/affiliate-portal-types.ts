export type AffiliateStatus = "approved" | "pending" | "denied";
export type ProgramStatus = "active" | "draft";
export type ConversionStatus = "approved" | "pending" | "denied";
export type CouponStatus = "active" | "inactive";
export type CouponAssignmentMode = "single" | "bulk";
export type CouponConnectionSource = "shopify_create" | "existing_coupon";

export interface AffiliateProgram {
  id: string;
  name: string;
  status: ProgramStatus;
  defaultCommissionRate: number;
  affiliates: number;
  orders: number;
  sales: number;
  signUpLink: string;
  checklist: { id: string; title: string; done: boolean; group: string }[];
}

export interface AffiliateProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  programName: string;
  status: AffiliateStatus;
  dateJoined: string;
  lastLogin?: string | null;
  source: string;
  country: string;
  clicks: number;
  orders: number;
  sales: number;
  commission: number;
  approvedBalance: number;
  affiliateCode: string;
  couponCode?: string | null;
  instagramUsername?: string | null;
  instagramProfileUrl?: string | null;
  referralLink: string;
  shortLink: string;
}

export interface AffiliateCoupon {
  id: string;
  code: string;
  affiliateId: string;
  affiliateName: string;
  status: CouponStatus;
  template: string;
  note?: string | null;
  createdAt: string;
  discountLabel: string;
  applyLink: string;
  assignmentMode: CouponAssignmentMode;
  connectionSource: CouponConnectionSource;
}

export interface AffiliateCouponHistoryItem {
  id: string;
  affiliateId: string;
  affiliateName: string;
  couponId?: string | null;
  code: string;
  couponTitle: string;
  discountLabel: string;
  applyLink: string;
  assignmentMode: CouponAssignmentMode;
  connectionSource: CouponConnectionSource;
  connectedAt: string;
}

export interface AffiliateConversion {
  id: string;
  orderNumber: string;
  date: string;
  affiliateId: string;
  affiliateName: string;
  // The affiliate's external ID from BixGrow (e.g. "mrMyBNq8Hm").
  // Stored on AffiliateMember.affiliateCode and surfaced here so the
  // conversions table can show the merchant the same ID they see in
  // BixGrow, making cross-reference trivial.
  affiliateCode?: string | null;
  total: number;
  commission: number;
  status: ConversionStatus;
  trackingBy: string;
  sourceUrl: string;
  contentTitle?: string | null;
  couponCode?: string | null;
}

export interface AffiliatePayout {
  id: string;
  affiliateId: string;
  affiliateName: string;
  paymentMethod: string;
  approvedOrders: number;
  approvedBalance: number;
}

export interface AffiliateContentPerformance {
  id: string;
  affiliateId: string;
  affiliateName: string;
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

export interface PortalTrendPoint {
  date: string;
  sales: number;
  clicks: number;
  orders: number;
}

export interface AffiliatePortalSettings {
  portalLanguage: string;
  brandingName: string;
  storeDomain: string;
  senderName: string;
  senderEmail: string;
  inviteAutomationEnabled: boolean;
  referralOrderEmailEnabled: boolean;
  couponAssignmentEnabled: boolean;
  advanced: {
    collectTaxForms: boolean;
    trackPendingOrders: boolean;
    webhookReady: boolean;
  };
}

export interface AffiliatePortalDashboardPayload {
  scope: {
    id: "bixgrow" | "all_affiliates";
    label: string;
    description: string;
  };
  program: AffiliateProgram;
  totals: {
    totalSales: number;
    totalOrders: number;
    totalClicks: number;
    totalAffiliates: number;
    totalCommission: number;
  };
  trend: PortalTrendPoint[];
  topAffiliatesBySales: AffiliateProfile[];
  topAffiliatesByClicks: AffiliateProfile[];
  topProducts: { name: string; sales: number }[];
  topReferralSources: { label: string; clicks: number }[];
  contentHighlights: AffiliateContentPerformance[];
}
