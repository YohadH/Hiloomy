"use client";

/**
 * Client shell for the Product Follow-Ups (Inventory) page.
 *
 * Handles:
 * - Quick search (filter by product name)
 * - Sort buttons: most-critical / most-sold / nearest-stockout (by days-since-last-sale as a proxy)
 * - Clickable KPI tiles (filter to that stock category)
 * - Action chips in the yellow section
 * - Days-since-last-sale display
 * - Visually enhanced section headers (critical vs low colors)
 *
 * The server page (`app/product-follow-ups/page.tsx`) passes all data here
 * as serializable props — no DB access in this file.
 */

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  HelpCircle,
  Package,
  Search,
  ShieldAlert,
  ShoppingCart,
  Truck
} from "lucide-react";
import { CollectionChips } from "@/components/dashboard-v2/collection-chips";
import { StockBadge } from "@/components/dashboard-v2/stock-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import type { ProductStockRow, StockFlag } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/utils";

// ─── Action chips for "running low" products ──────────────────────────────────

const ACTION_CHIPS: Array<{
  icon: typeof Truck;
  labelHe: string;
  labelEn: string;
  colorClass: string;
}> = [
  {
    icon: ShoppingCart,
    labelHe: "להזמין מלאי",
    labelEn: "Order stock",
    colorClass: "bg-amber-500/10 text-amber-800 border-amber-300"
  },
  {
    icon: Truck,
    labelHe: "לבדוק ספק",
    labelEn: "Check supplier",
    colorClass: "bg-sky-500/10 text-sky-800 border-sky-300"
  },
  {
    icon: Package,
    labelHe: "להגדיל ייצור",
    labelEn: "Scale production",
    colorClass: "bg-violet-500/10 text-violet-800 border-violet-300"
  }
];

// ─── Sort types ───────────────────────────────────────────────────────────────

type SortKey = "critical" | "sold" | "stockout";

// ─── Section header with colored left border ──────────────────────────────────

function SectionBanner({
  icon: Icon,
  eyebrow,
  title,
  hint,
  accentClass
}: {
  icon: typeof Flame;
  eyebrow: string;
  title: string;
  hint?: string;
  accentClass: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border-l-4 px-4 py-3", accentClass)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">{eyebrow}</p>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        {hint ? <p className="text-xs leading-5 opacity-75">{hint}</p> : null}
      </div>
    </div>
  );
}

// ─── Simple inventory table (no pagination — client-rendered) ─────────────────

type ColumnDef = {
  label: string;
  tooltip?: string;
  render: (row: ProductStockRow) => React.ReactNode;
};

function InventoryTable({
  rows,
  locale,
  showActionChips = false,
  emptyMessage
}: {
  rows: ProductStockRow[];
  locale: AppLocale;
  showActionChips?: boolean;
  emptyMessage?: string;
}) {
  const columns: ColumnDef[] = [
    {
      label: locale === "he" ? "מוצר" : "Product",
      render: (row) => (
        <span className="font-medium leading-5">{row.productTitle}</span>
      )
    },
    {
      label: locale === "he" ? "קטגוריות" : "Collections",
      render: (row) => (
        <CollectionChips collections={row.collections} fallback={row.collection} />
      )
    },
    {
      label: locale === "he" ? "ספק" : "Vendor",
      render: (row) => row.vendor ?? <span className="text-muted-foreground">—</span>
    },
    {
      label: locale === "he" ? "וריאציות" : "Variants",
      render: (row) => formatNumber(row.variantCount)
    },
    {
      label: locale === "he" ? "במלאי" : "In stock",
      render: (row) => <StockBadge quantity={row.inventoryQuantity} flag={row.flag} locale={locale} />
    },
    {
      label: locale === "he" ? "ימים מהמכירה האחרונה" : "Days since last sale",
      tooltip:
        locale === "he"
          ? "כמה ימים עברו מאז שהמוצר הופיע לאחרונה בהזמנה שלא בוטלה."
          : "Days since the product last appeared in a non-cancelled order.",
      render: (row) => {
        if (row.daysSinceLastSale === null) {
          return (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden />
              {locale === "he" ? "לא נמכר" : "Never sold"}
            </span>
          );
        }
        const isLong = row.daysSinceLastSale >= 30;
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
              isLong
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-muted bg-muted/50 text-muted-foreground"
            )}
          >
            <Clock className="h-3 w-3" aria-hidden />
            {locale === "he"
              ? `${formatNumber(row.daysSinceLastSale)} ימים`
              : `${formatNumber(row.daysSinceLastSale)}d`}
          </span>
        );
      }
    }
  ];

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        {showActionChips ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3">
            <span className="text-xs font-semibold text-muted-foreground">
              {locale === "he" ? "פעולה מומלצת:" : "Recommended action:"}
            </span>
            {ACTION_CHIPS.map((chip) => (
              <span
                key={chip.labelEn}
                className={cn(
                  "inline-flex cursor-default items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                  chip.colorClass
                )}
              >
                <chip.icon className="h-3.5 w-3.5" aria-hidden />
                {locale === "he" ? chip.labelHe : chip.labelEn}
              </span>
            ))}
          </div>
        ) : null}
        <table className="min-w-full divide-y divide-border text-sm">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-5 pb-3 pt-4 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.label}
                    {col.tooltip ? (
                      <HelpTip side="bottom" align="start">
                        {col.tooltip}
                      </HelpTip>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-6 text-sm text-muted-foreground">
                  {emptyMessage ?? (locale === "he" ? "אין מוצרים להצגה." : "No products to display.")}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.productId ?? idx} className="transition-colors hover:bg-muted/40">
                  {columns.map((col, ci) => (
                    <td key={ci} className="px-5 py-4 align-top">
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Clickable KPI stat card ──────────────────────────────────────────────────

function FilterStatCard({
  icon: Icon,
  label,
  value,
  hint,
  isActive,
  onClick,
  accentClass
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint?: string;
  isActive: boolean;
  onClick: () => void;
  accentClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-xl border text-start transition-all",
        isActive
          ? "border-indigo-400 shadow-md ring-2 ring-indigo-200"
          : "border-border hover:border-indigo-200 hover:shadow-sm"
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              accentClass
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {isActive ? (
            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              מסנן
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
          {hint ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InventoryClientProps {
  stock: ProductStockRow[];
  locale: AppLocale;
  freshnessLabel: string;
  freshnessIsStale: boolean;
  lastSyncedAtIso: string | null;
}

// ─── Main client component ────────────────────────────────────────────────────

export function InventoryClient({
  stock,
  locale,
  freshnessLabel,
  freshnessIsStale,
  lastSyncedAtIso
}: InventoryClientProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("critical");
  const [filterFlag, setFilterFlag] = useState<StockFlag | null>(null);

  const lastSyncedAt = lastSyncedAtIso ? new Date(lastSyncedAtIso) : null;

  // ── Derived counts for the KPI cards ──────────────────────────────────────
  const critical = useMemo(() => stock.filter((r) => r.flag === "critical"), [stock]);
  const red = useMemo(() => stock.filter((r) => r.flag === "red"), [stock]);
  const yellow = useMemo(() => stock.filter((r) => r.flag === "yellow"), [stock]);
  const green = useMemo(() => stock.filter((r) => r.flag === "green"), [stock]);
  const unknown = useMemo(() => stock.filter((r) => r.flag === "unknown"), [stock]);

  // "Not sold" = daysSinceLastSale === null (never sold or > 90 days — never sold in DB window)
  const unsold = useMemo(
    () => stock.filter((r) => r.daysSinceLastSale === null || r.daysSinceLastSale >= 90),
    [stock]
  );

  // ── Filtered + sorted rows ─────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let rows = stock;

    // Text search
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((r) => r.productTitle.toLowerCase().includes(q));
    }

    // Category filter from KPI card click
    if (filterFlag) {
      if (filterFlag === "red") {
        // "red" KPI card shows both critical + red
        rows = rows.filter((r) => r.flag === "critical" || r.flag === "red");
      } else {
        rows = rows.filter((r) => r.flag === filterFlag);
      }
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      if (sortKey === "critical") {
        const orderFlag = (f: StockFlag) =>
          f === "critical" ? 0 : f === "red" ? 1 : f === "yellow" ? 2 : f === "green" ? 3 : 4;
        const fd = orderFlag(a.flag) - orderFlag(b.flag);
        if (fd !== 0) return fd;
        const aq = a.inventoryQuantity ?? Number.POSITIVE_INFINITY;
        const bq = b.inventoryQuantity ?? Number.POSITIVE_INFINITY;
        return aq - bq;
      }
      if (sortKey === "sold") {
        // Most recently sold first (lower days = more recent)
        const da = a.daysSinceLastSale ?? Number.POSITIVE_INFINITY;
        const db2 = b.daysSinceLastSale ?? Number.POSITIVE_INFINITY;
        return da - db2;
      }
      if (sortKey === "stockout") {
        // Nearest stockout: lowest inventory with a known quantity first
        const aq = a.inventoryQuantity ?? Number.POSITIVE_INFINITY;
        const bq = b.inventoryQuantity ?? Number.POSITIVE_INFINITY;
        return aq - bq;
      }
      return 0;
    });

    return rows;
  }, [stock, query, sortKey, filterFlag]);

  // ── Split filtered rows into sections ─────────────────────────────────────
  const showSections = !query.trim() && !filterFlag;

  const criticalFiltered = useMemo(
    () => filteredRows.filter((r) => r.flag === "critical"),
    [filteredRows]
  );
  const redFiltered = useMemo(
    () => filteredRows.filter((r) => r.flag === "red"),
    [filteredRows]
  );
  const yellowFiltered = useMemo(
    () => filteredRows.filter((r) => r.flag === "yellow"),
    [filteredRows]
  );
  const greenFiltered = useMemo(
    () => filteredRows.filter((r) => r.flag === "green"),
    [filteredRows]
  );
  const unknownFiltered = useMemo(
    () => filteredRows.filter((r) => r.flag === "unknown"),
    [filteredRows]
  );
  const unsoldFiltered = useMemo(
    () =>
      filteredRows.filter(
        (r) => r.daysSinceLastSale === null || r.daysSinceLastSale >= 90
      ),
    [filteredRows]
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── Freshness chip ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
            freshnessIsStale
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
          title={
            lastSyncedAt
              ? locale === "he"
                ? `סנכרון מוצרים מלא אחרון מShopify: ${lastSyncedAt.toLocaleString()}`
                : `Last full Shopify product sync: ${lastSyncedAt.toLocaleString()}`
              : locale === "he"
                ? "עדיין לא בוצע סנכרון מוצרים לחנות הזו."
                : "No product sync has run yet for this store."
          }
        >
          {freshnessLabel}
        </span>
        {lastSyncedAt ? (
          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
            {locale === "he"
              ? `נכון לתאריך: ${lastSyncedAt.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}`
              : `As of: ${lastSyncedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
          </span>
        ) : null}
      </div>

      {/* ── KPI summary cards (clickable to filter) ───────────────────────── */}
      <section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterStatCard
            icon={Flame}
            label={locale === "he" ? "אזעקה (<5)" : "Emergency (<5)"}
            value={formatNumber(critical.length)}
            hint={locale === "he" ? "פחות מ5 יחידות — לחדש עכשיו." : "Below 5 units — restock now."}
            isActive={filterFlag === "critical"}
            onClick={() => setFilterFlag(filterFlag === "critical" ? null : "critical")}
            accentClass="bg-rose-700/10 text-rose-800"
          />
          <FilterStatCard
            icon={ShieldAlert}
            label={locale === "he" ? "קריטי (<20)" : "Critical (<20)"}
            value={formatNumber(red.length)}
            hint={locale === "he" ? "פחות מ20 יחידות — לחדש בהקדם." : "Below 20 units — restock soon."}
            isActive={filterFlag === "red"}
            onClick={() => setFilterFlag(filterFlag === "red" ? null : "red")}
            accentClass="bg-rose-500/10 text-rose-700"
          />
          <FilterStatCard
            icon={AlertTriangle}
            label={locale === "he" ? "נמוך (<50)" : "Low (<50)"}
            value={formatNumber(yellow.length)}
            hint={locale === "he" ? "20–49 יחידות — לתכנן הזמנה." : "20–49 units — plan a reorder."}
            isActive={filterFlag === "yellow"}
            onClick={() => setFilterFlag(filterFlag === "yellow" ? null : "yellow")}
            accentClass="bg-amber-500/10 text-amber-700"
          />
          <FilterStatCard
            icon={CheckCircle2}
            label={locale === "he" ? "תקין (≥50)" : "Healthy (≥50)"}
            value={formatNumber(green.length)}
            hint={locale === "he" ? "50+ יחידות — מצב טוב." : "50+ units — good shape."}
            isActive={filterFlag === "green"}
            onClick={() => setFilterFlag(filterFlag === "green" ? null : "green")}
            accentClass="bg-emerald-500/10 text-emerald-700"
          />
        </div>
        {filterFlag ? (
          <button
            type="button"
            onClick={() => setFilterFlag(null)}
            className="mt-2 text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
          >
            {locale === "he" ? "ביטול סינון" : "Clear filter"}
          </button>
        ) : null}
      </section>

      {/* ── Search + sort toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={locale === "he" ? "חיפוש מוצר..." : "Search products..."}
            className="h-9 w-full rounded-lg border border-input bg-background pe-3 ps-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            dir={locale === "he" ? "rtl" : "ltr"}
          />
        </div>

        {/* Sort buttons */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
          {(
            [
              { key: "critical" as SortKey, labelHe: "הכי קריטי", labelEn: "Most critical" },
              { key: "sold" as SortKey, labelHe: "הכי נמכר", labelEn: "Most sold" },
              { key: "stockout" as SortKey, labelHe: "קרוב לגמר", labelEn: "Near stockout" }
            ] as const
          ).map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => setSortKey(btn.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                sortKey === btn.key
                  ? "bg-white shadow-sm text-indigo-700 dark:bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {locale === "he" ? btn.labelHe : btn.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results: sectioned or flat ─────────────────────────────────────── */}
      {showSections ? (
        <div className="space-y-8">
          {/* CRITICAL section */}
          {criticalFiltered.length > 0 ? (
            <section className="space-y-3">
              <SectionBanner
                icon={Flame}
                eyebrow={locale === "he" ? "אזעקת מלאי" : "Stock emergency"}
                title={
                  locale === "he"
                    ? `מלאי קריטי — פחות מ5 יחידות (${formatNumber(criticalFiltered.length)} מוצרים)`
                    : `Critical stock — below 5 units (${criticalFiltered.length} products)`
                }
                hint={
                  locale === "he"
                    ? "פריטים אלו עומדים להיגמר לחלוטין. לחדש מלאי היום."
                    : "These items are about to run out entirely. Restock immediately."
                }
                accentClass="border-rose-600 bg-rose-50 text-rose-900"
              />
              <InventoryTable rows={criticalFiltered} locale={locale} />
            </section>
          ) : null}

          {/* LOW (red 5-20) section */}
          {redFiltered.length > 0 ? (
            <section className="space-y-3">
              <SectionBanner
                icon={ShieldAlert}
                eyebrow={locale === "he" ? "מלאי נמוך" : "Low stock"}
                title={
                  locale === "he"
                    ? `מלאי נמוך — 5–19 יחידות (${formatNumber(redFiltered.length)} מוצרים)`
                    : `Low stock — 5–19 units (${redFiltered.length} products)`
                }
                hint={
                  locale === "he"
                    ? "מלאי מתחת ל20 יחידות — לחדש השבוע."
                    : "Inventory below 20 units — restock this week."
                }
                accentClass="border-rose-400 bg-rose-50/70 text-rose-800"
              />
              <InventoryTable rows={redFiltered} locale={locale} />
            </section>
          ) : null}

          {/* RUNNING LOW (yellow) section */}
          {yellowFiltered.length > 0 ? (
            <section className="space-y-3">
              <SectionBanner
                icon={AlertTriangle}
                eyebrow={locale === "he" ? "מתקרב לסוף" : "Running low"}
                title={
                  locale === "he"
                    ? `מלאי מצטמצם — 20–49 יחידות (${formatNumber(yellowFiltered.length)} מוצרים)`
                    : `Shrinking stock — 20–49 units (${yellowFiltered.length} products)`
                }
                hint={
                  locale === "he"
                    ? "לתכנן הזמנת רכש השבוע כדי להימנע ממצב קריטי."
                    : "Plan a purchase order this week to avoid reaching critical levels."
                }
                accentClass="border-amber-400 bg-amber-50/70 text-amber-900"
              />
              <InventoryTable rows={yellowFiltered} locale={locale} showActionChips />
            </section>
          ) : null}

          {/* HEALTHY section */}
          {greenFiltered.length > 0 ? (
            <section className="space-y-3">
              <SectionBanner
                icon={CheckCircle2}
                eyebrow={locale === "he" ? "מלאי תקין" : "Healthy stock"}
                title={
                  locale === "he"
                    ? `מלאי תקין — 50+ יחידות (${formatNumber(greenFiltered.length)} מוצרים)`
                    : `Healthy stock — 50+ units (${greenFiltered.length} products)`
                }
                hint={
                  locale === "he"
                    ? "מוצרים עם מלאי מספיק. בדקו חריגים — מוצרים עם אלפי יחידות עלולים להיות אטיים."
                    : "Products with sufficient inventory. Check for outliers — high-stock items may indicate slow movers."
                }
                accentClass="border-emerald-400 bg-emerald-50/70 text-emerald-900"
              />
              <InventoryTable rows={greenFiltered} locale={locale} />
            </section>
          ) : null}

          {/* UNSOLD section */}
          {unsoldFiltered.length > 0 ? (
            <section className="space-y-3">
              <SectionBanner
                icon={HelpCircle}
                eyebrow={locale === "he" ? "לא נמכרו" : "No recent sales"}
                title={
                  locale === "he"
                    ? `מוצרים שלא נמכרו (${formatNumber(unsoldFiltered.length)} מוצרים)`
                    : `Products with no recent sales (${unsoldFiltered.length} products)`
                }
                hint={
                  locale === "he"
                    ? "מוצרים ללא מכירות ב90 הימים האחרונים. שקלו לעדכן מחיר, מיקום או לבדוק אם הם מופיעים בחנות."
                    : "Products with no sales in the last 90 days. Consider repricing, repositioning, or checking their store visibility."
                }
                accentClass="border-slate-300 bg-slate-50/70 text-slate-800"
              />
              <InventoryTable rows={unsoldFiltered} locale={locale} />
            </section>
          ) : null}

          {/* NOT TRACKED section */}
          {unknownFiltered.length > 0 ? (
            <section className="space-y-3">
              <SectionBanner
                icon={HelpCircle}
                eyebrow={locale === "he" ? "לא במעקב" : "Not tracked"}
                title={
                  locale === "he"
                    ? `אין נתוני מלאי (${formatNumber(unknownFiltered.length)} מוצרים)`
                    : `No inventory data (${unknownFiltered.length} products)`
                }
                hint={
                  locale === "he"
                    ? "וריאציות בלי מעקב מלאי. הפעילו 'Track quantity' בShopify כדי להציג דגלי מלאי."
                    : "Variants without inventory tracking. Enable 'Track quantity' in Shopify to generate flags."
                }
                accentClass="border-slate-200 bg-slate-50/50 text-slate-700"
              />
              <InventoryTable rows={unknownFiltered} locale={locale} />
            </section>
          ) : null}
        </div>
      ) : (
        // Flat view for search / filter mode
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              {locale === "he"
                ? `${formatNumber(filteredRows.length)} תוצאות`
                : `${formatNumber(filteredRows.length)} result${filteredRows.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <InventoryTable
            rows={filteredRows}
            locale={locale}
            emptyMessage={
              locale === "he" ? "לא נמצאו מוצרים התואמים לחיפוש." : "No products match your search."
            }
          />
        </section>
      )}
    </div>
  );
}
