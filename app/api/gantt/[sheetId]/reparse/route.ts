// POST /api/gantt/[sheetId]/reparse?sheetName=July
//
// Re-reads the original raw file (stored in R2 under GanttSheet.storageKey)
// with a caller-picked tab name and replaces the sheet's rows. Used when
// the auto-picker landed on the wrong tab in a multi-month workbook.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { parseGanttWorkbook } from "@/lib/services/gantt-parser-service";
import { readObject } from "@/lib/services/creative-storage-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ sheetId: string }> }
) {
  try {
    const { sheetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const sheetName = url.searchParams.get("sheetName")?.trim() || null;
    if (!sheetName) throw new AppError("sheetName query param is required.", 400);

    const db = getDb();
    const sheet = await db.ganttSheet.findFirst({
      where: { id: sheetId, storeId },
      select: { id: true, storageKey: true }
    });
    if (!sheet) throw new AppError("Sheet not found.", 404);
    if (!sheet.storageKey) {
      throw new AppError(
        "Original file is not available for re-parsing. Please re-upload.",
        410
      );
    }

    // Fetch the raw file back from R2/local. `readObject` returns `body`
    // as Buffer for local FS but the return type is intentionally `unknown`
    // to accommodate future S3 streaming — coerce defensively at runtime.
    const { body } = await readObject(sheet.storageKey);
    let buffer: Buffer;
    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else if (body && typeof (body as { byteLength?: number }).byteLength === "number") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buffer = Buffer.from(body as any);
    } else {
      throw new AppError("Unexpected storage payload shape.", 500);
    }

    let parsed;
    try {
      parsed = parseGanttWorkbook(buffer, { sheetName });
    } catch (err) {
      throw new AppError(
        `Could not parse the requested tab. ${err instanceof Error ? err.message : String(err)}`,
        400
      );
    }
    if (parsed.rows.length === 0) {
      throw new AppError(`Parsed 0 tasks from tab "${sheetName}".`, 422);
    }

    // Replace the existing rows atomically (delete + createMany).
    await db.$transaction([
      db.ganttRow.deleteMany({ where: { sheetId: sheet.id } }),
      db.ganttSheet.update({
        where: { id: sheet.id },
        data: {
          rangeStart: parsed.rangeStart,
          rangeEnd: parsed.rangeEnd,
          rowCount: parsed.rows.length,
          rolesJson: parsed.roles,
          categoriesJson: parsed.categories,
          sheetNamesJson: parsed.sheetNamesInWorkbook,
          parsedSheetName: parsed.parsedSheetName,
          // Re-parsing invalidates cached insights.
          insightsJson: null,
          insightsGeneratedAt: null
        }
      }),
      db.ganttRow.createMany({
        data: parsed.rows.map((row) => ({
          sheetId: sheet.id,
          storeId,
          rowIndex: row.rowIndex,
          task: row.task,
          role: row.role,
          category: row.category,
          startDate: row.startDate,
          endDate: row.endDate,
          status: row.status,
          actionType: row.actionType,
          rawJson: row.raw as object
        }))
      })
    ]);

    return NextResponse.json({
      ok: true,
      sheetNamesInWorkbook: parsed.sheetNamesInWorkbook,
      parsedSheetName: parsed.parsedSheetName,
      rowCount: parsed.rows.length,
      rangeStart: parsed.rangeStart?.toISOString().slice(0, 10) ?? null,
      rangeEnd: parsed.rangeEnd?.toISOString().slice(0, 10) ?? null,
      roles: parsed.roles,
      categories: parsed.categories
    });
  } catch (rawError) {
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
