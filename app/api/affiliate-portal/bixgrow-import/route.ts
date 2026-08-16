import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { readUploadAsCsv } from "@/lib/server/file-upload";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { syncBixGrowAttribution } from "@/lib/services/bixgrow-service";

// BixGrow attribution CSV upload endpoint (SA-HIGH-07).
//
// BixGrow is a manual-export affiliate platform: the merchant downloads the
// per-order conversion CSV from the BixGrow dashboard and uploads it here.
// The rows are parsed and upserted into `affiliate_attributions` (deduped by
// affiliate member + order) by `syncBixGrowAttribution`.
//
// Accepts multipart/form-data with a single `file` field (.csv).
// Returns { ok, imported, skipped, errors, detail, fileName }.
//
// Auth: resolves the caller's active store from session, then asserts that
// store belongs to the caller's active org (multi-tenant guard) before any
// write — so Tenant A cannot import into Tenant B's store.
//
// Manual usage (after signing in and copying the session cookie):
//   curl -X POST https://<host>/api/affiliate-portal/bixgrow-import \
//     -H "Cookie: <session-cookie>" \
//     -F "file=@bixgrow-export.csv"

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    // Confirm the resolved store is one the caller is actually allowed to
    // write to (throws 401/403/404 otherwise).
    await assertStoreInActiveOrg(storeId);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Upload a CSV or Excel (.xlsx) file using the 'file' field.", 400);
    }
    if (file.size === 0) {
      throw new AppError("Uploaded file is empty.", 400);
    }
    // Generous cap so we don't OOM on a huge accidental upload, but high
    // enough for a real annual export (~20MB worst case).
    if (file.size > 30 * 1024 * 1024) {
      throw new AppError("File too large (max 30MB).", 400);
    }

    const csvContent = await readUploadAsCsv(file);
    const result = await syncBixGrowAttribution(storeId, csvContent);
    return NextResponse.json({ ...result, fileName: file.name });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
