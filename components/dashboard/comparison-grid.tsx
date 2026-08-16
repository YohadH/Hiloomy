import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ComparisonMetric } from "@/lib/domain/types";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatSignedPercent } from "@/lib/utils";

function renderValue(label: string, value: number, percentLabels: string[]) {
  if (percentLabels.includes(label) || label.toLowerCase().includes("rate")) return `${value.toFixed(1)}%`;
  return formatCurrency(value);
}

export function ComparisonGrid({
  items,
  priorLabel = "Prior",
  percentLabels = []
}: {
  items: ComparisonMetric[];
  priorLabel?: string;
  percentLabels?: string[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const positive = item.change > 0;
        const negative = item.change < 0;
        const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
        const tone = positive ? "text-success" : negative ? "text-danger" : "text-muted-foreground";
        return (
          <Card key={item.label} className="transition-shadow hover:shadow-lg">
            <CardContent className="space-y-3 p-6">
              <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-semibold tracking-tight">
                {renderValue(item.label, item.current, percentLabels)}
              </p>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {priorLabel}: {renderValue(item.label, item.previous, percentLabels)}
                </span>
                <span className={cn("inline-flex items-center gap-1 font-semibold", tone)}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {formatSignedPercent(item.change)}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
