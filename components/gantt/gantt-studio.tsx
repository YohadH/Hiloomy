"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  Trash2,
  AlertCircle,
  Sparkles,
  Calendar,
  FileText,
  Tag,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Globe,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleSheetLink } from "@/components/gantt/google-sheet-link";
import { PlanView } from "@/components/plan/plan-view";
import { SheetSyncPanel } from "@/components/gantt/sheet-sync-panel";

// Interactive Gantt studio. Three panes stacked:
//   1. Upload / sheet picker
//   2. Calendar grid (one tile per day in the sheet's range — click a
//      day to drill in)
//   3. Drill-in pane: tasks for the selected day, with per-task action
//      buttons (create discount in Shopify, open Creative wizard with
//      brief pre-filled, etc.) + per-role PDF download
// Hebrew-first (locale defaults to "he"); pass locale="en" for the
// English UI. The feature was built for the Israeli marketing team.

type GanttRow = {
  id: string;
  rowIndex: number;
  task: string;
  role: string | null;
  category: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  actionType:
    | "discount_code"
    | "creative_image"
    | "creative_banner"
    | "creative_video"
    | "social_post"
    | "email_campaign"
    | "sms_campaign"
    | "web_update"
    | "blog_post"
    | null;
  executionJson: {
    executedAt?: string;
    providerRef?: string | null;
    providerUrl?: string | null;
  } | null;
};

type GanttSheetSummary = {
  id: string;
  title: string;
  originalName: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  rowCount: number;
  rolesJson: string[];
  categoriesJson: string[];
  sheetNamesJson: string[];
  parsedSheetName: string | null;
  insightsGeneratedAt: string | null;
  createdAt: string;
  sourceType: string;
  sourceSheetName: string | null;
  sourceUrl: string | null;
  sourceLastSyncedAt: string | null;
  sourceSyncError: string | null;
};

type GanttSheetFull = GanttSheetSummary & { rows: GanttRow[] };

type ActionMeta = Record<
  NonNullable<GanttRow["actionType"]>,
  { label: string; icon: typeof Tag; ctaLabel: string; href: (row: GanttRow) => string }
>;

function buildActionMeta(isHe: boolean): ActionMeta {
  const lang = (he: string, en: string) => (isHe ? he : en);
  return {
    discount_code: {
      label: lang("קופון/הנחה", "Coupon / discount"),
      icon: Tag,
      ctaLabel: lang("יצירת קופון בShopify", "Create a Shopify coupon"),
      href: (row) => `/marketing-tools?action=discount&title=${encodeURIComponent(row.task.slice(0, 80))}`
    },
    creative_image: {
      label: lang("תמונה", "Image"),
      icon: ImageIcon,
      ctaLabel: lang("פתיחת סטודיו ליצירה", "Open the creative studio"),
      href: (row) => `/creative/new?type=PACKSHOT&prompt=${encodeURIComponent(row.task.slice(0, 280))}`
    },
    creative_banner: {
      label: lang("באנר", "Banner"),
      icon: ImageIcon,
      ctaLabel: lang("פתיחת סטודיו לבאנר", "Open the banner studio"),
      href: (row) => `/creative/new?type=META_AD&prompt=${encodeURIComponent(row.task.slice(0, 280))}`
    },
    creative_video: {
      label: lang("וידאו", "Video"),
      icon: ImageIcon,
      ctaLabel: lang("פתיחת סטודיו לווידאו", "Open the video studio"),
      href: (row) => `/creative/new?type=UGC_VIDEO&prompt=${encodeURIComponent(row.task.slice(0, 280))}`
    },
    social_post: {
      label: lang("פוסט/סטורי", "Post / story"),
      icon: MessageSquare,
      ctaLabel: lang("פתיחת סטודיו ליצירה", "Open the creative studio"),
      href: (row) => `/creative/new?type=INSTAGRAM_POST&prompt=${encodeURIComponent(row.task.slice(0, 280))}`
    },
    email_campaign: {
      label: lang("אימייל/ניוזלטר", "Email / newsletter"),
      icon: Mail,
      ctaLabel: lang("יצירת טיוטה", "Create a draft"),
      href: (row) => `/marketing-tools?action=email&title=${encodeURIComponent(row.task.slice(0, 80))}`
    },
    sms_campaign: {
      label: lang("סמס", "SMS"),
      icon: MessageSquare,
      ctaLabel: lang("יצירת טיוטת סמס", "Create an SMS draft"),
      href: (row) => `/marketing-tools?action=sms&title=${encodeURIComponent(row.task.slice(0, 80))}`
    },
    web_update: {
      label: lang("אתר", "Site"),
      icon: Globe,
      ctaLabel: lang("עדכון אתר", "Update the site"),
      href: () => `/settings`
    },
    blog_post: {
      label: lang("מאמר/בלוג", "Article / blog"),
      icon: FileText,
      ctaLabel: lang("פתיחת עורך תוכן", "Open the content editor"),
      href: (row) => `/creative/new?type=INSTAGRAM_POST&prompt=${encodeURIComponent(row.task.slice(0, 280))}`
    }
  };
}

export function GanttStudio({
  initialSheets,
  locale = "he",
  storeId,
  googleSheetsConnected = false,
  sheetsNotice = null
}: {
  initialSheets: GanttSheetSummary[];
  locale?: "he" | "en";
  storeId: string;
  // Google Sheets connection state (lib/services/google-sheets-service.ts).
  googleSheetsConnected?: boolean;
  // Outcome of an OAuth round-trip that just landed here.
  sheetsNotice?: { kind: "connected" | "error"; message?: string } | null;
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  // Intl locale used for the dates rendered to the operator. Note: the
  // sheet-tab sanity check below deliberately stays on he-IL because it
  // compares against Hebrew tab names coming out of the workbook.
  const dateLocale = isHe ? "he-IL" : "en-US";
  const ACTION_META = useMemo(() => buildActionMeta(isHe), [isHe]);
  const router = useRouter();
  const [sheets, setSheets] = useState<GanttSheetSummary[]>(initialSheets);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(
    initialSheets[0]?.id ?? null
  );
  const [sheet, setSheet] = useState<GanttSheetFull | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [executingRowId, setExecutingRowId] = useState<string | null>(null);
  const [downloadingRole, setDownloadingRole] = useState<string | null>(null);
  // Bumped after any change to the rows (sync, reparse, execute) so the
  // plan view re-evaluates.
  const [planRefresh, setPlanRefresh] = useState(0);
  const [reparsing, setReparsing] = useState(false);
  const [reparseError, setReparseError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Remove the selected Gantt (rows cascade). Uploading again never replaces
  // an existing Gantt — it adds one — so this is how a wrong file goes away.
  const handleDelete = async () => {
    if (!selectedSheetId || !sheet) return;
    const ok = window.confirm(
      isHe
        ? `למחוק את הגאנט "${sheet.title}" (${sheet.rowCount} משימות)? אי אפשר לבטל.`
        : `Delete the Gantt "${sheet.title}" (${sheet.rowCount} tasks)? This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    setReparseError(null);
    try {
      const res = await fetch(`/api/gantt/${selectedSheetId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const listRes = await fetch("/api/gantt").then((r) => r.json());
      const next: GanttSheetSummary[] = listRes.ok ? listRes.sheets : sheets.filter((x) => x.id !== selectedSheetId);
      setSheets(next);
      setSheet(null);
      setSelectedSheetId(next[0]?.id ?? null);
      router.refresh();
    } catch (err) {
      setReparseError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };
  const [briefGenerating, setBriefGenerating] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefReady, setBriefReady] = useState(false);
  const [downloadingBriefPdf, setDownloadingBriefPdf] = useState(false);

  // Load the full sheet (with rows) whenever the selected id changes.
  useEffect(() => {
    if (!selectedSheetId) {
      setSheet(null);
      return;
    }
    let cancelled = false;
    setLoadingSheet(true);
    fetch(`/api/gantt/${selectedSheetId}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.ok) {
          setSheet(body.sheet);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingSheet(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSheetId]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const original = input.files?.[0];
    if (!original) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Read the bytes BEFORE anything can release the input's file handle.
      //
      // This used to do `input.value = ""` on the line after grabbing the
      // File, to reset the picker. Clearing the input drops the browser's
      // backing handle, and the File object — though still a live JS
      // reference — can serialise as an empty or missing multipart part.
      // The upload then arrived carrying only `title`, which is exactly the
      // "No file received" the server reported. The picker is now reset in
      // `finally`, once the bytes are safely in memory.
      const bytes = await original.arrayBuffer();
      if (bytes.byteLength === 0) {
        throw new Error(
          isHe
            ? "הקובץ נקרא ריק. נסו לבחור אותו שוב, או לשמור עותק חדש ולהעלות אותו."
            : "The file read as empty. Pick it again, or save a fresh copy and upload that."
        );
      }

      // Rewrap with an ASCII-safe name. The original name still travels as
      // `title`, so nothing is lost if the sheet was named in Hebrew.
      const safeName = original.name.replace(/[^\w.\- ]+/g, "_") || "gantt.xlsx";
      const file = new File([bytes], safeName, {
        type: original.type || "application/octet-stream"
      });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", original.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/gantt/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      // Refresh sheet list + select the new one.
      const listRes = await fetch("/api/gantt");
      const listBody = await listRes.json();
      if (listBody.ok) setSheets(listBody.sheets);
      setSelectedSheetId(body.sheetId);
      router.refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      // Reset the picker only now — doing it up front is what broke the
      // upload. Also lets the same file be re-selected after a failure,
      // which a non-empty input would otherwise suppress (no change event).
      input.value = "";
      setUploading(false);
    }
  };


  const handleDownloadRolePdf = async (role: string) => {
    if (!selectedSheetId) return;
    setDownloadingRole(role);
    try {
      const url = `/api/gantt/${selectedSheetId}/export-role-pdf?role=${encodeURIComponent(role)}&locale=${locale}`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `gantt-${role}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      alert(
        `${lang("יצירת הPDF נכשלה", "PDF export failed")}: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setDownloadingRole(null);
    }
  };

  const handleGenerateBrief = async (refresh = false) => {
    if (!selectedSheetId) return;
    setBriefError(null);
    setBriefGenerating(true);
    try {
      const res = await fetch(
        `/api/gantt/${selectedSheetId}/brief${refresh ? "?refresh=1" : ""}`,
        { method: "POST" }
      );
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setBriefReady(true);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : String(err));
    } finally {
      setBriefGenerating(false);
    }
  };

  const handleDownloadBriefPdf = async () => {
    if (!selectedSheetId) return;
    setDownloadingBriefPdf(true);
    try {
      // Ensure the brief exists first — cheap when cached.
      if (!briefReady) {
        const gen = await fetch(`/api/gantt/${selectedSheetId}/brief`, {
          method: "POST"
        });
        const genBody = await gen.json();
        if (!gen.ok || !genBody.ok) throw new Error(genBody.error || `HTTP ${gen.status}`);
        setBriefReady(true);
      }
      const res = await fetch(`/api/gantt/${selectedSheetId}/export-brief-pdf`, {
        method: "POST"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "marketing-brief.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingBriefPdf(false);
    }
  };

  const handleReparse = async (nextSheetName: string) => {
    if (!selectedSheetId || !sheet) return;
    if (nextSheetName === sheet.parsedSheetName) return;
    setReparseError(null);
    setReparsing(true);
    try {
      const url = `/api/gantt/${selectedSheetId}/reparse?sheetName=${encodeURIComponent(nextSheetName)}`;
      const res = await fetch(url, { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      // Re-fetch the full sheet so rows + calendar refresh.
      const refreshed = await fetch(`/api/gantt/${selectedSheetId}`).then((r) => r.json());
      if (refreshed.ok) {
        setSheet(refreshed.sheet);
        setPlanRefresh((n) => n + 1);
      }
      // Also refresh the sheet list summary (parsedSheetName may have changed).
      const listRes = await fetch("/api/gantt").then((r) => r.json());
      if (listRes.ok) setSheets(listRes.sheets);
    } catch (err) {
      setReparseError(err instanceof Error ? err.message : String(err));
    } finally {
      setReparsing(false);
    }
  };

  const handleExecuteRow = async (row: GanttRow) => {
    if (!selectedSheetId || !sheet) return;
    if (!row.actionType) return;
    const meta = ACTION_META[row.actionType];
    setExecutingRowId(row.id);
    try {
      // Record the click first (so the row gets the "executed" badge),
      // then deep-link to the existing service.
      await fetch(`/api/gantt/${selectedSheetId}/rows/${row.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: meta.label })
      });
      // Re-read row so the UI shows "Executed" without a full reload.
      const refreshed = await fetch(`/api/gantt/${selectedSheetId}`).then((r) => r.json());
      if (refreshed.ok) setSheet(refreshed.sheet);
      setPlanRefresh((n) => n + 1);
      // Now open the destination in a new tab.
      window.open(meta.href(row), "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(
        `${lang("לא הצלחנו לסמן את המשימה", "We could not mark the task")}: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setExecutingRowId(null);
    }
  };

  return (
    <div className="space-y-6" dir={isHe ? "rtl" : "ltr"}>
      {/* ── Sheet picker + upload ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{lang("גאנט שיווקי", "Marketing Gantt")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lang(
                "העלאת קובץ Excel של גאנט חודשי. המערכת מזהה את המבנה, מציעה כפתורי פעולה לכל משימה, ויוצרת בריף PDF לכל תפקיד.",
                "Upload a monthly Gantt Excel file. The system detects its structure, suggests an action button for every task, and generates a PDF brief per role."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <GoogleSheetLink
            storeId={storeId}
            connected={googleSheetsConnected}
            locale={locale}
            onLinked={async (sheetId) => {
              const listRes = await fetch("/api/gantt");
              const listBody = await listRes.json().catch(() => ({}));
              if (listBody.ok) setSheets(listBody.sheets);
              setSelectedSheetId(sheetId);
              router.refresh();
            }}
          />
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-accent",
              uploading && "pointer-events-none opacity-50"
            )}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            {uploading
              ? lang("מעלה…", "Uploading…")
              : lang("העלאת גאנט (.xlsx / .csv)", "Upload a Gantt (.xlsx / .csv)")}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
          </div>
        </div>
        {sheetsNotice ? (
          <p className={cn("mt-3 text-sm", sheetsNotice.kind === "error" ? "text-danger" : "text-success")}>
            {sheetsNotice.kind === "error"
              ? sheetsNotice.message ?? lang("חיבור Google Sheets נכשל.", "Google Sheets connection failed.")
              : lang("Google Sheets חובר. עכשיו אפשר לקשר לשונית.", "Google Sheets connected. You can link a tab now.")}
          </p>
        ) : null}
        {uploadError ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{uploadError}</span>
          </div>
        ) : null}
        {sheets.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {lang("גאנטים שמורים:", "Saved Gantts:")}
            </span>
            <select
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              value={selectedSheetId ?? ""}
              onChange={(e) => setSelectedSheetId(e.target.value || null)}
            >
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {s.rowCount} {lang("משימות", "tasks")}
                </option>
              ))}
            </select>
            {/* Tab picker — most impactful when a workbook has multiple
                month tabs and the auto-picker landed on the wrong one.
                Hidden when the workbook has only one sheet. */}
            {sheet && sheet.sheetNamesJson.length > 1 ? (
              <>
                <span className="ms-2 text-xs font-semibold text-muted-foreground">
                  {lang("לשונית בקובץ:", "Sheet tab in file:")}
                </span>
                <select
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                  value={sheet.parsedSheetName ?? ""}
                  disabled={reparsing}
                  onChange={(e) => handleReparse(e.target.value)}
                >
                  {sheet.sheetNamesJson.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {reparsing ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : null}
              </>
            ) : null}
            {sheet ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="ms-auto inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-danger disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                {lang("מחיקת הגאנט", "Delete this Gantt")}
              </button>
            ) : null}
          </div>
        ) : null}
        {reparseError ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {reparseError}
          </div>
        ) : null}
      </div>

      {loadingSheet ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {sheet && !loadingSheet ? (
        <>
          {sheet.sourceType === "google_sheet" ? (
            <SheetSyncPanel
              sheet={sheet}
              locale={locale}
              onSynced={async () => {
                const refreshed = await fetch(`/api/gantt/${sheet.id}`).then((r) => r.json());
                if (refreshed.ok) setSheet(refreshed.sheet);
                setPlanRefresh((n) => n + 1);
                const listRes = await fetch("/api/gantt").then((r) => r.json());
                if (listRes.ok) setSheets(listRes.sheets);
              }}
            />
          ) : null}
          {/* ── Parsed range banner — visual sanity check ──────────── */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-emerald-900">
                {lang("📅 טווח הגאנט:", "📅 Gantt range:")}
              </span>
              <span className="font-mono text-emerald-800" dir={isHe ? undefined : "ltr"}>
                {sheet.rangeStart
                  ? new Date(sheet.rangeStart).toLocaleDateString(dateLocale, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric"
                    })
                  : "—"}
                {" → "}
                {sheet.rangeEnd
                  ? new Date(sheet.rangeEnd).toLocaleDateString(dateLocale, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric"
                    })
                  : "—"}
              </span>
              <span className="text-xs text-muted-foreground">
                {lang("לשונית מקור:", "Source tab:")} <strong>{sheet.parsedSheetName ?? "?"}</strong> ·{" "}
                {sheet.rowCount} {lang("משימות", "tasks")}
              </span>
              {sheet.rangeStart &&
              sheet.rangeEnd &&
              sheet.parsedSheetName &&
              !sheet.parsedSheetName.toLowerCase().includes(
                new Date(sheet.rangeStart).toLocaleString("he-IL", { month: "long" })
              ) ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {lang(
                    "⚠ שם הלשונית לא מתאים לטווח התאריכים — ייתכן שהלשונית שגויה",
                    "⚠ The tab name does not match the date range — the wrong tab may be selected"
                  )}
                </span>
              ) : null}
            </div>
          </div>

          {/* ── Plan: initiatives, status, calendar, day panel ──────
              (components/plan/plan-view.tsx — Plan = intent, Data =
              reality, Today = decisions; docs/DECISION-INBOX-PLAN.md §0) */}
          <PlanView
            sheetId={sheet.id}
            locale={locale}
            refreshKey={planRefresh}
            rowActionFor={(rowId, actionType, context) => {
              const row = sheet.rows.find((r) => r.id === rowId);
              if (!row) return null;
              // The plan view knows the CHANNEL (a newsletter cell is an email
              // even when it mentions "15%"), so its action wins over the
              // row's parse-time guess. The creative studio gets the whole
              // move as its brief: initiative · offer · dates · channel · cell.
              const kind = (actionType ?? row.actionType) as GanttRow["actionType"];
              if (!kind) return null;
              const meta = ACTION_META[kind];
              const briefed: GanttRow = context ? { ...row, task: `${context}
${row.task}` } : row;
              return { label: meta.label, ctaLabel: meta.ctaLabel, href: meta.href(briefed) };
            }}
            onGroupingChanged={() => setPlanRefresh((n) => n + 1)}
            onExecuteRow={(rowId) => {
              const row = sheet.rows.find((r) => r.id === rowId);
              if (row) void handleExecuteRow(row);
            }}
            executingRowId={executingRowId}
          />

          {/* ── Export & tools: the brief and the role PDFs. Kept, demoted —
              the page is for managing the plan, not generating PDFs. */}
          <details className="group rounded-xl border border-border bg-card">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold hover:bg-accent/40">
              <span className="inline-flex items-center gap-2">
                <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
                {lang("ייצוא וכלים — בריף חודשי ו־PDF לכל תפקיד", "Export & tools — monthly brief and role PDFs")}
              </span>
            </summary>
            <div className="space-y-4 border-t border-border px-5 py-4">
          {/* ── Marketing brief generator (BIG CTA) ──────────────────── */}
              <div className="rounded-2xl border border-warning/40 bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-[14rem]">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-warning" aria-hidden />
                      <h3 className="text-base font-semibold">
                        {lang("בריף שיווקי חודשי", "Monthly marketing brief")}
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {lang(
                        "הילומה תבנה בריף מלא בפורמט שאתם משתמשים בו: הטבות קבועות, קודי קופון של משפיעניות, הנחות באתר, בריף קידום ממומן (תקציב + ROAS + קמפיינים), ותוכן UGC — הכל עם הדגשות, קופונים, ותנאי המבצעים.",
                        "Hiloma builds a full brief in the format you already use: standing perks, influencer coupon codes, on-site discounts, a paid-promotion brief (budget + ROAS + campaigns), and UGC content — all with highlights, coupons, and promo terms."
                      )}
                    </p>
                  </div>
                </div>
                {briefError ? (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {briefError}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerateBrief(!briefReady ? false : true)}
                    disabled={briefGenerating}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-orange-700 disabled:opacity-50"
                  >
                    {briefGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden />
                    )}
                    {briefReady
                      ? lang("יצירה מחדש", "Regenerate")
                      : lang("יצירת בריף שיווקי", "Generate marketing brief")}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadBriefPdf}
                    disabled={downloadingBriefPdf || briefGenerating}
                    className="inline-flex items-center gap-2 rounded-xl border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-700 hover:border-orange-500 disabled:opacity-50"
                  >
                    {downloadingBriefPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                    {lang("הורדת PDF", "Download PDF")}
                  </button>
                  <a
                    href={`/print/gantt-marketing-brief?sheetId=${selectedSheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm text-muted-foreground hover:border-orange-300"
                  >
                    {lang("תצוגה מקדימה בדפדפן", "Preview in browser")}
                  </a>
                </div>
              </div>

              {/* ── Per-role PDF downloads ───────────────────────────────── */}
              {sheet.rolesJson.length > 0 || sheet.rows.some((r) => r.actionType === "discount_code") ? (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold">
                    {lang("בריף PDF לכל תפקיד", "PDF brief per role")}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {lang(
                      "מורידים את הקובץ ושולחים לחבר/ה בצוות. הקובץ כולל רק את המשימות שלהם, מקובצות לפי ערוץ ותאריך. שירות לקוחות מקבל אוטומטית את כל המבצעים וההשקות כדי לענות ללקוחות.",
                      "Download the file and send it to a teammate. It contains only their tasks, grouped by channel and date. Customer service automatically gets every promo and launch so they can answer customers."
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sheet.rolesJson.map((role) => {
                      const label =
                        ({
                          web: lang("אתר", "Site"),
                          social: lang("סושיאל", "Social"),
                          graphic: lang("גרפיקה", "Graphics"),
                          affiliates: lang("אפיליאייטים", "Affiliates"),
                          email: lang("אימייל / SMS", "Email / SMS"),
                          marketing: lang("שיווק / מבצעים", "Marketing / promos")
                        } as Record<string, string>)[role] ?? role;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => handleDownloadRolePdf(role)}
                          disabled={downloadingRole === role}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-sm hover:border-emerald-300 disabled:opacity-50"
                        >
                          {downloadingRole === role ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Download className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {label}
                        </button>
                      );
                    })}
                    {/* Customer service — virtual role that filters to
                        discount/promo/launch tasks. Always available. */}
                    <button
                      type="button"
                      onClick={() => handleDownloadRolePdf("customer_service")}
                      disabled={downloadingRole === "customer_service"}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 hover:border-emerald-400 disabled:opacity-50"
                    >
                      {downloadingRole === "customer_service" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {lang("שירות לקוחות", "Customer service")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadRolePdf("")}
                      disabled={downloadingRole === ""}
                      className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-emerald-300"
                    >
                      {downloadingRole === "" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {lang("כל הצוותים", "All teams")}
                    </button>
                  </div>
                </div>
              ) : null}

            </div>
          </details>
        </>
      ) : null}

      {!sheet && !loadingSheet && sheets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-semibold">
            {lang("העלו את הגאנט הראשון", "Upload your first Gantt")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang(
              "פורמט מטריצה (יום בכל עמודה, ערוץ בכל שורה) או טבלאי (שורה לכל משימה). עברית ואנגלית נתמכות.",
              "Matrix format (a day per column, a channel per row) or tabular (one row per task). Hebrew and English are both supported."
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
