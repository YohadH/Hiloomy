"use client";

import { AlertTriangle, ArrowUpRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { displayDecisionId, QUALITY_LABEL, type Decision } from "@/lib/domain/decision";
import { StatusPill, ConfidenceTag } from "./status-pill";
import { EvidenceChip } from "./evidence";

type Locale = "he" | "en";

export function formatWhen(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "he" ? "he-IL" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// One Decision Object in the inbox. Status first, then the management
// question, then the evidence that raised it. Actions are deliberately
// two: open the receipt, or dismiss. Everything else lives in the receipt.
export function DecisionCard({
  decision,
  locale,
  onOpen,
  onIgnore,
  busy
}: {
  decision: Decision;
  locale: Locale;
  onOpen: (id: string) => void;
  onIgnore: (id: string) => void;
  busy: boolean;
}) {
  const d = decision;
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const chips = d.evidence.slice(0, 4);
  const primaryLabel = d.primaryAction === "review" ? t("לסקור את ההחלטה", "Review decision") : t("לראות את הראיות", "See evidence");

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-shadow hover:shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]",
        d.status === "act" && "border-primary/30"
      )}
    >
      {/* Status rail on the inline-start edge — the strongest cue, no color flood. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 start-0 w-1",
          d.status === "act"
            ? "bg-primary"
            : d.status === "change_plan"
              ? "bg-orange-400"
              : d.status === "test"
                ? "bg-emerald-500"
                : "bg-border"
        )}
      />
      <div className="space-y-5 p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusPill status={d.status} locale={locale} />
            <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground">{displayDecisionId(d.id)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
            {formatWhen(d.createdAt, locale)}
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{d.title[locale]}</h3>
          <p className="text-base font-semibold text-foreground/90">{d.question[locale]}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((f, i) => (
            <EvidenceChip key={i} fact={f} locale={locale} />
          ))}
        </div>

        {d.exposure ? (
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{d.exposure.value}</span>{" "}
            <span className="text-muted-foreground">{d.exposure.label[locale]}</span>
            {d.exposure.quality !== "known" ? (
              <span className="ms-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {QUALITY_LABEL[d.exposure.quality][locale]}
              </span>
            ) : null}
          </p>
        ) : null}

        <blockquote className="border-s-2 border-primary/50 ps-4 text-sm leading-6">
          <p className="font-medium">{d.recommendation[locale]}</p>
          {d.reason ? <p className="mt-1 text-muted-foreground">{d.reason[locale]}</p> : null}
        </blockquote>

        {d.unknown ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("מה הילומי לא יודעת", "What Hiloomy doesn't know")}
            </p>
            <p className="mt-1 leading-6">{d.unknown[locale]}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ConfidenceTag confidence={d.confidence} locale={locale} />
          {d.missingEvidence.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" aria-hidden />
              <span className="font-semibold">{t("ראיות חסרות:", "Missing evidence:")}</span>
              {d.missingEvidence.map((m, i) => (
                <span key={i}>
                  {m[locale]}
                  {i < d.missingEvidence.length - 1 ? " ·" : ""}
                </span>
              ))}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={() => onOpen(d.id)} disabled={busy}>
            {primaryLabel}
            <ArrowUpRight className="ms-1.5 h-4 w-4 rtl:-scale-x-100" aria-hidden />
          </Button>
          <Button variant="ghost" onClick={() => onIgnore(d.id)} disabled={busy}>
            {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("להתעלם", "Ignore")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
