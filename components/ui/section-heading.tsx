import { Badge } from "@/components/ui/badge";
import { HelpTip } from "@/components/ui/help-tip";

export function SectionHeading({
  eyebrow,
  title,
  description,
  tooltip
}: {
  eyebrow?: string;
  title: string;
  description: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {eyebrow ? <Badge>{eyebrow}</Badge> : null}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          {tooltip ? (
            <HelpTip side="bottom" align="start" width="lg" iconClassName="h-4 w-4">
              {tooltip}
            </HelpTip>
          ) : null}
        </div>
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">{description}</p>
      </div>
    </div>
  );
}
