import type { Alert } from "@/lib/domain/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { cn } from "@/lib/utils";

const severityStyles: Record<Alert["severity"], string> = {
  low: "bg-accent text-accent-foreground",
  medium: "bg-warning/15 text-warning-foreground",
  high: "bg-danger/15 text-danger"
};

export function AlertsPreview({
  items,
  title = "Alerts requiring attention",
  severityLabels,
  tooltip
}: {
  items: Alert[];
  title?: string;
  severityLabels?: Record<Alert["severity"], string>;
  tooltip?: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          {tooltip ? <HelpTip side="bottom" align="start">{tooltip}</HelpTip> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
            No alerts in this window.
          </p>
        ) : null}
        {items.map((alert) => (
          <div
            key={alert.id}
            className="rounded-2xl border border-border/70 bg-background/70 p-4 transition-shadow hover:shadow-soft"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                  severityStyles[alert.severity]
                )}
              >
                {severityLabels?.[alert.severity] ?? alert.severity}
              </span>
              <p className="text-xs text-muted-foreground">{alert.periodLabel}</p>
            </div>
            <p className="mt-3 font-semibold">{alert.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.explanation}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
