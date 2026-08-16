import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ComparisonMetric } from "@/lib/domain/types";
import { cn, formatCurrency, formatSignedPercent } from "@/lib/utils";

export function ComparisonTile({
  item,
  currency = "USD",
  isPercent: isPercentOverride,
  priorLabel = "Prior"
}: {
  item: ComparisonMetric;
  currency?: string;
  /** If omitted, infers from label containing "rate". */
  isPercent?: boolean;
  priorLabel?: string;
}) {
  const positive = item.change > 0;
  const negative = item.change < 0;
  const isPercent =
    isPercentOverride ?? item.label.toLowerCase().includes("rate");
  const formatValue = (n: number) => (isPercent ? `${n.toFixed(1)}%` : formatCurrency(n, currency));

  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {item.label}
        </p>
        <p className="mt-3 text-2xl font-semibold tabular-nums">{formatValue(item.current)}</p>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {priorLabel}: {formatValue(item.previous)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              positive && "bg-emerald-500/10 text-emerald-700",
              negative && "bg-rose-500/10 text-rose-700",
              !positive && !negative && "bg-muted text-muted-foreground"
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : negative ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {formatSignedPercent(item.change)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
