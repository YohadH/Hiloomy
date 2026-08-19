import { NextResponse } from "next/server";
import { syncAffiliateAttributionFromOrders } from "@/lib/services/affiliate-portal-admin-service";
import { classifyUnclassifiedAttributions } from "@/lib/services/affiliate-leakage-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required for affiliate attribution sync.", 400);
    }
    await assertStoreInActiveOrg(body.storeId);
    const result = await syncAffiliateAttributionFromOrders(body.storeId);
    // Enrich the fresh rows with new/returning customer classification —
    // set-based and idempotent, so it's safe to run on every sync.
    const classified = await classifyUnclassifiedAttributions(body.storeId).catch(() => 0);
    return NextResponse.json({ ...result, customerTypeClassified: classified });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
