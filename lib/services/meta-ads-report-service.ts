import { getDb } from "@/lib/server/db";
import type { MarketingPlannerMetaAdsCampaign } from "@/lib/domain/marketing-planner-types";

// Weekly Meta Ads report data — same underlying rows as
// `buildMarketingPlannerMetaAds`, but bucketed by brand for the printable
// report at /print/meta-ads-weekly.
//
// Brand assignment is driven by the META_ADS_BRAND_RULES env var, a JSON
// array of {brand, match} pairs where `match` is a regex applied to the
// campaign name. When the env is unset or no rule fires, the campaign lands
// in the catch-all "All campaigns" bucket so the report still works on day 1.

export interface MetaAdsBrandRule {
  brand: string;
  match: string;
}

export interface MetaAdsReportAd {
  // Ad-level row aggregated across the date window — the granular layer the
  // example PDF surfaces in its "סיכום קביעים" table at the bottom.
  campaignName: string;
  adsetName: string | null;
  adName: string | null;
  spend: number;
  clicks: number;
  cpc: number;
  purchases: number;
  purchaseRoas: number | null;
}

export interface MetaAdsReportFunnel {
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
}

export interface MetaAdsReportDailyRow {
  date: string; // YYYY-MM-DD
  spend: number;
  clicks: number;
  impressions: number;
  purchases: number;
  purchaseRoas: number | null;
}

export interface MetaAdsReportBrand {
  name: string;
  kpis: {
    spend: number;
    cpc: number; // weighted by clicks (totalSpend / totalClicks)
    cpm: number; // weighted by impressions
    ctr: number; // clicks/impressions * 100
    clicks: number;
    impressions: number;
    purchases: number;
    purchaseRoas: number | null;
  };
  funnel: MetaAdsReportFunnel;
  daily: MetaAdsReportDailyRow[];
  campaigns: MarketingPlannerMetaAdsCampaign[];
  ads: MetaAdsReportAd[];
}

export interface MetaAdsWeeklyReport {
  dateRange: { start: string; end: string };
  account: { id: string; name: string | null; currency: string | null };
  brands: MetaAdsReportBrand[];
  totals: {
    spend: number;
    clicks: number;
    impressions: number;
    purchases: number;
    campaignCount: number;
  };
  // Surface a warning to the report when no rules were configured, so the
  // user understands the single bucket isn't a bug.
  rulesActive: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Brand rule parsing
// ─────────────────────────────────────────────────────────────────────────

interface CompiledRule {
  brand: string;
  regex: RegExp;
}

export function parseBrandRules(raw: string | undefined | null): CompiledRule[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry): CompiledRule | null => {
        if (!entry || typeof entry !== "object") return null;
        const brand = String((entry as MetaAdsBrandRule).brand ?? "").trim();
        const pattern = String((entry as MetaAdsBrandRule).match ?? "").trim();
        if (!brand || !pattern) return null;
        try {
          return { brand, regex: new RegExp(pattern, "i") };
        } catch {
          // Bad regex → skip this rule but don't break the whole report.
          return null;
        }
      })
      .filter((r): r is CompiledRule => r !== null);
  } catch {
    return [];
  }
}

function assignBrand(
  campaignName: string,
  rules: CompiledRule[],
  fallback: string = "All campaigns"
): string {
  for (const rule of rules) {
    if (rule.regex.test(campaignName)) return rule.brand;
  }
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────
// Report builder
// ─────────────────────────────────────────────────────────────────────────

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    return Number((value as { toNumber: () => number }).toNumber());
  }
  return Number(value);
}

function toDateKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

// Per-campaign aggregator. We accumulate spend / clicks / impressions across
// every daily row for the same campaignId, plus a spend-weighted ROAS so the
// final tile reflects performance rather than a naive average.
interface CampaignAccumulator {
  campaignId: string;
  campaignName: string;
  spend: number;
  clicks: number;
  linkClicks: number;
  impressions: number;
  purchases: number;
  roasWeightedSpend: number;
  roasWeightedValue: number;
  dateStart: string;
  dateStop: string;
}

function newCampaignAccumulator(row: any): CampaignAccumulator {
  return {
    campaignId: String(row.campaignId ?? row.entityId ?? ""),
    campaignName: String(row.campaignName ?? row.campaignId ?? "Meta campaign"),
    spend: 0,
    clicks: 0,
    linkClicks: 0,
    impressions: 0,
    purchases: 0,
    roasWeightedSpend: 0,
    roasWeightedValue: 0,
    dateStart: toDateKey(row.dateStart),
    dateStop: toDateKey(row.dateStop)
  };
}

function addRow(acc: CampaignAccumulator, row: any): void {
  const spend = decimalToNumber(row.spend);
  acc.spend += spend;
  acc.clicks += Number(row.clicks ?? 0);
  acc.linkClicks += Number(row.linkClicks ?? 0);
  acc.impressions += Number(row.impressions ?? 0);
  acc.purchases += Number(row.purchases ?? 0);
  if (row.purchaseRoas != null && spend > 0) {
    const roas = decimalToNumber(row.purchaseRoas);
    acc.roasWeightedSpend += spend;
    acc.roasWeightedValue += roas * spend;
  }
  const rowStart = toDateKey(row.dateStart);
  const rowStop = toDateKey(row.dateStop);
  if (rowStart && (!acc.dateStart || rowStart < acc.dateStart)) acc.dateStart = rowStart;
  if (rowStop && (!acc.dateStop || rowStop > acc.dateStop)) acc.dateStop = rowStop;
}

function finalizeCampaign(acc: CampaignAccumulator): MarketingPlannerMetaAdsCampaign {
  const purchaseRoas = acc.roasWeightedSpend > 0
    ? acc.roasWeightedValue / acc.roasWeightedSpend
    : null;
  return {
    id: acc.campaignId,
    campaignId: acc.campaignId,
    campaignName: acc.campaignName,
    adsetId: null,
    adsetName: null,
    adId: null,
    adName: null,
    creativeId: null,
    creativeName: null,
    creativeTitle: null,
    creativeBody: null,
    creativeThumbnailUrl: null,
    creativePreviewUrl: null,
    creativePermalinkUrl: null,
    creativeObjectUrl: null,
    spend: acc.spend,
    impressions: acc.impressions,
    clicks: acc.clicks,
    linkClicks: acc.linkClicks,
    landingPageViews: 0,
    addToCart: 0,
    initiateCheckout: 0,
    purchases: acc.purchases,
    ctr: acc.impressions > 0 ? (acc.clicks / acc.impressions) * 100 : 0,
    cpc: acc.clicks > 0 ? acc.spend / acc.clicks : 0,
    cpm: acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : 0,
    purchaseRoas,
    dateStart: acc.dateStart,
    dateStop: acc.dateStop
  };
}

export interface BuildWeeklyReportInput {
  storeId: string;
  start: Date;
  end: Date;
}

export async function buildMetaAdsWeeklyReport(
  input: BuildWeeklyReportInput
): Promise<MetaAdsWeeklyReport | null> {
  const db = getDb();
  if (!db?.metaAdsConnection || !db?.metaAdsCampaignInsight) return null;

  const connection = await db.metaAdsConnection.findUnique({
    where: { storeId: input.storeId }
  });
  if (!connection) return null;

  // For single-bucket reports (no META_ADS_BRAND_RULES configured) we relabel
  // the "All campaigns" placeholder with the store's own name so the report
  // doesn't pretend to be brand-agnostic — there's only one brand here and
  // that's the connected store.
  const storeRecord = await db.store.findUnique({
    where: { id: input.storeId },
    select: { name: true, domain: true }
  });
  const fallbackBrandName =
    storeRecord?.name?.trim() ||
    connection.adAccountName?.trim() ||
    storeRecord?.domain?.replace(/\.myshopify\.com$/i, "") ||
    "All campaigns";

  // Pull both campaign-level and ad-level rows. Campaign rows drive the
  // brand KPI tiles + roundup; ad rows feed the granular "top ads" table
  // that mirrors the user's example PDF's bottom block.
  const [campaignDbRows, adDbRows] = await Promise.all([
    db.metaAdsCampaignInsight.findMany({
      where: {
        storeId: input.storeId,
        adAccountId: connection.adAccountId,
        level: "campaign",
        // Filter by dateStart only — Meta's `dateStop` is the EXCLUSIVE
        // start of the next day, so `dateStop <= end` silently drops the
        // last day of the window. Filtering by dateStart range gives
        // the inclusive window the caller expects.
        dateStart: { gte: input.start, lte: input.end }
      }
    }),
    db.metaAdsCampaignInsight.findMany({
      where: {
        storeId: input.storeId,
        adAccountId: connection.adAccountId,
        level: "ad",
        dateStart: { gte: input.start, lte: input.end }
      }
    })
  ]);
  const rows = campaignDbRows;

  const rules = parseBrandRules(process.env.META_ADS_BRAND_RULES);

  // Group rows by campaignId first, then by brand.
  const byCampaign = new Map<string, CampaignAccumulator>();
  for (const row of rows as any[]) {
    const key = String(row.campaignId ?? row.entityId ?? "");
    if (!key) continue;
    const acc = byCampaign.get(key) ?? newCampaignAccumulator(row);
    addRow(acc, row);
    byCampaign.set(key, acc);
  }

  const campaigns = Array.from(byCampaign.values()).map(finalizeCampaign);

  const brandMap = new Map<string, MarketingPlannerMetaAdsCampaign[]>();
  for (const campaign of campaigns) {
    const brand = assignBrand(campaign.campaignName, rules, fallbackBrandName);
    const list = brandMap.get(brand) ?? [];
    list.push(campaign);
    brandMap.set(brand, list);
  }

  // Aggregate ad-level rows by (campaign + adset + ad). Same dedup logic
  // as campaigns: one entry per unique tuple, summed across daily rows.
  const adsByKey = new Map<string, {
    campaignName: string;
    adsetName: string | null;
    adName: string | null;
    spend: number;
    clicks: number;
    purchases: number;
    roasWeightedSpend: number;
    roasWeightedValue: number;
  }>();
  for (const row of adDbRows as any[]) {
    const key = `${row.campaignId ?? row.entityId}|${row.adsetId ?? ""}|${row.adId ?? row.entityId}`;
    const entry =
      adsByKey.get(key) ?? {
        campaignName: String(row.campaignName ?? "Meta campaign"),
        adsetName: row.adsetName ?? null,
        adName: row.adName ?? null,
        spend: 0,
        clicks: 0,
        purchases: 0,
        roasWeightedSpend: 0,
        roasWeightedValue: 0
      };
    const spend = decimalToNumber(row.spend);
    entry.spend += spend;
    entry.clicks += Number(row.clicks ?? 0);
    entry.purchases += Number(row.purchases ?? 0);
    if (row.purchaseRoas != null && spend > 0) {
      const roas = decimalToNumber(row.purchaseRoas);
      entry.roasWeightedSpend += spend;
      entry.roasWeightedValue += roas * spend;
    }
    adsByKey.set(key, entry);
  }

  const adsByBrand = new Map<string, MetaAdsReportAd[]>();
  for (const ad of adsByKey.values()) {
    const brand = assignBrand(ad.campaignName, rules, fallbackBrandName);
    const list = adsByBrand.get(brand) ?? [];
    list.push({
      campaignName: ad.campaignName,
      adsetName: ad.adsetName,
      adName: ad.adName,
      spend: ad.spend,
      clicks: ad.clicks,
      cpc: ad.clicks > 0 ? ad.spend / ad.clicks : 0,
      purchases: ad.purchases,
      purchaseRoas: ad.roasWeightedSpend > 0 ? ad.roasWeightedValue / ad.roasWeightedSpend : null
    });
    adsByBrand.set(brand, list);
  }

  // Build per-brand funnel + daily aggregates straight from the raw DB rows
  // (campaign-level), not from the already-summed campaign objects — funnel
  // metrics like landingPageViews/addToCart aren't carried on the
  // MarketingPlannerMetaAdsCampaign shape.
  const funnelByBrand = new Map<string, MetaAdsReportFunnel>();
  const dailyByBrand = new Map<string, Map<string, MetaAdsReportDailyRow & { roasNum: number; roasDen: number }>>();
  for (const row of campaignDbRows as any[]) {
    const campaignName = String(row.campaignName ?? "");
    const brand = assignBrand(campaignName, rules, fallbackBrandName);
    const funnel = funnelByBrand.get(brand) ?? {
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      landingPageViews: 0,
      addToCart: 0,
      initiateCheckout: 0,
      purchases: 0
    };
    funnel.impressions += Number(row.impressions ?? 0);
    funnel.clicks += Number(row.clicks ?? 0);
    funnel.linkClicks += Number(row.linkClicks ?? 0);
    funnel.landingPageViews += Number(row.landingPageViews ?? 0);
    funnel.addToCart += Number(row.addToCart ?? 0);
    funnel.initiateCheckout += Number(row.initiateCheckout ?? 0);
    funnel.purchases += Number(row.purchases ?? 0);
    funnelByBrand.set(brand, funnel);

    const dateKey = toDateKey(row.dateStart);
    if (!dateKey) continue;
    const dailyMap = dailyByBrand.get(brand) ?? new Map();
    const day = dailyMap.get(dateKey) ?? {
      date: dateKey,
      spend: 0,
      clicks: 0,
      impressions: 0,
      purchases: 0,
      purchaseRoas: null as number | null,
      roasNum: 0,
      roasDen: 0
    };
    const rowSpend = decimalToNumber(row.spend);
    day.spend += rowSpend;
    day.clicks += Number(row.clicks ?? 0);
    day.impressions += Number(row.impressions ?? 0);
    day.purchases += Number(row.purchases ?? 0);
    if (row.purchaseRoas != null && rowSpend > 0) {
      day.roasNum += decimalToNumber(row.purchaseRoas) * rowSpend;
      day.roasDen += rowSpend;
    }
    dailyMap.set(dateKey, day);
    dailyByBrand.set(brand, dailyMap);
  }

  const brands: MetaAdsReportBrand[] = Array.from(brandMap.entries())
    .map(([name, list]) => {
      const spend = list.reduce((sum, c) => sum + c.spend, 0);
      const clicks = list.reduce((sum, c) => sum + c.clicks, 0);
      const impressions = list.reduce((sum, c) => sum + c.impressions, 0);
      const purchases = list.reduce((sum, c) => sum + c.purchases, 0);
      const roasNumerator = list.reduce((sum, c) => {
        if (c.purchaseRoas == null || c.spend <= 0) return sum;
        return sum + c.purchaseRoas * c.spend;
      }, 0);
      const roasDenominator = list.reduce((sum, c) => {
        if (c.purchaseRoas == null || c.spend <= 0) return sum;
        return sum + c.spend;
      }, 0);
      const purchaseRoas = roasDenominator > 0 ? roasNumerator / roasDenominator : null;
      const ads = (adsByBrand.get(name) ?? []).sort((a, b) => b.spend - a.spend);
      const funnel = funnelByBrand.get(name) ?? {
        impressions: 0,
        clicks: 0,
        linkClicks: 0,
        landingPageViews: 0,
        addToCart: 0,
        initiateCheckout: 0,
        purchases: 0
      };
      const daily = Array.from((dailyByBrand.get(name) ?? new Map()).values())
        .map((d: any) => ({
          date: d.date,
          spend: d.spend,
          clicks: d.clicks,
          impressions: d.impressions,
          purchases: d.purchases,
          purchaseRoas: d.roasDen > 0 ? d.roasNum / d.roasDen : null
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        name,
        kpis: {
          spend,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          clicks,
          impressions,
          purchases,
          purchaseRoas
        },
        funnel,
        daily,
        campaigns: list.sort((a, b) => b.spend - a.spend),
        ads
      };
    })
    .sort((a, b) => b.kpis.spend - a.kpis.spend);

  const totals = {
    spend: brands.reduce((sum, b) => sum + b.kpis.spend, 0),
    clicks: brands.reduce((sum, b) => sum + b.kpis.clicks, 0),
    impressions: brands.reduce((sum, b) => sum + b.kpis.impressions, 0),
    purchases: brands.reduce((sum, b) => sum + b.kpis.purchases, 0),
    campaignCount: campaigns.length
  };

  return {
    dateRange: {
      start: toDateKey(input.start),
      end: toDateKey(input.end)
    },
    account: {
      id: connection.adAccountId,
      name: connection.adAccountName ?? null,
      currency: connection.currency ?? null
    },
    brands,
    totals,
    rulesActive: rules.length > 0
  };
}
