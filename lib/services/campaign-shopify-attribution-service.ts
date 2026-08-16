// Per-campaign Shopify attribution.
//
// For each Meta campaign, find Shopify orders whose UTM data ties back to
// that campaign — and compute the REAL Shopify revenue/orders for it. We
// then expose both numbers (Meta-attributed vs Shopify-confirmed) so the
// report can show the gap honestly.
//
// Matching strategy:
//   1) utm_campaign value matches the Meta campaign name (case-insensitive,
//      with normalisation — "Adventage+_Paz" matches "adventage+paz" etc.).
//   2) utm_content value matches an ad/adset name from that campaign.
//   3) The order's landing URL contains the Meta campaign id (some setups
//      add ?utm_campaign=<id> instead of the name).
//
// Why two layers (campaign + ad/adset): if utm_campaign isn't set but
// utm_content carries the ad name, we can still tie the order back to the
// right campaign by looking up which campaign that ad belongs to.

import { getDb } from "@/lib/server/db";

export interface ShopifyAttributedCampaign {
  campaignId: string;
  campaignName: string;
  metaAttributedPurchases: number; // from MetaAdsCampaignInsight
  metaAttributedRevenueRaw: number | null; // Meta's revenue figure (if present)
  shopifyOrders: number; // Shopify orders we managed to tie back to this campaign
  shopifyRevenue: number; // sum of (totalPrice - totalRefunds) for those orders
  shopifyNewCustomers: number;
  shopifyReturningCustomers: number;
  matchConfidence: "high" | "medium" | "low";
}

export interface CampaignShopifyAttributionReport {
  dateRange: { start: string; end: string };
  campaigns: ShopifyAttributedCampaign[];
  // What fraction of Shopify orders carried a usable UTM that we could match
  // to ANY Meta campaign. Below ~30% means the founder shouldn't trust the
  // per-campaign Shopify column on the report.
  shopifyMatchCoverage: number;
}

// Normalise a label for fuzzy matching. Lowercase, drop spaces/+/_/- so
// "Adventage+_Paz" matches "adventagepaz".
function normalise(value: string): string {
  return value.toLowerCase().replace(/[\s_+\-]/g, "");
}

function extractUtm(url: string | null): { campaign: string | null; content: string | null; medium: string | null; source: string | null } {
  if (!url) return { campaign: null, content: null, medium: null, source: null };
  try {
    const parsed = new URL(url, "https://placeholder.local");
    return {
      campaign: parsed.searchParams.get("utm_campaign")?.toLowerCase() ?? null,
      content: parsed.searchParams.get("utm_content")?.toLowerCase() ?? null,
      medium: parsed.searchParams.get("utm_medium")?.toLowerCase() ?? null,
      source: parsed.searchParams.get("utm_source")?.toLowerCase() ?? null
    };
  } catch {
    return { campaign: null, content: null, medium: null, source: null };
  }
}

export interface BuildAttributionInput {
  storeId: string;
  start: Date;
  end: Date;
}

export async function buildCampaignShopifyAttribution(
  input: BuildAttributionInput
): Promise<CampaignShopifyAttributionReport> {
  const db = getDb();
  const connection = await db.metaAdsConnection.findUnique({
    where: { storeId: input.storeId }
  });
  if (!connection) {
    return {
      dateRange: {
        start: input.start.toISOString().slice(0, 10),
        end: input.end.toISOString().slice(0, 10)
      },
      campaigns: [],
      shopifyMatchCoverage: 0
    };
  }

  // 1) Meta side: aggregate spend + purchases per campaign for the window.
  // Filter by dateStart only — Meta's `dateStop` is the EXCLUSIVE start
  // of the next day, so `dateStop <= end` drops the last day.
  const metaRows = await db.metaAdsCampaignInsight.findMany({
    where: {
      storeId: input.storeId,
      adAccountId: connection.adAccountId,
      level: "campaign",
      dateStart: { gte: input.start, lte: input.end }
    },
    select: {
      campaignId: true,
      campaignName: true,
      purchases: true,
      purchaseRoasJson: true,
      spend: true
    }
  });

  interface MetaAgg {
    campaignId: string;
    campaignName: string;
    purchases: number;
    revenueRaw: number | null;
    spend: number;
  }
  const metaByCampaign = new Map<string, MetaAgg>();
  for (const r of metaRows as any[]) {
    const key = String(r.campaignId ?? r.campaignName ?? "");
    if (!key) continue;
    const acc = metaByCampaign.get(key) ?? {
      campaignId: String(r.campaignId ?? key),
      campaignName: String(r.campaignName ?? key),
      purchases: 0,
      revenueRaw: null,
      spend: 0
    };
    acc.purchases += Number(r.purchases ?? 0);
    acc.spend += Number(r.spend ?? 0);
    // purchase_roas can ship as JSON array on the row; we sum only as a
    // diagnostic, not as a source-of-truth — the report uses Shopify revenue.
    metaByCampaign.set(key, acc);
  }

  // 2) Meta ads → which campaign each ad belongs to. Used to resolve
  //    utm_content matches when utm_campaign is missing.
  // Same dateStart-range filter as above.
  const adRows = await db.metaAdsCampaignInsight.findMany({
    where: {
      storeId: input.storeId,
      adAccountId: connection.adAccountId,
      level: "ad",
      dateStart: { gte: input.start, lte: input.end }
    },
    select: {
      adName: true,
      campaignId: true,
      campaignName: true
    }
  });
  // Map normalised ad name -> campaign id, for utm_content lookups.
  const adNameToCampaign = new Map<string, string>();
  for (const r of adRows as any[]) {
    const adName = String(r.adName ?? "").trim();
    if (!adName) continue;
    const cid = String(r.campaignId ?? r.campaignName ?? "");
    if (cid) adNameToCampaign.set(normalise(adName), cid);
  }
  // And normalised campaign name -> campaign id, for utm_campaign matches.
  const campaignNameToId = new Map<string, string>();
  for (const m of metaByCampaign.values()) {
    campaignNameToId.set(normalise(m.campaignName), m.campaignId);
  }

  // 3) Shopify side: pull all orders in the window, try to match.
  const orders = await db.order.findMany({
    where: {
      storeId: input.storeId,
      createdAt: { gte: input.start, lte: input.end },
      test: false,
      cancelledAt: null
    },
    select: {
      totalPrice: true,
      totalRefunds: true,
      customerId: true,
      landingSiteRef: true
    }
  });

  const customerIds = Array.from(new Set(orders.map((o: any) => o.customerId).filter(Boolean) as string[]));
  const customers = customerIds.length
    ? await db.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, isReturning: true }
      })
    : [];
  const returningById = new Map(customers.map((c: any) => [c.id, Boolean(c.isReturning)]));

  interface CampaignAcc {
    orders: number;
    revenue: number;
    newCustomers: number;
    returningCustomers: number;
    highConfidenceMatches: number; // utm_campaign hit
  }
  const shopifyByCampaign = new Map<string, CampaignAcc>();
  let matchedOrders = 0;
  let totalOrders = orders.length;

  for (const o of orders as any[]) {
    const utm = extractUtm(o.landingSiteRef ?? null);
    let matchedCampaignId: string | null = null;
    let confidence: "high" | "medium" = "medium";

    // (a) utm_campaign direct match.
    if (utm.campaign) {
      const id = campaignNameToId.get(normalise(utm.campaign));
      if (id) {
        matchedCampaignId = id;
        confidence = "high";
      }
    }
    // (b) utm_content → ad name → campaign.
    if (!matchedCampaignId && utm.content) {
      const id = adNameToCampaign.get(normalise(utm.content));
      if (id) {
        matchedCampaignId = id;
        // Medium because utm_content alone is a weaker signal than utm_campaign.
        confidence = "medium";
      }
    }
    if (!matchedCampaignId) continue;

    matchedOrders += 1;
    const net = Number(o.totalPrice ?? 0) - Number(o.totalRefunds ?? 0);
    const acc = shopifyByCampaign.get(matchedCampaignId) ?? {
      orders: 0,
      revenue: 0,
      newCustomers: 0,
      returningCustomers: 0,
      highConfidenceMatches: 0
    };
    acc.orders += 1;
    acc.revenue += net;
    if (confidence === "high") acc.highConfidenceMatches += 1;
    const isReturning = o.customerId ? returningById.get(o.customerId) ?? false : false;
    if (o.customerId) {
      if (isReturning) acc.returningCustomers += 1;
      else acc.newCustomers += 1;
    }
    shopifyByCampaign.set(matchedCampaignId, acc);
  }

  // 4) Combine — every Meta campaign appears, even if zero Shopify matches.
  const campaigns: ShopifyAttributedCampaign[] = Array.from(metaByCampaign.values()).map((m) => {
    const shopify = shopifyByCampaign.get(m.campaignId);
    const matchConfidence: "high" | "medium" | "low" = shopify
      ? shopify.highConfidenceMatches / Math.max(1, shopify.orders) >= 0.5
        ? "high"
        : "medium"
      : "low";
    return {
      campaignId: m.campaignId,
      campaignName: m.campaignName,
      metaAttributedPurchases: m.purchases,
      metaAttributedRevenueRaw: null, // not a Source-of-Truth field; see Meta service for revenue if needed
      shopifyOrders: shopify?.orders ?? 0,
      shopifyRevenue: shopify?.revenue ?? 0,
      shopifyNewCustomers: shopify?.newCustomers ?? 0,
      shopifyReturningCustomers: shopify?.returningCustomers ?? 0,
      matchConfidence
    };
  });

  return {
    dateRange: {
      start: input.start.toISOString().slice(0, 10),
      end: input.end.toISOString().slice(0, 10)
    },
    campaigns: campaigns.sort((a, b) => b.shopifyRevenue - a.shopifyRevenue),
    shopifyMatchCoverage: totalOrders > 0 ? matchedOrders / totalOrders : 0
  };
}
