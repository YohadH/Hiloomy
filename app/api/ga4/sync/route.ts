import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { syncGa4Data } from "@/lib/services/ga4-service";

// POST /api/ga4/sync  { storeId }
//
// Manual "Sync now" for the GA4 connection — same syncGa4Data the 2h cron
// runs (90d backfill window, idempotent upserts), so a founder who just
// picked a property doesn't wait up to two hours for first data.

export const dynamic = "force-dynamic";
// The first pull backfills 90 days; give Google room.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required.", 400);
    }
    await assertStoreInActiveOrg(body.storeId);

    const result = await syncGa4Data(body.storeId);
    return NextResponse.json({ ok: true, rowsUpserted: result.rowsUpserted, days: result.days });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
