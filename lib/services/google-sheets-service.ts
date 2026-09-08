import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { google } from "googleapis";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import { parseGanttWorkbook, type ParsedGanttRow } from "@/lib/services/gantt-parser-service";

/**
 * Google Sheets as a LIVE source for the marketing Gantt.
 *
 * Most brands keep the plan in a Google Sheet. Instead of exporting and
 * uploading a file every time it changes, the operator links a tab once;
 * Hiloomy reads it through the Sheets API, parses it with the SAME parser
 * the upload uses, and re-syncs on the refresh cron. Every sync that finds
 * a difference writes a GanttSheetSync row (added / removed / changed
 * tasks), so the team can see how the plan moved — and executed actions on
 * unchanged rows are preserved across syncs (rows are matched, not wiped).
 *
 * Connection: PlatformConnection platform = "googleSheets", refresh token
 * encrypted in config, same GOOGLE_OAUTH_CLIENT_ID / SECRET app as GSC, GA4
 * and Google Ads. Scope: spreadsheets.readonly — Hiloomy never writes to
 * the sheet.
 */

export const GOOGLE_SHEETS_PLATFORM = "googleSheets" as const;

type OAuthClient = InstanceType<typeof google.auth.OAuth2>;
type Credentials = Parameters<OAuthClient["setCredentials"]>[0];

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

function getOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not set");
  const appUrl = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/google-sheets/oauth/callback` };
}

function createOAuthClient(): OAuthClient {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleSheetsOAuthUrl(storeId: string): string {
  if (!storeId?.trim()) throw new AppError("storeId is required to start the Google Sheets connection.", 400);
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    include_granted_scopes: true,
    state: Buffer.from(JSON.stringify({ storeId }), "utf8").toString("base64url")
  });
}

export function decodeGoogleSheetsOAuthState(state: string | null | undefined): { storeId: string } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { storeId?: unknown };
    return typeof parsed.storeId === "string" && parsed.storeId.trim() ? { storeId: parsed.storeId } : null;
  } catch {
    return null;
  }
}

interface ConnectionConfig {
  refreshTokenEnc?: string;
  scope?: string;
  connectedAt?: string;
}

async function readConfig(storeId: string): Promise<ConnectionConfig | null> {
  const connection = (await getDb().platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: GOOGLE_SHEETS_PLATFORM } },
    select: { config: true }
  })) as { config: ConnectionConfig | null } | null;
  return connection?.config ?? null;
}

export async function handleGoogleSheetsOAuthCallback(code: string, storeId: string): Promise<void> {
  const client = createOAuthClient();
  const cleanCode = code?.trim();
  if (!cleanCode) throw new AppError("Google did not return an authorization code.", 400);
  const { tokens } = await client.getToken(cleanCode);
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    throw new AppError("Google did not return a refresh token. Disconnect the app in your Google account and reconnect.", 502);
  }
  await persistConnection(storeId, refreshToken, tokens);
}

async function persistConnection(storeId: string, refreshToken: string, tokens: Credentials): Promise<void> {
  const config: ConnectionConfig = {
    refreshTokenEnc: encryptSecret(refreshToken),
    scope: tokens.scope ?? SCOPES.join(" "),
    connectedAt: new Date().toISOString()
  };
  await getDb().platformConnection.upsert({
    where: { storeId_platform: { storeId, platform: GOOGLE_SHEETS_PLATFORM } },
    update: { status: "connected", config: config as object, healthMessage: null, tokenLastFour: refreshToken.slice(-4) },
    create: { storeId, platform: GOOGLE_SHEETS_PLATFORM, status: "connected", config: config as object, tokenLastFour: refreshToken.slice(-4) }
  });
}

export async function isGoogleSheetsConnected(storeId: string): Promise<boolean> {
  const row = await getDb()
    .platformConnection.findUnique({ where: { storeId_platform: { storeId, platform: GOOGLE_SHEETS_PLATFORM } }, select: { status: true } })
    .catch(() => null);
  return row?.status === "connected";
}

async function sheetsClient(storeId: string) {
  const config = await readConfig(storeId);
  if (!config?.refreshTokenEnc) throw new AppError("Google Sheets is not connected for this store. Connect it first.", 409);
  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token: decryptSecret(config.refreshTokenEnc) });
  return google.sheets({ version: "v4", auth });
}

// ─── Spreadsheet addressing ────────────────────────────────────────────

// Accepts a full Sheets URL, a bare spreadsheet id, or a URL with #gid=.
export function parseSpreadsheetRef(input: string): { spreadsheetId: string; gid: number | null } {
  const raw = (input ?? "").trim();
  if (!raw) throw new AppError("Paste the Google Sheet's link.", 400);
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = m ? m[1] : /^[a-zA-Z0-9-_]{20,}$/.test(raw) ? raw : null;
  if (!spreadsheetId) throw new AppError("That does not look like a Google Sheets link.", 400);
  const gidMatch = raw.match(/[#&?]gid=(\d+)/);
  return { spreadsheetId, gid: gidMatch ? Number(gidMatch[1]) : null };
}

export interface SpreadsheetTabs {
  spreadsheetId: string;
  title: string;
  tabs: Array<{ title: string; gid: number; rows: number; cols: number }>;
}

export async function listSpreadsheetTabs(storeId: string, ref: string): Promise<SpreadsheetTabs> {
  const { spreadsheetId } = parseSpreadsheetRef(ref);
  const sheets = await sheetsClient(storeId);
  let res;
  try {
    res = await sheets.spreadsheets.get({ spreadsheetId, fields: "properties.title,sheets.properties(title,sheetId,gridProperties)" });
  } catch (err) {
    throw translateSheetsError(err);
  }
  const tabs = (res.data.sheets ?? []).map((s) => ({
    title: s.properties?.title ?? "",
    gid: s.properties?.sheetId ?? 0,
    rows: s.properties?.gridProperties?.rowCount ?? 0,
    cols: s.properties?.gridProperties?.columnCount ?? 0
  }));
  return { spreadsheetId, title: res.data.properties?.title ?? spreadsheetId, tabs };
}

function translateSheetsError(err: unknown): AppError {
  const anyErr = err as { code?: number; message?: string };
  const code = typeof anyErr?.code === "number" ? anyErr.code : 0;
  if (code === 404) return new AppError("Google could not find that spreadsheet. Check the link.", 404);
  if (code === 403) return new AppError("The connected Google account cannot open that spreadsheet. Share it with that account (view is enough), then try again.", 403);
  if (code === 401) return new AppError("Google rejected the connection. Reconnect Google Sheets.", 401);
  return new AppError(`Google Sheets: ${anyErr?.message ?? "request failed"}`, 502);
}

// Raw cell values of one tab. UNFORMATTED + SERIAL_NUMBER so dates arrive
// as spreadsheet serials — exactly what the xlsx parser already handles.
async function fetchTabValues(storeId: string, spreadsheetId: string, tab: string): Promise<unknown[][]> {
  const sheets = await sheetsClient(storeId);
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab.replace(/'/g, "''")}'`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER"
    });
    return (res.data.values ?? []) as unknown[][];
  } catch (err) {
    throw translateSheetsError(err);
  }
}

// Reuse the upload parser byte-for-byte: values → an in-memory xlsx → parse.
function valuesToWorkbookBuffer(values: unknown[][], tab: string): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(values as XLSX.CellObject[][] | unknown[][]);
  XLSX.utils.book_append_sheet(wb, ws, tab.slice(0, 31) || "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function contentHash(values: unknown[][]): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

// ─── Diff ──────────────────────────────────────────────────────────────

interface RowLike {
  task: string;
  role: string | null;
  category: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string | null;
}

function rowKey(r: RowLike): string {
  const norm = (v: string | null) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(r.task)}|${norm(r.role)}|${norm(r.category)}`;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export interface SheetDiff {
  added: Array<{ task: string; role: string | null; date: string | null }>;
  removed: Array<{ task: string; role: string | null; date: string | null }>;
  changed: Array<{ task: string; field: "start" | "end" | "status"; from: string | null; to: string | null }>;
}

// Keys can repeat (the matrix layout expands a multi-day task into one row
// per day, all with the same task text), so match by key + occurrence index.
function indexed<T extends RowLike>(rows: T[]): Map<string, T> {
  const seen = new Map<string, number>();
  const out = new Map<string, T>();
  for (const r of rows) {
    const k = rowKey(r);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    out.set(`${k}#${n}`, r);
  }
  return out;
}

export function diffRows(previous: RowLike[], next: RowLike[]): SheetDiff {
  const prev = indexed(previous);
  const cur = indexed(next);
  const diff: SheetDiff = { added: [], removed: [], changed: [] };
  for (const [k, n] of cur) {
    const p = prev.get(k);
    if (!p) {
      diff.added.push({ task: n.task, role: n.role, date: day(n.startDate) });
      continue;
    }
    if (day(p.startDate) !== day(n.startDate)) diff.changed.push({ task: n.task, field: "start", from: day(p.startDate), to: day(n.startDate) });
    if (day(p.endDate) !== day(n.endDate)) diff.changed.push({ task: n.task, field: "end", from: day(p.endDate), to: day(n.endDate) });
    if ((p.status ?? "") !== (n.status ?? "")) diff.changed.push({ task: n.task, field: "status", from: p.status, to: n.status });
  }
  for (const [k, p] of prev) {
    if (!cur.has(k)) diff.removed.push({ task: p.task, role: p.role, date: day(p.startDate) });
  }
  return diff;
}

// ─── Import + sync ─────────────────────────────────────────────────────

export interface ImportGoogleSheetInput {
  storeId: string;
  ref: string;
  sheetName: string;
  title?: string | null;
}

export async function importGoogleSheet(input: ImportGoogleSheetInput): Promise<{ sheetId: string; rowCount: number; title: string }> {
  const { spreadsheetId } = parseSpreadsheetRef(input.ref);
  const meta = await listSpreadsheetTabs(input.storeId, spreadsheetId);
  const tab = meta.tabs.find((t) => t.title === input.sheetName);
  if (!tab) throw new AppError(`Tab "${input.sheetName}" was not found in that spreadsheet.`, 404);
  const values = await fetchTabValues(input.storeId, spreadsheetId, tab.title);
  const parsed = parseGanttWorkbook(valuesToWorkbookBuffer(values, tab.title), { sheetName: tab.title.slice(0, 31) || "Sheet1" });
  if (parsed.rows.length === 0) {
    throw new AppError(
      `Parsed 0 tasks from "${tab.title}". Detected layout: ${parsed.layoutDetected}. Row 1 needs dates (matrix) or a header with Task + Role + Category + Start/End.`,
      422
    );
  }
  const db = getDb();
  const title = input.title?.trim() || `${meta.title} · ${tab.title}`;
  const sheet = await db.ganttSheet.create({
    data: {
      storeId: input.storeId,
      title,
      originalName: `${meta.title} / ${tab.title}`,
      contentType: "application/vnd.google-apps.spreadsheet",
      bytesLength: Buffer.byteLength(JSON.stringify(values)),
      storageKey: null,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
      rowCount: parsed.rows.length,
      rolesJson: parsed.roles,
      categoriesJson: parsed.categories,
      sheetNamesJson: meta.tabs.map((t) => t.title),
      parsedSheetName: tab.title,
      sourceType: "google_sheet",
      sourceSpreadsheetId: spreadsheetId,
      sourceSheetName: tab.title,
      sourceUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${tab.gid}`,
      sourceLastSyncedAt: new Date(),
      sourceContentHash: contentHash(values),
      sourceSyncError: null
    }
  });
  await db.ganttRow.createMany({ data: parsed.rows.map((row) => toRowData(row, sheet.id, input.storeId)) });
  await db.ganttSheetSync.create({
    data: { sheetId: sheet.id, storeId: input.storeId, added: parsed.rows.length, removed: 0, changed: 0, detailsJson: { initial: true } as object }
  });
  return { sheetId: sheet.id, rowCount: parsed.rows.length, title };
}

function toRowData(row: ParsedGanttRow, sheetId: string, storeId: string) {
  return {
    sheetId,
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
  };
}

export interface SyncResult {
  sheetId: string;
  skipped: boolean;
  diff: SheetDiff | null;
  rowCount: number;
}

// Re-read the linked tab. Unchanged content (same hash) → skipped. Changed
// → rows are matched by task/role/category so executed actions survive,
// the plan's range/roles/categories are refreshed, and a GanttSheetSync
// row records what moved.
export async function syncGanttSheet(sheetId: string, storeId?: string): Promise<SyncResult> {
  const db = getDb();
  const sheet = await db.ganttSheet.findFirst({
    where: { id: sheetId, ...(storeId ? { storeId } : {}) },
    select: { id: true, storeId: true, sourceType: true, sourceSpreadsheetId: true, sourceSheetName: true, sourceContentHash: true }
  });
  if (!sheet) throw new AppError("Sheet not found.", 404);
  if (sheet.sourceType !== "google_sheet" || !sheet.sourceSpreadsheetId || !sheet.sourceSheetName) {
    throw new AppError("This Gantt was uploaded as a file — it has no Google Sheet to sync from.", 400);
  }
  try {
    const values = await fetchTabValues(sheet.storeId, sheet.sourceSpreadsheetId, sheet.sourceSheetName);
    const hash = contentHash(values);
    if (hash === sheet.sourceContentHash) {
      await db.ganttSheet.update({ where: { id: sheet.id }, data: { sourceLastSyncedAt: new Date(), sourceSyncError: null } });
      const rowCount = await db.ganttRow.count({ where: { sheetId: sheet.id } });
      return { sheetId: sheet.id, skipped: true, diff: null, rowCount };
    }
    const parsed = parseGanttWorkbook(valuesToWorkbookBuffer(values, sheet.sourceSheetName), { sheetName: sheet.sourceSheetName.slice(0, 31) || "Sheet1" });
    if (parsed.rows.length === 0) throw new AppError(`The tab "${sheet.sourceSheetName}" now parses to 0 tasks — the plan was left as it was.`, 422);

    const existing = await db.ganttRow.findMany({
      where: { sheetId: sheet.id },
      select: { id: true, task: true, role: true, category: true, startDate: true, endDate: true, status: true }
    });
    const diff = diffRows(existing, parsed.rows);

    // Match rows so ids (and executionJson / actionPayloadJson on them) survive.
    type ExistingRow = RowLike & { id: string };
    const prevByKey = indexed<ExistingRow>(existing as ExistingRow[]);
    const nextByKey = indexed<ParsedGanttRow>(parsed.rows);
    const list: unknown[] = [];
    for (const [k, n] of nextByKey) {
      const p = prevByKey.get(k);
      if (p) {
        list.push(
          db.ganttRow.update({
            where: { id: p.id },
            data: { rowIndex: n.rowIndex, startDate: n.startDate, endDate: n.endDate, status: n.status, actionType: n.actionType, rawJson: n.raw as object }
          })
        );
      } else {
        list.push(db.ganttRow.create({ data: toRowData(n, sheet.id, sheet.storeId) }));
      }
    }
    for (const [k, p] of prevByKey) {
      if (!nextByKey.has(k)) list.push(db.ganttRow.delete({ where: { id: p.id } }));
    }
    list.push(
      db.ganttSheet.update({
        where: { id: sheet.id },
        data: {
          rangeStart: parsed.rangeStart,
          rangeEnd: parsed.rangeEnd,
          rowCount: parsed.rows.length,
          rolesJson: parsed.roles,
          categoriesJson: parsed.categories,
          sourceLastSyncedAt: new Date(),
          sourceContentHash: hash,
          sourceSyncError: null
        }
      })
    );
    if (diff.added.length || diff.removed.length || diff.changed.length) {
      list.push(
        db.ganttSheetSync.create({
          data: { sheetId: sheet.id, storeId: sheet.storeId, added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, detailsJson: diff as object }
        })
      );
    }
    await db.$transaction(list as never);
    return { sheetId: sheet.id, skipped: false, diff, rowCount: parsed.rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.ganttSheet.update({ where: { id: sheet.id }, data: { sourceSyncError: message.slice(0, 500) } }).catch(() => undefined);
    throw err;
  }
}

// Cron entry: every linked sheet of a store, errors isolated per sheet.
export async function syncAllGoogleSheets(storeId: string): Promise<{ sheets: number; changed: number; errors: number }> {
  const db = getDb();
  const linked = await db.ganttSheet.findMany({ where: { storeId, sourceType: "google_sheet" }, select: { id: true } });
  let changed = 0;
  let errors = 0;
  for (const s of linked) {
    try {
      const r = await syncGanttSheet(s.id, storeId);
      if (!r.skipped) changed += 1;
    } catch (err) {
      errors += 1;
      console.warn(`[google-sheets] sync failed for sheet ${s.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { sheets: linked.length, changed, errors };
}

export async function listSheetSyncs(sheetId: string, storeId: string, limit = 20) {
  return getDb().ganttSheetSync.findMany({
    where: { sheetId, storeId },
    orderBy: { syncedAt: "desc" },
    take: limit,
    select: { id: true, syncedAt: true, added: true, removed: true, changed: true, detailsJson: true }
  });
}
