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

// A card shows exactly four things: status, decision, why now, recommended
// action — plus a one-line confidence/missing note. Evidence, sources,
// options and history live in the receipt.
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

  if (tier === "compact") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/60 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <StatusPill status={d.status} locale={locale} className="shrink-0 self-start sm:self-center" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{d.title[locale]}</p>
          <p className="truncate text-xs text-muted-foreground">{d.whyNow[locale]}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(d.id)}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1 self-start text-xs font-semibold text-muted-foreground hover:text-foreground sm:self-center"
        >
          {t("לסקור", "Review")}
          <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
        </button>
      </div>
    );
  }

  const prominent = tier === "prominent";
  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        prominent && "border-primary/30",
        lead && "border-primary/50 shadow-[0_28px_70px_-32px_rgba(27,67,50,0.45)]"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 start-0 w-1",
          d.status === "act" ? "bg-primary" : d.status === "change_plan" ? "bg-orange-400" : "bg-emerald-500/70"
        )}
      />
      <div className={cn("space-y-4", prominent ? "p-6 sm:p-8" : "p-5 sm:p-6")}>
        <div className="flex items-center justify-between gap-3">
          <StatusPill status={d.status} locale={locale} />
          <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
            {formatWhen(d.createdAt, locale)}
          </p>
        </div>

        <div className="space-y-1.5">
          <h3 className={cn("font-semibold leading-snug tracking-tight", lead ? "text-2xl sm:text-3xl" : prominent ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}>
            {d.title[locale]}
          </h3>
          <p className="text-sm text-muted-foreground">{d.whyNow[locale]}</p>
          {/* The cross-domain join IS the value — say which systems were
              connected, in one quiet line. */}
          <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>{t("חיבור", "Connected")}:</span>
            {d.connected.inputs.map((input, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden className="text-border">×</span> : null}
                <span className="text-foreground/80">{input[locale]}</span>
              </span>
            ))}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            {t("הילומי ממליצה", "Hiloomy recommends")}
          </p>
          <p className={cn("leading-6", prominent ? "text-base font-medium" : "text-sm")}>{d.recommendation[locale]}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-1">
          <p className="text-xs text-muted-foreground">{confidenceLine}</p>
          <div className="flex items-center gap-1">
            {prominent ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => onIgnore(d.id)} disabled={busy}>
                  {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                  {t("להתעלם", "Ignore")}
                </Button>
                <Button onClick={() => onOpen(d.id)} disabled={busy}>
                  {reviewLabel}
                  <ArrowUpRight className="ms-1.5 h-4 w-4 rtl:-scale-x-100" aria-hidden />
                </Button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(d.id)}
                disabled={busy}
                className="inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                {reviewLabel}
                <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
