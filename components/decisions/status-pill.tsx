import { cn } from "@/lib/utils";
import { CONFIDENCE_LABEL, DECISION_STATUS_LABEL, type Confidence, type DecisionStatus } from "@/lib/domain/decision";

// The status is the strongest visual cue on a Decision Card, so it gets the
// only saturated treatment on the card. One filled pill (ACT), one warm
// outline (CHANGE PLAN), one green outline (TEST), and two quiet neutrals
// (DO NOT ACT, WATCH) — restraint is the point: no-action outcomes are
// first-class and must not look like errors.
const STATUS_STYLE: Record<DecisionStatus, string> = {
  act: "bg-primary text-primary-foreground border-primary",
  change_plan: "border-warning/40 bg-warning/10 text-warning",
  test: "border-success/40 bg-success/10 text-success",
  do_not_act: "border-border bg-muted text-foreground",
  watch: "border-border bg-transparent text-muted-foreground"
};

export function StatusPill({
  status,
  locale,
  className
}: {
  status: DecisionStatus;
  locale: "he" | "en";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase",
        STATUS_STYLE[status],
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "act" ? "bg-primary-foreground" : status === "watch" ? "bg-muted-foreground/60" : "bg-current"
        )}
      />
      {DECISION_STATUS_LABEL[status][locale]}
    </span>
  );
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "text-success",
  medium: "text-foreground",
  low: "text-warning"
};

export function ConfidenceTag({
  confidence,
  locale,
  className
}: {
  confidence: Confidence;
  locale: "he" | "en";
  className?: string;
}) {
  const bars = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-semibold", CONFIDENCE_STYLE[confidence], className)}>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("w-1 rounded-sm", i <= bars ? "bg-current" : "bg-border", i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : "h-3.5")}
          />
        ))}
      </span>
      <span>
        {locale === "he" ? "ביטחון" : "Confidence"} · {CONFIDENCE_LABEL[confidence][locale]}
      </span>
    </span>
  );
}
