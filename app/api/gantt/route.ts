// GET /api/gantt — list uploaded Gantt sheets for the active store.
// Compact summary used by the Gantt UI's "your sheets" dropdown.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.orgId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) return NextResponse.json({ ok: true, sheets: [] });
    const db = getDb();
    const sheets = await db.ganttSheet.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        originalName: true,
        rangeStart: true,
        rangeEnd: true,
        rowCount: true,
        rolesJson: true,
        categoriesJson: true,
        sheetNamesJson: true,
        parsedSheetName: true,
        insightsGeneratedAt: true,
        createdAt: true
      }
    });
    return NextResponse.json({ ok: true, sheets });
  } catch (rawError) {
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
