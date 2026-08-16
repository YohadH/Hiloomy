"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Loader2,
  Trash2,
  Upload,
  FileSpreadsheet,
  Sparkles,
  Store,
  Globe,
  AlertTriangle,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Megaphone,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { formatCurrency, formatNumber } from "@/lib/utils";

type SummaryRow = {
  barcode: string | null;
  itemName: string;
  matchedVariantId: string | null;
  matchedProductTitle: string | null;
  productStatus: string | null;
  offlineQuantity: number;
  offlineSales: number;
  onlineQuantity: number;
  onlineSales: number;
  totalQuantity: number;
  totalSales: number;
  matched: boolean;
  onlinePct: number;
  offlinePct: number;
  inventoryQuantity: number | null;
  dailyBurn: number;
  daysOfStock: number | null;
  stockRisk: boolean;
};

type ImportSummary = {
  id: string;
  fileName: string;
  sheetTitle: string | null;
  periodYear: number;
  periodMonth: number;
  totalRows: number;
  totalQuantity: number;
  totalSales: number;
  currency: string | null;
  createdAt: string;
};

type UnmatchedRow = {
  itemName: string;
  barcode: string | null;
  quantity: number;
  sales: number;
};

type Narrative = { headline: string; body: string; tone: "up" | "down" | "neutral" };

type AffiliateHaloProduct = {
  barcode: string | null;
  productTitle: string;
  onlineQuantity: number;
  onlineSales: number;
  offlineQuantity: number;
  offlineSales: number;
  haloRatio: number;
};

type AffiliateHaloEntry = {
  affiliateMemberId: string;
  affiliateName: string;
  affiliateCode: string;
  couponCodes: string[];
  onlineSales: number;
  onlineOrders: number;
  onlineQuantity: number;
  haloOfflineSales: number;
  haloOfflineQuantity: number;
  directOfflineSales: number;
  directOfflineQuantity: number;
  directRowCount: number;
  haloRatio: number;
  topProducts: AffiliateHaloProduct[];
};

type AffiliateHaloSummary = {
  hasCouponColumn: boolean;
  storeOfflineToOnlineRatio: number;
  totalOnlineSales: number;
  totalDirectOfflineSales: number;
  affiliates: AffiliateHaloEntry[];
};

type SummaryResponse = {
  import: ImportSummary;
  totals: {
    offlineQuantity: number;
    offlineSales: number;
    onlineQuantity: number;
    onlineSales: number;
    totalQuantity: number;
    totalSales: number;
    offlineShare: number;
    onlineShare: number;
  };
  matchedRows: number;
  unmatchedRows: number;
  rows: SummaryRow[];
  storeHeroes: SummaryRow[];
  webHeroes: SummaryRow[];
  unmatched: UnmatchedRow[];
  stockRisk: { count: number; threshold: number };
  narrative: Narrative;
  affiliateHalo: AffiliateHaloSummary;
};

const MONTH_LABELS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_LABELS_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

type PanelLocale = "en" | "he";

function getMonthLabels(locale: PanelLocale) {
  return locale === "he" ? MONTH_LABELS_HE : MONTH_LABELS_EN;
}

function periodLabel(year: number, month: number, locale: PanelLocale) {
  const labels = getMonthLabels(locale);
  return `${labels[month - 1] ?? month} ${year}`;
}

function getStrings(locale: PanelLocale) {
  const isHe = locale === "he";
  return {
    upload: {
      title: isHe ? "העלאת מכירות אופליין" : "Upload offline sales",
      fileLabel: isHe ? "קובץ אקסל (.xlsx)" : "Excel file (.xlsx)",
      monthLabel: isHe ? "חודש" : "Month",
      yearLabel: isHe ? "שנה" : "Year",
      hint: isHe
        ? "התקופה מזוהה אוטומטית מכותרת הגיליון — אפשר לשנות לפני העלאה. העלאה מחודשת של אותו חודש מחליפה את הקובץ הקודם."
        : "Period is auto-detected from the sheet title — adjust if needed. Re-uploading the same month replaces the prior import.",
      detectedFrom: isHe ? "זוהה מההעלאה האחרונה:" : "Detected from last upload:",
      submit: isHe ? "העלאה והתאמה" : "Upload & match",
      submitting: isHe ? "מעלה..." : "Uploading...",
      chooseFirst: isHe ? "בחרו קובץ אקסל תחילה." : "Choose an Excel file first."
    },
    sync: {
      title: isHe ? "מוצרי Shopify" : "Shopify products",
      hint: isHe
        ? "מסנכרן מחדש את מוצרי Shopify כדי שהברקודים יהיו מעודכנים. השתמשו בזה כששורות אופליין רבות מופיעות כלא מותאמות."
        : "Re-syncs Shopify products so barcodes are up to date. Run this if many offline rows show as unmatched.",
      button: isHe ? "סנכרון ברקודי Shopify" : "Sync Shopify barcodes",
      running: isHe ? "מסנכרן..." : "Syncing...",
      done: (n: number) =>
        isHe ? `סונכרנו ${n} מוצרים מShopify.` : `Synced ${n} products from Shopify.`
    },
    history: {
      title: isHe ? "היסטוריה" : "History",
      empty: isHe ? "אין עדיין העלאות — העלו את החודש הראשון למעלה." : "No imports yet — upload your first month above.",
      rowsLabel: isHe ? "שורות" : "rows",
      deleteAria: isHe ? "מחיקת העלאה" : "Delete import",
      deleteConfirm: isHe
        ? "למחוק את ההעלאה הזו? לא ניתן לשחזר."
        : "Delete this import? This cannot be undone.",
      deleteFailed: isHe ? "המחיקה נכשלה." : "Failed to delete."
    },
    summary: {
      selectPrompt: isHe
        ? "בחרו העלאה מההיסטוריה (או העלו חדשה) כדי לראות סך אונליין מול אופליין."
        : "Select an import from the history (or upload a new one) to see online vs. offline totals.",
      loading: isHe ? "טוען סיכום..." : "Loading summary...",
      sourceFile: isHe ? "קובץ מקור:" : "Source file:",
      bottomLine: isHe ? "שורה תחתונה — אונליין ואופליין" : "Online + offline bottom line",
      exportButton: isHe ? "ייצוא לאקסל" : "Export to Excel",
      exportPdfButton: isHe ? "ייצוא PDF" : "Export PDF",
      agentEyebrow: isHe ? "מה הסוכן רואה בתקופה הזו" : "What the agent sees this period",
      toneHealthy: isHe ? "תקין" : "Healthy",
      toneWatch: isHe ? "לעקוב" : "Watch",
      onlineSales: isHe ? "מכירות אונליין" : "Online sales",
      offlineSales: isHe ? "מכירות אופליין" : "Offline sales",
      combined: isHe ? "כולל" : "Combined",
      shareOfTotal: (pct: string) =>
        isHe ? `${pct}% מסך הכל` : `${pct}% of total`,
      unitsOnline: (n: string) => (isHe ? `${n} יחידות (Shopify)` : `${n} units (Shopify)`),
      unitsOffline: (n: string) =>
        isHe ? `${n} יחידות (מהקובץ)` : `${n} units (uploaded)`,
      unitsCombined: (n: string) =>
        isHe ? `${n} יחידות בסך הכל` : `${n} units total`,
      matchedLabel: (n: string) =>
        isHe
          ? `${n} שורות אופליין הותאמו למוצר Shopify לפי ברקוד.`
          : `${n} offline rows matched a Shopify product by barcode.`,
      unmatchedLabel: (n: string) =>
        isHe
          ? `${n} שורות ללא התאמה לברקוד (עדיין נספרות בסך).`
          : `${n} rows had no barcode match (still counted in totals).`,
      stockRiskLabel: (n: number, threshold: number) =>
        isHe
          ? `${n} מק"ט${n === 1 ? "" : "ים"} בסיכון מלאי (≤ ${threshold} ימים).`
          : `${n} SKU${n === 1 ? "" : "s"} at stock-out risk (≤ ${threshold} days).`
    },
    heroes: {
      storeTitle: isHe ? "גיבורי חנות" : "Store heroes",
      storeDesc: isHe
        ? "≥80% מההכנסה מגיעה מאופליין. מלאי חשוב יותר מהדף באתר."
        : "≥80% of revenue comes from offline. Stock matters more than the listing.",
      webTitle: isHe ? "מנצחי אונליין" : "Web heroes",
      webDesc: isHe
        ? "≥80% מההכנסה מגיעה מShopify. מלאי + פרסום משלמים פה."
        : "≥80% of revenue comes from Shopify. Inventory + ad spend pay off here.",
      empty: isHe ? "אין עדיין מנצחים ברורים — צריך נפח גבוה יותר." : "No clear winners yet — need higher volume to call it.",
      shareLabel: (pct: string, channel: "online" | "offline") =>
        isHe
          ? `${pct}% דרך ${channel === "online" ? "אונליין" : "אופליין"}`
          : `${pct}% via ${channel}`
    },
    breakdown: {
      title: isHe ? "פירוט לפי מוצר" : "Per-product breakdown",
      product: isHe ? "מוצר" : "Product",
      barcode: isHe ? "ברקוד" : "Barcode",
      offline: isHe ? "אופליין" : "Offline",
      online: isHe ? "אונליין" : "Online",
      channelMix: isHe ? "פילוח ערוצים" : "Channel mix",
      total: isHe ? "סה\"כ" : "Total",
      daysOfStock: isHe ? "ימי מלאי" : "Days of stock",
      unitsSuffix: isHe ? "יחידות" : "units",
      noRows: isHe ? "אין שורות בהעלאה זו." : "No rows in this import.",
      onLabel: isHe ? "אונ" : "on",
      offLabel: isHe ? "אופ" : "off",
      daysSuffix: isHe ? "ימים" : "days",
      stockNoData: isHe ? "אין מלאי" : "no inventory",
      stockNoBurn: isHe ? "ללא שחיקה" : "no burn",
      stockSubline: (inv: string, burn: string) =>
        isHe ? `${inv} מלאי · ${burn}/יום` : `${inv} stock · ${burn}/day`,
      stockRiskHeader: isHe
        ? "מק\"טים בסיכון מלאי (≤14 ימים) — בראש הרשימה"
        : "Stock-risk SKUs (≤14 days) — pinned to top",
      stockRiskHelp: isHe
        ? "הימים הצפויים עד גמר מלאי, מחושבים על קצב המכירות המשולב (אונליין + אופליין). מוצרי טיוטה / לא פעילים לא נכללים."
        : "Days until stock-out at the combined sales pace (online + offline). Excludes draft / archived products.",
      channelMixHelp: isHe
        ? "הסגול = אונליין (Shopify), הכתום = אופליין (קובץ שהועלה). 100% למוצרים עם מכירות."
        : "Indigo = online (Shopify), amber = offline (uploaded file). 100% for products with sales.",
      statusDraft: isHe ? "טיוטה" : "Draft",
      statusArchived: isHe ? "בארכיון" : "Archived",
      statusInactiveCellLabel: (label: string) =>
        isHe ? `לא רלוונטי (${label})` : `n/a (${label.toLowerCase()})`,
      tooltip: {
        channelMix: isHe ? (
          <>
            חלקה של ההכנסה מהמוצר בכל ערוץ.
            <strong className="text-indigo-300"> סגול</strong> = אונליין (Shopify),
            <strong className="text-amber-300"> כתום</strong> = אופליין (קובץ שהועלה).
            סוכם ל100% עבור מוצרים עם מכירות.
          </>
        ) : (
          <>
            Share of this product's revenue from each channel.
            <strong className="text-indigo-300"> Indigo</strong> = Online (Shopify),
            <strong className="text-amber-300"> amber</strong> = Offline (uploaded file).
            Sums to 100% for products with sales.
          </>
        ),
        daysOfStock: (threshold: number) =>
          isHe ? (
            <>
              כמה ימי מלאי נשארו בקצב השחיקה הנוכחי.
              <br />
              <strong>קצב שחיקה</strong> = (יחידות אונליין + יחידות אופליין) ÷ ימים בתקופה.
              <br />
              <strong>ימי מלאי</strong> = מלאי Shopify הנוכחי ÷ קצב השחיקה.
              <br />
              צבע: <span className="text-rose-300">≤ {threshold} ימים</span> /
              <span className="text-amber-300"> ≤ {threshold * 2} ימים</span> /
              <span className="text-emerald-300"> תקין</span>.
              שילוב שחיקה אופליין גורם לאזהרה להופיע מוקדם יותר מאשר אונליין בלבד.
            </>
          ) : (
            <>
              How many days of inventory remain at the current burn rate.
              <br />
              <strong>Burn rate</strong> = (online units + offline units) ÷ days in this period.
              <br />
              <strong>Days of stock</strong> = current Shopify inventory ÷ burn rate.
              <br />
              Color: <span className="text-rose-300">≤ {threshold} days</span> /
              <span className="text-amber-300"> ≤ {threshold * 2} days</span> /
              <span className="text-emerald-300"> healthy</span>.
              Combining offline burn means the warning fires sooner than online-only would.
            </>
          )
      }
    },
    unmatched: {
      title: isHe ? "שורות אופליין ללא התאמה · איכות נתונים" : "Unmatched offline rows · data quality",
      desc: isHe
        ? "הברקודים האלה מהקובץ לא קיימים (או עם ברקוד שונה) באף וריאציה בShopify. עד שיותאמו, הסוכן לא יוכל לחשב ימי מלאי או פילוח ערוצים עבורם."
        : "These barcodes from your offline file don't exist (or have a different barcode) on any Shopify variant. Until they're matched, the agent can't compute days-of-stock or per-SKU channel mix for them.",
      cta: isHe
        ? `אם הברקודים נכונים בShopify, לחצו על "סנכרון ברקודי Shopify" משמאל.`
        : `If barcodes look right in Shopify, click "Sync Shopify barcodes" on the left.`,
      product: isHe ? "מוצר" : "Product",
      barcodeInFile: isHe ? "ברקוד בקובץ" : "Barcode in file",
      quantity: isHe ? "כמות" : "Quantity",
      sales: isHe ? "מכירות" : "Sales",
      noBarcode: isHe ? "אין ברקוד בשורה" : "no barcode in row",
      footnote: (showing: number, total: number) =>
        isHe
          ? `מציג ${showing} מתוך ${total} שורות לא מותאמות.`
          : `Showing first ${showing} of ${total} unmatched rows.`
    },
    halo: {
      title: isHe ? "הילת שותפים על אופליין" : "Affiliate halo on offline",
      withCoupon: isHe
        ? "בקובץ שלך זוהה טור קופון — מוצג ייחוס ישיר לצד אות ההילה ברמת SKU."
        : "Your file has a coupon column — direct attribution is shown alongside the SKU-halo signal.",
      noCoupon: isHe
        ? "אין טור קופון בקובץ. הסוכן מציג אות הילה ברמת SKU: לכל שותף נבחנים המוצרים האונליין שלו והביצועים שלהם באופליין באותה תקופה. הילה גבוהה מהבסיס של החנות מצביעה על ליפט אמיתי."
        : "No coupon column in your file. The agent shows a SKU-halo signal: each affiliate's online products mapped to their offline performance for the same period. Halo > store baseline suggests a real lift.",
      codes: isHe ? "קודים:" : "Codes:",
      online: isHe ? "אונליין" : "Online",
      orders: isHe ? "הזמנות" : "orders",
      haloOffline: isHe ? "הילה אופליין" : "Halo offline",
      sameSkus: isHe ? "אותם SKU" : "same SKUs",
      directOffline: isHe ? "אופליין ישיר" : "Direct offline",
      couponRows: (n: string) =>
        isHe ? `${n} שורות עם קופון` : `${n} coupon rows`,
      noCouponMatch: isHe ? "ללא התאמת קופון" : "no coupon match",
      ratioOver: (pct: string) =>
        isHe ? `הילה +${pct}% מעל הבסיס` : `Halo +${pct}% vs baseline`,
      ratioUnder: (pct: string) =>
        isHe ? `הילה ${pct}% מתחת לבסיס` : `Halo ${pct}% vs baseline`,
      ratioApprox: isHe ? "הילה ≈ בסיס" : "Halo ≈ baseline",
      productsHeader: isHe ? "מוצרים (5 מובילים לפי מכירות אונליין)" : "Product (top 5 by online sales)",
      onlineCol: isHe ? "אונליין" : "Online",
      offlineSameCol: isHe ? "אופליין (אותו SKU)" : "Offline (same SKU)",
      ratioCol: isHe ? "יחס הילה" : "Halo ratio",
      barcodeCol: isHe ? "ברקוד" : "Barcode",
      footnote: (showing: number, total: number) =>
        isHe
          ? `מציג את ${showing} השותפים המובילים מתוך ${total} פעילים בתקופה.`
          : `Showing top ${showing} of ${total} affiliates active this period.`
    }
  };
}

type Strings = ReturnType<typeof getStrings>;

export function SalesSummaryPanel({
  initialImports,
  currency,
  locale
}: {
  initialImports: ImportSummary[];
  currency: string;
  locale: PanelLocale;
}) {
  const t = useMemo(() => getStrings(locale), [locale]);
  const [imports, setImports] = useState<ImportSummary[]>(initialImports);
  const [selectedId, setSelectedId] = useState<string | null>(initialImports[0]?.id ?? null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [autoDetected, setAutoDetected] = useState<{ year: number | null; month: number | null; sheetTitle: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now + 1; y >= now - 5; y -= 1) out.push(y);
    return out;
  }, []);

  function fetchSummary(id: string) {
    setLoadingSummary(true);
    setError(null);
    return fetch(`/api/sales-summary/imports/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setSummary(data.summary as SummaryResponse);
        else setError(data.error ?? "Failed to load summary.");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingSummary(false));
  }

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoadingSummary(true);
    setError(null);
    fetch(`/api/sales-summary/imports/${selectedId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) setSummary(data.summary as SummaryResponse);
        else setError(data.error ?? "Failed to load summary.");
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoadingSummary(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError(t.upload.chooseFirst);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("periodYear", String(year));
      formData.set("periodMonth", String(month));
      const res = await fetch("/api/sales-summary/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Upload failed.");
      setAutoDetected(data.detected);
      setImports((prev) => {
        const filtered = prev.filter((imp) => imp.id !== data.import.id);
        return [data.import, ...filtered].sort((a, b) =>
          b.periodYear !== a.periodYear ? b.periodYear - a.periodYear : b.periodMonth - a.periodMonth
        );
      });
      setSelectedId(data.import.id);
      setFile(null);
      const fileInput = document.getElementById("offline-sales-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(importId: string) {
    if (!confirm(t.history.deleteConfirm)) return;
    setError(null);
    const res = await fetch(`/api/sales-summary/imports/${importId}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error ?? t.history.deleteFailed);
      return;
    }
    startTransition(() => {
      setImports((prev) => prev.filter((imp) => imp.id !== importId));
      if (selectedId === importId) {
        setSelectedId(null);
        setSummary(null);
      }
    });
  }

  async function onSyncProducts() {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/sales-summary/sync-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Sync failed.");
      setSyncMessage(t.sync.done(data.fetched ?? 0));
      if (selectedId) await fetchSummary(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" /> {t.upload.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onUpload} className="space-y-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="offline-sales-file">
                  {t.upload.fileLabel}
                </label>
                <input
                  id="offline-sales-file"
                  name="file"
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="offline-month">{t.upload.monthLabel}</label>
                  <select
                    id="offline-month"
                    className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  >
                    {getMonthLabels(locale).map((label, idx) => (
                      <option key={label} value={idx + 1}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="offline-year">{t.upload.yearLabel}</label>
                  <select
                    id="offline-year"
                    className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  >
                    {yearOptions.map((y) => (<option key={y} value={y}>{y}</option>))}
                  </select>
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {t.upload.hint}
              </p>
              {autoDetected ? (
                <p className="text-xs text-indigo-600">
                  {t.upload.detectedFrom} {autoDetected.sheetTitle ?? "—"}
                  {autoDetected.month && autoDetected.year ? ` → ${periodLabel(autoDetected.year, autoDetected.month, locale)}` : ""}
                </p>
              ) : null}
              <Button type="submit" disabled={!file || uploading} className="w-full">
                {uploading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}
                {uploading ? t.upload.submitting : t.upload.submit}
              </Button>
              {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.sync.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              {t.sync.hint}
            </p>
            <Button variant="secondary" onClick={onSyncProducts} disabled={syncing} className="w-full">
              {syncing ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="me-2 h-4 w-4" />}
              {syncing ? t.sync.running : t.sync.button}
            </Button>
            {syncMessage ? <p className="mt-2 text-xs text-emerald-700">{syncMessage}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.history.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {imports.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.history.empty}</p>
            ) : (
              <ul className="space-y-2">
                {imports.map((imp) => {
                  const active = imp.id === selectedId;
                  return (
                    <li key={imp.id}>
                      <div
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors ${
                          active ? "border-indigo-500 bg-indigo-500/5" : "border-border hover:bg-accent/40"
                        }`}
                      >
                        <button type="button" className="flex flex-1 items-center gap-2 text-start" onClick={() => setSelectedId(imp.id)}>
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{periodLabel(imp.periodYear, imp.periodMonth, locale)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(imp.totalRows)} {t.history.rowsLabel} · {formatCurrency(imp.totalSales, currency)}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          aria-label={t.history.deleteAria}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
                          onClick={() => onDelete(imp.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {!selectedId ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {t.summary.selectPrompt}
            </CardContent>
          </Card>
        ) : loadingSummary || !summary ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="me-2 h-4 w-4 animate-spin" /> {t.summary.loading}
            </CardContent>
          </Card>
        ) : (
          <SummaryView summary={summary} currency={summary.import.currency ?? currency} t={t} locale={locale} />
        )}
      </div>
    </div>
  );
}

function SummaryView({
  summary,
  currency,
  t,
  locale
}: {
  summary: SummaryResponse;
  currency: string;
  t: Strings;
  locale: PanelLocale;
}) {
  const { totals, rows, import: imp, narrative, storeHeroes, webHeroes, unmatched, stockRisk, affiliateHalo } = summary;
  const ToneIcon = narrative.tone === "up" ? TrendingUp : narrative.tone === "down" ? TrendingDown : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
            {periodLabel(imp.periodYear, imp.periodMonth, locale)}
          </p>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t.summary.bottomLine}</h2>
          <p className="text-sm text-muted-foreground">
            {t.summary.sourceFile} {imp.fileName}{imp.sheetTitle ? ` — ${imp.sheetTitle}` : ""}
          </p>
        </div>
        <a
          href={`/api/sales-summary/imports/${imp.id}/export`}
          download
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-card-foreground shadow-soft transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          {t.summary.exportButton}
        </a>
        <a
          href={`/api/sales-summary/imports/${imp.id}/export-pdf`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-card-foreground shadow-soft transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          {t.summary.exportPdfButton}
        </a>
      </div>

      <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50/80 via-white to-sky-50/60 p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-sm">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
              {t.summary.agentEyebrow}
            </p>
            <h3 className="text-lg font-semibold leading-snug sm:text-xl">{narrative.headline}</h3>
            {narrative.body ? <p className="text-sm leading-6 text-muted-foreground">{narrative.body}</p> : null}
          </div>
          {ToneIcon ? (
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                narrative.tone === "up" ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"
              }`}
            >
              <ToneIcon className="h-3.5 w-3.5" />
              {narrative.tone === "up" ? t.summary.toneHealthy : t.summary.toneWatch}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={t.summary.onlineSales}
          value={formatCurrency(totals.onlineSales, currency)}
          subline={`${t.summary.unitsOnline(formatNumber(totals.onlineQuantity))} · ${t.summary.shareOfTotal(totals.onlineShare.toFixed(0))}`}
          tone="indigo"
        />
        <KpiCard
          label={t.summary.offlineSales}
          value={formatCurrency(totals.offlineSales, currency)}
          subline={`${t.summary.unitsOffline(formatNumber(totals.offlineQuantity))} · ${t.summary.shareOfTotal(totals.offlineShare.toFixed(0))}`}
          tone="amber"
        />
        <KpiCard
          label={t.summary.combined}
          value={formatCurrency(totals.totalSales, currency)}
          subline={t.summary.unitsCombined(formatNumber(totals.totalQuantity))}
          tone="emerald"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <span>{t.summary.matchedLabel(formatNumber(summary.matchedRows))}</span>
        {summary.unmatchedRows > 0 ? (
          <span className="text-amber-700">{t.summary.unmatchedLabel(formatNumber(summary.unmatchedRows))}</span>
        ) : null}
        {stockRisk.count > 0 ? (
          <span className="text-rose-700">{t.summary.stockRiskLabel(stockRisk.count, stockRisk.threshold)}</span>
        ) : null}
      </div>

      {(storeHeroes.length > 0 || webHeroes.length > 0) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <HeroesCard
            title={t.heroes.storeTitle}
            description={t.heroes.storeDesc}
            icon={Store}
            tone="amber"
            rows={storeHeroes}
            channel="offline"
            currency={currency}
            t={t}
          />
          <HeroesCard
            title={t.heroes.webTitle}
            description={t.heroes.webDesc}
            icon={Globe}
            tone="indigo"
            rows={webHeroes}
            channel="online"
            currency={currency}
            t={t}
          />
        </div>
      ) : null}

      <AffiliateHaloCard halo={affiliateHalo} currency={currency} t={t} />


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.breakdown.title}</CardTitle>
          {stockRisk.count > 0 ? (
            <p className="mt-1 inline-flex items-center gap-2 text-xs text-rose-700">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
              {t.breakdown.stockRiskHeader}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/30 text-xs tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start align-bottom uppercase">{t.breakdown.product}</th>
                <th className="px-4 py-2 text-start align-bottom uppercase">{t.breakdown.barcode}</th>
                <th className="px-4 py-2 text-end align-bottom uppercase">{t.breakdown.offline}</th>
                <th className="px-4 py-2 text-end align-bottom uppercase">{t.breakdown.online}</th>
                <th className="px-4 py-2 text-start align-bottom">
                  <div className="uppercase">{t.breakdown.channelMix}</div>
                  <div className="mt-1 max-w-[14rem] text-[10px] font-normal normal-case tracking-normal leading-4 text-muted-foreground/80">
                    {t.breakdown.channelMixHelp}
                  </div>
                </th>
                <th className="px-4 py-2 text-end align-bottom uppercase">{t.breakdown.total}</th>
                <th className="px-4 py-2 text-end align-bottom">
                  <div className="uppercase">{t.breakdown.daysOfStock}</div>
                  <div className="mt-1 max-w-[15rem] text-[10px] font-normal normal-case tracking-normal leading-4 text-muted-foreground/80">
                    {t.breakdown.stockRiskHelp}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={`${row.barcode ?? "no-barcode"}-${idx}`}
                  className={`border-b border-border/50 last:border-b-0 ${row.stockRisk ? "bg-rose-500/5" : ""}`}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.itemName}</span>
                      <ProductStatusBadge status={row.productStatus} t={t} />
                    </div>
                    {row.matchedProductTitle && row.matchedProductTitle !== row.itemName ? (
                      <div className="text-xs text-muted-foreground">↳ {row.matchedProductTitle}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {row.barcode ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 text-end">
                    <div>{formatCurrency(row.offlineSales, currency)}</div>
                    <div className="text-xs text-muted-foreground">{formatNumber(row.offlineQuantity)} {t.breakdown.unitsSuffix}</div>
                  </td>
                  <td className="px-4 py-2 text-end">
                    <div>{formatCurrency(row.onlineSales, currency)}</div>
                    <div className="text-xs text-muted-foreground">{formatNumber(row.onlineQuantity)} {t.breakdown.unitsSuffix}</div>
                  </td>
                  <td className="px-4 py-2">
                    <ChannelMixBar online={row.onlinePct} offline={row.offlinePct} totalSales={row.totalSales} t={t} />
                  </td>
                  <td className="px-4 py-2 text-end font-semibold">{formatCurrency(row.totalSales, currency)}</td>
                  <td className="px-4 py-2 text-end">
                    <DaysOfStockCell row={row} threshold={stockRisk.threshold} t={t} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t.breakdown.noRows}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </CardContent>
      </Card>

      {unmatched.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {t.unmatched.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              {t.unmatched.desc}
              {" "}
              <span className="font-medium text-foreground">{t.unmatched.cta}</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start">{t.unmatched.product}</th>
                    <th className="px-4 py-2 text-start">{t.unmatched.barcodeInFile}</th>
                    <th className="px-4 py-2 text-end">{t.unmatched.quantity}</th>
                    <th className="px-4 py-2 text-end">{t.unmatched.sales}</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatched.slice(0, 50).map((row, idx) => (
                    <tr key={`${row.barcode ?? "no"}-${idx}`} className="border-b border-border/50 last:border-b-0">
                      <td className="px-4 py-2">{row.itemName}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.barcode ?? <span className="text-muted-foreground italic">{t.unmatched.noBarcode}</span>}
                      </td>
                      <td className="px-4 py-2 text-end">{formatNumber(row.quantity)}</td>
                      <td className="px-4 py-2 text-end">{formatCurrency(row.sales, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {unmatched.length > 50 ? (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  {t.unmatched.footnote(50, unmatched.length)}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function HeroesCard({
  title,
  description,
  icon: Icon,
  tone,
  rows,
  channel,
  currency,
  t
}: {
  title: string;
  description: string;
  icon: typeof Store;
  tone: "amber" | "indigo";
  rows: SummaryRow[];
  channel: "online" | "offline";
  currency: string;
  t: Strings;
}) {
  const toneClasses = tone === "amber"
    ? "bg-amber-500/10 text-amber-700"
    : "bg-indigo-500/10 text-indigo-700";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${toneClasses}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.heroes.empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, idx) => {
              const sharePct = channel === "offline" ? row.offlinePct : row.onlinePct;
              const channelSales = channel === "offline" ? row.offlineSales : row.onlineSales;
              return (
                <li key={`${row.barcode ?? "no"}-${idx}`} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.itemName}</p>
                    {row.barcode ? <p className="font-mono text-[11px] text-muted-foreground">{row.barcode}</p> : null}
                  </div>
                  <div className="text-end">
                    <p className="font-semibold">{formatCurrency(channelSales, currency)}</p>
                    <p className="text-xs text-muted-foreground">{t.heroes.shareLabel(sharePct.toFixed(0), channel)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelMixBar({ online, offline, totalSales, t }: { online: number; offline: number; totalSales: number; t: Strings }) {
  if (totalSales <= 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-1">
      <div className="flex h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div className="bg-indigo-500" style={{ width: `${online}%` }} aria-label={`Online ${online.toFixed(0)}%`} />
        <div className="bg-amber-500" style={{ width: `${offline}%` }} aria-label={`Offline ${offline.toFixed(0)}%`} />
      </div>
      <div className="flex w-32 justify-between text-[10px] text-muted-foreground">
        <span>{online.toFixed(0)}% {t.breakdown.onLabel}</span>
        <span>{offline.toFixed(0)}% {t.breakdown.offLabel}</span>
      </div>
    </div>
  );
}

function DaysOfStockCell({ row, threshold, t }: { row: SummaryRow; threshold: number; t: Strings }) {
  if (!row.matched) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  // Suppress days-of-stock for non-ACTIVE products (draft, archived).
  if (row.productStatus && row.productStatus.toUpperCase() !== "ACTIVE") {
    const upper = row.productStatus.toUpperCase();
    const label = upper === "DRAFT" ? t.breakdown.statusDraft : upper === "ARCHIVED" ? t.breakdown.statusArchived : row.productStatus;
    return (
      <span className="text-xs text-muted-foreground italic">
        {t.breakdown.statusInactiveCellLabel(label)}
      </span>
    );
  }
  if (row.inventoryQuantity === null) {
    return <span className="text-xs text-muted-foreground">{t.breakdown.stockNoData}</span>;
  }
  if (row.dailyBurn === 0 || row.daysOfStock === null) {
    return <span className="text-xs text-muted-foreground">{t.breakdown.stockNoBurn}</span>;
  }
  const tone = row.daysOfStock <= threshold ? "rose" : row.daysOfStock <= threshold * 2 ? "amber" : "emerald";
  const toneCls =
    tone === "rose" ? "bg-rose-500/10 text-rose-700"
      : tone === "amber" ? "bg-amber-500/10 text-amber-700"
      : "bg-emerald-500/10 text-emerald-700";
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneCls}`}>
        {row.daysOfStock} {t.breakdown.daysSuffix}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {t.breakdown.stockSubline(formatNumber(row.inventoryQuantity), row.dailyBurn.toFixed(1))}
      </span>
    </div>
  );
}

function ProductStatusBadge({ status, t }: { status: string | null; t: Strings }) {
  if (!status) return null;
  const upper = status.toUpperCase();
  if (upper === "ACTIVE") return null;
  const label = upper === "DRAFT" ? t.breakdown.statusDraft : upper === "ARCHIVED" ? t.breakdown.statusArchived : status;
  const toneCls =
    upper === "DRAFT"
      ? "bg-amber-500/10 text-amber-700"
      : upper === "ARCHIVED"
        ? "bg-slate-500/10 text-slate-700"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${toneCls}`}>
      {label}
    </span>
  );
}

function AffiliateHaloCard({ halo, currency, t }: { halo: AffiliateHaloSummary; currency: string; t: Strings }) {
  if (halo.affiliates.length === 0) {
    return null;
  }
  const baselineRatio = halo.storeOfflineToOnlineRatio;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-700">
            <Megaphone className="h-3.5 w-3.5" />
          </span>
          {t.halo.title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {halo.hasCouponColumn ? t.halo.withCoupon : t.halo.noCoupon}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {halo.affiliates.slice(0, 6).map((entry) => {
          const haloVsBaseline = baselineRatio > 0 ? entry.haloRatio / baselineRatio : 0;
          const haloOver = haloVsBaseline > 1.2;
          const haloUnder = haloVsBaseline < 0.8 && baselineRatio > 0;
          return (
            <div key={entry.affiliateMemberId} className="rounded-xl border border-border bg-card/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{entry.affiliateName}</p>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {entry.affiliateCode}
                    </span>
                  </div>
                  {entry.couponCodes.length > 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t.halo.codes} {entry.couponCodes.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <Stat label={t.halo.online} value={formatCurrency(entry.onlineSales, currency)} sub={`${formatNumber(entry.onlineOrders)} ${t.halo.orders}`} />
                  <Stat
                    label={t.halo.haloOffline}
                    value={formatCurrency(entry.haloOfflineSales, currency)}
                    sub={`${formatNumber(entry.haloOfflineQuantity)} ${t.breakdown.unitsSuffix} · ${t.halo.sameSkus}`}
                  />
                  {halo.hasCouponColumn ? (
                    <Stat
                      label={t.halo.directOffline}
                      value={formatCurrency(entry.directOfflineSales, currency)}
                      sub={entry.directRowCount > 0 ? t.halo.couponRows(formatNumber(entry.directRowCount)) : t.halo.noCouponMatch}
                    />
                  ) : null}
                  {baselineRatio > 0 ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        haloOver
                          ? "bg-emerald-500/10 text-emerald-700"
                          : haloUnder
                            ? "bg-rose-500/10 text-rose-700"
                            : "bg-muted text-muted-foreground"
                      }`}
                      title={`Halo ratio ${(entry.haloRatio).toFixed(2)} vs store baseline ${baselineRatio.toFixed(2)}`}
                    >
                      {haloOver
                        ? t.halo.ratioOver(((haloVsBaseline - 1) * 100).toFixed(0))
                        : haloUnder
                          ? t.halo.ratioUnder(((haloVsBaseline - 1) * 100).toFixed(0))
                          : t.halo.ratioApprox}
                    </span>
                  ) : null}
                </div>
              </div>
              {entry.topProducts.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1 text-start">{t.halo.productsHeader}</th>
                        <th className="px-2 py-1 text-start">{t.halo.barcodeCol}</th>
                        <th className="px-2 py-1 text-end">{t.halo.onlineCol}</th>
                        <th className="px-2 py-1 text-end">{t.halo.offlineSameCol}</th>
                        <th className="px-2 py-1 text-end">{t.halo.ratioCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.topProducts.map((p, idx) => (
                        <tr key={`${p.barcode ?? "no"}-${idx}`} className="border-t border-border/40">
                          <td className="px-2 py-1">{p.productTitle}</td>
                          <td className="px-2 py-1 font-mono">{p.barcode ?? "—"}</td>
                          <td className="px-2 py-1 text-end">
                            <div>{formatCurrency(p.onlineSales, currency)}</div>
                            <div className="text-[10px] text-muted-foreground">{formatNumber(p.onlineQuantity)} u</div>
                          </td>
                          <td className="px-2 py-1 text-end">
                            <div>{formatCurrency(p.offlineSales, currency)}</div>
                            <div className="text-[10px] text-muted-foreground">{formatNumber(p.offlineQuantity)} u</div>
                          </td>
                          <td className="px-2 py-1 text-end">
                            {p.onlineSales > 0 ? p.haloRatio.toFixed(2) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
        {halo.affiliates.length > 6 ? (
          <p className="text-xs text-muted-foreground">
            {t.halo.footnote(6, halo.affiliates.length)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-end">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  subline,
  tone
}: {
  label: string;
  value: string;
  subline: string;
  tone: "indigo" | "amber" | "emerald";
}) {
  const toneClasses: Record<typeof tone, string> = {
    indigo: "bg-indigo-500/10 text-indigo-700",
    amber: "bg-amber-500/10 text-amber-700",
    emerald: "bg-emerald-500/10 text-emerald-700"
  };
  return (
    <Card>
      <CardContent className="p-5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClasses[tone]}`}>
          {label}
        </span>
        <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{subline}</p>
      </CardContent>
    </Card>
  );
}
