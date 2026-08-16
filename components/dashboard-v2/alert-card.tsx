import { BellRing } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Alert } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const SEVERITY_CARD: Record<Alert["severity"], string> = {
  high: "border-rose-200 bg-rose-50/60",
  medium: "border-amber-200 bg-amber-50/60",
  low: "border-sky-200 bg-sky-50/60"
};

const SEVERITY_PILL: Record<Alert["severity"], string> = {
  high: "bg-rose-500 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-sky-500 text-white"
};

export function AlertCard({
  alert,
  severityLabel
}: {
  alert: Alert;
  severityLabel?: string;
}) {
  return (
    <Card className={cn("border", SEVERITY_CARD[alert.severity])}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                SEVERITY_PILL[alert.severity]
              )}
            >
              <BellRing className="h-3 w-3" />
              {severityLabel ?? alert.severity}
            </span>
            <p className="text-xs font-medium text-muted-foreground">{alert.periodLabel}</p>
          </div>
        </div>
        <p className="text-sm font-semibold leading-snug">{alert.title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{alert.explanation}</p>
        {alert.suggestedAction ? (
          <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Suggested action
            </p>
            <p className="mt-1 text-xs leading-5">{alert.suggestedAction}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
