import { exportAffiliateConversionsAsCsv } from "@/lib/services/affiliate-portal-directory-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { NextResponse } from "next/server";

export async function GET() {
  // Conversion exports are store-scoped financial data — assert the caller's
  // org owns the active store the service will resolve.
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 401;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
  const csv = await exportAffiliateConversionsAsCsv();
  const timestamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="affiliate-conversions-${timestamp}.csv"`
    }
  });
}
