"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { ProductCostRow, ProductCostSummary } from "@/lib/services/product-cost-service";

// COGS-per-SKU editor (SA-HIGH-03). An editable table of every product with
// its sales weight + current cost, plus a CSV bulk import. Each row saves its
// per-unit cost to /api/products/costs and the server re-costs the synced
// order line items so the Profit page reflects the change immediately.

interface ImportResult {
  ok: boolean;
  totalRows: number;
  parsedRows: number;
  updated: number;
  cleared: number;
  skipped: number;
  lineItemsRecosted: number;
  warnings: string[];
  fileName?: string;
  error?: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function marginPctOf(price: number, cost: number): number | null {
  if (!(price > 0)) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

export function ProductCostsEditor({
  initialRows,
  summary,
  currency,
  locale
}: {
  initialRows: ProductCostRow[];
  summary: ProductCostSummary;
  currency: string;
  locale: "he" | "en";
}) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const router = useRouter();

  const [rows, setRows] = useState<ProductCostRow[]>(initialRows);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [state, setState] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  // CSV import state.
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const coveragePct = Math.round(summary.costCoverage * 100);
  const coverageTone =
    coveragePct >= 90
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : coveragePct >= 50
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-rose-200 bg-rose-50 text-rose-900";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.primarySku ?? "").toLowerCase().includes(q) ||
        r.handle.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const draftValue = (r: ProductCostRow) =>
    drafts[r.productId] ?? (r.costOverrideAmount != null ? String(r.costOverrideAmount) : "");

  async function saveRow(r: ProductCostRow) {
    const raw = draftValue(r).trim();
    let cost: number | null;
    if (raw === "") {
      cost = null;
    } else {
      const n = Number(raw.replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        setState((s) => ({ ...s, [r.productId]: "error" }));
        setErrors((e) => ({ ...e, [r.productId]: t("מספר לא תקין", "Not a valid number") }));
        return;
      }
      cost = Math.round(n * 100) / 100;
    }

    setState((s) => ({ ...s, [r.productId]: "saving" }));
    setErrors((e) => ({ ...e, [r.productId]: "" }));
    try {
      const res = await fetch("/api/products/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: r.productId, cost })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? t("השמירה נכשלה", "Save failed"));

      const effective = cost != null ? cost : r.estimatedCost;
      setRows((prev) =>
        prev.map((row) =>
          row.productId === r.productId
            ? {
                ...row,
                costOverrideAmount: cost,
                hasOverride: cost != null,
                effectiveUnitCost: effective,
                marginPct: marginPctOf(row.price, effective)
              }
            : row
        )
      );
      setState((s) => ({ ...s, [r.productId]: "saved" }));
      // Repaint the Profit page tables / setup-health on next view.
      router.refresh();
      setTimeout(() => setState((s) => ({ ...s, [r.productId]: "idle" })), 2000);
    } catch (e) {
      setState((s) => ({ ...s, [r.productId]: "error" }));
      setErrors((err) => ({
        ...err,
        [r.productId]: e instanceof Error ? e.message : t("שגיאה", "Error")
      }));
    }
  }

  async function onCsvChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setImportError(null);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/products/costs/import", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as ImportResult;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? t("ההעלאה נכשלה", "Upload failed"));
      setImportResult(body);
      router.refresh();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : t("שגיאה לא צפויה", "Unexpected error"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Coverage band */}
      <div className={`rounded-xl border ${coverageTone} p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
              {t("כיסוי עלויות", "Cost coverage")}
            </p>
            <p className="text-2xl font-bold sm:text-3xl">
              {coveragePct}%{" "}
              <span className="text-sm font-normal opacity-70">
                ({summary.soldProductsWithCost}/{summary.soldProducts}{" "}
                {t("מוצרים שנמכרו", "sold products")})
              </span>
            </p>
            <p className="mt-1 text-xs leading-5 opacity-80">
              {t(
                `${summary.productsWithOverride} מוצרים עם עלות ידנית. ללא עלות מדויקת, הרווח מחושב לפי יחס ברירת מחדל של ${(summary.defaultCostRatio * 100).toFixed(0)}%.`,
                `${summary.productsWithOverride} products have a manual cost. Without a real cost, profit falls back to the ${(summary.defaultCostRatio * 100).toFixed(0)}% default ratio.`
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              {uploading ? t("מייבא…", "Importing…") : t("ייבוא CSV", "Import CSV")}
            </button>
            <p className="text-[10px] opacity-70">
              {t("עמודות: sku/handle/title + cost", "Columns: sku/handle/title + cost")}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={onCsvChange}
            />
          </div>
        </div>

        {importResult ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {importResult.fileName ?? "CSV"} {t("יובא", "imported")}
            </p>
            <p className="mt-1">
              {t(
                `${importResult.updated} עודכנו · ${importResult.cleared} נוקו · ${importResult.skipped} דולגו · ${importResult.lineItemsRecosted} שורות הזמנה תומחרו מחדש`,
                `${importResult.updated} set · ${importResult.cleared} cleared · ${importResult.skipped} skipped · ${importResult.lineItemsRecosted} order lines re-costed`
              )}
            </p>
            {importResult.warnings.length > 0 ? (
              <div className="mt-1 text-amber-800">
                {importResult.warnings.slice(0, 6).map((w, i) => (
                  <span key={i} className="block">
                    ⚠ {w}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {importError ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {t("הייבוא נכשל", "Import failed")}
            </p>
            <p className="mt-1">{importError}</p>
          </div>
        ) : null}
      </div>

      {/* Editable table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {t("עלות לפי מוצר (COGS)", "Cost per product (COGS)")}
            </CardTitle>
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("חיפוש מוצר / מק\"ט", "Search product / SKU")}
                className="h-8 w-48 rounded-lg border border-border bg-background ps-8 pe-2 text-xs outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "הקלידו את העלות ליחידה ושמרו. מוצרים שנמכרו הכי הרבה מופיעים ראשונים.",
              "Type the cost per unit and save. Best-selling products appear first."
            )}
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("מוצר", "Product")}
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("נמכרו", "Units")}
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("מחיר", "Price")}
                  </th>
                  <th className="px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("עלות ליחידה", "Cost / unit")}
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("מרווח %", "Margin %")}
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      {t("אין מוצרים להצגה.", "No products to show.")}
                    </td>
                  </tr>
                ) : null}
                {filtered.map((r) => {
                  const st = state[r.productId] ?? "idle";
                  const margin = r.marginPct;
                  return (
                    <tr key={r.productId} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <div className="font-semibold leading-tight">{r.title}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {r.primarySku ? `${t("מק\"ט", "SKU")}: ${r.primarySku}` : r.handle}
                          {r.variantCount > 1
                            ? ` · ${r.variantCount} ${t("וריאציות", "variants")}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums">{formatNumber(r.unitsSold)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">
                        {formatCurrency(r.price, currency)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            inputMode="decimal"
                            value={draftValue(r)}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [r.productId]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRow(r);
                            }}
                            placeholder={
                              r.estimatedCost > 0
                                ? `≈ ${r.estimatedCost} (${t("משוער", "est.")})`
                                : t("עלות", "cost")
                            }
                            className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-xs tabular-nums outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                          {!r.hasOverride ? (
                            <span className="rounded-full border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                              {t("משוער", "estimate")}
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
                              {t("ידני", "manual")}
                            </span>
                          )}
                        </div>
                        {st === "error" && errors[r.productId] ? (
                          <p className="mt-1 text-[10px] text-rose-700">{errors[r.productId]}</p>
                        ) : null}
                      </td>
                      <td
                        className={`px-3 py-2 text-end tabular-nums font-semibold ${
                          margin == null
                            ? "text-muted-foreground"
                            : margin < 0
                              ? "text-rose-700"
                              : margin < 25
                                ? "text-amber-700"
                                : "text-emerald-700"
                        }`}
                      >
                        {margin == null ? "—" : `${margin.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2 text-end">
                        <button
                          type="button"
                          onClick={() => saveRow(r)}
                          disabled={st === "saving"}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {st === "saving" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : st === "saved" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                          ) : null}
                          {st === "saved" ? t("נשמר", "Saved") : t("שמירה", "Save")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            {t(
              "העלות נשמרת ברמת המוצר ומשמשת לחישוב הרווח. שמירה מתמחרת מחדש גם הזמנות שכבר סונכרנו.",
              "Cost is stored per product and drives the profit calculation. Saving also re-costs orders that were already synced."
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
