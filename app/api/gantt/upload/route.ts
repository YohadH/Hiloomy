// Gantt upload — operator drops a marketing-calendar .xlsx, we parse it
// into rows and stash the file + parsed data so the UI can show a
// per-day calendar with action buttons (create discount / open Creative
// wizard / etc.).
//
// Accepts multipart/form-data with a single `file` field (.xlsx). The
// raw file is preserved in R2 so we can re-parse with parser upgrades
// without asking the operator to re-upload.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
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

// The upload arrives in one of two shapes:
//
//   1. RAW BODY (the studio since 9 Sep 2026): the bytes are the body, the
//      name travels in `x-file-name`, the title in `x-title`, the preferred
//      tab in `x-sheet-name` (all percent-encoded so Hebrew survives HTTP
//      headers). Nothing to parse, so nothing can be dropped — the previous
//      multipart path lost the file part in production on an 868 KB
//      workbook (incense sept.xlsx) while the same bytes parsed fine locally.
//   2. MULTIPART (any other caller): the original `file` + `title` fields.
async function readUpload(request: Request): Promise<{ file: File; title: string; preferredSheetName: string | null }> {
  const contentType = request.headers.get("content-type") ?? "";
  const decode = (v: string | null): string | null => {
    if (!v) return null;
    try {
      const d = decodeURIComponent(v).trim();
      return d || null;
    } catch {
      return v.trim() || null;
    }
  };

  // 1. JSON envelope: { name, title, sheetName?, size, sha256, dataBase64 }.
  //    Text survives every proxy and body handler unchanged, and the size +
  //    hash prove the bytes are the ones the browser read. Used by the
  //    studio since 9 Sep 2026 after a raw binary body arrived altered in
  //    production (SheetJS then read the workbook as text: "tabular, 0 tasks").
  if (contentType.toLowerCase().startsWith("application/json")) {
    const body = (await request.json().catch(() => null)) as { name?: string; title?: string; sheetName?: string; size?: number; sha256?: string; dataBase64?: string } | null;
    if (!body || typeof body.dataBase64 !== "string" || !body.dataBase64) {
      throw new AppError("Upload envelope had no file data.", 400);
    }
    const buf = Buffer.from(body.dataBase64, "base64");
    const sha = createHash("sha256").update(buf).digest("hex");
    const sizeOk = typeof body.size !== "number" || body.size === buf.length;
    const hashOk = typeof body.sha256 !== "string" || body.sha256.toLowerCase() === sha;
    if (!sizeOk || !hashOk) {
      throw new AppError(
        `The file was altered in transit: browser sent ${body.size ?? "?"} bytes (sha256 ${String(body.sha256 ?? "?").slice(0, 12)}…), ` +
          `server received ${buf.length} bytes (sha256 ${sha.slice(0, 12)}…). Try again; if it repeats, something between the browser and the server rewrites request bodies.`,
        400
      );
    }
    const name = (body.name ?? "").trim() || "gantt.xlsx";
    const ext = name.toLowerCase().split(".").pop() ?? "";
    const type = ext === "csv" ? "text/csv" : ext === "xls" ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return {
      file: new File([buf], name, { type }),
      title: (body.title ?? "").trim() || name.replace(/\.[^.]+$/, ""),
      preferredSheetName: (body.sheetName ?? "").trim() || null
    };
  }

  // 2. Raw binary body with the name in headers.
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new AppError("Empty upload body — the file read as 0 bytes. Pick the file again.", 400);
    }
    const name = decode(request.headers.get("x-file-name")) ?? "gantt.xlsx";
    const type = contentType && contentType !== "application/octet-stream" ? contentType.split(";")[0].trim() : "";
    const file = new File([bytes], name, { type });
    return {
      file,
      title: decode(request.headers.get("x-title")) ?? name.replace(/\.[^.]+$/, ""),
      preferredSheetName: decode(request.headers.get("x-sheet-name"))
    };
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
    for (const entry of form.values()) {
      if (entry instanceof File && entry.size > 0) {
        file = entry;
        break;
      }
    }
  }
  if (!file) {
    // Return the field shape so the operator knows exactly what got sent.
    const observed: string[] = [];
    for (const [name, value] of form.entries()) {
      observed.push(value instanceof File ? `${name} = File(name="${value.name}", size=${value.size}, type="${value.type}")` : `${name} = string(len=${String(value).length})`);
    }
    throw new AppError(
      `No file received. Multipart body carried: ${observed.length ? observed.join("; ") : "(no fields)"}. ` +
        `The file part never arrived — re-pick the file and try again.`,
      400
    );
  }
  const titleField = form.get("title");
  const sheetNameField = form.get("sheetName");
  return {
    file,
    title: typeof titleField === "string" && titleField.trim() ? titleField.trim() : file.name.replace(/\.[^.]+$/, ""),
    preferredSheetName: typeof sheetNameField === "string" && sheetNameField.trim() ? sheetNameField.trim() : null
  };
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

    const { file, title, preferredSheetName } = await readUpload(request);
    if (file.size > MAX_BYTES) {
      throw new AppError(`File too large (max ${MAX_BYTES / 1024 / 1024}MB).`, 400);
    }
    if (!ALLOWED_MIMES.has(file.type) && !hasSpreadsheetExtension(file.name)) {
      throw new AppError(
        `Unexpected file type "${file.type}" (filename: "${file.name}"). Upload an Excel .xlsx or .csv file.`,
        400
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    // What arrived, for the error text: an .xlsx is a zip and starts with
    // "PK". Anything else means the bytes were changed on the way here —
    // SheetJS then quietly reads the content as text and finds no dates.
    const magic = buffer.subarray(0, 2).toString("latin1");
    const received = `${buffer.length} bytes, starts with ${magic === "PK" ? '"PK" (zip, as expected)' : JSON.stringify(magic) + " (NOT a zip)"}`;

    let parsed;
    try {
      parsed = parseGanttWorkbook(buffer, { sheetName: preferredSheetName });
    } catch (err) {
      throw new AppError(
        `Could not parse the workbook (${received}). ${err instanceof Error ? err.message : String(err)}`,
        400
      );
    }
    if (parsed.rows.length === 0) {
      const tabs = parsed.sheetNamesInWorkbook.length ? parsed.sheetNamesInWorkbook.join(", ") : "(none)";
      throw new AppError(
        `Parsed 0 tasks from tab "${parsed.parsedSheetName ?? "?"}" (layout: ${parsed.layoutDetected}). Received ${received}. Tabs seen: ${tabs}. ` +
          `A matrix tab needs dates in row 1; a table needs Task + Role + Category + Start/End columns.`,
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
