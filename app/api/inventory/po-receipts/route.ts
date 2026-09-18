// Purchase-order receipts recorded in Hiloomy — EXTERNAL stock arriving at a
// location (usually the main warehouse). They feed the inventory flow view
// as exact PO_RECEIPT events, distinct from internal transfers.
//
// GET    /api/inventory/po-receipts?storeId=…                       → recent POs
// POST   /api/inventory/po-receipts { storeId?, poNumber, receivedAt, locationId, locationName?, lines:[{sku|shopifyVariantId, quantity}], note? }
// DELETE /api/inventory/po-receipts { storeId?, poNumber }          → remove a PO's events

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveScopedStoreId } from "@/lib/auth/guards";
import { deletePurchaseOrderReceipt, listPurchaseOrderReceipts, recordPurchaseOrderReceipt, type PoReceiptInput } from "@/lib/services/inventory-events-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = await resolveScopedStoreId(url.searchParams.get("storeId"));
    const receipts = await listPurchaseOrderReceipts(storeId);
    return NextResponse.json({ ok: true, receipts });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<PoReceiptInput> & { storeId?: string };
    const storeId = await resolveScopedStoreId(body.storeId);
    const result = await recordPurchaseOrderReceipt(storeId, {
      poNumber: String(body.poNumber ?? ""),
      receivedAt: String(body.receivedAt ?? ""),
      locationId: String(body.locationId ?? ""),
      locationName: body.locationName ?? null,
      lines: Array.isArray(body.lines) ? body.lines : [],
      note: body.note ?? null
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { storeId?: string; poNumber?: string };
    const storeId = await resolveScopedStoreId(body.storeId);
    if (!body.poNumber) throw new AppError("poNumber is required.", 400);
    const result = await deletePurchaseOrderReceipt(storeId, String(body.poNumber));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
