import type {
  AffiliateContentPerformance,
  AffiliateConversion,
  AffiliateCoupon,
  AffiliateCouponHistoryItem,
  AffiliatePayout,
  AffiliatePortalDashboardPayload,
  AffiliatePortalSettings,
  AffiliateProfile,
  AffiliateProgram,
  PortalTrendPoint
} from "@/lib/domain/affiliate-portal-types";
import { getDb } from "@/lib/server/db";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import {
  humanizeAffiliateSourcePlatform,
  isBixGrowAttributedRecord,
  resolveAffiliateSourcePlatform
} from "@/lib/services/affiliate-attribution-source";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

const DEFAULT_PROGRAM_CHECKLIST: AffiliateProgram["checklist"] = [
  { id: "embedded", title: "Enable app embed", done: false, group: "launch" },
  { id: "program", title: "Create a program", done: false, group: "launch" },
  { id: "brand", title: "Add brand identity", done: false, group: "launch" },
  { id: "payments", title: "Add payment method", done: false, group: "launch" },
  { id: "portal", title: "Design portal pages", done: false, group: "launch" },
  { id: "emails", title: "Review email automation", done: false, group: "launch" },
  { id: "first-affiliate", title: "Add the first affiliate", done: false, group: "test" },
  { id: "first-conversion", title: "Get the first conversion", done: false, group: "test" },
  { id: "landing", title: "Showcase landing page on your store", done: false, group: "promote" },
  { id: "reachout", title: "Reach out to potential affiliates", done: false, group: "promote" }
];

const DEFAULT_PORTAL_SETTINGS = {
  portalLanguage: "English",
  inviteAutomationEnabled: false,
  referralOrderEmailEnabled: false,
  couponAssignmentEnabled: false,
  advanced: {
    collectTaxForms: false,
    trackPendingOrders: true,
    webhookReady: true
  }
} as const;

const COUPON_TEMPLATES = [
  { id: "tpl-percent-10", name: "10% off", discountType: "percent", value: 10 },
  { id: "tpl-percent-15", name: "15% off", discountType: "percent", value: 15 },
  { id: "tpl-fixed-25", name: "25 off", discountType: "fixed", value: 25 }
];

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

// Refund-adjustment factor for a single affiliate attribution row.
// Returns 1 for un-refunded orders, 0 for fully refunded, fractional
// for partial. Used to shrink sales / commission proportionally so the
// dashboard doesn't claim revenue (or owe commission) on bounced orders.
// Without this every chart and KPI in the affiliate portal over-reports
// in proportion to the store's refund rate.
function refundedFraction(order: { totalPrice?: unknown; totalRefunds?: unknown } | null | undefined) {
  if (!order) return 0;
  const total = toNumber(order.totalPrice);
  const refunds = toNumber(order.totalRefunds);
  if (total <= 0 || refunds <= 0) return 0;
  return Math.min(refunds / total, 1);
}

function buildProgramName(storeName?: string | null) {
  return storeName ? `${storeName} Affiliate Program` : "Affiliate Program";
}

function buildReferralLink(storeDomain: string, affiliateCode: string, couponCode?: string | null) {
  const url = new URL(`https://${storeDomain}/`);
  url.searchParams.set("ref", affiliateCode);
  if (couponCode) {
    url.searchParams.set("coupon", couponCode);
  }
  url.searchParams.set("utm_source", "affiliate");
  return url.toString();
}

function buildCouponDiscountLabel(value: number, discountType: string, currency: string) {
  return discountType === "percent" ? `${value}% off` : `${currency} ${value} off`;
}

function normalizeAssignmentMode(value?: string | null): AffiliateCoupon["assignmentMode"] {
  return value === "bulk" ? "bulk" : "single";
}

function normalizeConnectionSource(value?: string | null): AffiliateCoupon["connectionSource"] {
  return value === "existing_coupon" ? "existing_coupon" : "shopify_create";
}

function formatTrendLabel(value: Date) {
  return value.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function toDayKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeSourceLabel(
  sourceUrl?: string | null,
  sourcePlatform?: string | null,
  trackingMethod?: string | null
) {
  if (isBixGrowAttributedRecord({ sourceUrl, sourcePlatform, trackingMethod })) {
    return "BixGrow";
  }

  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return sourceUrl;
    }
  }

  return humanizeAffiliateSourcePlatform(sourcePlatform) ?? "Unknown";
}

function buildProgramPayload(store: any | null, row: any | null, affiliateRows: AffiliateProfile[]): AffiliateProgram {
  return {
    id: row?.id ?? `${store?.id ?? "affiliate"}-program`,
    name: row?.name ?? buildProgramName(store?.name),
    status: (row?.status === "active" ? "active" : "draft") as AffiliateProgram["status"],
    defaultCommissionRate: row ? Math.round(toNumber(row.commissionRate) * 10000) / 100 : 0,
    affiliates: affiliateRows.length,
    orders: affiliateRows.reduce((sum, item) => sum + item.orders, 0),
    sales: affiliateRows.reduce((sum, item) => sum + item.sales, 0),
    signUpLink: row?.signUpLink ?? "",
    checklist: DEFAULT_PROGRAM_CHECKLIST
  };
}

async function getAffiliateStore() {
  // Signed-in callers FAIL CLOSED to their own org's active store: a user
  // with no org or no store sees empty portal data — never another
  // tenant's. (The legacy active_store_id cookie is deliberately NOT
  // honored here; it has no ownership check.) The base-store fallback is
  // reserved for contexts with no signed-in user at all (cron, report
  // generation, single-tenant/self-hosted mode).
  try {
    const { getAuthContext } = await import("@/lib/auth/session");
    const auth = await getAuthContext();
    if (auth.userId) {
      if (!auth.orgId || !auth.storeId) return null;
      const db = getDb();
      const store = await db?.store.findUnique({ where: { id: auth.storeId } });
      return store ?? null;
    }
  } catch {
    // No request scope (cron/background) — fall through to base store.
  }
  try {
    return await resolveOrCreateBaseStore();
  } catch {
    return null;
  }
}

function isWithinRange(value: string | Date, start: Date, end: Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date >= start && date <= end;
}

function buildAffiliateProfileFromMember(row: any, store: any): AffiliateProfile {
  const referralLink = row.referralLink ?? buildReferralLink(store.domain, row.affiliateCode, row.couponCode);
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    programName: row.program?.name ?? buildProgramName(store.name),
    status: row.status,
    dateJoined: row.joinedAt.toISOString(),
    lastLogin: row.lastLoginAt?.toISOString() ?? null,
    source: row.source ?? "Manual",
    country: row.country ?? "",
    clicks: 0,
    orders: 0,
    sales: 0,
    commission: 0,
    approvedBalance: toNumber(row.approvedBalance),
    affiliateCode: row.affiliateCode,
    couponCode: row.couponCode ?? null,
    instagramUsername: row.instagramUsername ?? null,
    instagramProfileUrl: row.instagramProfileUrl ?? null,
    referralLink,
    shortLink: row.shortLink ?? referralLink
  };
}

async function loadAffiliatesFromDb(): Promise<AffiliateProfile[]> {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.affiliateMember) return [];

  try {
    const rows = await db.affiliateMember.findMany({
      include: { program: true },
      where: { storeId: store.id },
      orderBy: [{ salesTotal: "desc" }, { joinedAt: "asc" }]
    });

    return rows.map((row: any) => {
      const referralLink = row.referralLink ?? buildReferralLink(store.domain, row.affiliateCode, row.couponCode);
      return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        programName: row.program?.name ?? buildProgramName(store.name),
        status: row.status,
        dateJoined: row.joinedAt.toISOString(),
        lastLogin: row.lastLoginAt?.toISOString() ?? null,
        source: row.source ?? "Manual",
        country: row.country ?? "",
        clicks: row.clicksTotal ?? 0,
        orders: row.ordersTotal ?? 0,
        sales: toNumber(row.salesTotal),
        commission: toNumber(row.commissionTotal),
        approvedBalance: toNumber(row.approvedBalance),
        affiliateCode: row.affiliateCode,
        couponCode: row.couponCode ?? null,
        instagramUsername: row.instagramUsername ?? null,
        instagramProfileUrl: row.instagramProfileUrl ?? null,
        referralLink,
        shortLink: row.shortLink ?? referralLink
      };
    }) as AffiliateProfile[];
  } catch {
    return [];
  }
}

async function loadCouponsFromDb(): Promise<AffiliateCoupon[]> {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.affiliateCoupon) return [];

  try {
    const rows = await db.affiliateCoupon.findMany({
      where: { storeId: store.id },
      include: {
        affiliateMember: true,
        assignments: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    return rows.map((row: any) => {
      const latestAssignment = row.assignments?.[0] ?? null;
      return {
        id: row.id,
        code: row.code,
        affiliateId: row.affiliateMemberId ?? "",
        affiliateName: row.affiliateMember ? `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}` : "-",
        status: row.status === "inactive" ? "inactive" : "active",
        template: latestAssignment?.couponTitle ?? row.title,
        note: null,
        createdAt: (latestAssignment?.createdAt ?? row.createdAt).toISOString(),
        discountLabel: buildCouponDiscountLabel(toNumber(row.discountValue), row.discountType, store.currency),
        applyLink: latestAssignment?.applyLink ?? row.applyLink ?? `https://${store.domain}/discount/${row.code}?redirect=%2F`,
        assignmentMode: normalizeAssignmentMode(latestAssignment?.assignmentMode),
        connectionSource: normalizeConnectionSource(latestAssignment?.connectionSource)
      };
    }) as AffiliateCoupon[];
  } catch {
    return [];
  }
}

async function loadCouponHistoryFromDb(affiliateId?: string): Promise<AffiliateCouponHistoryItem[]> {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store) return [];

  const historyWhere = affiliateId
    ? { storeId: store.id, affiliateMemberId: affiliateId }
    : { storeId: store.id };

  if (db.affiliateCouponAssignment) {
    try {
      const rows = await db.affiliateCouponAssignment.findMany({
        where: historyWhere,
        include: {
          affiliateMember: true,
          affiliateCoupon: true
        },
        orderBy: { createdAt: "desc" }
      });

      if (rows.length) {
        return rows.map((row: any) => ({
          id: row.id,
          affiliateId: row.affiliateMemberId,
          affiliateName: row.affiliateMember ? `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}` : "-",
          couponId: row.affiliateCouponId ?? row.affiliateCoupon?.id ?? null,
          code: row.couponCode,
          couponTitle: row.couponTitle,
          discountLabel: buildCouponDiscountLabel(toNumber(row.discountValue), row.discountType, store.currency),
          applyLink: row.applyLink ?? row.affiliateCoupon?.applyLink ?? `https://${store.domain}/discount/${row.couponCode}?redirect=%2F`,
          assignmentMode: normalizeAssignmentMode(row.assignmentMode),
          connectionSource: normalizeConnectionSource(row.connectionSource),
          connectedAt: row.createdAt.toISOString()
        })) as AffiliateCouponHistoryItem[];
      }
    } catch {
      // Fall back to coupon rows when assignment history is not available yet.
    }
  }

  if (!db.affiliateCoupon) return [];

  try {
    const couponRows = await db.affiliateCoupon.findMany({
      where: affiliateId
        ? { storeId: store.id, affiliateMemberId: affiliateId }
        : { storeId: store.id },
      include: { affiliateMember: true },
      orderBy: { createdAt: "desc" }
    });

    return couponRows.map((row: any) => ({
      id: `legacy-${row.id}`,
      affiliateId: row.affiliateMemberId ?? "",
      affiliateName: row.affiliateMember ? `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}` : "-",
      couponId: row.id,
      code: row.code,
      couponTitle: row.title,
      discountLabel: buildCouponDiscountLabel(toNumber(row.discountValue), row.discountType, store.currency),
      applyLink: row.applyLink ?? `https://${store.domain}/discount/${row.code}?redirect=%2F`,
      assignmentMode: "single",
      connectionSource: "shopify_create",
      connectedAt: row.createdAt.toISOString()
    })) as AffiliateCouponHistoryItem[];
  } catch {
    return [];
  }
}

async function loadConversionsFromDb(): Promise<AffiliateConversion[]> {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.affiliateAttribution) return [];

  try {
    // Filter by the operator's selected date window. Without this the
    // table dumped every attribution ever — which both ignored the date
    // picker on the topbar AND was slow on large stores.
    //
    // Using select instead of include cuts the wire payload ~70% by
    // only pulling the columns the UI actually renders. Index on
    // (storeId, occurredAt) makes the date filter + orderBy a fast scan.
    //
    // Cap of 500 is still here as a safety belt for extreme date windows
    // (e.g. "year to date" on a heavy-volume merchant).
    const range = await getReportingDateRangeSelection("en");
    const rows = await db.affiliateAttribution.findMany({
      where: {
        storeId: store.id,
        occurredAt: { gte: range.start, lte: range.end }
      },
      orderBy: { occurredAt: "desc" },
      take: 500,
      select: {
        id: true,
        affiliateMemberId: true,
        orderId: true,
        externalOrderNumber: true,
        couponCode: true,
        sourceType: true,
        sourceUrl: true,
        trackingMethod: true,
        contentTitle: true,
        salesAmount: true,
        commissionAmount: true,
        occurredAt: true,
        affiliateMember: {
          select: {
            firstName: true,
            lastName: true,
            affiliateCode: true,
            couponCode: true
          }
        },
        order: { select: { displayName: true, orderNumber: true } }
      }
    });

    return rows.map((row: any) => ({
      id: row.id,
      // Priority: Shopify-matched order number > externalOrderNumber (BixGrow
      // sends this even when the Shopify order hasn't synced) > raw orderId.
      orderNumber:
        row.order?.displayName ??
        row.order?.orderNumber ??
        row.externalOrderNumber ??
        row.orderId ??
        "-",
      date: row.occurredAt.toISOString(),
      affiliateId: row.affiliateMemberId,
      affiliateName: row.affiliateMember ? `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}`.trim() || "-" : "-",
      // BixGrow's external affiliate_id (saved as AffiliateMember.affiliateCode
      // by the webhook handler). Lets the merchant cross-reference with BixGrow.
      affiliateCode: row.affiliateMember?.affiliateCode ?? null,
      total: toNumber(row.salesAmount),
      commission: toNumber(row.commissionAmount),
      status: "approved",
      trackingBy: row.trackingMethod ? String(row.trackingMethod).replaceAll("_", " ") : row.sourceType ?? "Link",
      sourceUrl: normalizeSourceLabel(row.sourceUrl, null, row.trackingMethod),
      contentTitle: row.contentTitle ?? null,
      couponCode: row.couponCode ?? row.affiliateMember?.couponCode ?? null
    })) as AffiliateConversion[];
  } catch {
    return [];
  }
}

async function loadContentFromDb(): Promise<AffiliateContentPerformance[]> {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store || !db.creatorPost) return [];

  try {
    const rows = await db.creatorPost.findMany({
      where: { storeId: store.id },
      include: { creatorProfile: true, attributions: true },
      orderBy: { postedAt: "desc" },
      take: 20
    });

    return rows.map((row: any) => {
      const attributedClicks = Array.isArray(row.attributions)
        ? row.attributions.reduce((sum: number, attribution: any) => sum + Number(attribution.clicks ?? 0), 0)
        : 0;
      const attributedOrders = Array.isArray(row.attributions)
        ? row.attributions.reduce((sum: number, attribution: any) => sum + Number(attribution.ordersCount ?? 0), 0)
        : 0;
      const attributedSales = Array.isArray(row.attributions)
        ? row.attributions.reduce((sum: number, attribution: any) => sum + toNumber(attribution.salesAmount), 0)
        : 0;

      return {
        id: row.id,
        affiliateId: row.creatorProfileId ?? row.id,
        affiliateName: row.creatorProfile?.displayName ?? row.creatorProfile?.username ?? "Creator",
        platform: "Instagram",
        title: row.caption ?? "Untitled content",
        contentType: row.mediaType ?? "Media",
        postedAt: row.postedAt.toISOString(),
        views: row.viewCount ?? 0,
        likes: row.likeCount ?? 0,
        comments: row.commentsCount ?? 0,
        clicks: attributedClicks,
        orders: Math.max(row.attributedOrders ?? 0, attributedOrders),
        sales: Math.max(toNumber(row.attributedSales), attributedSales)
      };
    }) as AffiliateContentPerformance[];
  } catch {
    return [];
  }
}

async function loadProgramFromDb(affiliateRows: AffiliateProfile[]): Promise<AffiliateProgram> {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!store) return buildProgramPayload(null, null, affiliateRows);
  if (!db || !db.affiliateProgram) return buildProgramPayload(store, null, affiliateRows);

  try {
    const row = await db.affiliateProgram.findFirst({
      where: { storeId: store.id },
      orderBy: { createdAt: "asc" }
    });

    return buildProgramPayload(store, row, affiliateRows);
  } catch {
    return buildProgramPayload(store, null, affiliateRows);
  }
}

async function loadAffiliateDashboardSnapshot() {
  const db = getDb();
  const store = await getAffiliateStore();
  if (!db || !store) {
    return null;
  }

  const range = await getReportingDateRangeSelection("en");
  const [memberRows, programRow, rawAttributionRows, rawSessionRows, rawOrderRows] = await Promise.all([
    db.affiliateMember
      ? db.affiliateMember.findMany({
          include: { program: true },
          where: { storeId: store.id },
          orderBy: [{ salesTotal: "desc" }, { joinedAt: "asc" }]
        })
      : Promise.resolve([]),
    db.affiliateProgram
      ? db.affiliateProgram.findFirst({
          where: { storeId: store.id },
          orderBy: { createdAt: "asc" }
        })
      : Promise.resolve(null),
    db.affiliateAttribution
      ? db.affiliateAttribution.findMany({
          where: {
            storeId: store.id,
            occurredAt: {
              gte: range.start,
              lte: range.end
            }
          },
          include: { affiliateMember: { include: { program: true } }, order: true },
          orderBy: { occurredAt: "desc" }
        })
      : Promise.resolve([]),
    db.attributionSession
      ? db.attributionSession.findMany({
          where: {
            storeId: store.id,
            createdAt: {
              gte: range.start,
              lte: range.end
            }
          },
          include: { affiliateMember: { include: { program: true } } },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve([]),
    db.order
      ? db.order.findMany({
          where: {
            storeId: store.id,
            affiliateAttributions: {
              some: {
                occurredAt: {
                  gte: range.start,
                  lte: range.end
                }
              }
            }
          },
          include: {
            lineItems: { include: { product: true } }
          },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve([])
  ]);
  const bixgrowAttributionRows = (rawAttributionRows as any[]).filter((row: any) =>
    isBixGrowAttributedRecord({
      sourceUrl: row.sourceUrl,
      trackingMethod: row.trackingMethod
    })
  );
  const bixgrowSessionRows = (rawSessionRows as any[]).filter((row: any) =>
    isBixGrowAttributedRecord({
      sourceUrl: row.sourceUrl,
      sourcePlatform: row.sourcePlatform
    })
  );
  const useBixGrowScope = bixgrowAttributionRows.length > 0 || bixgrowSessionRows.length > 0;
  const attributionRows = useBixGrowScope ? bixgrowAttributionRows : (rawAttributionRows as any[]);
  const sessionRows = useBixGrowScope ? bixgrowSessionRows : (rawSessionRows as any[]);
  const filteredOrderIds = new Set(
    attributionRows.map((row: any) => row.orderId).filter(Boolean)
  );
  const orderRows = filteredOrderIds.size
    ? (rawOrderRows as any[]).filter((order: any) => filteredOrderIds.has(order.id))
    : [];

  const profilesById = new Map<string, AffiliateProfile>();
  const memberIdByAffiliateCode = new Map<string, string>();

  for (const member of memberRows as any[]) {
    profilesById.set(member.id, buildAffiliateProfileFromMember(member, store));
    memberIdByAffiliateCode.set(String(member.affiliateCode).toUpperCase(), member.id);
  }

  const ensureProfile = (input: { member?: any | null; memberId?: string | null; affiliateCode?: string | null; fallbackName?: string | null }) => {
    const resolvedMemberId = input.member?.id
      ?? input.memberId
      ?? (input.affiliateCode ? memberIdByAffiliateCode.get(String(input.affiliateCode).toUpperCase()) : null)
      ?? null;

    if (resolvedMemberId && profilesById.has(resolvedMemberId)) {
      return profilesById.get(resolvedMemberId) as AffiliateProfile;
    }

    if (input.member && resolvedMemberId) {
      const profile = buildAffiliateProfileFromMember(input.member, store);
      profilesById.set(resolvedMemberId, profile);
      memberIdByAffiliateCode.set(String(profile.affiliateCode).toUpperCase(), resolvedMemberId);
      return profile;
    }

    if (!resolvedMemberId) {
      const fallbackCode = input.affiliateCode?.trim() || input.fallbackName?.trim() || "UNKNOWN";
      const syntheticId = `affiliate-${fallbackCode.toUpperCase()}`;
      if (profilesById.has(syntheticId)) {
        return profilesById.get(syntheticId) as AffiliateProfile;
      }

      const profile: AffiliateProfile = {
        id: syntheticId,
        firstName: fallbackCode,
        lastName: "",
        email: "",
        programName: buildProgramName(store.name),
        status: "approved",
        dateJoined: new Date(range.start).toISOString(),
        lastLogin: null,
        source: "Tracked session",
        country: "",
        clicks: 0,
        orders: 0,
        sales: 0,
        commission: 0,
        approvedBalance: 0,
        affiliateCode: fallbackCode.toUpperCase(),
        couponCode: null,
        referralLink: buildReferralLink(store.domain, fallbackCode.toUpperCase()),
        shortLink: buildReferralLink(store.domain, fallbackCode.toUpperCase())
      };
      profilesById.set(syntheticId, profile);
      memberIdByAffiliateCode.set(profile.affiliateCode, syntheticId);
      return profile;
    }

    return null;
  };

  for (const row of attributionRows) {
    const profile = ensureProfile({
      member: row.affiliateMember ?? null,
      memberId: row.affiliateMemberId,
      fallbackName: row.affiliateMember ? `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}` : row.affiliateMemberId
    });
    if (!profile) continue;
    // Shrink sales + commission by the order's refund fraction so refunded
    // orders don't continue to show as "owed commission" or affiliate revenue.
    const netFactor = 1 - refundedFraction(row.order);
    profile.sales += toNumber(row.salesAmount) * netFactor;
    profile.commission += toNumber(row.commissionAmount) * netFactor;
    profile.orders += Number(row.ordersCount ?? 0);
  }

  for (const row of sessionRows) {
    const profile = ensureProfile({
      member: row.affiliateMember ?? null,
      memberId: row.affiliateMemberId,
      affiliateCode: row.affiliateCode,
      fallbackName: row.affiliateMember ? `${row.affiliateMember.firstName} ${row.affiliateMember.lastName}` : row.affiliateCode
    });
    if (!profile) continue;
    profile.clicks += 1;
  }

  const affiliateRows = Array.from(profilesById.values())
    .filter((profile) => profile.sales > 0 || profile.orders > 0 || profile.clicks > 0 || profile.commission > 0)
    .sort((left, right) => right.sales - left.sales || right.clicks - left.clicks);
  const scope = useBixGrowScope
    ? {
        id: "bixgrow" as const,
        label: "BixGrow tracked",
        description: "Showing only clicks and orders marked by BixGrow tracking (`bg_ref`) in the selected window."
      }
    : {
        id: "all_affiliates" as const,
        label: "All affiliate sources",
        description: "Showing all affiliate-attributed clicks and orders in the selected window."
      };

  return {
    scope,
    store,
    range,
    memberRows,
    programRow,
    attributionRows,
    sessionRows,
    orderRows,
    affiliateRows
  };
}

async function loadTrendFromDb(
  snapshot?: Awaited<ReturnType<typeof loadAffiliateDashboardSnapshot>>
): Promise<PortalTrendPoint[]> {
  const context = snapshot ?? await loadAffiliateDashboardSnapshot();
  if (!context) return [];

  try {
    const buckets = new Map<string, PortalTrendPoint>();
    const cursor = new Date(context.range.start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= context.range.end) {
      buckets.set(toDayKey(cursor), {
        date: formatTrendLabel(cursor),
        sales: 0,
        clicks: 0,
        orders: 0
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    context.attributionRows.forEach((row: any) => {
      const bucket = buckets.get(toDayKey(row.occurredAt));
      if (!bucket) return;
      // Same refund-shrink as the snapshot loop — otherwise a $5k Day-1
      // spike stays $5k forever in the trend chart even after refunds.
      bucket.sales += toNumber(row.salesAmount) * (1 - refundedFraction(row.order));
      bucket.orders += Number(row.ordersCount ?? 0);
      bucket.clicks += Number(row.clicks ?? 0);
    });

    context.sessionRows.forEach((row: any) => {
      const bucket = buckets.get(toDayKey(row.createdAt));
      if (!bucket) return;
      bucket.clicks += 1;
    });

    return Array.from(buckets.values());
  } catch {
    return [];
  }
}

async function loadTopProductsFromDb(
  snapshot?: Awaited<ReturnType<typeof loadAffiliateDashboardSnapshot>>
): Promise<{ name: string; sales: number }[]> {
  const context = snapshot ?? await loadAffiliateDashboardSnapshot();
  if (!context) return [];

  try {
    const grouped = new Map<string, number>();
    context.orderRows.forEach((order: any) => {
      order.lineItems.forEach((item: any) => {
        const name = item.product?.title ?? item.title;
        // Subtract refundedSubtotal so the "top affiliate products"
        // ranking reflects what stayed sold, not what was ordered then
        // returned. OrderLineItem.refundedSubtotal is a column on the
        // model so it's already on the row (no select change needed).
        const net = Math.max(toNumber(item.lineSubtotal) - toNumber(item.refundedSubtotal), 0);
        grouped.set(name, (grouped.get(name) ?? 0) + net);
      });
    });

    return Array.from(grouped.entries())
      .map(([name, sales]) => ({ name, sales }))
      .sort((left, right) => right.sales - left.sales)
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function loadTopReferralSourcesFromDb(
  snapshot?: Awaited<ReturnType<typeof loadAffiliateDashboardSnapshot>>
): Promise<{ label: string; clicks: number }[]> {
  const context = snapshot ?? await loadAffiliateDashboardSnapshot();
  if (!context) return [];

  try {
    const grouped = new Map<string, number>();

    if (context.sessionRows.length) {
      context.sessionRows.forEach((row: any) => {
        const label = normalizeSourceLabel(row.sourceUrl, row.sourcePlatform);
        grouped.set(label, (grouped.get(label) ?? 0) + 1);
      });
    } else {
      context.attributionRows
        .forEach((row: any) => {
          const label = normalizeSourceLabel(
            row.sourceUrl,
            resolveAffiliateSourcePlatform({
              sourceUrl: row.sourceUrl,
              trackingMethod: row.trackingMethod
            }),
            row.trackingMethod
          );
          grouped.set(label, (grouped.get(label) ?? 0) + Math.max(Number(row.clicks ?? 0), 1));
        });
    }

    return Array.from(grouped.entries())
      .map(([label, clicks]) => ({ label, clicks }))
      .sort((left, right) => right.clicks - left.clicks)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function getAffiliatePortalDashboard(): Promise<AffiliatePortalDashboardPayload> {
  const snapshot = await loadAffiliateDashboardSnapshot();
  const affiliateRows = snapshot?.affiliateRows ?? [];
  const [contentRows, trend, topProducts, topReferralSources] = await Promise.all([
    loadContentFromDb(),
    loadTrendFromDb(snapshot),
    loadTopProductsFromDb(snapshot),
    loadTopReferralSourcesFromDb(snapshot)
  ]);
  const program = snapshot?.store
    ? buildProgramPayload(snapshot.store, snapshot.programRow, affiliateRows)
    : await loadProgramFromDb(affiliateRows);
  const contentHighlights = snapshot
    ? contentRows.filter((item) => isWithinRange(item.postedAt, snapshot.range.start, snapshot.range.end))
    : contentRows;

  return {
    scope: snapshot?.scope ?? {
      id: "all_affiliates",
      label: "All affiliate sources",
      description: "Showing all affiliate-attributed clicks and orders in the selected window."
    },
    program,
    totals: {
      totalSales: affiliateRows.reduce((sum, item) => sum + item.sales, 0),
      totalOrders: affiliateRows.reduce((sum, item) => sum + item.orders, 0),
      totalClicks: affiliateRows.reduce((sum, item) => sum + item.clicks, 0),
      totalAffiliates: affiliateRows.length,
      totalCommission: affiliateRows.reduce((sum, item) => sum + item.commission, 0)
    },
    trend,
    topAffiliatesBySales: [...affiliateRows].sort((left, right) => right.sales - left.sales).slice(0, 5),
    topAffiliatesByClicks: [...affiliateRows].sort((left, right) => right.clicks - left.clicks).slice(0, 5),
    topProducts,
    topReferralSources,
    contentHighlights: [...contentHighlights].sort((left, right) => right.sales - left.sales).slice(0, 4)
  };
}

export async function getAffiliatePrograms() {
  const affiliates = await getAffiliates();
  return [await loadProgramFromDb(affiliates)];
}

export async function getAffiliates() {
  return loadAffiliatesFromDb();
}

export async function getAffiliateById(affiliateId: string) {
  const [affiliateRows, couponRows, couponHistory, conversionRows, contentRows] = await Promise.all([
    getAffiliates(),
    getAffiliateCoupons(),
    getAffiliateCouponHistory(affiliateId),
    getAffiliateConversions(),
    getAffiliateContentPerformance()
  ]);
  const affiliate = affiliateRows.find((item) => item.id === affiliateId) ?? null;
  if (!affiliate) return null;

  return {
    affiliate,
    coupons: couponRows.filter((item) => item.affiliateId === affiliateId),
    couponHistory,
    conversions: conversionRows.filter((item) => item.affiliateId === affiliateId),
    content: contentRows.filter((item) => item.affiliateId === affiliateId)
  };
}

export async function getAffiliateCoupons() {
  return loadCouponsFromDb();
}

export async function getAffiliateCouponHistory(affiliateId?: string) {
  return loadCouponHistoryFromDb(affiliateId);
}

export async function getAffiliateConversions() {
  return loadConversionsFromDb();
}

export async function getAffiliatePayouts(): Promise<AffiliatePayout[]> {
  const affiliateRows = await getAffiliates();
  return affiliateRows.map((item) => ({
    id: `pay-${item.id}`,
    affiliateId: item.id,
    affiliateName: `${item.firstName} ${item.lastName}`,
    paymentMethod: item.approvedBalance > 0 ? "Ready for payout" : "Not configured",
    approvedOrders: item.orders,
    approvedBalance: item.approvedBalance
  }));
}

export async function getAffiliateContentPerformance() {
  return loadContentFromDb();
}

export async function getAffiliatePortalSettings(): Promise<AffiliatePortalSettings> {
  const store = await getAffiliateStore();

  return {
    portalLanguage: DEFAULT_PORTAL_SETTINGS.portalLanguage,
    brandingName: store?.name ?? "",
    storeDomain: store?.domain ?? "",
    senderName: store?.name ?? "",
    senderEmail: "",
    inviteAutomationEnabled: DEFAULT_PORTAL_SETTINGS.inviteAutomationEnabled,
    referralOrderEmailEnabled: DEFAULT_PORTAL_SETTINGS.referralOrderEmailEnabled,
    couponAssignmentEnabled: DEFAULT_PORTAL_SETTINGS.couponAssignmentEnabled,
    advanced: { ...DEFAULT_PORTAL_SETTINGS.advanced }
  };
}

export async function getCouponTemplates() {
  return COUPON_TEMPLATES;
}
