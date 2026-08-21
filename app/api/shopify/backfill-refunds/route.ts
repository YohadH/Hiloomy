import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { backfillRefundLineItems } from "@/lib/services/shopify-sync-service";

// POST /api/shopify/backfill-refunds  { storeId }
//
// One-shot returns-intelligence backfill: re-fetches every refunded order
// from Shopify so refund LINE ITEMS (omitted by the initial bulk sync)
// land on OrderLineItem.refundedQuantity / refundedSubtotal. Triggered
// from the coverage banner on /profit/returns. Idempotent; safe to rerun.

export const dynamic = "force-dynamic";
// Large refunded-order histories can take a while (paginated 100/page).
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required.", 400);
    }
    await assertStoreInActiveOrg(body.storeId);

    const result = await backfillRefundLineItems(body.storeId);
    return NextResponse.json({ ok: true, fetched: result.fetched });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
