// Per-platform spend vs income (F-077) — the owner's ask, verbatim: "for
// each platform we spent money on: how much we spent and how much we made,
// according to the dates we chose. Total!"
//
// Server component — pure presentation of a PlatformSpendReport. Platforms
// without a connector render as explicit "not connected" rows: an absent
// platform must read as "not measured", never as "spent nothing".

import type { PlatformSpendReport } from "@/lib/services/platform-spend-service";
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

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto table-scroll scroll-fade-end">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang("פלטפורמה", "Platform")}
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
                <tr key={row.platform} className={cn("border-t border-border", !row.connected && "opacity-70")}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{isHe ? row.label.he : row.label.en}</span>
                      {!row.connected ? (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          {lang("לא מחובר", "Not connected")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                      {isHe ? row.attributionNote.he : row.attributionNote.en}
                    </div>
                  </td>
                  {row.connected ? (
                    <>
                      <td className="px-3 py-2 text-end tabular-nums">{fmt(row.spend)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{fmt(row.attributedRevenue)}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-end font-semibold tabular-nums",
                          row.net < 0 ? "text-rose-700" : "text-emerald-700"
                        )}
                      >
                        {fmt(row.net)}
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums">
                        {row.roas != null ? `${row.roas.toFixed(2)}×` : "—"}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="px-3 py-2 text-end text-[11px] text-muted-foreground">
                      {lang("יוצג אחרי חיבור — אין נתונים ≠ אין הוצאה", "Appears once connected — no data ≠ no spend")}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-slate-50">
                <td className="px-3 py-2 text-[11px] font-bold">
                  {lang("סה״כ (פלטפורמות מחוברות)", "Total (connected platforms)")}
                </td>
                <td className="px-3 py-2 text-end font-bold tabular-nums">{fmt(report.totalSpend)}</td>
                <td className="px-3 py-2 text-end font-bold tabular-nums">{fmt(report.totalAttributedRevenue)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-end font-bold tabular-nums",
                    report.totalAttributedRevenue - report.totalSpend < 0 ? "text-rose-700" : "text-emerald-700"
                  )}
                >
                  {fmt(report.totalAttributedRevenue - report.totalSpend)}
                </td>
                <td className="px-3 py-2 text-end font-bold tabular-nums">
                  {report.totalSpend > 0
                    ? `${(report.totalAttributedRevenue / report.totalSpend).toFixed(2)}×`
                    : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
