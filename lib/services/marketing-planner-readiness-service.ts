import type {
  MarketingPlannerCustomerVoice,
  MarketingPlannerDataReadiness,
  MarketingPlannerDataReadinessSource,
  MarketingPlannerInfluencerIntelligence,
  MarketingPlannerMetaAds,
  MarketingPlannerPreviousMonthBaseline,
  MarketingPlannerStoreScope
} from "@/lib/domain/marketing-planner-types";
import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { reportBreadcrumb } from "@/lib/server/error-report";
import { buildMarketingPlannerCustomerVoice } from "@/lib/services/flashy-review-service";
import { crawlPublicInstagramProfiles } from "@/lib/services/instagram-public-crawler-service";
import {
  buildPreviousMonthBaseline,
  buildStoreScope
} from "@/lib/services/marketing-planner-service";
import { buildMarketingPlannerInfluencerIntelligence } from "@/lib/services/marketing-planner-influencer-service";
import { buildMarketingPlannerMetaAds, syncMetaAdsCampaignInsights } from "@/lib/services/meta-ads-service";
import { runIncrementalSync } from "@/lib/services/shopify-sync-service";

export interface MarketingPlannerDataReadinessInput {
  storeId?: string | null;
  planningMonth: string;
  refresh?: boolean;
}

function parsePlanningMonth(value: string) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new AppError("Choose a planning month before checking data readiness.", 400);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new AppError("Choose a valid planning month before checking data readiness.", 400);
  }

  return new Date(year, monthIndex, 1);
}

function formatMoney(value: number) {
  return `₪${Math.round(value).toLocaleString("en-US")}`;
}

function statusRank(status: MarketingPlannerDataReadinessSource["status"]) {
  if (status === "ready") return 3;
  if (status === "warning") return 2;
  return 1;
}

function latestDate(...values: Array<string | null | undefined>) {
  const dates = values
    .map((value) => value ? new Date(value) : null)
    .filter((value): value is Date => Boolean(value && !Number.isNaN(value.getTime())))
    .sort((left, right) => right.getTime() - left.getTime());

  return dates[0]?.toISOString() ?? null;
}

async function getLatestShopifySyncAt(storeScope: MarketingPlannerStoreScope) {
  if (!storeScope.storeId) return null;
  const db = getDb();
  if (!db?.syncRun) return null;

  const run = await db.syncRun.findFirst({
    where: {
      storeId: storeScope.storeId,
      mode: { in: ["initial", "incremental"] },
      status: "success"
    },
    orderBy: { startedAt: "desc" },
    select: { completedAt: true, startedAt: true }
  });

  return latestDate(run?.completedAt?.toISOString(), run?.startedAt?.toISOString());
}

function buildShopifySource(
  baseline: MarketingPlannerPreviousMonthBaseline | null,
  storeScope: MarketingPlannerStoreScope,
  lastUpdatedAt: string | null,
  refreshWarnings: string[]
): MarketingPlannerDataReadinessSource {
  if (!storeScope.connected) {
    return {
      id: "shopify_previous_month",
      label: "Shopify previous month",
      status: "missing",
      headline: "No connected Shopify store was found.",
      details: ["Connect Shopify before using store-based planning."],
      lastUpdatedAt,
      metrics: { orders: 0, revenue: 0 }
    };
  }

  if (!baseline) {
    return {
      id: "shopify_previous_month",
      label: "Shopify previous month",
      status: "missing",
      headline: "Previous-month Shopify data is not available yet.",
      details: ["Run a Shopify sync before generating the final GANT."],
      lastUpdatedAt,
      metrics: { orders: 0, revenue: 0 }
    };
  }

  const hasOrders = baseline.orders > 0;
  return {
    id: "shopify_previous_month",
    label: "Shopify previous month",
    status: hasOrders ? "ready" : "warning",
    headline: hasOrders
      ? `${baseline.orders} previous-month orders, ${formatMoney(baseline.revenue)} revenue.`
      : "Shopify is connected, but no previous-month orders were found.",
    details: [
      ...baseline.summaryLines.slice(0, 2),
      ...refreshWarnings.filter((warning) => warning.toLowerCase().includes("shopify")).slice(0, 1)
    ],
    lastUpdatedAt,
    metrics: {
      orders: baseline.orders,
      revenue: Math.round(baseline.revenue),
      averageOrderValue: Math.round(baseline.averageOrderValue),
      discountRate: Number(baseline.discountRate.toFixed(1))
    }
  };
}

function buildAffiliateSource(
  influencer: MarketingPlannerInfluencerIntelligence | null
): MarketingPlannerDataReadinessSource {
  if (!influencer) {
    return {
      id: "affiliate_portal",
      label: "Affiliate / BixGrow attribution",
      status: "missing",
      headline: "Affiliate data is not loaded for this store.",
      details: ["The planner will not be able to rank creators by clicks, orders, codes, or sales."],
      lastUpdatedAt: null,
      metrics: { creators: 0, sales: 0, orders: 0, clicks: 0 }
    };
  }

  const hasCommercialSignal = influencer.totalCreators > 0 && (influencer.activeCreators > 0 || influencer.totalSales > 0 || influencer.totalClicks > 0);
  const status = influencer.totalCreators ? (hasCommercialSignal ? "ready" : "warning") : "missing";
  return {
    id: "affiliate_portal",
    label: "Affiliate / BixGrow attribution",
    status,
    headline: influencer.totalCreators
      ? `${influencer.activeCreators}/${influencer.totalCreators} creators active, ${formatMoney(influencer.totalSales)} attributed sales.`
      : "No affiliates are loaded yet.",
    details: influencer.summaryLines.slice(0, 3),
    lastUpdatedAt: influencer.periodEnd,
    metrics: {
      creators: influencer.totalCreators,
      activeCreators: influencer.activeCreators,
      sales: Math.round(influencer.totalSales),
      orders: influencer.totalOrders,
      clicks: influencer.totalClicks
    }
  };
}

function buildMetaAdsSource(metaAds: MarketingPlannerMetaAds | null): MarketingPlannerDataReadinessSource {
  if (!metaAds) {
    return {
      id: "meta_ads",
      label: "Meta Ads",
      status: "missing",
      headline: "Meta Ads is not connected or has not been synced yet.",
      details: ["Add the Meta access token and ad account in Settings, then sync campaign insights."],
      lastUpdatedAt: null,
      metrics: { campaigns: 0, spend: 0, purchases: 0 }
    };
  }

  const hasCampaigns = metaAds.campaigns.length > 0;
  const hasCreatives = metaAds.topCreatives.length > 0;
  return {
    id: "meta_ads",
    label: "Meta Ads",
    status: hasCampaigns && hasCreatives ? "ready" : "warning",
    headline: hasCampaigns
      ? `${metaAds.dailyBreakdown.length} daily dates, ${metaAds.campaigns.length} campaigns, ${metaAds.topCreatives.length} creatives, ${formatMoney(metaAds.totalSpend)} spend, ${metaAds.totalPurchases} purchases.`
      : "Meta Ads is connected, but no campaign rows are synced yet.",
    details: metaAds.summaryLines.slice(0, 3),
    lastUpdatedAt: metaAds.lastSyncAt ?? null,
    metrics: {
      campaigns: metaAds.campaigns.length,
      creatives: metaAds.topCreatives.length,
      dailyDates: metaAds.dailyBreakdown.length,
      spend: Math.round(metaAds.totalSpend),
      purchases: metaAds.totalPurchases,
      averageRoas: metaAds.averagePurchaseRoas != null ? Number(metaAds.averagePurchaseRoas.toFixed(2)) : null
    }
  };
}

function buildBrandInstagramSource(
  influencer: MarketingPlannerInfluencerIntelligence | null
): MarketingPlannerDataReadinessSource {
  const brand = influencer?.instagramCrawl.brandProfile ?? null;
  if (!brand) {
    return {
      id: "instagram_brand",
      label: "Brand Instagram",
      status: "missing",
      headline: "Brand Instagram has not been crawled yet.",
      details: ["Run Refresh data before planning to crawl the public brand profile."],
      lastUpdatedAt: null,
      metrics: { postsStored: 0, postsScanned: 0 }
    };
  }

  return {
    id: "instagram_brand",
    label: "Brand Instagram",
    status: brand.postsStored > 0 ? "ready" : "warning",
    headline: `@${brand.username}: ${brand.postsStored} public posts/reels stored.`,
    details: [
      `Scanned ${brand.postsScanned}, found ${brand.postsFound}, updated ${brand.postsUpdated}, saved ${brand.postsSaved}.`,
      brand.note
    ],
    lastUpdatedAt: brand.lastCrawledAt ?? brand.lastPostAt ?? null,
    metrics: {
      postsStored: brand.postsStored,
      postsScanned: brand.postsScanned,
      postsFound: brand.postsFound,
      skippedUnrelated: brand.postsSkippedUnrelated
    }
  };
}

function buildAffiliateInstagramSource(
  influencer: MarketingPlannerInfluencerIntelligence | null
): MarketingPlannerDataReadinessSource {
  const profiles = influencer?.instagramCrawl.affiliateProfiles ?? [];
  if (!profiles.length) {
    return {
      id: "instagram_affiliates",
      label: "Influencer Instagram profiles",
      status: "missing",
      headline: "No affiliate Instagram handles are saved yet.",
      details: ["Add Instagram profile URLs on the affiliate page, then run Refresh data before planning."],
      lastUpdatedAt: influencer?.instagramCrawl.lastRunAt ?? null,
      metrics: { handles: 0, postsFound: 0, postsStored: 0 }
    };
  }

  const postsFound = profiles.reduce((sum, profile) => sum + profile.postsFound, 0);
  const postsStored = profiles.reduce((sum, profile) => sum + profile.postsStored, 0);
  const scanned = profiles.reduce((sum, profile) => sum + profile.postsScanned, 0);
  const skipped = profiles.reduce((sum, profile) => sum + profile.postsSkippedUnrelated, 0);
  const status = postsFound > 0 || postsStored > 0 ? "ready" : "warning";
  const topProfiles = profiles
    .slice()
    .sort((left, right) => right.postsFound - left.postsFound || right.postsScanned - left.postsScanned)
    .slice(0, 3)
    .map((profile) => `@${profile.username}: scanned ${profile.postsScanned}, found ${profile.postsFound}`);

  return {
    id: "instagram_affiliates",
    label: "Influencer Instagram profiles",
    status,
    headline: `${profiles.length} handles saved, ${postsFound} brand-related public posts found.`,
    details: topProfiles.length ? topProfiles : ["Handles exist, but no brand-related public posts were found yet."],
    lastUpdatedAt: influencer?.instagramCrawl.lastRunAt ?? null,
    metrics: {
      handles: profiles.length,
      postsScanned: scanned,
      postsFound,
      postsStored,
      skippedUnrelated: skipped
    }
  };
}

function buildFlashySource(customerVoice: MarketingPlannerCustomerVoice | null): MarketingPlannerDataReadinessSource {
  if (!customerVoice) {
    return {
      id: "flashy_reviews",
      label: "Flashy customer reviews",
      status: "missing",
      headline: "Flashy reviews were not available for this store.",
      details: ["The planner will skip customer-voice insights unless Flashy account data is configured."],
      lastUpdatedAt: null,
      metrics: { sampledReviews: 0, sampledProducts: 0 }
    };
  }

  return {
    id: "flashy_reviews",
    label: "Flashy customer reviews",
    status: customerVoice.sampledReviews > 0 ? "ready" : "warning",
    headline: `${customerVoice.sampledReviews} reviews sampled across ${customerVoice.sampledProducts} active products.`,
    details: customerVoice.summaryLines.slice(0, 3),
    lastUpdatedAt: new Date().toISOString(),
    metrics: {
      sampledReviews: customerVoice.sampledReviews,
      sampledProducts: customerVoice.sampledProducts,
      averageRating: customerVoice.averageRating != null ? Number(customerVoice.averageRating.toFixed(1)) : null,
      verifiedShare: Number(customerVoice.verifiedShare.toFixed(1))
    }
  };
}

export async function buildMarketingPlannerDataReadiness(
  input: MarketingPlannerDataReadinessInput
): Promise<MarketingPlannerDataReadiness> {
  const planningDate = parsePlanningMonth(input.planningMonth);
  const storeScope = await buildStoreScope(input.storeId);
  const refreshWarnings: string[] = [];

  if (input.refresh && storeScope.connected && storeScope.storeId) {
    const scopedStoreId = storeScope.storeId;
    await runIncrementalSync(scopedStoreId).catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      refreshWarnings.push(`Shopify refresh skipped or failed: ${message}`);
      // Breadcrumb, not a full error report: this is a KNOWN-degraded case
      // (surfaced to caller via refreshWarnings). Left as trail so if a
      // later error surfaces we can see the refresh already degraded.
      reportBreadcrumb("marketing-planner:shopify-refresh", message, { storeId: scopedStoreId });
    });

    await crawlPublicInstagramProfiles({ storeId: scopedStoreId }).catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      refreshWarnings.push(`Instagram refresh failed: ${message}`);
      reportBreadcrumb("marketing-planner:instagram-refresh", message, { storeId: scopedStoreId });
    });

    await syncMetaAdsCampaignInsights({ storeId: scopedStoreId, datePreset: "last_30d" }).catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      refreshWarnings.push(`Meta Ads refresh failed: ${message}`);
      reportBreadcrumb("marketing-planner:meta-ads-refresh", message, { storeId: scopedStoreId });
    });
  }

  const [baseline, customerVoice, influencer, metaAds, latestShopifySyncAt] = await Promise.all([
    buildPreviousMonthBaseline(storeScope, planningDate).catch(() => null),
    buildMarketingPlannerCustomerVoice(storeScope).catch(() => null),
    buildMarketingPlannerInfluencerIntelligence(storeScope, planningDate).catch(() => null),
    buildMarketingPlannerMetaAds(storeScope).catch(() => null),
    getLatestShopifySyncAt(storeScope).catch(() => null)
  ]);

  const sources = [
    buildShopifySource(baseline, storeScope, latestShopifySyncAt, refreshWarnings),
    buildAffiliateSource(influencer),
    buildMetaAdsSource(metaAds),
    buildBrandInstagramSource(influencer),
    buildAffiliateInstagramSource(influencer),
    buildFlashySource(customerVoice)
  ].sort((left, right) => statusRank(right.status) - statusRank(left.status));

  const readyCount = sources.filter((source) => source.status === "ready").length;
  const warningCount = sources.filter((source) => source.status === "warning").length;
  const missingCount = sources.filter((source) => source.status === "missing").length;
  const warnings = [
    ...sources
      .filter((source) => source.status !== "ready")
      .map((source) => `${source.label}: ${source.headline}`),
    ...refreshWarnings
  ];

  return {
    ok: true,
    storeScope,
    planningMonth: input.planningMonth,
    generatedAt: new Date().toISOString(),
    refreshed: Boolean(input.refresh),
    sources,
    summaryLines: [
      `${readyCount}/${sources.length} data sources are ready for this store.`,
      warningCount ? `${warningCount} source(s) have usable but incomplete data.` : "No incomplete data sources detected.",
      missingCount ? `${missingCount} source(s) are missing and will be skipped by the planner.` : "No missing data sources detected."
    ],
    warnings
  };
}
