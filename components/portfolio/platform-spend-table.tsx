// Per-platform spend vs income (F-077) — the owner's ask, verbatim: "for
// each platform we spent money on: how much we spent and how much we made,
// according to the dates we chose. Total!" and, since 23 Sep 2026, "divide
// it by brand so I can see how much each brand spent and how much income
// Meta created."
//
// Server component — pure presentation of a PlatformSpendReport. Each
// connected platform row is followed by one sub-row per brand; a brand
// without that platform's connector renders as "not connected", never as
// zero. Platforms with no connected brand at all keep the single
// "not connected" row.

import type { PlatformSpendReport, PlatformSpendRow } from "@/lib/services/platform-spend-service";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function PlatformSpendTable({
  report,
  currency,
  isHe
}: {
  report: PlatformSpendReport;
  currency: string;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => formatCurrency(n, currency);
  const roas = (value: number | null) => (value != null ? `${value.toFixed(2)}×` : "—");
  const netCls = (net: number) => (net < 0 ? "text-rose-700" : "text-emerald-700");
  const notConnectedTag = (
    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
      {lang("לא מחובר", "Not connected")}
    </span>
  );

  // Sub-rows only add information when the selection holds more than one
  // brand; a single-brand org would just repeat the platform total.
  const showBrands = (row: PlatformSpendRow) => row.connected && row.brands.length > 1;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto table-scroll scroll-fade-end">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang("פלטפורמה / מותג", "Platform / brand")}
                </th>
                <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang("הוצאה", "Spend")}
                </th>
                <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang("הכנסה משויכת", "Attributed income")}
                </th>
                <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang("נטו", "Net")}
                </th>
                <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  ROAS
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <PlatformRows key={row.platform} row={row} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-slate-50">
                <td className="px-3 py-2 text-[11px] font-bold">
                  {lang("סה״כ (פלטפורמות מחוברות)", "Total (connected platforms)")}
                </td>
                <td className="px-3 py-2 text-end font-bold tabular-nums">{fmt(report.totalSpend)}</td>
                <td className="px-3 py-2 text-end font-bold tabular-nums">{fmt(report.totalAttributedRevenue)}</td>
                <td className={cn("px-3 py-2 text-end font-bold tabular-nums", netCls(report.totalAttributedRevenue - report.totalSpend))}>
                  {fmt(report.totalAttributedRevenue - report.totalSpend)}
                </td>
                <td className="px-3 py-2 text-end font-bold tabular-nums">
                  {report.totalSpend > 0 ? `${(report.totalAttributedRevenue / report.totalSpend).toFixed(2)}×` : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  function PlatformRows({ row }: { row: PlatformSpendRow }) {
    return (
      <>
        <tr className={cn("border-t border-border", !row.connected && "opacity-70", showBrands(row) && "bg-slate-50/60")}>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{isHe ? row.label.he : row.label.en}</span>
              {!row.connected ? notConnectedTag : null}
            </div>
            <div className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
              {isHe ? row.attributionNote.he : row.attributionNote.en}
            </div>
          </td>
          {row.connected ? (
            <>
              <td className="px-3 py-2 text-end font-semibold tabular-nums">{fmt(row.spend)}</td>
              <td className="px-3 py-2 text-end font-semibold tabular-nums">{fmt(row.attributedRevenue)}</td>
              <td className={cn("px-3 py-2 text-end font-semibold tabular-nums", netCls(row.net))}>{fmt(row.net)}</td>
              <td className="px-3 py-2 text-end font-semibold tabular-nums">{roas(row.roas)}</td>
            </>
          ) : (
            <td colSpan={4} className="px-3 py-2 text-end text-[11px] text-muted-foreground">
              {lang("יוצג אחרי חיבור — אין נתונים ≠ אין הוצאה", "Appears once connected — no data ≠ no spend")}
            </td>
          )}
        </tr>
        {showBrands(row)
          ? row.brands.map((brand) => (
              <tr key={`${row.platform}:${brand.storeId}`} className={cn("border-t border-border/50", !brand.connected && "opacity-70")}>
                <td className="px-3 py-1.5 ps-8">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-muted-foreground">↳</span>
                    <span>{brand.storeName}</span>
                    {!brand.connected ? notConnectedTag : null}
                  </div>
                </td>
                {brand.connected ? (
                  <>
                    <td className="px-3 py-1.5 text-end tabular-nums">{fmt(brand.spend)}</td>
                    <td className="px-3 py-1.5 text-end tabular-nums">{fmt(brand.attributedRevenue)}</td>
                    <td className={cn("px-3 py-1.5 text-end tabular-nums", netCls(brand.net))}>{fmt(brand.net)}</td>
                    <td className="px-3 py-1.5 text-end tabular-nums">{roas(brand.roas)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="px-3 py-1.5 text-end text-[11px] text-muted-foreground">
                    {lang("המותג לא מחובר לפלטפורמה — לא נמדד", "Brand not connected to this platform — not measured")}
                  </td>
                )}
              </tr>
            ))
          : null}
      </>
    );
  }
}
