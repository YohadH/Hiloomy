// GET /api/gantt/google/tabs?ref=<sheet url or id> — the spreadsheet's title
// and tabs, so the operator picks which tab is the plan.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { listSpreadsheetTabs } from "@/lib/services/google-sheets-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    const ref = new URL(request.url).searchParams.get("ref") ?? "";
    const result = await listSpreadsheetTabs(storeId, ref);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
