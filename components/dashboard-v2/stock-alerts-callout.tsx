import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StockBadge } from "@/components/dashboard-v2/stock-badge";
import type { ProductStockRow } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function StockAlertsCallout({ stock, locale = "en" }: { stock: ProductStockRow[]; locale?: AppLocale }) {
  const critical = stock.filter((row) => row.flag === "critical");
  const red = stock.filter((row) => row.flag === "red");
  const yellow = stock.filter((row) => row.flag === "yellow");
  const green = stock.filter((row) => row.flag === "green").length;
  const unknown = stock.filter((row) => row.flag === "unknown").length;

  const urgentCount = critical.length + red.length;
  const tone = urgentCount > 0 ? "danger" : yellow.length > 0 ? "warning" : "ok";

  // Show top 5 most-urgent items (critical first, then red, then yellow), already sorted asc by qty in repo
  const urgent = [...critical, ...red, ...yellow].slice(0, 5);

  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-lg",
        tone === "danger" && "border-rose-200 bg-rose-50/40",
        tone === "warning" && "border-amber-200 bg-amber-50/40",
        tone === "ok" && "border-emerald-200 bg-emerald-50/40"
      )}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-xl text-white",
                tone === "danger" && "bg-rose-500",
                tone === "warning" && "bg-amber-500",
                tone === "ok" && "bg-emerald-500"
              )}
            >
              <ShieldAlert className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Stock health
              </p>
              <p className="text-base font-semibold leading-snug">
                {tone === "ok"
                  ? "All products in good shape"
                  : critical.length > 0
                    ? `${critical.length} product${critical.length === 1 ? "" : "s"} in emergency (<5 units)`
                    : urgentCount > 0
                      ? `${urgentCount} product${urgentCount === 1 ? "" : "s"} critically low`
                      : `${yellow.length} product${yellow.length === 1 ? "" : "s"} running low`}
              </p>
            </div>
          </div>
          <Link
            href="/product-follow-ups"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted/60"
          >
            Open follow-ups <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Emergency" value={critical.length} tone="danger" hint="< 5 in stock" />
          <Stat label="Critical" value={red.length} tone="danger" hint="5–19 in stock" />
          <Stat label="Yellow flags" value={yellow.length} tone="warning" hint="< 50 in stock" />
          <Stat label="Healthy" value={green} tone="ok" hint="≥ 50 in stock" />
          <Stat label="Not tracked" value={unknown} tone="muted" hint="No inventory data" />
        </div>

        {urgent.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-border/70 bg-card/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Top {urgent.length} most urgent
            </p>
            <ul className="divide-y divide-border/60">
              {urgent.map((row) => (
                <li
                  key={row.productId}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <p className="min-w-0 truncate text-sm font-medium">{row.productTitle}</p>
                  <StockBadge quantity={row.inventoryQuantity} flag={row.flag} locale={locale} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone
}: {
  label: string;
  value: number;
  hint: string;
  tone: "danger" | "warning" | "ok" | "muted";
}) {
  const valueClass =
    tone === "danger"
      ? "text-rose-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", valueClass)}>{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
