// Shopify inventory transfers → exact movement events (owner, 18 Sep 2026).
//
// Admin GraphQL `inventoryTransfers` (API 2026-07+, scope
// read_inventory_transfers). Each transfer line becomes two legs:
//   TRANSFER_OUT at the origin      — quantity shipped
//   TRANSFER_IN  at the destination — quantity received
// Dates: the shipment's creation date for the out leg (that is when stock
// left the origin), the transfer's latest shipment date for the in leg (the
// API does not expose a "received at" timestamp per line; the quantity is
// exact, the day is the best available). Draft transfers (nothing shipped)
// produce no events.
//
// Stores that installed before the scope existed get "scope" back and the
// movement view falls back to derived residuals until they reconnect.

import { getDb } from "@/lib/server/db";
import { createShopifyClient } from "@/lib/shopify/client";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";

const TRANSFERS_API_VERSION = process.env.SHOPIFY_TRANSFERS_API_VERSION ?? "2026-07";
const STATUS_KEY = (storeId: string) => `inventory_transfers_status:${storeId}`;
const stripGid = (gid?: string | null) => (gid ? gid.split("/").pop() ?? gid : null);

const TRANSFERS_QUERY = /* GraphQL */ `
  query InventoryTransfers($cursor: String, $query: String) {
    inventoryTransfers(first: 50, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          status
          dateCreated
          referenceName
          origin { name location { id name } }
          destination { name location { id name } }
          lineItems(first: 100) {
            edges {
              node {
                inventoryItem { id variant { id } }
                totalQuantity
                shippedQuantity
              }
            }
          }
          shipments(first: 10) {
            edges {
              node {
                id
                status
                dateCreated
                dateShipped
                dateReceived
                lineItems(first: 100) {
                  edges { node { inventoryItem { id } quantity acceptedQuantity rejectedQuantity } }
                }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface TransferNode {
  id: string;
  name: string;
  status: string;
  dateCreated: string | null;
  referenceName: string | null;
  origin: { name: string | null; location: { id: string; name: string } | null } | null;
  destination: { name: string | null; location: { id: string; name: string } | null } | null;
  lineItems: { edges: Array<{ node: { inventoryItem: { id: string; variant: { id: string } | null } | null; totalQuantity: number; shippedQuantity: number } }> };
  shipments: {
    edges: Array<{
      node: {
        id: string;
        status: string;
        dateCreated: string | null;
        dateShipped: string | null;
        dateReceived: string | null;
        lineItems: { edges: Array<{ node: { inventoryItem: { id: string } | null; quantity: number; acceptedQuantity: number; rejectedQuantity: number } }> };
      };
    }>;
  };
}

export interface TransfersSyncStatus {
  state: "ok" | "scope" | "unavailable" | "never";
  syncedAt: string | null;
  transfers: number;
  events: number;
  error: string | null;
  // Exact transfer history is complete from this day on (YYYY-MM-DD): the
  // first sync pulls everything Shopify returns and records the earliest
  // transfer it saw; later syncs are incremental and keep the earlier date.
  coverageSince?: string | null;
}

export async function getInventoryTransfersStatus(storeId: string): Promise<TransfersSyncStatus> {
  const db = getDb() as any;
  const row = await db.systemConfig.findUnique({ where: { key: STATUS_KEY(storeId) }, select: { value: true } }).catch(() => null);
  if (!row?.value) return { state: "never", syncedAt: null, transfers: 0, events: 0, error: null };
  try {
    return JSON.parse(row.value) as TransfersSyncStatus;
  } catch {
    return { state: "never", syncedAt: null, transfers: 0, events: 0, error: null };
  }
}

async function writeStatus(storeId: string, status: TransfersSyncStatus) {
  const db = getDb() as any;
  const value = JSON.stringify(status);
  await db.systemConfig.upsert({ where: { key: STATUS_KEY(storeId) }, update: { value }, create: { key: STATUS_KEY(storeId), value } }).catch(() => null);
}

// First run: a full backfill (every transfer Shopify returns; the earliest
// one seen becomes `coverageSince`). Later runs: incremental — transfers
// created or updated since the last successful sync, minus a 7-day overlap
// so receipts that completed later are picked up. Idempotent upserts.
export async function syncInventoryTransfers(storeId: string, options: { full?: boolean } = {}): Promise<TransfersSyncStatus> {
  const db = getDb() as any;
  const now = new Date();
  const previous = await getInventoryTransfersStatus(storeId);
  // Always a full pull: Shopify's inventoryTransfers query filters by
  // created_at / status / ids / tags but NOT updated_at, and a transfer
  // created months ago can be received today. Transfers are few per store,
  // so a full walk (50 per page) is cheap and always consistent.
  void options;
  let transfers = 0;
  let events = 0;
  let earliest: string | null = previous.coverageSince ?? null;
  try {
    const credentials = await getStoredShopifyCredentials(storeId);
    const client = createShopifyClient({ ...credentials, apiVersion: TRANSFERS_API_VERSION });
    // Variant ids for the store, to map inventory items that carry no variant.
    const variants = (await db.productVariant.findMany({ where: { storeId }, select: { id: true, productId: true, shopifyVariantId: true } })) as Array<{ id: string; productId: string; shopifyVariantId: string }>;
    const byShopifyId = new Map(variants.map((v) => [v.shopifyVariantId, v]));
    let cursor: string | null = null;
    for (;;) {
      type TransfersPage = { inventoryTransfers: { edges: Array<{ node: TransferNode }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
      const page: TransfersPage = await client.request<TransfersPage>(TRANSFERS_QUERY, { cursor, query: null });
      const conn: TransfersPage["inventoryTransfers"] = page.inventoryTransfers;
      for (const { node: t } of conn.edges) {
        transfers += 1;
        const created = t.dateCreated ? t.dateCreated.slice(0, 10) : null;
        if (created && (!earliest || created < earliest)) earliest = created;
        const originId = stripGid(t.origin?.location?.id);
        const destId = stripGid(t.destination?.location?.id);
        // No live origin location = goods came from outside the business
        // (a supplier PO received through Shopify's transfer flow, or a
        // deleted location). Those units are EXTERNAL stock: a PO receipt at
        // the destination, never an internal transfer leg.
        const external = !originId && !!destId;
        if (t.status === "DRAFT" || t.status === "CANCELED") continue;
        const shipments = t.shipments.edges.map((e) => e.node);
        const shippedDates = shipments.map((sh) => sh.dateShipped ?? sh.dateCreated).filter((d): d is string => !!d).sort();
        const receivedDates = shipments.map((sh) => sh.dateReceived).filter((d): d is string => !!d).sort();
        const shippedAt = shippedDates[0] ?? t.dateCreated ?? now.toISOString();
        const receivedAt = receivedDates[receivedDates.length - 1] ?? shippedDates[shippedDates.length - 1] ?? t.dateCreated ?? now.toISOString();
        // Received units per inventory item: accepted across every shipment
        // of this transfer. Rejected and still-unreceived units stay in transit.
        const receivedByItem = new Map<string, number>();
        for (const sh of shipments) {
          for (const { node: sl } of sh.lineItems.edges) {
            const key = stripGid(sl.inventoryItem?.id);
            if (!key) continue;
            receivedByItem.set(key, (receivedByItem.get(key) ?? 0) + (sl.acceptedQuantity ?? 0));
          }
        }
        for (const { node: li } of t.lineItems.edges) {
          const shopifyVariantId = stripGid(li.inventoryItem?.variant?.id);
          if (!shopifyVariantId) continue;
          const v = byShopifyId.get(shopifyVariantId);
          const base = { storeId, shopifyVariantId, productId: v?.productId ?? null, variantId: v?.id ?? null, sourceType: "SHOPIFY_TRANSFER", precision: "exact", reference: t.name, note: t.referenceName };
          const itemId = stripGid(li.inventoryItem?.id) ?? shopifyVariantId;
          const receivedQuantity = receivedByItem.get(itemId) ?? 0;
          if (originId && li.shippedQuantity > 0) {
            const sourceId = `${stripGid(t.id)}:${itemId}:out`;
            await db.inventoryMovementEvent.upsert({
              where: { storeId_sourceType_sourceId: { storeId, sourceType: "SHOPIFY_TRANSFER", sourceId } },
              update: { quantity: li.shippedQuantity, occurredAt: new Date(shippedAt), locationId: originId, locationName: t.origin?.location?.name ?? t.origin?.name ?? null, reference: t.name },
              create: { ...base, sourceId, type: "TRANSFER_OUT", quantity: li.shippedQuantity, occurredAt: new Date(shippedAt), locationId: originId, locationName: t.origin?.location?.name ?? t.origin?.name ?? null }
            });
            events += 1;
          }
          if (destId && receivedQuantity > 0) {
            const sourceId = `${stripGid(t.id)}:${itemId}:in`;
            const inType = external ? "PO_RECEIPT" : "TRANSFER_IN";
            const note = external ? [t.referenceName, t.origin?.name ? `מקור: ${t.origin.name}` : null].filter(Boolean).join(" · ") || null : t.referenceName;
            await db.inventoryMovementEvent.upsert({
              where: { storeId_sourceType_sourceId: { storeId, sourceType: "SHOPIFY_TRANSFER", sourceId } },
              update: { type: inType, quantity: receivedQuantity, occurredAt: new Date(receivedAt), locationId: destId, locationName: t.destination?.location?.name ?? t.destination?.name ?? null, reference: t.name, note },
              create: { ...base, note, sourceId, type: inType, quantity: receivedQuantity, occurredAt: new Date(receivedAt), locationId: destId, locationName: t.destination?.location?.name ?? t.destination?.name ?? null }
            });
            events += 1;
          }
        }
      }
      if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
      cursor = conn.pageInfo.endCursor;
    }
    // A full pull that saw no transfers still covers from today on.
    const status: TransfersSyncStatus = { state: "ok", syncedAt: now.toISOString(), transfers, events, error: null, coverageSince: earliest ?? previous.coverageSince ?? now.toISOString().slice(0, 10) };
    await writeStatus(storeId, status);
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const scope = /access denied|read_inventory_transfers|scope|doesn't exist on type 'QueryRoot'|Field 'inventoryTransfers'/i.test(message);
    const status: TransfersSyncStatus = { state: scope ? "scope" : "unavailable", syncedAt: now.toISOString(), transfers, events, error: message.slice(0, 300), coverageSince: previous.coverageSince ?? null };
    await writeStatus(storeId, status);
    return status;
  }
}
