import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import {
  applyReturningCommissionPolicy,
  classifyUnclassifiedAttributions,
  getCommissionLeakageSummary
} from "@/lib/services/affiliate-leakage-service";

// GET /api/affiliate-portal/leakage?storeId=...&start=ISO&end=ISO
// Runs the (idempotent, set-based) classifier first so freshly-synced
// conversions are included, then returns the commission-leakage summary.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId");
    if (!storeId) throw new AppError("Store id is required.", 400);
    await assertStoreInActiveOrg(storeId);

    const end = url.searchParams.get("end") ? new Date(String(url.searchParams.get("end"))) : new Date();
    const start = url.searchParams.get("start")
      ? new Date(String(url.searchParams.get("start")))
      : new Date(end.getTime() - 30 * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppError("Invalid start/end date.", 400);
    }

    await classifyUnclassifiedAttributions(storeId);
    // Settle returning-customer policy pricing on freshly-classified rows
    // so the summary reflects what will actually be paid out.
    await applyReturningCommissionPolicy(storeId).catch(() => null);
    const summary = await getCommissionLeakageSummary({ storeId, start, end });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
