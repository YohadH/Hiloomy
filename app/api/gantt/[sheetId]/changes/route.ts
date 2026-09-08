// GET /api/gantt/[sheetId]/changes — the sync log: what moved in the plan.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { listSheetSyncs } from "@/lib/services/google-sheets-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ sheetId: string }> }) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    const syncs = await listSheetSyncs(sheetId, storeId);
    return NextResponse.json({ ok: true, syncs });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
