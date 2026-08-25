// Campaign ↔ product links (F-013/F-004).
//
// Meta campaign names are free text — nothing in the data says which
// product a campaign pushes, so every "campaign × commerce" question
// (about to stock out while ads still spend? clicks fine but no sales?)
// was unanswerable. The owner tags campaigns with products once in
// Settings; this service is the CRUD plus the one join every alert
// engine shares: product → the live campaigns currently pushing it.

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { toNumber } from "@/lib/server/numbers";

export interface CampaignSummary {
  campaignId: string;
  campaignName: string;
  // Trailing-30d totals, so the picker shows which campaigns matter.
  spend: number;
  purchases: number;
  // Spent within the last 7 days → considered "live".
  active: boolean;
  linkedProducts: Array<{ productId: string; title: string }>;
}

export interface CampaignLinksOverview {
  campaigns: CampaignSummary[];
  products: Array<{ productId: string; title: string }>;
}

const CAMPAIGN_LOOKBACK_DAYS = 30;
const ACTIVE_WINDOW_DAYS = 7;

export async function getCampaignLinksOverview(storeId: string): Promise<CampaignLinksOverview> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const now = Date.now();
  const since = new Date(now - CAMPAIGN_LOOKBACK_DAYS * 86_400_000);
  const activeSince = new Date(now - ACTIVE_WINDOW_DAYS * 86_400_000);

  const [insights, links, products] = await Promise.all([
    db.metaAdsCampaignInsight.groupBy({
      by: ["campaignId", "campaignName"],
      where: { storeId, level: "campaign", dateStart: { gte: since } },
      _sum: { spend: true, purchases: true },
      _max: { dateStart: true }
    }) as Promise<
      Array<{
        campaignId: string;
        campaignName: string;
        _sum: { spend: unknown; purchases: number | null };
        _max: { dateStart: Date | null };
      }>
    >,
    db.campaignProductLink.findMany({
      where: { storeId },
      select: {
        campaignId: true,
        product: { select: { id: true, title: true } }
      }
    }) as Promise<Array<{ campaignId: string; product: { id: string; title: string } }>>,
    db.product.findMany({
      where: { storeId, status: { equals: "ACTIVE", mode: "insensitive" } },
      select: { id: true, title: true },
      orderBy: { title: "asc" }
    }) as Promise<Array<{ id: string; title: string }>>
  ]);

  const linksByCampaign = new Map<string, Array<{ productId: string; title: string }>>();
  for (const link of links) {
    const list = linksByCampaign.get(link.campaignId) ?? [];
    list.push({ productId: link.product.id, title: link.product.title });
    linksByCampaign.set(link.campaignId, list);
  }

  // Same campaignId can appear under several historical names — keep the
  // latest-name row per id (highest spend wins the tiebreak).
  const byId = new Map<string, CampaignSummary>();
  for (const row of insights) {
    const spend = toNumber(row._sum.spend);
    const existing = byId.get(row.campaignId);
    const candidate: CampaignSummary = {
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      spend: (existing?.spend ?? 0) + spend,
      purchases: (existing?.purchases ?? 0) + Number(row._sum.purchases ?? 0),
      active:
        (existing?.active ?? false) ||
        (row._max.dateStart != null && row._max.dateStart.getTime() >= activeSince.getTime() && spend > 0),
      linkedProducts: linksByCampaign.get(row.campaignId) ?? []
    };
    byId.set(row.campaignId, candidate);
  }

  const campaigns = [...byId.values()].sort(
    (a, b) => Number(b.active) - Number(a.active) || b.spend - a.spend
  );
  return {
    campaigns,
    products: products.map((p) => ({ productId: p.id, title: p.title }))
  };
}

export async function addCampaignProductLink(
  storeId: string,
  input: { campaignId?: string; campaignName?: string; productId?: string }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const campaignId = typeof input.campaignId === "string" ? input.campaignId.trim() : "";
  const campaignName = typeof input.campaignName === "string" ? input.campaignName.trim().slice(0, 300) : "";
  const productId = typeof input.productId === "string" ? input.productId.trim() : "";
  if (!campaignId || !productId) throw new AppError("campaignId and productId are required.", 400);

  const product = await db.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
  if (!product) throw new AppError("Product not found for this store.", 404);

  await db.campaignProductLink.upsert({
    where: { storeId_campaignId_productId: { storeId, campaignId, productId } },
    update: { campaignName },
    create: { storeId, campaignId, campaignName, productId }
  });
}

export async function removeCampaignProductLink(
  storeId: string,
  input: { campaignId?: string; productId?: string }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const campaignId = typeof input.campaignId === "string" ? input.campaignId.trim() : "";
  const productId = typeof input.productId === "string" ? input.productId.trim() : "";
  if (!campaignId || !productId) throw new AppError("campaignId and productId are required.", 400);
  await db.campaignProductLink.deleteMany({ where: { storeId, campaignId, productId } });
}

export interface LiveCampaignForProduct {
  campaignId: string;
  campaignName: string;
  spend: number;
  clicks: number;
  purchases: number;
}

/**
 * productId → the campaigns that spent money on it within the trailing
 * `sinceDays`. THE join the alert engines were missing: "is a campaign
 * currently pushing this product?" Returns an empty map when the owner
 * hasn't tagged anything — callers degrade to their old single-source
 * behavior.
 */
export async function getActiveCampaignsByProduct(
  storeId: string,
  sinceDays = ACTIVE_WINDOW_DAYS
): Promise<Map<string, LiveCampaignForProduct[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const links = (await db.campaignProductLink.findMany({
    where: { storeId },
    select: { campaignId: true, campaignName: true, productId: true }
  })) as Array<{ campaignId: string; campaignName: string; productId: string }>;
  if (links.length === 0) return new Map();

  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const insights = (await db.metaAdsCampaignInsight.groupBy({
    by: ["campaignId"],
    where: {
      storeId,
      level: "campaign",
      campaignId: { in: [...new Set(links.map((l) => l.campaignId))] },
      dateStart: { gte: since }
    },
    _sum: { spend: true, clicks: true, purchases: true }
  })) as Array<{
    campaignId: string;
    _sum: { spend: unknown; clicks: number | null; purchases: number | null };
  }>;

  const liveById = new Map<string, { spend: number; clicks: number; purchases: number }>();
  for (const row of insights) {
    const spend = toNumber(row._sum.spend);
    if (spend <= 0) continue;
    liveById.set(row.campaignId, {
      spend,
      clicks: Number(row._sum.clicks ?? 0),
      purchases: Number(row._sum.purchases ?? 0)
    });
  }

  const byProduct = new Map<string, LiveCampaignForProduct[]>();
  for (const link of links) {
    const live = liveById.get(link.campaignId);
    if (!live) continue;
    const list = byProduct.get(link.productId) ?? [];
    list.push({ campaignId: link.campaignId, campaignName: link.campaignName, ...live });
    byProduct.set(link.productId, list);
  }
  for (const list of byProduct.values()) list.sort((a, b) => b.spend - a.spend);
  return byProduct;
}
