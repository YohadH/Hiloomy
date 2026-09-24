// Loads the inputs for the deterministic creative engine
// (lib/domain/meta-creative-signals) from the synced MetaAdsCampaignInsight
// rows: campaign-level rows for the campaign context, ad-level rows for the
// creatives, both for the current window AND the equal-length previous window
// (fatigue needs it). Revenue follows the account convention used everywhere
// on the Command Center: Σ spend × Meta-reported purchase ROAS.

import { getDb } from "@/lib/server/db";
import { buildCreativeSignals, type CampaignInput, type CreativeInput, type CreativeSignalsResult, type PeriodMetrics } from "@/lib/domain/meta-creative-signals";
import type { MetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface AdRow {
  adId: string | null;
  entityId: string | null;
  adName: string | null;
  campaignId: string;
  campaignName: string;
  spend: unknown;
  impressions: number;
  clicks: number;
  purchases: number;
  purchaseRoas: unknown | null;
}

async function loadAdRows(db: any, storeId: string, adAccountId: string, range: { start: Date; end: Date }): Promise<AdRow[]> {
  return (await db.metaAdsCampaignInsight
    .findMany({
      where: { storeId, adAccountId, level: "ad", dateStart: { gte: range.start }, dateStop: { lte: range.end } },
      select: { adId: true, entityId: true, adName: true, campaignId: true, campaignName: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseRoas: true }
    })
    .catch(() => [])) as AdRow[];
}

function aggregateAds(rows: AdRow[]): Map<string, PeriodMetrics & { name: string; campaignId: string }> {
  const out = new Map<string, PeriodMetrics & { name: string; campaignId: string }>();
  for (const r of rows) {
    const id = String(r.adId ?? r.entityId ?? "");
    if (!id) continue;
    const spend = toNum(r.spend);
    const agg = out.get(id) ?? { name: r.adName ?? id, campaignId: String(r.campaignId), spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0 };
    agg.spend += spend;
    agg.revenue += r.purchaseRoas == null ? 0 : spend * toNum(r.purchaseRoas);
    agg.purchases += toNum(r.purchases);
    agg.clicks += toNum(r.clicks);
    agg.impressions += toNum(r.impressions);
    if (r.adName) agg.name = r.adName;
    out.set(id, agg);
  }
  return out;
}

export async function buildMetaCreativeSignals(input: {
  storeId: string;
  overview: MetaCampaignsOverview;
  breakevenRoas: number | null;
}): Promise<CreativeSignalsResult | null> {
  const db = getDb() as any;
  if (!db?.metaAdsCampaignInsight) return null;
  const connection = (await db.metaAdsConnection?.findUnique({ where: { storeId: input.storeId }, select: { adAccountId: true } }).catch(() => null)) as { adAccountId: string | null } | null;
  if (!connection?.adAccountId) return null;

  const start = new Date(input.overview.rangeStartAt);
  const end = new Date(input.overview.rangeEndAt);
  const lengthMs = Math.max(end.getTime() - start.getTime(), 86_400_000);
  const previous = { start: new Date(start.getTime() - lengthMs), end: new Date(start.getTime() - 1) };

  const [currentRows, previousRows] = await Promise.all([
    loadAdRows(db, input.storeId, connection.adAccountId, { start, end }),
    loadAdRows(db, input.storeId, connection.adAccountId, previous)
  ]);
  if (!currentRows.length) return null;

  const current = aggregateAds(currentRows);
  const prev = aggregateAds(previousRows);
  const creatives: CreativeInput[] = [...current.entries()].map(([creativeId, a]) => {
    const p = prev.get(creativeId);
    return {
      creativeId,
      name: a.name,
      campaignId: a.campaignId,
      spend: a.spend,
      revenue: a.revenue,
      purchases: a.purchases,
      clicks: a.clicks,
      impressions: a.impressions,
      previous: p ? { spend: p.spend, revenue: p.revenue, purchases: p.purchases, clicks: p.clicks, impressions: p.impressions } : null
    };
  });

  const campaigns: CampaignInput[] = input.overview.campaigns.map((c) => ({
    campaignId: c.campaignId,
    name: c.campaignName,
    spend: c.spend,
    revenue: c.revenue,
    purchases: c.purchases,
    clicks: c.clicks,
    impressions: c.impressions,
    funnel: { linkClicks: c.linkClicks, landingPageViews: c.landingPageViews, addToCart: c.addToCart, initiateCheckout: c.initiateCheckout }
  }));

  return buildCreativeSignals({
    account: {
      spend: input.overview.totalSpend,
      revenue: input.overview.totalRevenue,
      purchases: input.overview.totalPurchases,
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
      impressions: campaigns.reduce((s, c) => s + c.impressions, 0)
    },
    breakevenRoas: input.breakevenRoas,
    campaigns,
    creatives
  });
}
