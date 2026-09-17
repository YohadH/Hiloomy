// Inventory movement by location for a period — the data behind the
// "where did the stock go" view on Product follow-ups (owner, 17 Sep 2026):
// opening → in / sold / out → closing per variant per location, plus the
// product and total rows. Pure math lives in lib/domain/inventory-movement.
//
// Sources:
//   opening  — the latest InventoryLevelSnapshot strictly before the period
//              start (null when the history does not reach back that far)
//   closing  — the latest snapshot on/before the period end; when the period
//              ends today, the live VariantInventoryLevel rows
//   sold     — order lines (net of refunds) inside the period, by the order's
//              location (POS physicalLocation / fulfillment location);
//              orders without a location count in the total only
// History starts the day the daily snapshot shipped; the response says so.

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/server/db";
import { computeMovement, sumMovements, type LevelPoint, type LocationMovement, type SoldPoint, type VariantMovement } from "@/lib/domain/inventory-movement";
import { getCachedShopifyLocations } from "@/lib/services/inventory-locations-service";
import { formatDateInTimeZone, getStoreTimeZone } from "@/lib/server/reporting-date-range";

export interface ProductMovement {
  productId: string;
  variants: Record<string, VariantMovement & { variantId: string }>; // keyed by internal ProductVariant.id
  locations: LocationMovement[]; // product-level, per location
  total: LocationMovement;
  unlocatedSold: number;
}

export interface InventoryMovementReport {
  range: { start: string; end: string }; // YYYY-MM-DD, store-local
  // The snapshot dates actually used. openingDate null = no history before
  // the period; closingLive = the live levels were used for closing.
  openingDate: string | null;
  closingDate: string | null;
  closingLive: boolean;
  historyStart: string | null; // earliest snapshot for this store
  locations: Array<{ id: string; name: string }>;
  products: Record<string, ProductMovement>;
  // Orders in the period that carry no location (share of sold units).
  unlocatedShare: number | null;
}

const isoDay = (d: Date, tz: string) => formatDateInTimeZone(d, tz);

export async function getInventoryMovement(storeId: string, range: { start: Date; end: Date }, options: { productIds?: string[] } = {}): Promise<InventoryMovementReport> {
  const db = getDb() as any;
  const tz = await getStoreTimeZone(storeId);
  const startDay = isoDay(range.start, tz);
  const endDay = isoDay(range.end, tz);
  const today = isoDay(new Date(), tz);

  const [historyRow, openingRow, closingRow, locationsCached] = await Promise.all([
    db.$queryRaw`SELECT min("date")::text AS d FROM "InventoryLevelSnapshot" WHERE "storeId" = ${storeId}` as Promise<Array<{ d: string | null }>>,
    db.$queryRaw`SELECT max("date")::text AS d FROM "InventoryLevelSnapshot" WHERE "storeId" = ${storeId} AND "date" < ${startDay}::date` as Promise<Array<{ d: string | null }>>,
    db.$queryRaw`SELECT max("date")::text AS d FROM "InventoryLevelSnapshot" WHERE "storeId" = ${storeId} AND "date" <= ${endDay}::date` as Promise<Array<{ d: string | null }>>,
    getCachedShopifyLocations(storeId)
  ]);
  const historyStart = historyRow[0]?.d ?? null;
  const openingDate = openingRow[0]?.d ?? null;
  const closingLive = endDay >= today;
  const closingDate = closingLive ? null : (closingRow[0]?.d ?? null);

  // Variants in scope (all active products unless narrowed).
  const variantRows = (await db.productVariant.findMany({
    where: { storeId, ...(options.productIds?.length ? { productId: { in: options.productIds } } : {}) },
    select: { id: true, productId: true, shopifyVariantId: true }
  })) as Array<{ id: string; productId: string; shopifyVariantId: string }>;
  const byShopifyVariant = new Map(variantRows.map((v) => [v.shopifyVariantId, v]));
  const shopifyIds = variantRows.map((v) => v.shopifyVariantId);
  if (!shopifyIds.length) {
    return { range: { start: startDay, end: endDay }, openingDate, closingDate, closingLive, historyStart, locations: locationsCached.map((l) => ({ id: l.id, name: l.name })), products: {}, unlocatedShare: null };
  }

  const levelRows = async (date: string | null, live: boolean): Promise<LevelPoint[]> => {
    if (live) {
      const rows = (await db.variantInventoryLevel.findMany({ where: { storeId, shopifyVariantId: { in: shopifyIds } }, select: { shopifyVariantId: true, shopifyLocationId: true, locationName: true, available: true } })) as LevelPoint[];
      return rows;
    }
    if (!date) return [];
    const rows = (await db.$queryRaw`
      SELECT "shopifyVariantId", "shopifyLocationId", "locationName", "available"
      FROM "InventoryLevelSnapshot"
      WHERE "storeId" = ${storeId} AND "date" = ${date}::date AND "shopifyVariantId" IN (${Prisma.join(shopifyIds)})
    `) as LevelPoint[];
    return rows;
  };

  const [opening, closing, soldRows] = await Promise.all([
    levelRows(openingDate, false),
    levelRows(closingDate, closingLive),
    db.$queryRaw`
      SELECT pv."shopifyVariantId" AS "shopifyVariantId", o."shopifyLocationId" AS "shopifyLocationId",
             SUM(li."quantity" - li."refundedQuantity")::int AS units
      FROM "OrderLineItem" li
      JOIN "Order" o ON o.id = li."orderId"
      JOIN "ProductVariant" pv ON pv.id = li."variantId"
      WHERE li."storeId" = ${storeId}
        AND o."createdAt" >= ${range.start} AND o."createdAt" <= ${range.end}
        AND o."cancelledAt" IS NULL AND o."test" = false
        AND pv."shopifyVariantId" IN (${Prisma.join(shopifyIds)})
      GROUP BY 1, 2
    ` as Promise<Array<{ shopifyVariantId: string; shopifyLocationId: string | null; units: number }>>
  ]);
  const sold: SoldPoint[] = soldRows.map((r) => ({ shopifyVariantId: r.shopifyVariantId, shopifyLocationId: r.shopifyLocationId, units: Number(r.units) }));
  const soldTotal = sold.reduce((n, s) => n + s.units, 0);
  const unlocated = sold.filter((s) => !s.shopifyLocationId).reduce((n, s) => n + s.units, 0);

  // Location order: the store's list (warehouse first if it holds the most units), then names.
  const locations = locationsCached.map((l) => ({ id: l.id, name: l.name }));
  const movement = computeMovement({ opening, closing, sold, locations });

  const products: Record<string, ProductMovement> = {};
  const byProduct = new Map<string, Array<VariantMovement & { variantId: string }>>();
  for (const [shopifyVariantId, m] of movement) {
    const v = byShopifyVariant.get(shopifyVariantId);
    if (!v) continue;
    const list = byProduct.get(v.productId) ?? [];
    list.push({ ...m, variantId: v.id });
    byProduct.set(v.productId, list);
  }
  for (const [productId, list] of byProduct) {
    const folded = sumMovements(list);
    products[productId] = { productId, variants: Object.fromEntries(list.map((m) => [m.variantId, m])), locations: folded.locations, total: folded.total, unlocatedSold: folded.unlocatedSold };
  }
  return {
    range: { start: startDay, end: endDay },
    openingDate,
    closingDate,
    closingLive,
    historyStart,
    locations,
    products,
    unlocatedShare: soldTotal > 0 ? unlocated / soldTotal : null
  };
}
