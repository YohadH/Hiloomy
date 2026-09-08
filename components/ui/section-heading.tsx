import { HelpTip } from "@/components/ui/help-tip";

// Page-level heading for the tool pages. Editorial: a small context line, the
// title, one sentence. No badge, no eyebrow chip.
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
    <div className="space-y-1.5">
      {eyebrow ? <p className="text-sm text-muted-foreground">{eyebrow}</p> : null}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {tooltip ? (
          <HelpTip side="bottom" align="start" width="lg" iconClassName="h-4 w-4">
            {tooltip}
          </HelpTip>
        ) : null}
      </div>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
    </div>
  );
}
