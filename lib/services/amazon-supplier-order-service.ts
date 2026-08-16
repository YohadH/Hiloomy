import type {
  AmazonSupplierOrderCandidate,
  AmazonSupplierOrderDraft,
  AmazonSupplierOrdersWorkspace,
  AmazonSupplierProductMapping,
  GrowthProductRecommendation
} from "@/lib/domain/growth-agent-types";
import { getDb, isDatabaseConnectionError } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { getGrowthAgentStoreContext, getGrowthFindings, saveGrowthPlatformConnection } from "@/lib/services/growth-agent-service";

interface AmazonSupplierConfig {
  mappings?: AmazonSupplierProductMapping[];
  drafts?: AmazonSupplierOrderDraft[];
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function readConfig(value: unknown): AmazonSupplierConfig {
  if (!value || typeof value !== "object") return { mappings: [], drafts: [] };
  const record = value as AmazonSupplierConfig;
  return {
    mappings: Array.isArray(record.mappings) ? record.mappings : [],
    drafts: Array.isArray(record.drafts) ? record.drafts : []
  };
}

function extractRecommendations(findings: Awaited<ReturnType<typeof getGrowthFindings>>): GrowthProductRecommendation[] {
  return findings
    .filter((finding) => finding.findingType === "product_opportunity" && finding.sourceData?.recommendation)
    .map((finding) => finding.sourceData?.recommendation)
    .filter((item): item is GrowthProductRecommendation => Boolean(item));
}

function mapRecentOrders(records: any[]): AmazonSupplierOrderCandidate[] {
  return records.map((order) => ({
    orderId: order.id,
    orderNumber: order.displayName ?? order.orderNumber,
    customerName: order.customer?.name ?? null,
    customerEmail: order.customer?.email ?? null,
    createdAt: order.createdAt.toISOString(),
    fulfillmentStatus: order.fulfillmentStatus ?? null,
    financialStatus: order.financialStatus ?? null,
    lineItems: order.lineItems.map((lineItem: any) => ({
      id: lineItem.id,
      title: lineItem.title,
      quantity: lineItem.quantity,
      productId: lineItem.productId ?? null,
      productTitle: lineItem.product?.title ?? null
    }))
  }));
}

async function getStoreContext(storeId?: string, options?: { allowFallback?: boolean }) {
  const context = await getGrowthAgentStoreContext(storeId);
  if (!context.db && !options?.allowFallback) {
    throw new AppError("Database client is not available.", 500);
  }
  return context;
}

async function getConfigForStore(storeId?: string, options?: { allowFallback?: boolean }) {
  const { db, store } = await getStoreContext(storeId, options);
  if (!db?.platformConnection) {
    if (options?.allowFallback) {
      return {
        db: null,
        store,
        connection: null,
        config: readConfig(null)
      };
    }
    throw new AppError("Database client is not available.", 500);
  }

  try {
    const connection = await db.platformConnection.findUnique({
      where: { storeId_platform: { storeId: store.id, platform: "amazon" } }
    });

    return {
      db,
      store,
      connection,
      config: readConfig(connection?.config)
    };
  } catch (error) {
    if (options?.allowFallback && isDatabaseConnectionError(error)) {
      return {
        db: null,
        store,
        connection: null,
        config: readConfig(null)
      };
    }
    throw error;
  }
}

async function persistAmazonConfig(storeId: string, config: AmazonSupplierConfig) {
  const mappings = config.mappings ?? [];
  const drafts = config.drafts ?? [];
  const status = mappings.length || drafts.length ? "connected" : "stub";
  const healthMessage = drafts.length
    ? `Amazon supplier drafting has ${drafts.length} draft order${drafts.length === 1 ? "" : "s"} ready for review.`
    : mappings.length
      ? `Amazon supplier drafting has ${mappings.length} mapped product${mappings.length === 1 ? "" : "s"} ready for order drafting.`
      : "Amazon supplier drafting is ready. Save ASINs or supplier URLs to prepare manual dropship order drafts.";

  await saveGrowthPlatformConnection({
    platform: "amazon",
    status,
    healthMessage,
    lastSyncAt: new Date().toISOString(),
    config: {
      mappingsCount: mappings.length,
      draftsCount: drafts.length
    }
  }, storeId);

  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  await db.platformConnection.upsert({
    where: { storeId_platform: { storeId, platform: "amazon" } },
    update: { config },
    create: {
      storeId,
      platform: "amazon",
      status,
      healthMessage,
      config,
      lastSyncAt: new Date()
    }
  });
}

export async function getAmazonSupplierOrdersWorkspace(storeId?: string): Promise<AmazonSupplierOrdersWorkspace> {
  const { db, store, config } = await getConfigForStore(storeId, { allowFallback: true });
  const findings = await getGrowthFindings(store.id);
  const orders = db?.order
    ? await db.order.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          customer: true,
          lineItems: {
            include: { product: true },
            orderBy: { createdAt: "asc" }
          }
        }
      }).catch((error: unknown) => {
        if (isDatabaseConnectionError(error)) return [];
        throw error;
      })
    : [];

  return {
    recommendations: extractRecommendations(findings),
    mappings: config.mappings ?? [],
    drafts: (config.drafts ?? []).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    recentOrders: mapRecentOrders(orders)
  };
}

export async function saveAmazonProductMapping(input: {
  recommendationId: string;
  recommendationTitle: string;
  supplierUrl: string;
  amazonAsin?: string | null;
  shopifyProductTitle?: string | null;
  shopifyProductId?: string | null;
  notes?: string | null;
  sourceDomain?: string | null;
}, storeId?: string) {
  if (!input.recommendationId || !input.recommendationTitle || !input.supplierUrl?.trim()) {
    throw new AppError("Recommendation, title, and supplier URL are required.", 400);
  }

  const { store, config } = await getConfigForStore(storeId);
  const nextMapping: AmazonSupplierProductMapping = {
    recommendationId: input.recommendationId,
    recommendationTitle: input.recommendationTitle,
    supplierUrl: input.supplierUrl.trim(),
    amazonAsin: input.amazonAsin?.trim() || null,
    shopifyProductTitle: input.shopifyProductTitle?.trim() || null,
    shopifyProductId: input.shopifyProductId?.trim() || null,
    notes: input.notes?.trim() || null,
    sourceDomain: input.sourceDomain?.trim() || null,
    updatedAt: new Date().toISOString()
  };

  const mappings = [...(config.mappings ?? [])];
  const index = mappings.findIndex((item) => item.recommendationId === nextMapping.recommendationId);
  if (index >= 0) mappings[index] = nextMapping;
  else mappings.unshift(nextMapping);

  await persistAmazonConfig(store.id, {
    mappings,
    drafts: config.drafts ?? []
  });

  return { ok: true, mapping: nextMapping };
}

export async function createAmazonSupplierOrderDraft(input: {
  orderId: string;
  lineItemId: string;
  recommendationId: string;
  notes?: string | null;
}, storeId?: string) {
  const { db, store, config } = await getConfigForStore(storeId);
  const order = await db.order.findFirst({
    where: { id: input.orderId, storeId: store.id },
    include: {
      customer: true,
      lineItems: { include: { product: true } }
    }
  });

  if (!order) throw new AppError("Order was not found.", 404);
  const lineItem = order.lineItems.find((item: any) => item.id === input.lineItemId);
  if (!lineItem) throw new AppError("Order line item was not found.", 404);

  const mapping = (config.mappings ?? []).find((item) => item.recommendationId === input.recommendationId);
  if (!mapping) throw new AppError("Create a supplier mapping for this product before drafting an order.", 400);

  const draft: AmazonSupplierOrderDraft = {
    id: `amazon-draft-${Date.now()}-${input.lineItemId}`,
    orderId: order.id,
    orderNumber: order.displayName ?? order.orderNumber,
    customerName: order.customer?.name ?? null,
    lineItemId: lineItem.id,
    lineItemTitle: lineItem.title,
    quantity: lineItem.quantity,
    recommendationId: mapping.recommendationId,
    recommendationTitle: mapping.recommendationTitle,
    amazonAsin: mapping.amazonAsin ?? null,
    supplierUrl: mapping.supplierUrl,
    notes: input.notes?.trim() || mapping.notes || null,
    status: "draft",
    createdAt: new Date().toISOString(),
    approvedAt: null
  };

  const drafts = [draft, ...(config.drafts ?? []).filter((item) => !(item.orderId === draft.orderId && item.lineItemId === draft.lineItemId))];
  await persistAmazonConfig(store.id, { mappings: config.mappings ?? [], drafts });

  return { ok: true, draft };
}

export async function approveAmazonSupplierOrderDraft(draftId: string, storeId?: string) {
  const { store, config } = await getConfigForStore(storeId);
  const drafts = [...(config.drafts ?? [])];
  const index = drafts.findIndex((item) => item.id === draftId);
  if (index < 0) throw new AppError("Supplier draft was not found.", 404);

  drafts[index] = {
    ...drafts[index],
    status: "approved",
    approvedAt: new Date().toISOString()
  };

  await persistAmazonConfig(store.id, { mappings: config.mappings ?? [], drafts });
  return { ok: true, draft: drafts[index] };
}

export function suggestRecommendationForLineItem(
  lineItemTitle: string,
  mappings: AmazonSupplierProductMapping[]
) {
  const title = normalizeText(lineItemTitle);
  return mappings.find((mapping) => {
    const recommendationMatch = normalizeText(mapping.recommendationTitle);
    const shopifyMatch = mapping.shopifyProductTitle ? normalizeText(mapping.shopifyProductTitle) : "";
    return title.includes(recommendationMatch) || recommendationMatch.includes(title) || (shopifyMatch && (title.includes(shopifyMatch) || shopifyMatch.includes(title)));
  }) ?? null;
}
