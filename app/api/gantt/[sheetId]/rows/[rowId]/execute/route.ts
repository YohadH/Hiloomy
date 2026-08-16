// POST /api/gantt/[sheetId]/rows/[rowId]/execute
//
// Records the operator's intent to act on a Gantt task. Right now the
// wiring is minimal — we mark the row's executionJson with a timestamp +
// optional providerRef + providerUrl + freeform notes. The UI uses this
// to disable the "Execute" button on already-acted rows and show
// "Created on ..." next to them.
//
// Why we don't auto-fire the underlying service here yet:
//   - discount_code → Shopify discount creation needs $ amount + scope
//     decisions the operator should make in the Shopify admin or our
//     existing discount UI; we route them there with a deep link.
//   - creative_image / creative_banner / creative_video → routed to the
//     Creative wizard with the task text prefilled as the brief.
//   - email_campaign / sms_campaign → no built-in composer yet; we
//     surface the brief and let the operator copy/paste into their
//     ESP / SMS tool.
//
// Once each underlying service grows a single-call "create-from-brief"
// endpoint we'll wire it here without changing the row-level UI.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

interface ExecuteBody {
  providerRef?: string | null;
  providerUrl?: string | null;
  notes?: string | null;
  // If the operator wants to "un-execute" (clear the mark), send {clear: true}.
  clear?: boolean;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sheetId: string; rowId: string }> }
) {
  try {
    const { sheetId, rowId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const body = (await request.json().catch(() => ({}))) as ExecuteBody;

    const db = getDb();
    const row = await db.ganttRow.findFirst({
      where: { id: rowId, sheetId, storeId },
      select: { id: true }
    });
    if (!row) throw new AppError("Row not found.", 404);

    const executionJson = body.clear
      ? null
      : {
          executedAt: new Date().toISOString(),
          providerRef: body.providerRef ?? null,
          providerUrl: body.providerUrl ?? null,
          notes: body.notes ?? null
        };

    const updated = await db.ganttRow.update({
      where: { id: row.id },
      data: { executionJson: executionJson as object | null }
    });
    return NextResponse.json({ ok: true, execution: updated.executionJson });
  } catch (rawError) {
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
