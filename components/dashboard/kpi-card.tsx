import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import type { KPI } from "@/lib/domain/types";
import { formatKpiValue } from "@/lib/formatters";
import { cn, formatSignedPercent } from "@/lib/utils";

export function KpiCard({
  kpi,
  currency = "USD",
  changeLabel = "vs prior period",
  tooltip
}: {
  kpi: KPI;
  currency?: string;
  changeLabel?: string;
  tooltip?: React.ReactNode;
}) {
  const hasChange = typeof kpi.change === "number";
  const change = kpi.change ?? 0;
  const positive = change >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="h-full transition-shadow hover:shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
          {tooltip ? <HelpTip side="bottom" align="start">{tooltip}</HelpTip> : null}
        </div>
        <CardTitle className="text-2xl sm:text-3xl">{formatKpiValue(kpi, currency)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 pt-1">
        {hasChange ? (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {formatSignedPercent(change)}
            </span>
            <span className="text-xs text-muted-foreground">{changeLabel}</span>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
