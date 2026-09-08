// POST /api/gantt/google/import { ref, sheetName, title? } — link a Google
// Sheet tab as a Gantt. Parsed with the upload parser; re-synced by the cron.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { importGoogleSheet } from "@/lib/services/google-sheets-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    const body = (await request.json().catch(() => ({}))) as { ref?: string; sheetName?: string; title?: string };
    if (!body.ref || !body.sheetName) throw new AppError("ref and sheetName are required.", 400);
    const result = await importGoogleSheet({ storeId, ref: body.ref, sheetName: body.sheetName, title: body.title ?? null });
    return NextResponse.json({ ok: true, ...result });
  } catch (rawError) {
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
