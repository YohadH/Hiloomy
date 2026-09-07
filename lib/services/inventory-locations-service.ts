// Inventory by location.
//
// Shopify's `inventoryQuantity` on a variant is the sum over EVERY location —
// the logistics warehouse, the showroom, and the "damaged goods" shelf alike.
// For Take a Nap that made "-33 at the showroom, 0 at the warehouse" read as
// -33 in stock. This service pulls per-location levels, lets the store pick
// which locations count, and recomputes ProductVariant.inventoryQuantity
// from that selection so every downstream surface (stock flags, stockout
// engine, Decision Inbox) follows the right shelf without knowing about
// locations at all.
//
// Requires the `read_locations` scope for location names; stores installed
// before it was added must reconnect Shopify once.

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { createShopifyClient } from "@/lib/shopify/client";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";

export interface ShopifyLocation {
  id: string; // numeric id, GID stripped
  name: string;
  isActive: boolean;
}

const LOCATIONS_KEY = (storeId: string) => `shopify_locations:${storeId}`;
const SELECTION_KEY = (storeId: string) => `inventory_locations:${storeId}`;
const LEVELS_SYNCED_KEY = (storeId: string) => `inventory_levels_synced_at:${storeId}`;

const stripGid = (gid: string) => gid.split("/").pop() ?? gid;

async function readConfig<T>(key: string): Promise<T | null> {
  const db = getDb() as any;
  const row = await db.systemConfig.findUnique({ where: { key }, select: { value: true } }).catch(() => null);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

async function writeConfig(key: string, value: unknown): Promise<void> {
  const db = getDb() as any;
  const serialized = JSON.stringify(value);
  await db.systemConfig.upsert({ where: { key }, update: { value: serialized }, create: { key, value: serialized } });
}

// ── Locations ───────────────────────────────────────────────────────────

const LOCATIONS_QUERY = `
  query Locations {
    locations(first: 50, includeInactive: true) {
      edges { node { id name isActive } }
    }
  }
`;

export async function listShopifyLocations(
  storeId: string,
  options: { refresh?: boolean } = {}
): Promise<{ locations: ShopifyLocation[]; error: "scope" | "unavailable" | null }> {
  if (!options.refresh) {
    const cached = await readConfig<ShopifyLocation[]>(LOCATIONS_KEY(storeId));
    if (cached && cached.length) return { locations: cached, error: null };
  }
  try {
    const credentials = await getStoredShopifyCredentials(storeId);
    const client = createShopifyClient(credentials);
    const data = await client.request<{ locations: { edges: Array<{ node: { id: string; name: string; isActive: boolean } }> } }>(
      LOCATIONS_QUERY
    );
    const locations = data.locations.edges.map(({ node }) => ({ id: stripGid(node.id), name: node.name, isActive: node.isActive }));
    await writeConfig(LOCATIONS_KEY(storeId), locations);
    return { locations, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cached = (await readConfig<ShopifyLocation[]>(LOCATIONS_KEY(storeId))) ?? [];
    return { locations: cached, error: /access denied|read_locations|scope/i.test(message) ? "scope" : "unavailable" };
  }
}

// Cached names only — for page headers that must never call Shopify.
export async function getCachedShopifyLocations(storeId: string): Promise<ShopifyLocation[]> {
  return (await readConfig<ShopifyLocation[]>(LOCATIONS_KEY(storeId))) ?? [];
}

// ── Selection ───────────────────────────────────────────────────────────

// Empty selection = Shopify's own total (every location), the historical behaviour.
export async function getSelectedInventoryLocations(storeId: string): Promise<string[]> {
  const ids = await readConfig<string[]>(SELECTION_KEY(storeId));
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

export async function setSelectedInventoryLocations(storeId: string, locationIds: string[]): Promise<void> {
  const clean = [...new Set(locationIds.map((id) => stripGid(String(id)).trim()).filter(Boolean))];
  await writeConfig(SELECTION_KEY(storeId), clean);
}

export async function getInventoryLevelsSyncedAt(storeId: string): Promise<string | null> {
  return readConfig<string>(LEVELS_SYNCED_KEY(storeId));
}

// ── Levels sync ─────────────────────────────────────────────────────────

const LEVELS_QUERY = `
  query LocationLevels($locationId: ID!, $cursor: String) {
    location(id: $locationId) {
      id
      name
      inventoryLevels(first: 250, after: $cursor) {
        edges {
          node {
            item { id tracked variant { id } }
            quantities(names: ["available"]) { name quantity }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

interface LevelsPage {
  location: {
    id: string;
    name: string;
    inventoryLevels: {
      edges: Array<{
        node: {
          item: { id: string; tracked: boolean; variant: { id: string } | null };
          quantities: Array<{ name: string; quantity: number }>;
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

// Pulls every location's levels and rewrites the table for this store, then
// re-applies the location selection to ProductVariant.inventoryQuantity.
export async function syncInventoryLevels(storeId: string): Promise<{ locations: number; levels: number }> {
  const { locations } = await listShopifyLocations(storeId, { refresh: true });
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const db = getDb() as any;
  const now = new Date();
  let levels = 0;

  for (const location of locations) {
    const rows: Array<{ shopifyVariantId: string; available: number }> = [];
    let cursor: string | null = null;
    for (;;) {
      const page: LevelsPage = await client.request<LevelsPage>(LEVELS_QUERY, {
        locationId: `gid://shopify/Location/${location.id}`,
        cursor
      });
      const conn = page.location?.inventoryLevels;
      if (!conn) break;
      for (const { node } of conn.edges) {
        if (!node.item.variant || !node.item.tracked) continue;
        const available = node.quantities.find((q) => q.name === "available")?.quantity ?? 0;
        rows.push({ shopifyVariantId: stripGid(node.item.variant.id), available });
      }
      if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
      cursor = conn.pageInfo.endCursor;
    }
    await db.variantInventoryLevel.deleteMany({ where: { storeId, shopifyLocationId: location.id } });
    if (rows.length) {
      await db.variantInventoryLevel.createMany({
        data: rows.map((r) => ({ storeId, shopifyVariantId: r.shopifyVariantId, shopifyLocationId: location.id, locationName: location.name, available: r.available, updatedAt: now })),
        skipDuplicates: true
      });
    }
    levels += rows.length;
  }

  await writeConfig(LEVELS_SYNCED_KEY(storeId), now.toISOString());
  await applyInventoryLocationSelection(storeId);
  return { locations: locations.length, levels };
}

// ProductVariant.inventoryQuantity := Σ available over the SELECTED locations,
// for tracked variants only (untracked stay null). No selection → leave
// Shopify's total alone.
export async function applyInventoryLocationSelection(storeId: string): Promise<{ updated: number }> {
  const selected = await getSelectedInventoryLocations(storeId);
  if (selected.length === 0) return { updated: 0 };
  const db = getDb() as any;
  const updated: number = await db.$executeRaw`
    UPDATE "ProductVariant" v
    SET "inventoryQuantity" = COALESCE(sub.total, 0)
    FROM (
      SELECT pv.id AS variant_id, SUM(l.available)::int AS total
      FROM "ProductVariant" pv
      LEFT JOIN "VariantInventoryLevel" l
        ON l."storeId" = pv."storeId"
       AND l."shopifyVariantId" = pv."shopifyVariantId"
       AND l."shopifyLocationId" IN (${Prisma.join(selected)})
      WHERE pv."storeId" = ${storeId} AND pv."inventoryQuantity" IS NOT NULL
      GROUP BY pv.id
    ) sub
    WHERE v.id = sub.variant_id
      AND v."inventoryQuantity" IS DISTINCT FROM COALESCE(sub.total, 0)
  `;
  return { updated: Number(updated) };
}

// Per-location breakdown for a set of products (for the custom dashboard).
export async function getInventoryByLocationForProducts(
  storeId: string,
  productIds: string[]
): Promise<Map<string, Array<{ locationId: string; locationName: string; available: number }>>> {
  const out = new Map<string, Array<{ locationId: string; locationName: string; available: number }>>();
  if (productIds.length === 0) return out;
  const db = getDb() as any;
  const rows = (await db.$queryRaw`
    SELECT pv."productId" AS product_id, l."shopifyLocationId" AS location_id, l."locationName" AS location_name,
           SUM(l.available)::int AS available
    FROM "VariantInventoryLevel" l
    JOIN "ProductVariant" pv ON pv."storeId" = l."storeId" AND pv."shopifyVariantId" = l."shopifyVariantId"
    WHERE l."storeId" = ${storeId} AND pv."productId" IN (${Prisma.join(productIds)})
    GROUP BY pv."productId", l."shopifyLocationId", l."locationName"
    ORDER BY l."locationName"
  `.catch(() => [])) as Array<{ product_id: string; location_id: string; location_name: string; available: number }>;
  for (const r of rows) {
    const list = out.get(r.product_id) ?? [];
    list.push({ locationId: r.location_id, locationName: r.location_name, available: Number(r.available) });
    out.set(r.product_id, list);
  }
  return out;
}

export function assertLocationIds(input: unknown): string[] {
  if (!Array.isArray(input)) throw new AppError("locationIds must be an array.", 400);
  return input.map((x) => String(x));
}
