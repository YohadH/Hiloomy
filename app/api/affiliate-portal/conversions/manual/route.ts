// POST /api/affiliate-portal/conversions/manual
//
// Add one affiliate conversion by hand. Complements the CSV import path
// (which stays under /import) — this is what the operator uses when a
// single order needs to be attributed after the fact (BixGrow webhook
// missed it, phone order, backfill).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { createManualConversion } from "@/lib/services/affiliate-manual-entry-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body {
  affiliateEmail?: string;
  affiliateCode?: string;
  orderNumber?: string;
  salesAmount?: number | string;
  commissionAmount?: number | string;
  couponCode?: string;
  sourceType?: string;
  sourceUrl?: string;
  contentTitle?: string;
  occurredAt?: string;
  note?: string;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const body = (await request.json().catch(() => ({}))) as Body;
    const salesAmount = toNumberOrNull(body.salesAmount);
    if (salesAmount == null) {
      throw new AppError("salesAmount is required and must be a number.", 400);
    }
    if (!body.orderNumber?.trim()) {
      throw new AppError("orderNumber is required.", 400);
    }

    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : null;
    const result = await createManualConversion({
      storeId,
      affiliateEmail: body.affiliateEmail ?? null,
      affiliateCode: body.affiliateCode ?? null,
      orderNumber: body.orderNumber,
      salesAmount,
      commissionAmount: toNumberOrNull(body.commissionAmount),
      couponCode: body.couponCode ?? null,
      sourceType: body.sourceType ?? null,
      sourceUrl: body.sourceUrl ?? null,
      contentTitle: body.contentTitle ?? null,
      occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
      note: body.note ?? null
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
