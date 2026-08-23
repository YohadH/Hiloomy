"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileText,
  Tag,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Globe,
  CheckCircle2,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";

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
};

type GanttSheetFull = GanttSheetSummary & { rows: GanttRow[] };

type Insights = {
  summary: string;
  insights: Array<{
    title: string;
    severity: "info" | "warning" | "critical";
    body: string;
    relatedDates?: string[];
    relatedCategories?: string[];
  }>;
  actions: Array<{
    title: string;
    body: string;
    suggestedDate?: string;
    suggestedActionType?: string;
  }>;
};

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

function daysBetween(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function dayKey(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function fmtDayLabel(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}

const DOW_HE = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Category color palette ─────────────────────────────────────────────
// Every distinct category (col A in the operator's calendar) gets a
// stable color from this palette so the calendar becomes scannable —
// green blocks = paid promo, red = website banners, purple = main story,
// etc., matching how the source Excel already colors its rows.
//
// Rules:
//   • Well-known Hebrew categories are pinned to specific colors so
//     they always look the same across sheets (paid promo = green,
//     website = red, etc.).
//   • Unknown categories fall back to a stable hash so the same category
//     always renders the same color within one calendar.
const CATEGORY_PALETTE: Array<{ bg: string; border: string; text: string; dot: string }> = [
  { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", dot: "bg-emerald-500" },
  { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-800", dot: "bg-rose-500" },
  { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", dot: "bg-purple-500" },
  { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", dot: "bg-amber-500" },
  { bg: "bg-sky-50", border: "border-sky-300", text: "text-sky-800", dot: "bg-sky-500" },
  { bg: "bg-fuchsia-50", border: "border-fuchsia-300", text: "text-fuchsia-800", dot: "bg-fuchsia-500" },
  { bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-800", dot: "bg-teal-500" },
  { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", dot: "bg-orange-500" }
];

const CATEGORY_PINS: Array<{ patterns: RegExp[]; index: number }> = [
  // Paid promo — bright green, matches the source Excel
  { patterns: [/קידום ממומן/i, /קידום/i, /ממומן/i, /paid/i, /budget/i], index: 0 },
  // Website / banners — red, matches the operator's Excel red rows
  { patterns: [/^אתר$/i, /website/i, /landing/i, /דף נחיתה/i, /באנר/i, /banner/i], index: 1 },
  // Main story / hero — purple
  { patterns: [/סיפור/i, /story/i, /hero/i, /הירו/i, /ראשי/i], index: 2 },
  // Special days / events — amber
  { patterns: [/ימים מיוחדים/i, /special/i, /אירוע/i, /event/i], index: 3 },
  // Samples / distribution — sky
  { patterns: [/דוגמ/i, /sample/i, /גלוי/i, /חלוקת/i], index: 4 },
  // Influencers — fuchsia
  { patterns: [/משפיע/i, /affiliate/i, /influenc/i, /יוצר/i, /creator/i], index: 5 },
  // Email / SMS — teal
  { patterns: [/אימייל/i, /email/i, /ניוזלטר/i, /newsletter/i, /סמס/i, /sms/i], index: 6 },
  // Social — orange
  { patterns: [/פוסט/i, /post/i, /סטור/i, /story/i, /אינסט/i, /instagram/i, /סושיאל/i], index: 7 }
];

function categoryColor(category: string | null | undefined): (typeof CATEGORY_PALETTE)[number] {
  if (!category) return CATEGORY_PALETTE[CATEGORY_PALETTE.length - 1];
  for (const pin of CATEGORY_PINS) {
    if (pin.patterns.some((re) => re.test(category))) return CATEGORY_PALETTE[pin.index];
  }
  // Stable hash fallback so identical labels always get the same color.
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0;
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length];
}

export function GanttStudio({
  initialSheets,
  locale = "he"
}: {
  initialSheets: GanttSheetSummary[];
  locale?: "he" | "en";
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsGeneratedAt, setInsightsGeneratedAt] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [executingRowId, setExecutingRowId] = useState<string | null>(null);
  const [downloadingRole, setDownloadingRole] = useState<string | null>(null);
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [reparseError, setReparseError] = useState<string | null>(null);
  const [briefGenerating, setBriefGenerating] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefReady, setBriefReady] = useState(false);
  const [downloadingBriefPdf, setDownloadingBriefPdf] = useState(false);

  // Load the full sheet (with rows) whenever the selected id changes.
  useEffect(() => {
    if (!selectedSheetId) {
      setSheet(null);
      setSelectedDay(null);
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
          // Default-pick the earliest day with tasks.
          const first = body.sheet.rows.find((r: GanttRow) => r.startDate)?.startDate;
          setSelectedDay(first ? dayKey(first) : null);
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

  // Load cached insights on sheet change (don't auto-fire — agent costs).
  useEffect(() => {
    if (!selectedSheetId) {
      setInsights(null);
      setInsightsGeneratedAt(null);
      return;
    }
    fetch(`/api/gantt/${selectedSheetId}/insights`, { method: "POST" })
      .then((r) => r.json())
      .then((body) => {
        if (body.ok && body.cached) {
          setInsights(body.insights);
          setInsightsGeneratedAt(body.generatedAt);
        }
      })
      .catch(() => {});
  }, [selectedSheetId]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const original = event.target.files?.[0];
    event.target.value = "";
    if (!original) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Guard against multipart parsers that choke on non-ASCII filenames
      // (Hebrew, emoji, etc.) by rewrapping the file with a safe name +
      // sending the original name as a separate title field so we don't
      // lose it. Same bytes, safer filename on the wire.
      const safeName = original.name.replace(/[^\w.\- ]+/g, "_") || "gantt.xlsx";
      const file =
        safeName === original.name
          ? original
          : new File([original], safeName, {
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
      setUploading(false);
    }
  };

  const handleRunInsights = async () => {
    if (!selectedSheetId) return;
    setInsightsError(null);
    setInsightsLoading(true);
    try {
      const res = await fetch(`/api/gantt/${selectedSheetId}/insights?refresh=1`, {
        method: "POST"
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setInsights(body.insights);
      setInsightsGeneratedAt(body.generatedAt);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : String(err));
    } finally {
      setInsightsLoading(false);
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
        const first = refreshed.sheet.rows.find((r: GanttRow) => r.startDate)?.startDate;
        setSelectedDay(first ? dayKey(first) : null);
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

  const calendarDays = useMemo(() => {
    if (!sheet?.rangeStart || !sheet?.rangeEnd) return [];
    return daysBetween(new Date(sheet.rangeStart), new Date(sheet.rangeEnd));
  }, [sheet]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, GanttRow[]>();
    for (const r of sheet?.rows ?? []) {
      const k = dayKey(r.startDate);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }, [sheet]);

  const tasksForSelectedDay = selectedDay ? tasksByDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-6" dir="rtl">
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
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 px-3 py-2 text-sm font-semibold text-emerald-700 hover:border-emerald-400",
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

          {/* ── BI insights pane ────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-green-600" aria-hidden />
                <h3 className="text-base font-semibold">
                  {lang("תובנות מסוכן BI", "Insights from the BI agent")}
                </h3>
                {insightsGeneratedAt ? (
                  <span className="text-[11px] text-muted-foreground">
                    {lang("הופק:", "Generated:")}{" "}
                    {new Date(insightsGeneratedAt).toLocaleString(dateLocale, {
                      dateStyle: "short",
                      timeStyle: "short"
                    })}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleRunInsights}
                disabled={insightsLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {insightsLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3 w-3" aria-hidden />
                )}
                {insights
                  ? lang("רענון תובנות", "Refresh insights")
                  : lang("הפעלת ניתוח", "Run analysis")}
              </button>
            </div>
            {insightsError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {insightsError}
              </div>
            ) : null}
            {insights ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm leading-6">{insights.summary}</p>
                {insights.insights.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {insights.insights.map((ins, i) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-xl border p-3 text-sm",
                          ins.severity === "critical"
                            ? "border-rose-200 bg-rose-50/60"
                            : ins.severity === "warning"
                              ? "border-amber-200 bg-amber-50/60"
                              : "border-slate-200 bg-slate-50/60"
                        )}
                      >
                        <p className="text-[13px] font-semibold">{ins.title}</p>
                        <p className="mt-1 text-[12px] leading-5 text-slate-700">{ins.body}</p>
                        {ins.relatedDates?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {ins.relatedDates.map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setSelectedDay(d)}
                                className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {insights.actions.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                      {lang("פעולות מומלצות", "Recommended actions")}
                    </p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {insights.actions.map((a, i) => (
                        <li key={i}>
                          <span className="font-semibold">{a.title}</span>
                          {a.suggestedDate ? (
                            <span className="ms-2 text-[11px] text-muted-foreground">
                              ({a.suggestedDate})
                            </span>
                          ) : null}
                          <p className="text-[12px] leading-5 text-slate-700">{a.body}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {lang(
                  'לחצו על "הפעלת ניתוח" כדי לקבל סיכום, אזהרות (חוסרים, התנגשויות, חוסר זמן הכנה) והמלצות מסוכן הBI.',
                  'Click "Run analysis" to get a summary, warnings (gaps, conflicts, not enough lead time) and recommendations from the BI agent.'
                )}
              </p>
            )}
          </div>

          {/* ── Marketing brief generator (BIG CTA) ──────────────────── */}
          <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-pink-50 via-white to-amber-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-orange-600" aria-hidden />
                  <h3 className="text-base font-semibold">
                    {lang("בריף שיווקי חודשי", "Monthly marketing brief")}
                  </h3>
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {lang(
                    "הBI יבנה בריף מלא בפורמט שאתם משתמשים בו: הטבות קבועות, קודי קופון של משפיעניות, הנחות באתר, בריף קידום ממומן (תקציב + ROAS + קמפיינים), ותוכן UGC — הכל עם הדגשות, קופונים, ותנאי המבצעים.",
                    "The BI agent builds a full brief in the format you already use: standing perks, influencer coupon codes, on-site discounts, a paid-promotion brief (budget + ROAS + campaigns), and UGC content — all with highlights, coupons, and promo terms."
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

          {/* ── Calendar grid ────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" aria-hidden />
              <h3 className="text-base font-semibold">{lang("לוח שנה", "Calendar")}</h3>
              <span className="text-xs text-muted-foreground">
                {calendarDays.length} {lang("ימים,", "days,")} {sheet.rows.length}{" "}
                {lang(
                  "משימות. לחצו על יום כדי לראות את המשימות שלו.",
                  "tasks. Click a day to see its tasks."
                )}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-muted-foreground">
              {(isHe ? DOW_HE : DOW_EN).map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {/* Pad the first row so day-of-week aligns. Israeli week
                  starts Sunday (col 0). */}
              {calendarDays.length > 0
                ? Array.from({ length: calendarDays[0].getUTCDay() }).map((_, i) => (
                    <div key={`pad-${i}`} />
                  ))
                : null}
              {calendarDays.map((d) => {
                const key = dayKey(d)!;
                const tasks = tasksByDay.get(key) ?? [];
                const selected = key === selectedDay;
                // Distinct-category color dots for the day. Cap at 4 so
                // the tile stays compact.
                const uniqueCategories = Array.from(
                  new Set(tasks.map((t) => t.category).filter(Boolean) as string[])
                );
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDay(key);
                      if (tasks.length > 0) setDayModalOpen(true);
                    }}
                    className={cn(
                      "flex h-20 flex-col rounded-lg border p-1.5 text-start transition-colors",
                      selected
                        ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-200"
                        : tasks.length > 0
                          ? "border-border bg-white hover:border-emerald-300"
                          : "border-dashed border-border bg-muted/20 hover:border-emerald-300"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("text-[11px] font-bold", selected ? "text-emerald-700" : "text-foreground")}>
                        {fmtDayLabel(d)}
                      </span>
                      {uniqueCategories.length > 0 ? (
                        <div className="flex items-center gap-0.5">
                          {uniqueCategories.slice(0, 4).map((cat) => (
                            <span
                              key={cat}
                              className={cn("h-2 w-2 rounded-full", categoryColor(cat).dot)}
                              title={cat}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {tasks.length > 0 ? (
                      <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {tasks.length}
                      </span>
                    ) : null}
                    <div className="mt-auto truncate text-[9px] text-muted-foreground">
                      {tasks
                        .slice(0, 2)
                        .map((t) => t.category)
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Day-of-tasks MODAL (opens on calendar click) ─────────── */}
          {dayModalOpen && selectedDay ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
              onClick={() => setDayModalOpen(false)}
            >
              <div
                dir="rtl"
                className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(selectedDay);
                      d.setUTCDate(d.getUTCDate() - 1);
                      setSelectedDay(dayKey(d));
                    }}
                    className="rounded-lg border border-border p-1.5 hover:border-emerald-300"
                    title={lang("יום קודם", "Previous day")}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                  <h3 className="flex-1 text-base font-semibold">
                    {new Date(selectedDay).toLocaleDateString(dateLocale, {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric"
                    })}
                    <span className="ms-3 text-xs font-normal text-muted-foreground">
                      {tasksForSelectedDay.length} {lang("משימות", "tasks")}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(selectedDay);
                      d.setUTCDate(d.getUTCDate() + 1);
                      setSelectedDay(dayKey(d));
                    }}
                    className="rounded-lg border border-border p-1.5 hover:border-emerald-300"
                    title={lang("יום הבא", "Next day")}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDayModalOpen(false)}
                    className="rounded-lg border border-border p-1.5 hover:border-rose-300 hover:bg-rose-50"
                    title={lang("סגירה", "Close")}
                  >
                    ✕
                  </button>
                </div>
                <div className="max-h-[calc(85vh-60px)] overflow-y-auto p-5">
                  {tasksForSelectedDay.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {lang("אין משימות מתוכננות ליום זה.", "No tasks planned for this day.")}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {tasksForSelectedDay.map((row) => {
                        const meta = row.actionType ? ACTION_META[row.actionType] : null;
                        const Icon = meta?.icon ?? FileText;
                        const executed = Boolean(row.executionJson?.executedAt);
                        // Per-category color — makes the day's task list
                        // scannable at a glance (green stripe = paid promo,
                        // red = website, etc., matching the source Excel).
                        const catColor = categoryColor(row.category);
                        return (
                          <li
                            key={row.id}
                            className={cn(
                              "rounded-xl border p-4 border-s-4",
                              executed
                                ? "border-emerald-200 bg-emerald-50/40"
                                : `${catColor.border} ${catColor.bg}`
                            )}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2 text-[11px]">
                                  <Icon className={cn("h-3.5 w-3.5", catColor.text)} aria-hidden />
                                  <span className={cn("font-semibold", catColor.text)}>
                                    {row.category ?? "—"}
                                  </span>
                                  {row.role ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                                      {row.role}
                                    </span>
                                  ) : null}
                                  {meta ? (
                                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", catColor.bg, catColor.text)}>
                                      {meta.label}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-6">
                                  {row.task}
                                </p>
                                {executed ? (
                                  <p className="flex items-center gap-1 text-[11px] text-emerald-700">
                                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                                    {lang("סומן כבוצע", "Marked as done")}{" "}
                                    {row.executionJson?.executedAt
                                      ? new Date(row.executionJson.executedAt).toLocaleString(dateLocale, {
                                          dateStyle: "short",
                                          timeStyle: "short"
                                        })
                                      : ""}
                                  </p>
                                ) : null}
                              </div>
                              {meta ? (
                                <button
                                  type="button"
                                  onClick={() => handleExecuteRow(row)}
                                  disabled={executingRowId === row.id}
                                  className={cn(
                                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                                    executed
                                      ? "border border-emerald-300 bg-white text-emerald-700"
                                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                                  )}
                                >
                                  {executingRowId === row.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                  ) : (
                                    <Icon className="h-3.5 w-3.5" aria-hidden />
                                  )}
                                  {executed ? lang("פתיחה מחדש", "Open again") : meta.ctaLabel}
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : null}
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
