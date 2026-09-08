import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import type { AppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface StyledColumn<T> {
  key: keyof T;
  label: string;
  render?: (row: T) => React.ReactNode;
  tooltip?: React.ReactNode;
  align?: "start" | "end" | "center";
  /** Tint the cell value as profit-positive. */
  emphasis?: boolean;
}

function alignClass(align?: "start" | "end" | "center") {
  if (align === "end") return "text-end";
  if (align === "center") return "text-center";
  return "text-start";
}

// One data primitive, two layouts. Desktop (md+) is the table. Phones get
// `mobileRender` when the caller provides one — an intentional per-row
// layout instead of an eight-column horizontal pan. Without it the table
// scrolls inside its own box (the fallback, not the strategy).
export function StyledTable<T extends object>({
  columns,
  rows,
  numbered = false,
  emptyMessage,
  rowKey,
  locale = "en",
  mobileRender
}: {
  columns: StyledColumn<T>[];
  rows: T[];
  /** Show 1, 2, 3... in a leading column. */
  numbered?: boolean;
  emptyMessage?: string;
  rowKey?: (row: T, index: number) => string;
  locale?: AppLocale;
  /** Phone layout for one row. When given, the table is hidden below `md`. */
  mobileRender?: (row: T, index: number) => React.ReactNode;
}) {
  // No "yet" — that word sends people to re-sync when the real causes are
  // usually the selected range or a failed query, and it hid a real bug
  // from the owner for a whole QA session (F-020).
  const resolvedEmptyMessage =
    emptyMessage ??
    (locale === "he"
      ? "אין נתונים בטווח התאריכים שנבחר. נסו טווח רחב יותר — ואם הנתונים מופיעים במקומות אחרים אך לא כאן, זו תקלה ששווה לדווח עליה."
      : "No data in the selected date range. Try a wider range — and if other sections show data while this one doesn't, that's a defect worth reporting.");
  return (
    <Card>
      <CardContent className="p-0">
        {mobileRender ? (
          <ul className="divide-y divide-border md:hidden">
            {rows.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">{resolvedEmptyMessage}</li> : null}
            {rows.map((row, index) => (
              <li key={rowKey ? rowKey(row, index) : index} className="px-4 py-3">
                {mobileRender(row, index)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className={cn("overflow-x-auto table-scroll scroll-fade-end", mobileRender && "hidden md:block")}>
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-xs font-medium text-muted-foreground">
              <tr>
                {numbered ? <th className="px-4 py-2.5 text-start">#</th> : null}
                {columns.map((column) => (
                  <th key={String(column.key)} className={cn("px-4 py-2.5 font-medium", alignClass(column.align))}>
                    <span className="inline-flex items-center gap-1">
                      {column.label}
                      {column.tooltip ? <HelpTip>{column.tooltip}</HelpTip> : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (numbered ? 1 : 0)} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {resolvedEmptyMessage}
                  </td>
                </tr>
              ) : null}
              {rows.map((row, index) => (
                <tr key={rowKey ? rowKey(row, index) : index} className="transition-colors hover:bg-muted/30">
                  {numbered ? <td className="px-4 py-3 text-xs text-muted-foreground">{index + 1}</td> : null}
                  {columns.map((column) => (
                    <td key={String(column.key)} className={cn("px-4 py-3", alignClass(column.align), column.emphasis && "font-semibold text-success")}>
                      {column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper for `mobileRender`: a label/value pair list under a row title.
export function MobileRowFacts({ facts }: { facts: Array<{ label: string; value: React.ReactNode; muted?: boolean }> }) {
  return (
    <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {facts.map((f, i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className={cn("text-end font-medium", f.muted && "font-normal text-muted-foreground")}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
