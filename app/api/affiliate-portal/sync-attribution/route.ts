import { NextResponse } from "next/server";
import { syncAffiliateAttributionFromOrders } from "@/lib/services/affiliate-portal-admin-service";
import {
  applyReturningCommissionPolicy,
  classifyUnclassifiedAttributions
} from "@/lib/services/affiliate-leakage-service";
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
    // Settle returning-customer policy pricing on the fresh rows (only
    // touches unpaid, non-manual conversions — see leakage service).
    const policy = await applyReturningCommissionPolicy(body.storeId).catch(() => ({ repriced: 0 }));
    return NextResponse.json({ ...result, customerTypeClassified: classified, policyRepriced: policy.repriced });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
