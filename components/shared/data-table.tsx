import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { DataTablePaginated } from "@/components/shared/data-table-paginated";

export interface DataColumn<T> {
  key: keyof T;
  label: string;
  render?: (row: T) => React.ReactNode;
  tooltip?: React.ReactNode;
  align?: "start" | "end" | "center";
}

export interface DataTableProps<T> {
  title: string;
  description?: string;
  tooltip?: React.ReactNode;
  columns: DataColumn<T>[];
  rows: T[];
  emptyMessage?: string;
  /** Enable client-side pagination, scrollable body, and page-size selector. */
  paginate?: boolean;
  pageSizes?: number[];
  initialPageSize?: number;
  maxBodyHeight?: number;
}

export function DataTable<T extends object>({
  title,
  description,
  tooltip,
  columns,
  rows,
  emptyMessage = "No data available yet.",
  paginate,
  pageSizes,
  initialPageSize,
  maxBodyHeight
}: DataTableProps<T>) {
  if (paginate) {
    const renderedRows: React.ReactNode[][] = rows.map((row) =>
      columns.map((column) =>
        column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")
      )
    );

    return (
      <DataTablePaginated
        title={title}
        description={description}
        tooltip={tooltip}
        columns={columns.map((column) => ({
          label: column.label,
          tooltip: column.tooltip,
          align: column.align
        }))}
        rows={renderedRows}
        pageSizes={pageSizes}
        initialPageSize={initialPageSize}
        maxBodyHeight={maxBodyHeight}
        emptyMessage={emptyMessage}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          {tooltip ? (
            <HelpTip side="bottom" align="start" width="lg">
              {tooltip}
            </HelpTip>
          ) : null}
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="overflow-x-auto table-scroll scroll-fade-end">
        <table className="min-w-full divide-y divide-border text-start text-sm">
          <thead>
            <tr>
              {columns.map((column) => {
                const align =
                  column.align === "end" ? "text-end" : column.align === "center" ? "text-center" : "text-start";
                return (
                  <th
                    key={String(column.key)}
                    className={`pb-3 pe-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${align}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {column.label}
                      {column.tooltip ? <HelpTip side="bottom" align="start">{column.tooltip}</HelpTip> : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={index} className="transition-colors hover:bg-muted/40">
                  {columns.map((column) => {
                    const align =
                      column.align === "end" ? "text-end" : column.align === "center" ? "text-center" : "text-start";
                    return (
                      <td key={String(column.key)} className={`py-4 pe-6 align-top ${align}`}>
                        {column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-6 text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
