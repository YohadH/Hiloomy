// Gantt upload — operator drops a marketing-calendar .xlsx, we parse it
// into rows and stash the file + parsed data so the UI can show a
// per-day calendar with action buttons (create discount / open Creative
// wizard / etc.).
//
// Accepts multipart/form-data with a single `file` field (.xlsx). The
// raw file is preserved in R2 so we can re-parse with parser upgrades
// without asking the operator to re-upload.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { friendlyDbError } from "@/lib/server/db-error-friendly";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { parseGanttWorkbook } from "@/lib/services/gantt-parser-service";
import {
  buildStorageKey,
  putObject,
  suggestFilename
} from "@/lib/services/creative-storage-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // some browsers misreport — accept if extension is .xlsx/.xls
  "text/csv",
  "application/csv",
  ""
]);
const MAX_BYTES = 20 * 1024 * 1024; // 20MB

// Accept .xlsx / .xls AND .csv. The `xlsx` library parses all three
// transparently. CSV is the common failure — operators export from Google
// Sheets / an Excel "Save as" step and get .csv without realising.
function hasSpreadsheetExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv")
  );
}

export async function POST(request: Request) {
  try {
    let storeId: string | null = null;
    try {
      storeId = await resolveActiveStoreId();
    } catch (err) {
      throw new AppError(
        `Could not resolve active store: ${err instanceof Error ? err.message : String(err)}. Try logging out and back in.`,
        401
      );
    }
    if (!storeId) throw new AppError("No active store.", 400);
    try {
      await assertStoreInActiveOrg(storeId);
    } catch (err) {
      throw new AppError(
        `Store guard failed: ${err instanceof Error ? err.message : String(err)}`,
        403
      );
    }

    const form = await request.formData();

    // Multipart robustness — Hebrew filenames (יולי.xlsx) sometimes fail
    // the standard `form.get("file")` path because the multipart parser
    // is strict about RFC 5987 filename encoding. Fall through the field
    // aliases and, as a last resort, grab the first File in the form.
    const FIELD_ALIASES = ["file", "gantt", "upload", "sheet", "xlsx"];
    let file: File | null = null;
    for (const key of FIELD_ALIASES) {
      const candidate = form.get(key);
      if (candidate instanceof File && candidate.size > 0) {
        file = candidate;
        break;
      }
    }
    if (!file) {
      // Sweep every entry — if the client used a random field name we still
      // want to accept a valid File.
      for (const entry of form.values()) {
        if (entry instanceof File && entry.size > 0) {
          file = entry;
          break;
        }
      }
    }
    if (!file) {
      // Return the field shape so the operator (and I, next time) knows
      // exactly what got sent. This turns a silent multipart failure into
      // an actionable diagnostic.
      const observed: string[] = [];
      for (const [name, value] of form.entries()) {
        if (value instanceof File) {
          observed.push(`${name} = File(name="${value.name}", size=${value.size}, type="${value.type}")`);
        } else {
          observed.push(`${name} = string(len=${String(value).length})`);
        }
      }
      throw new AppError(
        `No file received. Multipart body carried: ${observed.length ? observed.join("; ") : "(no fields)"}. ` +
          `If the filename contains Hebrew, try renaming to ASCII (e.g. gantt-july.xlsx) and re-uploading.`,
        400
      );
    }
    if (file.size > MAX_BYTES) {
      throw new AppError(`File too large (max ${MAX_BYTES / 1024 / 1024}MB).`, 400);
    }
    if (!ALLOWED_MIMES.has(file.type) && !hasSpreadsheetExtension(file.name)) {
      throw new AppError(
        `Unexpected file type "${file.type}" (filename: "${file.name}"). Upload an Excel .xlsx or .csv file.`,
        400
      );
    }
    const titleField = form.get("title");
    const title =
      typeof titleField === "string" && titleField.trim()
        ? titleField.trim()
        : file.name.replace(/\.[^.]+$/, "");
    // Optional — operator explicitly says "parse this tab". Otherwise the
    // parser auto-picks the first Gantt-shaped tab.
    const sheetNameField = form.get("sheetName");
    const preferredSheetName =
      typeof sheetNameField === "string" && sheetNameField.trim()
        ? sheetNameField.trim()
        : null;

    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = parseGanttWorkbook(buffer, { sheetName: preferredSheetName });
    } catch (err) {
      throw new AppError(
        `Could not parse the workbook. ${err instanceof Error ? err.message : String(err)}`,
        400
      );
    }
    if (parsed.rows.length === 0) {
      throw new AppError(
        `Parsed 0 tasks. Detected layout: ${parsed.layoutDetected}. ` +
          `Make sure row 1 has dates (matrix layout) OR the header row contains Task + Role + Category + Start/End columns.`,
        422
      );
    }

    // Preserve the raw upload — lets us re-parse later if we improve the
    // parser, and lets the operator download what they sent.
    const storageKey = buildStorageKey({
      storeId,
      scope: "sources",
      segments: ["gantt"],
      filename: suggestFilename(file.name || "gantt.xlsx")
    });
    await putObject({
      key: storageKey,
      body: buffer,
      contentType:
        file.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const db = getDb();
    const sheet = await db.ganttSheet.create({
      data: {
        storeId,
        title,
        originalName: file.name,
        contentType:
          file.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytesLength: buffer.length,
        storageKey,
        rangeStart: parsed.rangeStart,
        rangeEnd: parsed.rangeEnd,
        rowCount: parsed.rows.length,
        rolesJson: parsed.roles,
        categoriesJson: parsed.categories,
        sheetNamesJson: parsed.sheetNamesInWorkbook,
        parsedSheetName: parsed.parsedSheetName
      }
    });

    // Bulk-insert the rows. CreateMany skips defaults/relations so we
    // pre-shape the records here.
    await db.ganttRow.createMany({
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
    });

    // Diagnostic: the first 3 tasks (date + category + first 60 chars) so
    // the operator can immediately verify "did we parse the right tab
    // with the right dates?" without leaving the upload flow.
    const firstThree = parsed.rows.slice(0, 3).map((r) => ({
      date: r.startDate?.toISOString().slice(0, 10) ?? null,
      category: r.category,
      role: r.role,
      preview: r.task.length > 60 ? r.task.slice(0, 60) + "…" : r.task
    }));

    return NextResponse.json({
      ok: true,
      sheetId: sheet.id,
      title: sheet.title,
      layoutDetected: parsed.layoutDetected,
      sheetNamesInWorkbook: parsed.sheetNamesInWorkbook,
      parsedSheetName: parsed.parsedSheetName,
      rowCount: parsed.rows.length,
      rangeStart: parsed.rangeStart?.toISOString().slice(0, 10) ?? null,
      rangeEnd: parsed.rangeEnd?.toISOString().slice(0, 10) ?? null,
      roles: parsed.roles,
      categories: parsed.categories,
      diagnostic: { firstThree }
    });
  } catch (rawError) {
    const error = friendlyDbError(rawError);
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
