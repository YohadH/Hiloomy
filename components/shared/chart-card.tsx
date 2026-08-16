import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";

export function ChartCard({
  title,
  description,
  tooltip,
  children,
  className,
  action
}: {
  title: string;
  description?: string;
  tooltip?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <CardTitle>{title}</CardTitle>
            {tooltip ? <HelpTip side="bottom" align="start" width="lg">{tooltip}</HelpTip> : null}
          </div>
          {action}
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
