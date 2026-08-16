import { exportAffiliatesAsCsv, exportAffiliatesAsJson } from "@/lib/services/affiliate-portal-directory-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { NextResponse } from "next/server";

function buildTimestamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  // Affiliate exports contain PII — make sure the caller's org actually
  // owns the store the export will be built from (the service resolves the
  // same active store).
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 401;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
  const format = new URL(request.url).searchParams.get("format")?.toLowerCase();

  if (format === "json") {
    const json = await exportAffiliatesAsJson();
    return new Response(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="affiliates-${buildTimestamp()}.json"`
      }
    });
  }

  const csv = await exportAffiliatesAsCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="affiliates-${buildTimestamp()}.csv"`
    }
  });
}
