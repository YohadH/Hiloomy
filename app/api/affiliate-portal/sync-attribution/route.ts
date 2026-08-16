import { NextResponse } from "next/server";
import { syncAffiliateAttributionFromOrders } from "@/lib/services/affiliate-portal-admin-service";
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
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
