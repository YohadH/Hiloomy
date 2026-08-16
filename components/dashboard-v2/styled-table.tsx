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
  /** Tint the cell value as profit-positive (emerald). */
  emphasis?: boolean;
}

function alignClass(align?: "start" | "end" | "center") {
  if (align === "end") return "text-end";
  if (align === "center") return "text-center";
  return "text-start";
}

export function StyledTable<T extends object>({
  columns,
  rows,
  numbered = false,
  emptyMessage,
  rowKey,
  locale = "en"
}: {
  columns: StyledColumn<T>[];
  rows: T[];
  /** Show 1, 2, 3... in a leading column. */
  numbered?: boolean;
  emptyMessage?: string;
  rowKey?: (row: T, index: number) => string;
  locale?: AppLocale;
}) {
  const resolvedEmptyMessage =
    emptyMessage ?? (locale === "he" ? "אין עדיין נתונים להצגה." : "No data available yet.");
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto table-scroll scroll-fade-end">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                {numbered ? <th className="px-4 py-2.5 text-start">#</th> : null}
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    className={cn("px-4 py-2.5", alignClass(column.align))}
                  >
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
                  <td
                    colSpan={columns.length + (numbered ? 1 : 0)}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    {resolvedEmptyMessage}
                  </td>
                </tr>
              ) : null}
              {rows.map((row, index) => (
                <tr
                  key={rowKey ? rowKey(row, index) : index}
                  className="transition-colors hover:bg-muted/30"
                >
                  {numbered ? (
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                        {index + 1}
                      </span>
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className={cn(
                        "px-4 py-3 tabular-nums",
                        alignClass(column.align),
                        column.emphasis && "font-semibold text-emerald-600"
                      )}
                    >
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
