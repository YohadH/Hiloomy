// Inventory flow by location for a period — the data behind the movement
// view on Product follow-ups (owner, 17–18 Sep 2026). Pure math lives in
// lib/domain/inventory-movement (computeLedger); this file gathers:
//
//   opening   the latest InventoryLevelSnapshot strictly before the period
//             start (null when history does not reach back — never invented)
//   closing   the latest snapshot on/before the period end; when the period
//             ends today, the live VariantInventoryLevel rows
//   events    inside the period only:
//             • SALE from order lines (net of refunds), by the order's
//               location — POS till ("pos") or the fulfilling location
//               ("fulfillment"); orders without a location are unlocated
//             • TRANSFER_IN / TRANSFER_OUT from synced Shopify transfers
//             • PO_RECEIPT from receipts recorded in Hiloomy
//             • adjustments with a source, when any exist
//   derived   whatever the snapshots show that the events do not explain —
//             computed per location, never stored, never called a transfer

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/server/db";
import { computeLedger, saleEvents, sumLedgers, type BusinessLedger, type LevelPoint, type LocationLedger, type MovementEvent, type SaleChannel, type VariantLedger } from "@/lib/domain/inventory-movement";
import { getCachedShopifyLocations } from "@/lib/services/inventory-locations-service";
import { listMovementEvents } from "@/lib/services/inventory-events-service";
import { getInventoryTransfersStatus, type TransfersSyncStatus } from "@/lib/services/inventory-transfers-service";
import { formatDateInTimeZone, getStoreTimeZone } from "@/lib/server/reporting-date-range";

export interface ProductMovement {
  productId: string;
  variants: Record<string, VariantLedger & { variantId: string }>; // keyed by internal ProductVariant.id
  locations: LocationLedger[]; // product-level, per location
  total: BusinessLedger;
}

export interface InventoryMovementReport {
  range: { start: string; end: string }; // YYYY-MM-DD, store-local
  openingDate: string | null; // snapshot date used for opening; null = no history before the period
  closingDate: string | null; // snapshot date used for closing when not live
  closingLive: boolean;
  historyStart: string | null; // "Inventory history available since …"
  locations: Array<{ id: string; name: string }>;
  products: Record<string, ProductMovement>;
  // Whole-catalogue (in scope) business row and per-location rows.
  summary: { locations: LocationLedger[]; total: BusinessLedger };
  // Evidence quality for the audit.
  evidence: {
    exactEvents: number; // transfers + PO receipts + adjustments with a source, in range
    transfers: TransfersSyncStatus;
    poReceipts: number;
    salesLocated: number;
    salesUnlocated: number;
    // Exact transfer history reaches back to this day (null = no sync yet);
    // a period that starts earlier shows transfers only as derived movement.
    transferCoverageSince: string | null;
    transferCoverageGap: boolean;
  };
}

export async function getInventoryMovement(storeId: string, range: { start: Date; end: Date }, options: { productIds?: string[] } = {}): Promise<InventoryMovementReport> {
  const db = getDb() as any;
  const tz = await getStoreTimeZone(storeId);
  const startDay = formatDateInTimeZone(range.start, tz);
  const endDay = formatDateInTimeZone(range.end, tz);
  const today = formatDateInTimeZone(new Date(), tz);

  const [historyRow, openingRow, closingRow, locationsCached, transfers] = await Promise.all([
    db.$queryRaw`SELECT min("date")::text AS d FROM "InventoryLevelSnapshot" WHERE "storeId" = ${storeId}` as Promise<Array<{ d: string | null }>>,
    db.$queryRaw`SELECT max("date")::text AS d FROM "InventoryLevelSnapshot" WHERE "storeId" = ${storeId} AND "date" < ${startDay}::date` as Promise<Array<{ d: string | null }>>,
    db.$queryRaw`SELECT max("date")::text AS d FROM "InventoryLevelSnapshot" WHERE "storeId" = ${storeId} AND "date" <= ${endDay}::date` as Promise<Array<{ d: string | null }>>,
    getCachedShopifyLocations(storeId),
    getInventoryTransfersStatus(storeId)
  ]);
  const historyStart = historyRow[0]?.d ?? null;
  const openingDate = openingRow[0]?.d ?? null;
  const closingLive = endDay >= today;
  const closingDate = closingLive ? null : (closingRow[0]?.d ?? null);
  const locations = locationsCached.map((l) => ({ id: l.id, name: l.name }));

  const variantRows = (await db.productVariant.findMany({
    where: { storeId, ...(options.productIds?.length ? { productId: { in: options.productIds } } : {}) },
    select: { id: true, productId: true, shopifyVariantId: true }
  })) as Array<{ id: string; productId: string; shopifyVariantId: string }>;
  const byShopifyVariant = new Map(variantRows.map((v) => [v.shopifyVariantId, v]));
  const shopifyIds = variantRows.map((v) => v.shopifyVariantId);
  const empty: InventoryMovementReport = {
    range: { start: startDay, end: endDay },
    openingDate,
    closingDate,
    closingLive,
    historyStart,
    locations,
    products: {},
    summary: sumLedgers([]),
    evidence: { exactEvents: 0, transfers, poReceipts: 0, salesLocated: 0, salesUnlocated: 0, transferCoverageSince: transfers.coverageSince ?? null, transferCoverageGap: transfers.state === "ok" ? !!transfers.coverageSince && transfers.coverageSince > startDay : transfers.state !== "never" }
  };
  if (!shopifyIds.length) return empty;

  const levelRows = async (date: string | null, live: boolean): Promise<LevelPoint[]> => {
    if (live) return (await db.variantInventoryLevel.findMany({ where: { storeId, shopifyVariantId: { in: shopifyIds } }, select: { shopifyVariantId: true, shopifyLocationId: true, locationName: true, available: true } })) as LevelPoint[];
    if (!date) return [];
    return (await db.$queryRaw`
      SELECT "shopifyVariantId", "shopifyLocationId", "locationName", "available"
      FROM "InventoryLevelSnapshot"
      WHERE "storeId" = ${storeId} AND "date" = ${date}::date AND "shopifyVariantId" IN (${Prisma.join(shopifyIds)})
    `) as LevelPoint[];
  };

  const [opening, closing, soldRows, stored] = await Promise.all([
    levelRows(openingDate, false),
    levelRows(closingDate, closingLive),
    db.$queryRaw`
      SELECT pv."shopifyVariantId" AS "shopifyVariantId", o."shopifyLocationId" AS "locationId", o."locationName" AS "locationName",
             o."locationSource" AS "locationSource", SUM(li."quantity")::int AS units, SUM(li."refundedQuantity")::int AS returned
      FROM "OrderLineItem" li
      JOIN "Order" o ON o.id = li."orderId"
      JOIN "ProductVariant" pv ON pv.id = li."variantId"
      WHERE li."storeId" = ${storeId}
        AND o."createdAt" >= ${range.start} AND o."createdAt" <= ${range.end}
        AND o."cancelledAt" IS NULL AND o."test" = false
        AND pv."shopifyVariantId" IN (${Prisma.join(shopifyIds)})
      GROUP BY 1, 2, 3, 4
    ` as Promise<Array<{ shopifyVariantId: string; locationId: string | null; locationName: string | null; locationSource: string | null; units: number; returned: number }>>,
    listMovementEvents(storeId, range, shopifyIds)
  ]);

  const sales = saleEvents(
    soldRows.map((r) => ({
      shopifyVariantId: r.shopifyVariantId,
      locationId: r.locationId,
      locationName: r.locationName,
      channel: (r.locationSource === "pos" ? "pos" : r.locationSource === "fulfillment" ? "fulfillment" : "unknown") as SaleChannel,
      units: Number(r.units),
      returned: Number(r.returned ?? 0),
      occurredAt: range.start.toISOString()
    }))
  );
  const events: MovementEvent[] = [...stored, ...sales];
  const ledgers = computeLedger({ opening, closing, events, locations });

  const products: Record<string, ProductMovement> = {};
  const byProduct = new Map<string, Array<VariantLedger & { variantId: string }>>();
  for (const [shopifyVariantId, m] of ledgers) {
    const v = byShopifyVariant.get(shopifyVariantId);
    if (!v) continue;
    const list = byProduct.get(v.productId) ?? [];
    list.push({ ...m, variantId: v.id });
    byProduct.set(v.productId, list);
  }
  const all: VariantLedger[] = [];
  for (const [productId, list] of byProduct) {
    const folded = sumLedgers(list);
    products[productId] = { productId, variants: Object.fromEntries(list.map((m) => [m.variantId, m])), locations: folded.locations, total: folded.total };
    all.push(...list);
  }
  const salesLocated = sales.filter((s) => s.type === "SALE" && s.locationId).reduce((n, s) => n + s.quantity, 0);
  const salesUnlocated = sales.filter((s) => s.type === "SALE" && !s.locationId).reduce((n, s) => n + s.quantity, 0);
  return {
    ...empty,
    products,
    summary: sumLedgers(all),
    evidence: { exactEvents: stored.length, transfers, poReceipts: stored.filter((e) => e.type === "PO_RECEIPT").length, salesLocated, salesUnlocated, transferCoverageSince: transfers.coverageSince ?? null, transferCoverageGap: transfers.state === "ok" ? !!transfers.coverageSince && transfers.coverageSince > startDay : transfers.state !== "never" }
  };
}
