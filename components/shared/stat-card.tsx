import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";

export function StatCard({
  label,
  value,
  tooltip,
  hint
}: {
  label: string;
  value: React.ReactNode;
  tooltip?: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-muted-foreground">{label}</p>
          {tooltip ? <HelpTip side="bottom" align="start">{tooltip}</HelpTip> : null}
        </div>
        <p className="mt-3 text-2xl font-semibold sm:text-3xl">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
