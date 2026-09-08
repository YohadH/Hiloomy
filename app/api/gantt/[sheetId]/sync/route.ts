// POST /api/gantt/[sheetId]/sync — re-read the linked Google Sheet tab now.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { syncGanttSheet } from "@/lib/services/google-sheets-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_request: Request, context: { params: Promise<{ sheetId: string }> }) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    const result = await syncGanttSheet(sheetId, storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (rawError) {
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
