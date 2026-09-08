"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONFIDENCE_LABEL, type Decision, type DecisionStatus } from "@/lib/domain/decision";
import { StatusPill } from "./status-pill";

type Locale = "he" | "en";

export function formatWhen(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "he" ? "he-IL" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Three tiers, so attention follows importance:
//   prominent — ACT / CHANGE PLAN: the only cards with a filled CTA.
//   standard  — TEST: a question worth a look, quiet link.
//   compact   — WATCH / DO NOT ACT: one row. "Do nothing" must not take the
//               space of "act".
export type CardTier = "prominent" | "standard" | "compact";

export function tierOf(status: DecisionStatus): CardTier {
  if (status === "act" || status === "change_plan") return "prominent";
  if (status === "test") return "standard";
  return "compact";
}

const STATUS_RULE: Record<DecisionStatus, string> = {
  act: "bg-primary",
  change_plan: "bg-warning",
  test: "bg-success/70",
  watch: "bg-transparent",
  do_not_act: "bg-transparent"
};

// A card shows exactly four things: status, decision, why now, recommended
// action — plus a one-line confidence/missing note. Evidence, sources,
// options and history live in the receipt. Metadata (which systems were
// connected) sits under a divider, not in the first view.
export function DecisionCard({
  decision,
  locale,
  onOpen,
  onIgnore,
  busy,
  lead
}: {
  decision: Decision;
  locale: Locale;
  onOpen: (id: string) => void;
  onIgnore: (id: string) => void;
  busy: boolean;
  // The first prominent card gets extra weight.
  lead?: boolean;
}) {
  const d = decision;
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const tier = tierOf(d.status);
  const reviewLabel = d.primaryAction === "review" ? t("לסקור את ההחלטה", "Review decision") : t("לראות את הראיות", "See evidence");
  const missing = d.missingEvidence[0]?.[locale] ?? null;
  const confidenceLine = `${t("ביטחון", "Confidence")}: ${CONFIDENCE_LABEL[d.confidence][locale]}${
    missing ? ` · ${t("חסר", "Missing")}: ${missing}${d.missingEvidence.length > 1 ? ` +${d.missingEvidence.length - 1}` : ""}` : ""
  }`;
  const connected = d.connected.inputs.map((input) => input[locale]).join(" × ");

  if (tier === "compact") {
    // Titles wrap to two lines on phones — truncation there removes exactly
    // the words the manager needs. From `sm` the row is wide enough to clip.
    return (
      <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
        <StatusPill status={d.status} locale={locale} className="shrink-0 self-start sm:self-center" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold sm:line-clamp-none sm:truncate">{d.title[locale]}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground sm:line-clamp-none sm:truncate">{d.whyNow[locale]}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(d.id)}
          disabled={busy}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 self-start text-sm font-semibold text-muted-foreground hover:text-foreground sm:min-h-0 sm:self-center sm:text-xs"
        >
          {t("לסקור", "Review")}
          <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
        </button>
      </div>
    );
  }

  const prominent = tier === "prominent";
  return (
    <Card className={cn("relative overflow-hidden", prominent && "border-primary/40")}>
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1", STATUS_RULE[d.status])} />
      <div className={cn("space-y-4", prominent ? "p-5 sm:p-7" : "p-5 sm:p-6")}>
        <div className="flex items-center justify-between gap-3">
          <StatusPill status={d.status} locale={locale} />
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            {formatWhen(d.createdAt, locale)}
          </p>
        </div>

        <div className="space-y-1.5">
          <h3 className={cn("font-semibold leading-snug tracking-tight", lead ? "text-2xl sm:text-3xl" : prominent ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}>
            {d.title[locale]}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">{d.whyNow[locale]}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("הילומי ממליצה", "Hiloomy recommends")}</p>
          <p className={cn("leading-6", prominent ? "text-base font-medium" : "text-sm")}>{d.recommendation[locale]}</p>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{confidenceLine}</p>
            {prominent ? (
              // Phones: the main action is a full 48px target, one-handed.
              <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex sm:items-center sm:gap-1">
                <Button variant="ghost" size="lg" className="sm:h-9 sm:px-3" onClick={() => onIgnore(d.id)} disabled={busy}>
                  {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                  {t("להתעלם", "Ignore")}
                </Button>
                <Button size="lg" className="sm:h-10" onClick={() => onOpen(d.id)} disabled={busy}>
                  {reviewLabel}
                  <ArrowUpRight className="ms-1.5 h-4 w-4 rtl:-scale-x-100" aria-hidden />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(d.id)}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-foreground underline-offset-4 hover:underline sm:min-h-0"
              >
                {reviewLabel}
                <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
              </button>
            )}
          </div>
          {/* The cross-domain join IS the value — say which systems were
              connected, in one quiet line at the bottom. */}
          {connected ? <p className="text-xs text-muted-foreground">{connected}</p> : null}
        </div>
      </div>
    </Card>
  );
}
