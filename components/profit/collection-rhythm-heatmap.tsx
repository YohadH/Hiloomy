// Collection × weekday heatmap (Insight Engine 4). Server-rendered —
// pure presentation of a CollectionRhythmReport. Cell shading is the
// day's share of that collection's weekly revenue (row-relative, so a
// small collection's pattern reads as clearly as the hero collection's).

import {
  WEEKDAY_LABELS,
  type CollectionRhythmReport
} from "@/lib/services/collection-rhythm-service";
import { formatCurrency } from "@/lib/utils";

export function CollectionRhythmHeatmap({
  report,
  currency,
  isHe
}: {
  report: CollectionRhythmReport;
  currency: string;
  isHe: boolean;
}) {
  const days = isHe ? WEEKDAY_LABELS.he : WEEKDAY_LABELS.en;

  // The explicit date range, so nobody reads a 12-week aggregate as "this
  // week" — that misread is exactly how the totals looked impossibly high
  // to the owner (F-034).
  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat(isHe ? "he-IL" : "en-US", {
      day: "numeric",
      month: "short"
    }).format(new Date(iso));
  const rangeLabel = isHe
    ? `${fmtDay(report.windowStart)} – ${fmtDay(report.windowEnd)} · ${report.weeks} שבועות`
    : `${fmtDay(report.windowStart)} – ${fmtDay(report.windowEnd)} · ${report.weeks} weeks`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {isHe
            ? `כל תא = סך המכירות של הקולקציה ביום הזה בשבוע, מצטבר על פני ${rangeLabel}`
            : `Each cell = the collection's total sales on that weekday, accumulated over ${rangeLabel}`}
        </p>
        <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {rangeLabel}
        </span>
      </div>
      {report.recommendation ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 px-4 py-3 text-sm font-medium text-emerald-900">
          📅 {isHe ? report.recommendation.he : report.recommendation.en}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start font-semibold">{isHe ? "קולקציה" : "Collection"}</th>
              {days.map((d) => (
                <th key={d} className="px-2 py-3 text-center font-semibold">
                  {d}
                </th>
              ))}
              <th className="px-4 py-3 text-end font-semibold">{isHe ? "סה״כ" : "Total"}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const max = Math.max(1, ...row.cells.map((c) => c.revenue));
              return (
                <tr key={row.collectionId} className="border-t border-border">
                  <td className="max-w-[220px] px-4 py-2">
                    <div className="truncate font-medium" title={row.title}>
                      {row.title}
                    </div>
                    {row.bestDay ? (
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        {isHe
                          ? `יום חזק: ${days[row.bestDay.weekday]} (+${Math.round(row.bestDay.lift * 100)}%)`
                          : `Best: ${days[row.bestDay.weekday]} (+${Math.round(row.bestDay.lift * 100)}%)`}
                      </span>
                    ) : null}
                  </td>
                  {row.cells.map((cell) => {
                    const intensity = cell.revenue / max;
                    return (
                      <td key={cell.weekday} className="px-1 py-1.5 text-center">
                        <div
                          className="mx-auto flex h-10 w-full min-w-[68px] flex-col items-center justify-center rounded-lg tabular-nums"
                          style={{
                            backgroundColor: `rgba(22, 163, 74, ${(0.08 + intensity * 0.55).toFixed(2)})`,
                            color: intensity > 0.55 ? "#fff" : "#14512C"
                          }}
                          title={`${days[cell.weekday]} · ${formatCurrency(cell.revenue, currency)} · ${cell.orders} ${isHe ? "הזמנות" : "orders"}`}
                        >
                          <span className="text-xs font-semibold">
                            {cell.revenue >= 1000
                              ? `₪${(cell.revenue / 1000).toFixed(1)}K`
                              : `₪${Math.round(cell.revenue)}`}
                          </span>
                          <span className="text-[10px] opacity-80">{cell.orders}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-end font-semibold tabular-nums">
                    {formatCurrency(row.totalRevenue, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {isHe
          ? `הכנסה נטו לפי יום בשבוע (אזור זמן ${report.timeZone}), ${report.weeks} השבועות האחרונים. מוצר שנמצא בכמה קולקציות מחולק שווה ביניהן, כך שהשורות ניתנות לחיבור; מספר ההזמנות הוא הזמנות שנגעו בקולקציה, ולכן הזמנה יכולה להופיע ביותר משורה אחת. "יום חזק" מוצג רק כשיש מספיק הזמנות ופער אמיתי (30%+ מעל יום ממוצע).`
          : `Net revenue by weekday (${report.timeZone} time), trailing ${report.weeks} weeks. A product in several collections is split evenly between them so the rows are additive; order counts are orders that touched the collection, so one order can appear in more than one row. A "best day" is only shown with enough orders and a real gap (30%+ above an average day).`}
      </p>
    </div>
  );
}
