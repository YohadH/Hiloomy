import { getDb, withOptionalDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { reportError } from "@/lib/server/error-report";
import { aggregateDailyMetrics, persistSummary } from "@/lib/services/daily-metric-aggregator";
import { createShopifyClient, ShopifyGraphQLClient } from "@/lib/shopify/client";
import { COLLECTIONS_QUERY, COLLECTION_PRODUCTS_PAGE_QUERY } from "@/lib/shopify/queries/collections";
import { CUSTOMERS_QUERY } from "@/lib/shopify/queries/customers";
import { ORDERS_QUERY } from "@/lib/shopify/queries/orders";
import { PRODUCTS_QUERY } from "@/lib/shopify/queries/products";
import { SHOP_QUERY } from "@/lib/shopify/queries/shop";
import { bulkCustomersQuery, bulkOrdersQuery, bulkProductsQuery } from "@/lib/shopify/queries/bulk";
import {
  BulkOperationBusyError,
  fetchBulkJsonl,
  pollBulkOperation,
  reassembleByParent,
  runBulkQuery,
  type ChildAttachPlan
} from "@/lib/shopify/bulk-client";
import { mapCustomerNode, mapOrderNode, mapProductNode, mapShopMetadata } from "@/lib/shopify/mappers/shopify-mappers";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import type { SyncMode, SyncRunSummary } from "@/lib/domain/types";

// Stores at or above this many orders use Bulk Operations for the initial sync;
// smaller stores keep using the paginated path (a single bulk op has fixed
// kickoff + poll overhead that isn't worth it for a few hundred orders).
// Override with SHOPIFY_BULK_SYNC_THRESHOLD.
const BULK_SYNC_ORDER_THRESHOLD = (() => {
  const n = Number(process.env.SHOPIFY_BULK_SYNC_THRESHOLD);
  return Number.isFinite(n) && n > 0 ? n : 1000;
})();

// A full initial sync for a high-volume store (tens of thousands of orders /
// customers) legitimately runs well over 20 minutes. The old 20-minute cutoff
// made the staleness watchdog guillotine healthy, in-progress syncs before they
// could finish — so they never recorded success. Default to 3h; override with
// SHOPIFY_SYNC_STALE_THRESHOLD_MIN if a store needs more/less.
const STALE_SYNC_THRESHOLD_MS =
  (() => {
    const mins = Number(process.env.SHOPIFY_SYNC_STALE_THRESHOLD_MIN);
    return Number.isFinite(mins) && mins > 0 ? mins : 180;
  })() *
  60 *
  1000;
const STALE_SYNC_ERROR_MESSAGE = "Previous sync was interrupted before completion.";
const SUPERSEDED_SYNC_ERROR_MESSAGE = "This sync was closed after another sync completed for the store.";
const ACTIVE_SYNC_ERROR_MESSAGE = "A Shopify sync is already running for this store. Wait for it to finish before starting another one.";

// Max in-flight upserts at any moment during a sync. Kept BELOW the Prisma
// connection-pool size (5, see lib/prisma.ts) so the sync never tries to fetch
// more connections than the pool can hand out — that exact mismatch is what
// produced the "Timed out fetching a new connection from the connection pool"
// failure during initial sync (SA-FIX3). Override with SHOPIFY_SYNC_CONCURRENCY.
const SYNC_UPSERT_CONCURRENCY = (() => {
  const n = Number(process.env.SHOPIFY_SYNC_CONCURRENCY);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 4) : 4;
})();

/**
 * Processes `items` through `worker` in fixed-size chunks, awaiting each chunk
 * before starting the next. This bounds the number of concurrent DB operations
 * to at most `chunkSize`, so a large initial sync never exhausts the Prisma
 * connection pool while still being far faster than a strictly serial loop.
 * Errors propagate (the whole sync fails) exactly as the old serial loop did.
 */
async function processInChunks<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  chunkSize: number = SYNC_UPSERT_CONCURRENCY
): Promise<void> {
  const size = Math.max(1, chunkSize);
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.all(chunk.map((item) => worker(item)));
  }
}

function buildUpdatedAfterQuery(updatedAfter?: Date | null) {
  return updatedAfter ? `updated_at:>=${updatedAfter.toISOString()}` : undefined;
}

async function startSyncRun(storeId: string, mode: SyncMode, syncFrom?: Date | null) {
  const db = getDb();
  return db.syncRun.create({
    data: {
      storeId,
      mode,
      status: "running",
      syncFrom: syncFrom ?? null
    }
  });
}

async function finishSyncRun(syncRunId: string, payload: Record<string, unknown>) {
  const db = getDb();
  return db.syncRun.update({
    where: { id: syncRunId },
    data: {
      ...payload,
      completedAt: new Date()
    }
  });
}

async function setConnectionSyncState(storeId: string, status: "running" | "success" | "error", error?: string | null) {
  const db = getDb();
  return db.shopifyConnection.update({
    where: { storeId },
    data: {
      syncStatus: status,
      lastSyncError: error ?? null,
      ...(status === "success" ? { lastSyncAt: new Date(), lastSuccessfulSyncAt: new Date() } : {})
    }
  });
}

async function reconcileRunningSyncRuns(storeId: string) {
  const db = getDb();
  const connection = await db.shopifyConnection.findUnique({
    where: { storeId },
    select: { syncStatus: true }
  });
  const runningRuns = await db.syncRun.findMany({
    where: {
      storeId,
      status: "running"
    },
    orderBy: { startedAt: "asc" }
  });

  if (!runningRuns.length) {
    return [];
  }

  const now = Date.now();
  const storeStillRunning = connection?.syncStatus === "running";
  const staleRuns = runningRuns.filter((run: any) => {
    if (!storeStillRunning) {
      return true;
    }

    return now - run.startedAt.getTime() > STALE_SYNC_THRESHOLD_MS;
  });
  const activeRuns = runningRuns.filter((run: any) => now - run.startedAt.getTime() <= STALE_SYNC_THRESHOLD_MS);

  if (staleRuns.length) {
    const staleRunIds = staleRuns.map((run: any) => run.id);
    const staleMessage = storeStillRunning ? STALE_SYNC_ERROR_MESSAGE : SUPERSEDED_SYNC_ERROR_MESSAGE;
    await db.syncRun.updateMany({
      where: { id: { in: staleRunIds } },
      data: {
        status: "error",
        errorMessage: staleMessage,
        completedAt: new Date()
      }
    });

    if (!activeRuns.length && storeStillRunning) {
      await db.shopifyConnection.update({
        where: { storeId },
        data: {
          syncStatus: "error",
          lastSyncError: STALE_SYNC_ERROR_MESSAGE
        }
      });
    }
  }

  return storeStillRunning ? activeRuns : [];
}

async function ensureSyncCanStart(storeId: string) {
  const activeRuns = await reconcileRunningSyncRuns(storeId);
  if (activeRuns.length) {
    throw new AppError(ACTIVE_SYNC_ERROR_MESSAGE, 409);
  }
}

export async function syncStoreMetadata(storeId: string) {
  const db = getDb();
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const data = await client.request<{ shop: any }>(SHOP_QUERY);
  const mapped = mapShopMetadata(data.shop);

  await db.store.update({
    where: { id: storeId },
    data: {
      name: mapped.name,
      domain: mapped.domain,
      shopifyShopId: mapped.shopifyShopId,
      currency: mapped.currency,
      timezone: mapped.timezone,
      planName: mapped.planName,
      connected: true
    }
  });
}

/**
 * Persists a single mapped product (and its variants). Returns how many variants
 * were upserted so callers can keep their created/updated counters. Shared by the
 * paginated and bulk product sync paths.
 */
async function upsertProductFromNode(db: any, storeId: string, productNode: any): Promise<{ variants: number }> {
  const mapped = mapProductNode(productNode, storeId);
  const product = await db.product.upsert({
    where: {
      storeId_shopifyProductId: {
        storeId,
        shopifyProductId: mapped.product.shopifyProductId
      }
    },
    update: mapped.product,
    create: mapped.product
  });

  for (const variant of mapped.variants) {
    await db.productVariant.upsert({
      where: {
        storeId_shopifyVariantId: {
          storeId,
          shopifyVariantId: variant.shopifyVariantId
        }
      },
      update: {
        ...variant,
        productId: product.id
      },
      create: {
        ...variant,
        productId: product.id
      }
    });
  }

  return { variants: mapped.variants.length };
}

export async function syncProducts(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);

  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const query = buildUpdatedAfterQuery(updatedAfter);
  const products = await client.paginateConnection<any, { products: any }>("products", PRODUCTS_QUERY, { query });
  let created = 0;
  let updated = 0;

  await processInChunks(products, async (productNode) => {
    const { variants } = await upsertProductFromNode(db, storeId, productNode);
    updated += 1;
    created += variants;
  });

  await db.shopifyConnection.update({
    where: { storeId },
    data: {
      lastProductsSyncAt: new Date()
    }
  });

  return { created, updated, fetched: products.length };
}

function stripGid(gid?: string | null) {
  if (!gid) return null;
  return gid.split("/").pop() ?? gid;
}

export async function syncCollections(storeId: string) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);

  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);

  // Build a lookup from shopify product id -> internal product id (for membership rows)
  const products = await db.product.findMany({
    where: { storeId },
    select: { id: true, shopifyProductId: true }
  });
  const productLookup = new Map(products.map((p: { id: string; shopifyProductId: string }) => [p.shopifyProductId, p.id]));

  let collectionsFetched = 0;
  let collectionsUpdated = 0;
  let membershipsCreated = 0;
  let cursor: string | null = null;

  do {
    const page: any = await (client as any).request(COLLECTIONS_QUERY, { cursor });
    const edges = page?.collections?.edges ?? [];
    cursor = page?.collections?.pageInfo?.hasNextPage
      ? page?.collections?.pageInfo?.endCursor ?? null
      : null;

    for (const edge of edges) {
      const node = edge.node;
      const shopifyCollectionId = stripGid(node.id);
      if (!shopifyCollectionId) continue;
      const isAutomatic = Boolean(node.ruleSet?.rules?.length);

      const collection = await db.shopifyCollection.upsert({
        where: {
          storeId_shopifyCollectionId: { storeId, shopifyCollectionId }
        },
        update: {
          title: node.title ?? "Untitled",
          handle: node.handle ?? "",
          isAutomatic,
          productsCount: node.productsCount?.count ?? 0,
          updatedAt: node.updatedAt ? new Date(node.updatedAt) : new Date()
        },
        create: {
          storeId,
          shopifyCollectionId,
          title: node.title ?? "Untitled",
          handle: node.handle ?? "",
          isAutomatic,
          productsCount: node.productsCount?.count ?? 0,
          updatedAt: node.updatedAt ? new Date(node.updatedAt) : new Date()
        }
      });
      collectionsFetched += 1;
      collectionsUpdated += 1;

      // Collect all member product ids for this collection (paginate if needed)
      const memberShopifyIds: string[] = [];
      const initial = node.products?.edges ?? [];
      for (const productEdge of initial) {
        const pid = stripGid(productEdge.node?.id);
        if (pid) memberShopifyIds.push(pid);
      }

      let membersCursor: string | null = node.products?.pageInfo?.hasNextPage
        ? node.products?.pageInfo?.endCursor ?? null
        : null;
      while (membersCursor) {
        const more: any = await (client as any).request(COLLECTION_PRODUCTS_PAGE_QUERY, {
          collectionId: node.id,
          cursor: membersCursor
        });
        const moreEdges = more?.collection?.products?.edges ?? [];
        for (const me of moreEdges) {
          const pid = stripGid(me.node?.id);
          if (pid) memberShopifyIds.push(pid);
        }
        membersCursor = more?.collection?.products?.pageInfo?.hasNextPage
          ? more?.collection?.products?.pageInfo?.endCursor ?? null
          : null;
      }

      // Replace the membership set for this collection
      await db.productCollectionMembership.deleteMany({
        where: { storeId, collectionId: collection.id }
      });
      const memberInternalIds = memberShopifyIds
        .map((sid) => productLookup.get(sid))
        .filter((id): id is string => Boolean(id));

      if (memberInternalIds.length) {
        await db.productCollectionMembership.createMany({
          data: memberInternalIds.map((productId) => ({
            storeId,
            productId,
            collectionId: collection.id
          })),
          skipDuplicates: true
        });
        membershipsCreated += memberInternalIds.length;
      }
    }
  } while (cursor);

  return { fetched: collectionsFetched, updated: collectionsUpdated, memberships: membershipsCreated };
}

/** Persists a single mapped customer. Shared by paginated and bulk customer sync. */
async function upsertCustomerFromNode(db: any, storeId: string, customerNode: any): Promise<void> {
  const mapped = mapCustomerNode(customerNode, storeId);
  await db.customer.upsert({
    where: {
      storeId_shopifyCustomerId: {
        storeId,
        shopifyCustomerId: mapped.shopifyCustomerId
      }
    },
    update: mapped,
    create: mapped
  });
}

export async function syncCustomers(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const query = buildUpdatedAfterQuery(updatedAfter);
  const customers = await client.paginateConnection<any, { customers: any }>("customers", CUSTOMERS_QUERY, { query });

  await processInChunks(customers, (customerNode) => upsertCustomerFromNode(db, storeId, customerNode));

  await db.shopifyConnection.update({
    where: { storeId },
    data: {
      lastCustomersSyncAt: new Date()
    }
  });

  return { created: customers.length, updated: customers.length, fetched: customers.length };
}

/**
 * Persists a single mapped order (and its line items, discounts, refunds) into the
 * DB. Shared by BOTH the paginated `syncOrders` and the bulk `bulkSyncOrders` path
 * so the two never drift apart. `db` and `store` are passed in so the caller can
 * resolve them once per run instead of per order.
 */
async function upsertOrderFromMapped(
  db: any,
  storeId: string,
  store: any,
  orderNode: any,
  preload?: {
    productsByShopifyId: Map<string, any>;
    variantsByShopifyId: Map<string, any>;
  }
): Promise<void> {
  const mapped = mapOrderNode(orderNode, storeId, Number(store.defaultCostRatio ?? 0.35));

  const customer = mapped.order.shopifyCustomerId
    ? await db.customer.findUnique({
        where: {
          storeId_shopifyCustomerId: {
            storeId,
            shopifyCustomerId: mapped.order.shopifyCustomerId
          }
        }
      })
    : null;

  const orderRecord = await db.order.upsert({
    where: {
      storeId_shopifyOrderId: {
        storeId,
        shopifyOrderId: mapped.order.shopifyOrderId
      }
    },
    update: {
      orderNumber: mapped.order.orderNumber,
      displayName: mapped.order.displayName,
      createdAt: mapped.order.createdAt,
      processedAt: mapped.order.processedAt,
      currency: mapped.order.currency,
      subtotalPrice: mapped.order.subtotalPrice,
      totalDiscounts: mapped.order.totalDiscounts,
      totalTax: mapped.order.totalTax,
      totalShipping: mapped.order.totalShipping,
      totalRefunds: mapped.order.totalRefunds,
      totalPrice: mapped.order.totalPrice,
      taxesIncluded: mapped.order.taxesIncluded,
      financialStatus: mapped.order.financialStatus,
      fulfillmentStatus: mapped.order.fulfillmentStatus,
      cancelledAt: mapped.order.cancelledAt,
      test: mapped.order.test,
      sourceName: mapped.order.sourceName,
      landingSiteRef: mapped.order.landingSiteRef ?? null,
      referringSite: mapped.order.referringSite ?? null,
      updatedAt: mapped.order.updatedAt,
      customerId: customer?.id ?? null
    },
    create: {
      storeId,
      shopifyOrderId: mapped.order.shopifyOrderId,
      orderNumber: mapped.order.orderNumber,
      displayName: mapped.order.displayName,
      createdAt: mapped.order.createdAt,
      processedAt: mapped.order.processedAt,
      currency: mapped.order.currency,
      subtotalPrice: mapped.order.subtotalPrice,
      totalDiscounts: mapped.order.totalDiscounts,
      totalTax: mapped.order.totalTax,
      totalShipping: mapped.order.totalShipping,
      totalRefunds: mapped.order.totalRefunds,
      totalPrice: mapped.order.totalPrice,
      taxesIncluded: mapped.order.taxesIncluded,
      financialStatus: mapped.order.financialStatus,
      fulfillmentStatus: mapped.order.fulfillmentStatus,
      cancelledAt: mapped.order.cancelledAt,
      test: mapped.order.test,
      sourceName: mapped.order.sourceName,
      landingSiteRef: mapped.order.landingSiteRef ?? null,
      referringSite: mapped.order.referringSite ?? null,
      updatedAt: mapped.order.updatedAt,
      customerId: customer?.id ?? null
    }
  });

  await db.orderLineItem.deleteMany({ where: { orderId: orderRecord.id } });
  await db.discountUsage.deleteMany({ where: { orderId: orderRecord.id } });
  await db.refund.deleteMany({ where: { orderId: orderRecord.id } });

  for (const lineItem of mapped.lineItems) {
    // Preload path avoids the per-line-item N+1: caller batch-loaded products
    // and variants for the whole 100-order block, so lookups become O(1). Falls
    // back to per-item findUnique when the block-level orchestrator wasn't used.
    let product: any = null;
    let variant: any = null;
    if (preload) {
      product = lineItem.shopifyProductId
        ? preload.productsByShopifyId.get(lineItem.shopifyProductId) ?? null
        : null;
      variant = lineItem.shopifyVariantId
        ? preload.variantsByShopifyId.get(lineItem.shopifyVariantId) ?? null
        : null;
    } else {
      product = lineItem.shopifyProductId
        ? await db.product.findUnique({
            where: {
              storeId_shopifyProductId: {
                storeId,
                shopifyProductId: lineItem.shopifyProductId
              }
            }
          })
        : null;
      variant = lineItem.shopifyVariantId
        ? await db.productVariant.findUnique({
            where: {
              storeId_shopifyVariantId: {
                storeId,
                shopifyVariantId: lineItem.shopifyVariantId
              }
            }
          })
        : null;
    }
    const overrideCost = product?.costOverrideAmount ? Number(product.costOverrideAmount) * lineItem.quantity : null;

    await db.orderLineItem.create({
      data: {
        storeId,
        orderId: orderRecord.id,
        productId: product?.id ?? null,
        variantId: variant?.id ?? null,
        shopifyLineItemId: lineItem.shopifyLineItemId,
        title: lineItem.title,
        quantity: lineItem.quantity,
        originalUnitPrice: lineItem.originalUnitPrice,
        discountedUnitPrice: lineItem.discountedUnitPrice,
        lineSubtotal: lineItem.lineSubtotal,
        lineDiscountAmount: lineItem.lineDiscountAmount,
        taxAmount: lineItem.taxAmount,
        refundedQuantity: lineItem.refundedQuantity,
        refundedSubtotal: lineItem.refundedSubtotal,
        estimatedCostAmount: overrideCost ?? lineItem.estimatedCostAmount
      }
    });
  }

  for (const discount of mapped.discounts) {
    await db.discountUsage.create({
      data: {
        storeId,
        orderId: orderRecord.id,
        code: discount.code,
        amount: mapped.order.totalDiscounts / Math.max(mapped.discounts.length, 1)
      }
    });
  }

  for (const refund of mapped.refunds) {
    await db.refund.create({
      data: {
        storeId,
        orderId: orderRecord.id,
        shopifyRefundId: refund.shopifyRefundId,
        refundedAmount: refund.refundedAmount,
        refundedLineItemsAmount: refund.refundedLineItemsAmount,
        createdAt: refund.createdAt
      }
    });
  }
}

// Block size for the product/variant preload. Small enough that the two
// findMany queries stay well under Postgres's parameter cap and keep memory
// bounded, large enough that the round-trip savings dominate. On a 30k-order
// backfill this cuts product/variant lookups from ~180k to ~600 (2 per block).
const ORDER_PRELOAD_BLOCK_SIZE = 100;

/**
 * Batch-preloads all product and variant rows referenced by a block of order
 * nodes, then upserts each order within the block using the preloaded maps.
 * This replaces the per-line-item findUnique N+1 with 2 findMany queries per
 * ORDER_PRELOAD_BLOCK_SIZE orders.
 *
 * `mapOrderNode` is called twice per order (once to collect ids for the
 * preload, once inside `upsertOrderFromMapped`) — this is pure in-memory work
 * and cheap compared to the round-trips we save.
 */
async function processOrdersWithPreload(
  db: any,
  storeId: string,
  store: any,
  orderNodes: any[]
): Promise<void> {
  const costRatio = Number(store.defaultCostRatio ?? 0.35);
  for (let i = 0; i < orderNodes.length; i += ORDER_PRELOAD_BLOCK_SIZE) {
    const block = orderNodes.slice(i, i + ORDER_PRELOAD_BLOCK_SIZE);

    const productIds = new Set<string>();
    const variantIds = new Set<string>();
    for (const orderNode of block) {
      const mapped = mapOrderNode(orderNode, storeId, costRatio);
      for (const li of mapped.lineItems) {
        if (li.shopifyProductId) productIds.add(li.shopifyProductId);
        if (li.shopifyVariantId) variantIds.add(li.shopifyVariantId);
      }
    }

    const [products, variants] = await Promise.all([
      productIds.size
        ? db.product.findMany({
            where: { storeId, shopifyProductId: { in: Array.from(productIds) } }
          })
        : Promise.resolve([] as any[]),
      variantIds.size
        ? db.productVariant.findMany({
            where: { storeId, shopifyVariantId: { in: Array.from(variantIds) } }
          })
        : Promise.resolve([] as any[])
    ]);

    const productsByShopifyId = new Map<string, any>(
      products.map((p: any) => [p.shopifyProductId, p])
    );
    const variantsByShopifyId = new Map<string, any>(
      variants.map((v: any) => [v.shopifyVariantId, v])
    );

    await processInChunks(block, (orderNode) =>
      upsertOrderFromMapped(db, storeId, store, orderNode, {
        productsByShopifyId,
        variantsByShopifyId
      })
    );
  }
}

export async function syncOrders(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);

  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const query = buildUpdatedAfterQuery(updatedAfter);
  const orders = await client.paginateConnection<any, { orders: any }>("orders", ORDERS_QUERY, { query });

  await processOrdersWithPreload(db, storeId, store, orders);

  await db.shopifyConnection.update({
    where: { storeId },
    data: {
      lastOrdersSyncAt: new Date()
    }
  });

  return { created: orders.length, updated: orders.length, fetched: orders.length };
}

/**
 * Bulk-exports the store's products via a single Shopify Bulk Operation, re-nests
 * each product's variants, and upserts via the shared `upsertProductFromNode`.
 * Returns counts shaped like the paginated `syncProducts` so callers can sum them
 * uniformly. Throws BulkOperationBusyError if a bulk op is already running so the
 * caller can fall back to the paginated path.
 */
async function bulkSyncProducts(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const innerQuery = bulkProductsQuery(updatedAfter);
  const operationId = await runBulkQuery(client, innerQuery);
  const state = await pollBulkOperation(client, operationId);
  const rows = await fetchBulkJsonl(state.url);
  const PRODUCT_CHILD_PLAN: ChildAttachPlan[] = [
    { gidMarker: "/ProductVariant/", field: "variants", shape: "connection" }
  ];
  const productNodes = reassembleByParent(rows, PRODUCT_CHILD_PLAN);
  let created = 0;
  let updated = 0;
  await processInChunks(productNodes, async (productNode) => {
    const { variants } = await upsertProductFromNode(db, storeId, productNode);
    updated += 1;
    created += variants;
  });
  await db.shopifyConnection.update({
    where: { storeId },
    data: { lastProductsSyncAt: new Date() }
  });
  return { fetched: productNodes.length, created, updated };
}

/**
 * Bulk-exports the store's customers via a single Shopify Bulk Operation. Customers
 * have no nested connections we sync, so each JSONL line is a root node mapped
 * directly through the shared `upsertCustomerFromNode`. Throws BulkOperationBusyError
 * if a bulk op is already running.
 */
async function bulkSyncCustomers(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const innerQuery = bulkCustomersQuery(updatedAfter);
  const operationId = await runBulkQuery(client, innerQuery);
  const state = await pollBulkOperation(client, operationId);
  const rows = await fetchBulkJsonl(state.url);
  // No child plan: every customer row is a root node.
  const customerNodes = reassembleByParent(rows, []);
  await processInChunks(customerNodes, (customerNode) => upsertCustomerFromNode(db, storeId, customerNode));
  await db.shopifyConnection.update({
    where: { storeId },
    data: { lastCustomersSyncAt: new Date() }
  });
  return { fetched: customerNodes.length, created: customerNodes.length, updated: customerNodes.length };
}

/**
 * Bulk-exports the store's orders via a single Shopify Bulk Operation, re-nests each
 * order's line items, and upserts via the shared `upsertOrderFromMapped`. Throws
 * BulkOperationBusyError if a bulk op is already running so the caller can fall back
 * to the paginated path.
 */
async function bulkSyncOrders(storeId: string, updatedAfter?: Date | null) {
  const db = getDb();
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError("Store not found.", 404);
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const innerQuery = bulkOrdersQuery(updatedAfter);
  const operationId = await runBulkQuery(client, innerQuery);
  const state = await pollBulkOperation(client, operationId);
  const rows = await fetchBulkJsonl(state.url);
  const ORDER_CHILD_PLAN: ChildAttachPlan[] = [
    { gidMarker: "/LineItem/", field: "lineItems", shape: "connection" }
  ];
  const orderNodes = reassembleByParent(rows, ORDER_CHILD_PLAN);
  await processOrdersWithPreload(db, storeId, store, orderNodes);
  await db.shopifyConnection.update({
    where: { storeId },
    data: { lastOrdersSyncAt: new Date() }
  });
  return { fetched: orderNodes.length, created: orderNodes.length, updated: orderNodes.length };
}

export async function runFullInitialSync(storeId: string): Promise<SyncRunSummary> {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  await ensureSyncCanStart(storeId);

  const syncRun = await startSyncRun(storeId, "initial", null);
  await setConnectionSyncState(storeId, "running");

  try {
    await syncStoreMetadata(storeId);

    // Large stores (>= threshold orders already on record) use a single Bulk
    // Operation per resource instead of hundreds of paginated round-trips. Each
    // bulk call is wrapped so that if a bulk op is already running for the shop
    // (BulkOperationBusyError) we transparently fall back to the paginated path
    // for just that resource. Small stores stay paginated end-to-end.
    const existingOrderCount = await db.order.count({ where: { storeId } });
    const useBulk = existingOrderCount >= BULK_SYNC_ORDER_THRESHOLD;
    console.info(
      `[shopify-sync] initial sync for store ${storeId}: ${existingOrderCount} existing orders; ` +
        `path=${useBulk ? "bulk" : "paginated"} (threshold=${BULK_SYNC_ORDER_THRESHOLD}).`
    );

    const products = useBulk
      ? await bulkSyncProducts(storeId, null).catch((err) => {
          if (err instanceof BulkOperationBusyError) {
            console.warn("[shopify-sync] bulk products busy; falling back to paginated.", err);
            return syncProducts(storeId, null);
          }
          throw err;
        })
      : await syncProducts(storeId, null);

    const collections = await syncCollections(storeId).catch((err) => {
      console.error("Collection sync failed; continuing without collections.", err);
      return { fetched: 0, updated: 0, memberships: 0 };
    });

    const customers = useBulk
      ? await bulkSyncCustomers(storeId, null).catch((err) => {
          if (err instanceof BulkOperationBusyError) {
            console.warn("[shopify-sync] bulk customers busy; falling back to paginated.", err);
            return syncCustomers(storeId, null);
          }
          throw err;
        })
      : await syncCustomers(storeId, null);

    const orders = useBulk
      ? await bulkSyncOrders(storeId, null).catch((err) => {
          if (err instanceof BulkOperationBusyError) {
            console.warn("[shopify-sync] bulk orders busy; falling back to paginated.", err);
            return syncOrders(storeId, null);
          }
          throw err;
        })
      : await syncOrders(storeId, null);

    // ── DATA-03: materialise DailyMetric rows from synced orders ────────
    // Full initial sync — aggregate the last COVERAGE_DAYS (90) of orders.
    const dailyMetricsUpserted = await aggregateDailyMetrics(storeId, null).catch((err) => {
      reportError("aggregateDailyMetrics", err, { storeId, mode: "initial" });
      return 0;
    });
    if (dailyMetricsUpserted > 0) {
      console.info(`[shopify-sync] upserted ${dailyMetricsUpserted} DailyMetric rows for store ${storeId}.`);
    } else {
      // Zero rows written despite a completed order sync — log as a data-gap
      // warning so it is visible in production logs without crashing the sync.
      // AP-T8 / lessons-learned 2026-06-22: zero-writes-with-nonempty-source must be surfaced.
      const orderCount = (orders.created ?? 0) + (orders.updated ?? 0);
      if (orderCount > 0) {
        console.warn("[SA-SILENT-FAIL] aggregateDailyMetrics wrote 0 rows but orders synced > 0:", {
          op: "aggregateDailyMetrics",
          storeId,
          mode: "initial",
          orderCount
        });
      }
    }
    // Persist a Summary row after the metrics are fresh.
    await persistSummary(storeId).catch((err) => {
      reportError("persistSummary", err, { storeId, mode: "initial" });
    });

    const result = await finishSyncRun(syncRun.id, {
      status: "success",
      errorMessage: null,
      recordsCreated: products.created + customers.created + orders.created,
      recordsUpdated: products.updated + customers.updated + orders.updated + collections.updated,
      recordsFailed: 0,
      detailsJson: {
        products,
        collections,
        customers,
        orders,
        dailyMetricsUpserted
      }
    });

    await setConnectionSyncState(storeId, "success", null);

    return {
      id: result.id,
      mode: "initial",
      status: "success",
      startedAt: result.startedAt.toISOString(),
      completedAt: result.completedAt?.toISOString() ?? null,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      recordsFailed: result.recordsFailed,
      errorMessage: result.errorMessage
    };
  } catch (error) {
    const message = toErrorMessage(error);
    await finishSyncRun(syncRun.id, {
      status: "error",
      errorMessage: message
    });
    await setConnectionSyncState(storeId, "error", message);
    throw error;
  }
}

export async function runIncrementalSync(storeId: string): Promise<SyncRunSummary> {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  await ensureSyncCanStart(storeId);

  const connection = await db.shopifyConnection.findUnique({ where: { storeId } });
  const syncFrom = connection?.lastSuccessfulSyncAt ?? connection?.lastSyncAt ?? null;
  const syncRun = await startSyncRun(storeId, "incremental", syncFrom);
  await setConnectionSyncState(storeId, "running");

  try {
    await syncStoreMetadata(storeId);
    const products = await syncProducts(storeId, syncFrom);
    const collections = await syncCollections(storeId).catch((err) => {
      console.error("Collection sync failed; continuing without collections.", err);
      return { fetched: 0, updated: 0, memberships: 0 };
    });
    const customers = await syncCustomers(storeId, syncFrom);
    const orders = await syncOrders(storeId, syncFrom);

    // ── DATA-03: materialise DailyMetric rows from synced orders ────────
    // Incremental sync — narrow the aggregation window to changed days plus
    // a 1-day look-back (handled inside aggregateDailyMetrics via syncFrom).
    const dailyMetricsUpserted = await aggregateDailyMetrics(storeId, syncFrom).catch((err) => {
      reportError("aggregateDailyMetrics", err, { storeId, mode: "incremental" });
      return 0;
    });
    if (dailyMetricsUpserted > 0) {
      console.info(`[shopify-sync] upserted ${dailyMetricsUpserted} DailyMetric rows for store ${storeId}.`);
    } else {
      // Zero rows on an incremental sync with orders is unusual on a non-empty store.
      // AP-T8 / lessons-learned 2026-06-22: zero-writes-with-nonempty-source must be surfaced.
      const orderCount = (orders.created ?? 0) + (orders.updated ?? 0);
      if (orderCount > 0) {
        console.warn("[SA-SILENT-FAIL] aggregateDailyMetrics wrote 0 rows but orders synced > 0:", {
          op: "aggregateDailyMetrics",
          storeId,
          mode: "incremental",
          orderCount
        });
      }
    }
    await persistSummary(storeId).catch((err) => {
      reportError("persistSummary", err, { storeId, mode: "incremental" });
    });

    const result = await finishSyncRun(syncRun.id, {
      status: "success",
      errorMessage: null,
      recordsCreated: products.created + customers.created + orders.created,
      recordsUpdated: products.updated + customers.updated + orders.updated + collections.updated,
      recordsFailed: 0,
      detailsJson: {
        syncFrom: syncFrom?.toISOString() ?? null,
        products,
        collections,
        customers,
        orders,
        dailyMetricsUpserted
      }
    });

    await setConnectionSyncState(storeId, "success", null);

    return {
      id: result.id,
      mode: "incremental",
      status: "success",
      startedAt: result.startedAt.toISOString(),
      completedAt: result.completedAt?.toISOString() ?? null,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      recordsFailed: result.recordsFailed,
      errorMessage: result.errorMessage
    };
  } catch (error) {
    const message = toErrorMessage(error);
    await finishSyncRun(syncRun.id, {
      status: "error",
      errorMessage: message
    });
    await setConnectionSyncState(storeId, "error", message);
    throw error;
  }
}

export async function getSyncStatus(storeId?: string) {
  const storeRecord: any = await withOptionalDb(
    (db) =>
      storeId
        ? db.store.findUnique({ where: { id: storeId }, include: { connection: true } })
        : db.store.findFirst({ where: { connected: true, connection: { isNot: null } }, include: { connection: true }, orderBy: { updatedAt: "desc" } }),
    null
  );

  if (!storeRecord) {
    return { connection: null, recentRuns: [] };
  }

  await reconcileRunningSyncRuns(storeRecord.id);

  const store: any = await withOptionalDb(
    (db) =>
      db.store.findUnique({
        where: { id: storeRecord.id },
        include: { connection: true }
      }),
    storeRecord
  );

  const runs: any[] = await withOptionalDb(
    (db) =>
      db.syncRun.findMany({
        where: { storeId: store.id },
        orderBy: { startedAt: "desc" },
        take: 10
      }),
    []
  );

  const orderedRuns = [...runs]
    .sort((left: any, right: any) => {
      const leftRunning = left.status === "running";
      const rightRunning = right.status === "running";
      if (leftRunning !== rightRunning) {
        return leftRunning ? -1 : 1;
      }

      const leftTime = (left.completedAt ?? left.startedAt).getTime();
      const rightTime = (right.completedAt ?? right.startedAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 5);

  return {
    connection: {
      storeId: store.id,
      shopDomain: store.domain,
      connected: store.connected,
      syncStatus: store.connection?.syncStatus ?? "idle",
      lastSyncAt: store.connection?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: store.connection?.lastSyncError ?? null
    },
    recentRuns: orderedRuns.map((run: any) => ({
      id: run.id,
      mode: run.mode,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      recordsCreated: run.recordsCreated,
      recordsUpdated: run.recordsUpdated,
      recordsFailed: run.recordsFailed,
      errorMessage: run.errorMessage
    }))
  };
}
