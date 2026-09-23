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
}

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function getMetaTopCreatives(storeId: string, range: { start: Date; end: Date }, limit = 8): Promise<MetaTopCreative[]> {
  const db = getDb() as any;
  if (!db?.metaAdsCampaignInsight) return [];
  const connection = (await db.metaAdsConnection?.findUnique({ where: { storeId }, select: { adAccountId: true } }).catch(() => null)) as { adAccountId: string | null } | null;
  if (!connection?.adAccountId) return [];

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
  if (!rows.length) return [];

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
      dateStart: day(r.dateStart), dateStop: day(r.dateStop), _roasWeighted: 0, _roasSpend: 0
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

  return [...byAd.values()]
    .filter((a) => a.spend > 0)
    .map(({ _roasWeighted, _roasSpend, ...a }) => ({
      ...a,
      revenue: Math.round(a.revenue),
      roas: _roasSpend > 0 ? _roasWeighted / _roasSpend : null,
      ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null,
      cpa: a.purchases > 0 ? a.spend / a.purchases : null
    }))
    // Ranked by the sales the ad brought; ties by purchases, then ROAS.
    .sort((x, y) => y.revenue - x.revenue || y.purchases - x.purchases || (y.roas ?? -1) - (x.roas ?? -1))
    .slice(0, limit);
}
