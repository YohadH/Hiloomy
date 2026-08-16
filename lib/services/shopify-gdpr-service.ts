// Shopify mandatory-compliance webhook processors.
//
// Shopify requires every public app to handle three privacy webhooks
// (customers/data_request, customers/redact, shop/redact) and, in practice,
// app/uninstalled for credential cleanup. Every event is recorded in the
// GdprRequest ledger BEFORE acting — the ledger has no FK to Store on
// purpose, so it survives the very deletion it documents.
//
// Deletion model:
//   app/uninstalled   → revoke credentials + mark store disconnected.
//                       Data is retained so a re-install within Shopify's
//                       48h grace window restores the account intact.
//   shop/redact       → (sent by Shopify ~48h after uninstall) delete the
//                       Store row — every store-scoped table cascades from
//                       it, wiping orders, customers, products, insights.
//   customers/redact  → delete the specific Customer rows (PII). Orders
//                       remain as anonymous financial records (permitted —
//                       Order.customerId is SetNull on customer delete).
//   customers/data_request → recorded in the ledger for the merchant to
//                       fulfil; nothing is deleted.

import { getDb } from "@/lib/server/db";

interface GdprResult {
  ok: true;
  action: string;
  detail?: string;
}

async function recordRequest(
  shopDomain: string,
  topic: string,
  payload: unknown
): Promise<string> {
  const db = getDb() as any;
  const row = await db.gdprRequest.create({
    data: { shopDomain, topic, payloadJson: payload ?? undefined },
    select: { id: true }
  });
  return row.id as string;
}

async function completeRequest(id: string, status: "completed" | "failed", detail?: string) {
  const db = getDb() as any;
  await db.gdprRequest
    .update({ where: { id }, data: { status, detail: detail ?? null, completedAt: new Date() } })
    .catch(() => undefined);
}

function findStoreByDomain(shopDomain: string) {
  const db = getDb();
  return db.store.findFirst({ where: { domain: shopDomain.toLowerCase().trim() } });
}

// customers/data_request — record it; fulfilment is a merchant-side process
// (the app exposes the ledger; nothing is sent automatically).
export async function processCustomersDataRequest(
  shopDomain: string,
  payload: Record<string, unknown>
): Promise<GdprResult> {
  const id = await recordRequest(shopDomain, "customers/data_request", payload);
  await completeRequest(id, "completed", "recorded for merchant fulfilment");
  return { ok: true, action: "recorded" };
}

// customers/redact — delete the customer's PII. Orders survive as anonymous
// financial records (customerId SetNull on delete).
export async function processCustomersRedact(
  shopDomain: string,
  payload: Record<string, unknown>
): Promise<GdprResult> {
  const id = await recordRequest(shopDomain, "customers/redact", payload);
  const db = getDb();
  try {
    const store = await findStoreByDomain(shopDomain);
    if (!store) {
      await completeRequest(id, "completed", "store not found — nothing to redact");
      return { ok: true, action: "noop", detail: "store not found" };
    }
    const customer = (payload["customer"] ?? {}) as { id?: number | string; email?: string };
    const shopifyCustomerId = customer.id != null ? String(customer.id) : null;
    const email = typeof customer.email === "string" ? customer.email.trim() : null;

    const where = {
      storeId: store.id,
      OR: [
        ...(shopifyCustomerId ? [{ shopifyCustomerId }] : []),
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])
      ]
    };
    if (where.OR.length === 0) {
      await completeRequest(id, "completed", "no customer identifiers in payload");
      return { ok: true, action: "noop", detail: "no identifiers" };
    }
    const deleted = await db.customer.deleteMany({ where });
    await completeRequest(id, "completed", `deleted ${deleted.count} customer row(s)`);
    return { ok: true, action: "redacted", detail: `${deleted.count} customer row(s)` };
  } catch (err) {
    await completeRequest(id, "failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// shop/redact — full data deletion. The Store row is the cascade root for
// every store-scoped table, so one delete wipes the tenant.
export async function processShopRedact(
  shopDomain: string,
  payload: Record<string, unknown>
): Promise<GdprResult> {
  const id = await recordRequest(shopDomain, "shop/redact", payload);
  const db = getDb();
  try {
    const store = await findStoreByDomain(shopDomain);
    if (!store) {
      await completeRequest(id, "completed", "store not found — already deleted or never installed");
      return { ok: true, action: "noop", detail: "store not found" };
    }
    await db.store.delete({ where: { id: store.id } });
    await completeRequest(id, "completed", `store ${store.id} and all cascaded data deleted`);
    return { ok: true, action: "deleted", detail: store.id };
  } catch (err) {
    await completeRequest(id, "failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// app/uninstalled — revoke credentials immediately, keep data for the 48h
// window until shop/redact arrives (re-install restores the account).
export async function processAppUninstalled(
  shopDomain: string,
  payload: Record<string, unknown>
): Promise<GdprResult> {
  const id = await recordRequest(shopDomain, "app/uninstalled", payload);
  const db = getDb();
  try {
    const store = await findStoreByDomain(shopDomain);
    if (!store) {
      await completeRequest(id, "completed", "store not found");
      return { ok: true, action: "noop", detail: "store not found" };
    }
    await db.shopifyConnection.deleteMany({ where: { storeId: store.id } });
    await db.store.update({ where: { id: store.id }, data: { connected: false } });
    await completeRequest(id, "completed", "credentials revoked, store marked disconnected");
    return { ok: true, action: "disconnected", detail: store.id };
  } catch (err) {
    await completeRequest(id, "failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
