// POST /api/gantt/[sheetId]/plan/overrides — operator corrections to the
// automatic grouping: move an execution to another initiative, split one
// out, merge two initiatives, exclude an initiative from the decision engine,
// confirm / remove a link between an initiative and a calendar event.
// Stored per sheet, applied on every read. Body: PlanOverrideOp.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { savePlanOverride, type PlanOverrideOp } from "@/lib/services/plan-service";

export const dynamic = "force-dynamic";

const OPS = new Set(["move", "split", "merge", "exclude", "include", "link_event", "unlink_event", "reset"]);

export async function POST(request: Request, context: { params: Promise<{ sheetId: string }> }) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    const owned = await getDb().ganttSheet.findFirst({ where: { id: sheetId, storeId }, select: { id: true } });
    if (!owned) throw new AppError("Sheet not found.", 404);
    const body = (await request.json().catch(() => ({}))) as Partial<PlanOverrideOp> & { op?: string };
    if (!body.op || !OPS.has(body.op)) throw new AppError("Unknown override op.", 400);
    const overrides = await savePlanOverride(sheetId, body as PlanOverrideOp);
    return NextResponse.json({ ok: true, overrides });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
