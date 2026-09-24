// Top Meta creatives for the Command Center (owner ask, 2026-09-23): next to
// the campaign list, show the actual ads — ranked by the SALES they brought,
// each one clearly tagged with the campaign it belongs to.
//
// Source: ad-level MetaAdsCampaignInsight rows for the connected ad account
// inside the reporting window, aggregated per ad. Revenue follows the same
// convention as the campaign overview: Σ spend × Meta-reported purchase ROAS
// (Meta does not store purchase value per row separately).

import { getDb } from "@/lib/server/db";

export interface MetaTopCreative {
  adId: string;
  adName: string | null;
  campaignId: string;
  campaignName: string;
  adsetName: string | null;
  creativeTitle: string | null;
  creativeBody: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  permalinkUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number | null;
  ctr: number | null;
  cpa: number | null;
  dateStart: string;
  dateStop: string;
  // The campaign this ad belongs to, over the same window — so the card can
  // say "27% of the campaign's sales, 1 of 23 ads" and the reader sees why
  // one creative is never the whole campaign.
  campaignRevenue: number;
  campaignPurchases: number;
  campaignAds: number;
  shareOfCampaign: number | null; // revenue / campaignRevenue, 0–1
}

export interface MetaTopCreativesResult {
  creatives: MetaTopCreative[];
  totalAds: number; // ads with spend in the window (the list shows the top N of these)
}

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const day = (d: Date) => d.toISOString().slice(0, 10);

const EMPTY: MetaTopCreativesResult = { creatives: [], totalAds: 0 };

export async function getMetaTopCreatives(storeId: string, range: { start: Date; end: Date }, limit = 8): Promise<MetaTopCreativesResult> {
  const db = getDb() as any;
  if (!db?.metaAdsCampaignInsight) return EMPTY;
  const connection = (await db.metaAdsConnection?.findUnique({ where: { storeId }, select: { adAccountId: true } }).catch(() => null)) as { adAccountId: string | null } | null;
  if (!connection?.adAccountId) return EMPTY;

  const rows = (await db.metaAdsCampaignInsight
    .findMany({
      where: { storeId, adAccountId: connection.adAccountId, level: "ad", dateStart: { gte: range.start }, dateStop: { lte: range.end } },
      orderBy: { dateStop: "asc" },
      select: {
        adId: true, adName: true, entityId: true, campaignId: true, campaignName: true, adsetName: true,
        creativeTitle: true, creativeBody: true, creativeThumbnailUrl: true, creativePreviewUrl: true, creativePermalinkUrl: true,
        dateStart: true, dateStop: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseRoas: true
      }
    })
    .catch(() => [])) as Array<Record<string, any>>;
  if (!rows.length) return EMPTY;
  // Campaign-level rows for the same window: the campaign's own total, which
  // the ad rows add up to (Meta rounds per-row ROAS, so within ~1–2%).
  const campaignRows = (await db.metaAdsCampaignInsight
    .findMany({
      where: { storeId, adAccountId: connection.adAccountId, level: "campaign", dateStart: { gte: range.start }, dateStop: { lte: range.end } },
      select: { campaignId: true, spend: true, purchases: true, purchaseRoas: true }
    })
    .catch(() => [])) as Array<Record<string, any>>;
  const campaignTotals = new Map<string, { revenue: number; purchases: number }>();
  for (const r of campaignRows) {
    const t = campaignTotals.get(String(r.campaignId)) ?? { revenue: 0, purchases: 0 };
    t.revenue += toNum(r.spend) * (r.purchaseRoas == null ? 0 : toNum(r.purchaseRoas));
    t.purchases += toNum(r.purchases);
    campaignTotals.set(String(r.campaignId), t);
  }

  const byAd = new Map<string, MetaTopCreative & { _roasWeighted: number; _roasSpend: number }>();
  for (const r of rows) {
    const id = String(r.adId ?? r.entityId ?? "");
    if (!id) continue;
    const spend = toNum(r.spend);
    const roas = r.purchaseRoas == null ? null : toNum(r.purchaseRoas);
    const agg = byAd.get(id) ?? {
      adId: id, adName: null, campaignId: String(r.campaignId ?? ""), campaignName: String(r.campaignName ?? ""), adsetName: null,
      creativeTitle: null, creativeBody: null, thumbnailUrl: null, previewUrl: null, permalinkUrl: null,
      spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, roas: null, ctr: null, cpa: null,
      dateStart: day(r.dateStart), dateStop: day(r.dateStop), _roasWeighted: 0, _roasSpend: 0,
      campaignRevenue: 0, campaignPurchases: 0, campaignAds: 0, shareOfCampaign: null
    };
    agg.spend += spend;
    agg.impressions += toNum(r.impressions);
    agg.clicks += toNum(r.clicks);
    agg.purchases += toNum(r.purchases);
    if (roas != null) { agg.revenue += spend * roas; agg._roasWeighted += spend * roas; agg._roasSpend += spend; }
    // Latest non-empty descriptive fields win (rows are date-ascending).
    agg.adName = r.adName ?? agg.adName;
    agg.adsetName = r.adsetName ?? agg.adsetName;
    agg.campaignName = r.campaignName ?? agg.campaignName;
    agg.creativeTitle = r.creativeTitle ?? agg.creativeTitle;
    agg.creativeBody = r.creativeBody ?? agg.creativeBody;
    agg.thumbnailUrl = r.creativeThumbnailUrl ?? agg.thumbnailUrl;
    agg.previewUrl = r.creativePreviewUrl ?? agg.previewUrl;
    agg.permalinkUrl = r.creativePermalinkUrl ?? agg.permalinkUrl;
    if (day(r.dateStart) < agg.dateStart) agg.dateStart = day(r.dateStart);
    if (day(r.dateStop) > agg.dateStop) agg.dateStop = day(r.dateStop);
    byAd.set(id, agg);
  }

  const active = [...byAd.values()].filter((a) => a.spend > 0);
  const adsPerCampaign = new Map<string, number>();
  for (const a of active) adsPerCampaign.set(a.campaignId, (adsPerCampaign.get(a.campaignId) ?? 0) + 1);
  const creatives = active
    .map(({ _roasWeighted, _roasSpend, ...a }) => {
      const total = campaignTotals.get(a.campaignId);
      // Fall back to the sum of this campaign's ads when campaign rows are missing.
      const campaignRevenue = Math.round(total?.revenue ?? active.filter((x) => x.campaignId === a.campaignId).reduce((s, x) => s + x.revenue, 0));
      const revenue = Math.round(a.revenue);
      return {
        ...a,
        revenue,
        roas: _roasSpend > 0 ? _roasWeighted / _roasSpend : null,
        ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null,
        cpa: a.purchases > 0 ? a.spend / a.purchases : null,
        campaignRevenue,
        campaignPurchases: total?.purchases ?? active.filter((x) => x.campaignId === a.campaignId).reduce((s, x) => s + x.purchases, 0),
        campaignAds: adsPerCampaign.get(a.campaignId) ?? 1,
        shareOfCampaign: campaignRevenue > 0 ? Math.min(1, revenue / campaignRevenue) : null
      };
    })
    // Ranked by the sales the ad brought; ties by purchases, then ROAS.
    .sort((x, y) => y.revenue - x.revenue || y.purchases - x.purchases || (y.roas ?? -1) - (x.roas ?? -1))
    .slice(0, limit);
  return { creatives, totalAds: active.length };
}
