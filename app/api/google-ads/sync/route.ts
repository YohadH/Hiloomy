import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { syncGoogleAdsData } from "@/lib/services/google-ads-service";

// POST /api/google-ads/sync { storeId } — manual "Sync now"; same 90d
// idempotent pull the 2h cron runs.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) throw new AppError("Store id is required.", 400);
    await assertStoreInActiveOrg(body.storeId);
    const result = await syncGoogleAdsData(body.storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
