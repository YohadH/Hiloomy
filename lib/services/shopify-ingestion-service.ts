import { runFullInitialSync, runIncrementalSync, syncCustomers, syncOrders, syncProducts, syncStoreMetadata } from "@/lib/services/shopify-sync-service";
import { getDb } from "@/lib/server/db";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import { registerOrderWebhooks } from "@/lib/services/shopify-oauth-service";
import { listProductCosts } from "@/lib/services/product-cost-service";

/**
 * Register the order webhooks for an ALREADY-connected store (e.g. to backfill
 * webhooks on a connection that was created before SA-HIGH-01, or to retry a
 * registration that previously failed). The OAuth install/callback flow itself
 * registers webhooks automatically in persistOauthConnection(); this entry point
 * lets the app (re)register them on demand for an existing connection.
 *
 * Best-effort: registerOrderWebhooks never throws. Returns a small status
 * object describing what happened.
 */
export async function startShopifyOAuthPlaceholder(storeDomain: string) {
  const db = getDb();
  if (!db) {
    return { status: "db_unavailable", storeDomain } as const;
  }

  const store = await db.store.findUnique({ where: { domain: storeDomain } });
  if (!store) {
    return { status: "store_not_found", storeDomain } as const;
  }

  let credentials: { shopDomain: string; adminAccessToken: string };
  try {
    credentials = await getStoredShopifyCredentials(store.id);
  } catch {
    return { status: "not_connected", storeDomain } as const;
  }

  const result = await registerOrderWebhooks({
    shopDomain: credentials.shopDomain,
    accessToken: credentials.adminAccessToken
  });

  if (result.webhookIds.length > 0) {
    await db.shopifyConnection
      .update({
        where: { storeId: store.id },
        data: { webhookIds: result.webhookIds, webhooksRegisteredAt: new Date() }
      })
      .catch(() => undefined);
  } else if (result.registered > 0) {
    await db.shopifyConnection
      .update({ where: { storeId: store.id }, data: { webhooksRegisteredAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    status: result.failed === 0 ? "ok" : "partial",
    storeDomain,
    registered: result.registered,
    failed: result.failed,
    webhookIds: result.webhookIds
  } as const;
}

export async function runShopifyAdminIngestionPlaceholder(storeId: string) {
  return runFullInitialSync(storeId);
}

/**
 * Product cost (COGS) ingestion status for a store.
 *
 * SA-HIGH-03: real per-SKU costs are now ingested through the UI
 * (/profit/costs) and CSV import — see `lib/services/product-cost-service.ts`,
 * which populates `Product.costOverrideAmount` and re-costs the synced order
 * line items. This entry point reports current coverage so callers (setup
 * health, onboarding, the Growth Agent) can nudge the founder to finish
 * configuring costs. An ERP/automatic feed can later replace the manual path.
 */
export async function syncProductCostsPlaceholder(storeId: string) {
  const db = getDb();
  if (!db) {
    return { status: "db_unavailable", storeId } as const;
  }
  const { summary } = await listProductCosts(storeId);
  return {
    status: summary.costCoverage >= 0.9 ? "configured" : "needs_input",
    storeId,
    soldProducts: summary.soldProducts,
    soldProductsWithCost: summary.soldProductsWithCost,
    productsWithOverride: summary.productsWithOverride,
    costCoverage: summary.costCoverage,
    source: "manual_ui_and_csv"
  } as const;
}

export {
  runFullInitialSync,
  runIncrementalSync,
  syncCustomers,
  syncOrders,
  syncProducts,
  syncStoreMetadata
};
