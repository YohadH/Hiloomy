"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { cn } from "@/lib/utils";

export interface PaginatedColumnMeta {
  label: string;
  tooltip?: React.ReactNode;
  align?: "start" | "end" | "center";
}

export interface DataTablePaginatedProps {
  title: string;
  description?: string;
  tooltip?: React.ReactNode;
  columns: PaginatedColumnMeta[];
  /** Pre-rendered cells (one inner array per row, ordered to match `columns`). */
  rows: React.ReactNode[][];
  pageSizes?: number[];
  initialPageSize?: number;
  /** Max height of the scrollable body in px. */
  maxBodyHeight?: number;
  emptyMessage?: string;
}

function alignClass(align?: "start" | "end" | "center") {
  if (align === "end") return "text-end";
  if (align === "center") return "text-center";
  return "text-start";
}

export function DataTablePaginated({
  title,
  description,
  tooltip,
  columns,
  rows,
  pageSizes = [20, 50, 100],
  initialPageSize = 20,
  maxBodyHeight = 560,
  emptyMessage = "No data available yet."
}: DataTablePaginatedProps) {
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [page, setPage] = useState<number>(1);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalRows);

  const visibleRows = useMemo(() => rows.slice(startIdx, endIdx), [rows, startIdx, endIdx]);

  function handlePageSizeChange(next: number) {
    setPageSize(next);
    setPage(1);
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
      <CardContent className="px-0 pb-0">
        <div
          className="overflow-y-auto overflow-x-auto border-y border-border/60"
          style={{ maxHeight: maxBodyHeight }}
        >
          <table className="min-w-full divide-y divide-border text-start text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                {columns.map((column, i) => (
                  <th
                    key={i}
                    className={cn(
                      "border-b border-border/70 bg-card/95 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur",
                      alignClass(column.align)
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {column.label}
                      {column.tooltip ? (
                        <HelpTip side="bottom" align="start">
                          {column.tooltip}
                        </HelpTip>
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-6 text-sm text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                visibleRows.map((cells, rowIdx) => (
                  <tr key={startIdx + rowIdx} className="transition-colors hover:bg-muted/40">
                    {cells.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className={cn("px-6 py-3.5 align-top tabular-nums", alignClass(columns[cellIdx]?.align))}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-border/60 px-6 py-3 text-sm sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Rows per page</span>
            <div className="inline-flex overflow-hidden rounded-full border border-border bg-card">
              {pageSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handlePageSizeChange(size)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors",
                    size === pageSize
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
            <span className="hidden sm:inline">
              {totalRows === 0
                ? "0 of 0"
                : `${startIdx + 1}–${endIdx} of ${totalRows}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card disabled:hover:text-muted-foreground"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[88px] text-center text-xs font-medium text-muted-foreground tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card disabled:hover:text-muted-foreground"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
