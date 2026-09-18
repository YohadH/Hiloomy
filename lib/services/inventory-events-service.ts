// Inventory movement events with a known cause — reading them for a period,
// and recording the one kind Shopify cannot give us: a PURCHASE ORDER
// RECEIPT the manager records in Hiloomy (PO 1042, 3 Sep, main warehouse,
// variant A +100). A PO receipt is EXTERNAL stock (PO_RECEIPT), never a
// transfer, so it reaches the business total's "received".

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import type { MovementEvent, MovementType } from "@/lib/domain/inventory-movement";

export interface PoReceiptLineInput {
  sku?: string | null;
  shopifyVariantId?: string | null;
  quantity: number;
}

export interface PoReceiptInput {
  poNumber: string;
  receivedAt: string; // YYYY-MM-DD (store-local day)
  locationId: string;
  locationName?: string | null;
  lines: PoReceiptLineInput[];
  note?: string | null;
}

export interface PoReceiptResult {
  poNumber: string;
  recorded: number;
  units: number;
  unresolved: Array<{ sku: string | null; shopifyVariantId: string | null; quantity: number }>;
}

// Upserts one PO_RECEIPT event per line (re-recording the same PO number and
// variant overwrites the quantity — a correction, not a duplicate).
export async function recordPurchaseOrderReceipt(storeId: string, input: PoReceiptInput): Promise<PoReceiptResult> {
  const db = getDb() as any;
  const poNumber = String(input.poNumber ?? "").trim().slice(0, 60);
  if (!poNumber) throw new AppError("PO number is required.", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedAt)) throw new AppError("receivedAt must be YYYY-MM-DD.", 400);
  const locationId = String(input.locationId ?? "").trim();
  if (!locationId) throw new AppError("locationId is required.", 400);
  if (!Array.isArray(input.lines) || !input.lines.length) throw new AppError("At least one line is required.", 400);
  const skus = input.lines.map((l) => (l.sku ?? "").trim()).filter(Boolean);
  const ids = input.lines.map((l) => (l.shopifyVariantId ?? "").trim()).filter(Boolean);
  const variants = (await db.productVariant.findMany({
    where: { storeId, OR: [...(skus.length ? [{ sku: { in: skus } }] : []), ...(ids.length ? [{ shopifyVariantId: { in: ids } }] : [])] },
    select: { id: true, productId: true, shopifyVariantId: true, sku: true }
  })) as Array<{ id: string; productId: string; shopifyVariantId: string; sku: string | null }>;
  const bySku = new Map(variants.filter((v) => v.sku).map((v) => [v.sku!.trim().toLowerCase(), v]));
  const byId = new Map(variants.map((v) => [v.shopifyVariantId, v]));
  const occurredAt = new Date(`${input.receivedAt}T12:00:00.000Z`);
  let recorded = 0;
  let units = 0;
  const unresolved: PoReceiptResult["unresolved"] = [];
  for (const line of input.lines) {
    const qty = Math.round(Number(line.quantity));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const v = (line.shopifyVariantId && byId.get(line.shopifyVariantId.trim())) || (line.sku && bySku.get(line.sku.trim().toLowerCase())) || null;
    if (!v) {
      unresolved.push({ sku: line.sku ?? null, shopifyVariantId: line.shopifyVariantId ?? null, quantity: qty });
      continue;
    }
    const sourceId = `${poNumber}:${v.shopifyVariantId}:${locationId}`;
    await db.inventoryMovementEvent.upsert({
      where: { storeId_sourceType_sourceId: { storeId, sourceType: "HILOOMY_PO", sourceId } },
      update: { quantity: qty, occurredAt, locationName: input.locationName ?? null, note: input.note ?? null },
      create: { storeId, shopifyVariantId: v.shopifyVariantId, productId: v.productId, variantId: v.id, locationId, locationName: input.locationName ?? null, type: "PO_RECEIPT", quantity: qty, occurredAt, sourceType: "HILOOMY_PO", sourceId, precision: "exact", reference: poNumber, note: input.note ?? null }
    });
    recorded += 1;
    units += qty;
  }
  return { poNumber, recorded, units, unresolved };
}

export async function deletePurchaseOrderReceipt(storeId: string, poNumber: string): Promise<{ deleted: number }> {
  const db = getDb() as any;
  const r = await db.inventoryMovementEvent.deleteMany({ where: { storeId, sourceType: "HILOOMY_PO", reference: poNumber } });
  return { deleted: Number(r.count ?? 0) };
}

export interface RecordedPo {
  poNumber: string;
  receivedAt: string;
  locationName: string | null;
  lines: number;
  units: number;
}

export async function listPurchaseOrderReceipts(storeId: string, limit = 20): Promise<RecordedPo[]> {
  const db = getDb() as any;
  const rows = (await db.$queryRaw`
    SELECT "reference" AS po, min("occurredAt") AS at, max("locationName") AS loc, count(*)::int AS lines, sum("quantity")::int AS units
    FROM "InventoryMovementEvent"
    WHERE "storeId" = ${storeId} AND "sourceType" = 'HILOOMY_PO'
    GROUP BY "reference" ORDER BY min("occurredAt") DESC LIMIT ${limit}
  `.catch(() => [])) as Array<{ po: string; at: Date; loc: string | null; lines: number; units: number }>;
  return rows.map((r) => ({ poNumber: r.po, receivedAt: r.at.toISOString().slice(0, 10), locationName: r.loc, lines: Number(r.lines), units: Number(r.units) }));
}

// Stored events (transfers, PO receipts, adjustments) inside a period.
export async function listMovementEvents(storeId: string, range: { start: Date; end: Date }, shopifyVariantIds?: string[]): Promise<MovementEvent[]> {
  const db = getDb() as any;
  const rows = (await db.inventoryMovementEvent
    .findMany({
      where: { storeId, occurredAt: { gte: range.start, lte: range.end }, ...(shopifyVariantIds?.length ? { shopifyVariantId: { in: shopifyVariantIds } } : {}) },
      select: { shopifyVariantId: true, locationId: true, locationName: true, type: true, quantity: true, occurredAt: true, sourceType: true, sourceId: true, precision: true, reference: true },
      take: 50000
    })
    .catch(() => [])) as Array<{ shopifyVariantId: string; locationId: string; locationName: string | null; type: string; quantity: number; occurredAt: Date; sourceType: string; sourceId: string; precision: string; reference: string | null }>;
  return rows.map((r) => ({
    shopifyVariantId: r.shopifyVariantId,
    locationId: r.locationId,
    locationName: r.locationName,
    type: r.type as MovementType,
    quantity: r.quantity,
    occurredAt: r.occurredAt.toISOString(),
    sourceType: r.sourceType as MovementEvent["sourceType"],
    sourceId: r.sourceId,
    precision: r.precision === "derived" ? "derived" : "exact",
    reference: r.reference
  }));
}
