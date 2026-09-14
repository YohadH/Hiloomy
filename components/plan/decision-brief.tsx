// The briefing blocks shared by the receipt and the initiative page:
// Diagnosis → Recommendation → Alternatives (with the condition under which
// each becomes better) → What would change → Questions Hiloomy asks.
// Presentational; the questions are the only interactive part.

import type { BusinessDiagnosis } from "@/lib/domain/business-diagnosis";
import type { DecisionOption, Recommendation } from "@/lib/domain/decision-space";
import { FeasibilityQuestion } from "@/components/plan/feasibility-question";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

const TONE: Record<string, string> = {
  strong: "bg-success/15 text-success",
  healthy: "bg-success/15 text-success",
  effective: "bg-success/15 text-success",
  possible_in_time: "bg-success/15 text-success",
  transfer_possible: "bg-success/15 text-success",
  enough_time: "bg-success/15 text-success",
  mixed: "bg-warning/15 text-warning",
  constrained: "bg-warning/15 text-warning",
  window_narrowing: "bg-warning/15 text-warning",
  possibly_unnecessary: "bg-warning/15 text-warning",
  weak: "bg-danger/10 text-danger",
  out_of_stock: "bg-danger/10 text-danger",
  unprofitable: "bg-danger/10 text-danger",
  impossible_in_time: "bg-danger/10 text-danger",
  decision_required_now: "bg-danger/10 text-danger",
  unknown: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
  not_running: "bg-muted text-muted-foreground",
  not_needed: "bg-muted text-muted-foreground",
  ended: "bg-muted text-muted-foreground"
};
const STATE_LABEL: Record<string, { he: string; en: string }> = {
  strong: { he: "חזק", en: "strong" },
  healthy: { he: "בריא", en: "healthy" },
  weak: { he: "חלש", en: "weak" },
  mixed: { he: "מעורב", en: "mixed" },
  unknown: { he: "לא ידוע", en: "unknown" },
  none: { he: "אין", en: "none" },
  not_running: { he: "לא רץ", en: "not running" },
  constrained: { he: "מוגבל", en: "constrained" },
  out_of_stock: { he: "אזל", en: "out of stock" },
  possible_in_time: { he: "אפשרי בזמן", en: "possible in time" },
  impossible_in_time: { he: "לא אפשרי בזמן", en: "not possible in time" },
  transfer_possible: { he: "העברה אפשרית", en: "transfer possible" },
  not_needed: { he: "לא נדרש", en: "not needed" },
  unprofitable: { he: "הפסדי", en: "unprofitable" },
  effective: { he: "עובד", en: "effective" },
  possibly_unnecessary: { he: "אולי מיותר", en: "possibly unnecessary" },
  enough_time: { he: "יש זמן", en: "enough time" },
  window_narrowing: { he: "החלון מצטמצם", en: "window narrowing" },
  decision_required_now: { he: "נדרשת החלטה עכשיו", en: "decision required now" },
  ended: { he: "הסתיים", en: "ended" }
};
const FEAS: Record<DecisionOption["feasibility"], { he: string; en: string }> = {
  feasible: { he: "ישים", en: "feasible" },
  conditional: { he: "בתנאי", en: "conditional" },
  infeasible: { he: "לא ישים", en: "infeasible" },
  unknown: { he: "ישימות לא ידועה", en: "feasibility unknown" }
};

export function DiagnosisBlock({ d, locale, compact = false }: { d: BusinessDiagnosis; locale: Locale; compact?: boolean }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const dims: Array<[string, { state: string; evidence: { he: string; en: string } }]> = [
    [t("ביקוש", "Demand"), d.demand],
    [t("חנויות", "Stores"), d.offline],
    [t("Meta", "Meta"), d.paid],
    [t("קריאייטורים", "Creators"), d.creators],
    [t("מלאי", "Inventory"), d.inventory],
    [t("חידוש מלאי", "Replenishment"), d.replenishment],
    [t("מרווח", "Margin"), d.margin],
    [t("הצעה", "Offer"), d.offer],
    [t("זמן", "Time"), d.time]
  ];
  const shown = compact ? dims.filter(([, x]) => x.state !== "unknown" && x.state !== "none" && x.state !== "not_needed" && x.state !== "not_running") : dims.filter(([, x]) => x.state !== "none" && x.state !== "not_needed");
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold leading-snug">{d.headline[locale]}</p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map(([label, x]) => (
          <li key={label} className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[x.state] ?? "bg-muted text-muted-foreground")} title={x.evidence[locale]}>
            {label}: {STATE_LABEL[x.state]?.[locale] ?? x.state}
          </li>
        ))}
      </ul>
      {!compact ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {shown.map(([label, x]) => (
            <li key={label}>
              <span className="text-foreground">{label}:</span> {x.evidence[locale]}
            </li>
          ))}
        </ul>
      ) : null}
      {d.unknowns.length ? <p className="text-xs text-muted-foreground">{t("לא ידוע", "Unknown")}: {d.unknowns.map((u) => u[locale]).join(" · ")}</p> : null}
    </div>
  );
}

export function RecommendationBlock({ rec, locale }: { rec: Recommendation; locale: Locale }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  return (
    <div className="space-y-2">
      <p className="text-lg font-semibold leading-snug">{rec.what[locale]}</p>
      <ul className="space-y-1 text-sm">
        {rec.why.map((w, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
            <span>{w[locale]}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {t("ביטחון", "Confidence")}: {rec.confidence === "high" ? t("גבוה", "high") : rec.confidence === "medium" ? t("בינוני", "medium") : t("נמוך", "low")} · {rec.confidenceReason[locale]}
      </p>
    </div>
  );
}

export function AlternativesBlock({ rec, locale }: { rec: Recommendation; locale: Locale }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  if (!rec.alternatives.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {rec.alternatives.map((a) => (
        <li key={a.option.type} className="rounded-lg border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{a.option.label[locale]}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px]", a.option.feasibility === "feasible" ? "bg-success/15 text-success" : a.option.feasibility === "infeasible" ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground")}>{FEAS[a.option.feasibility][locale]}</span>
          </div>
          <p className="mt-1 text-muted-foreground">{a.option.what[locale]}</p>
          <p className="mt-1 text-xs">
            <span className="font-medium">{t("עדיף אם", "Better if")}:</span> {a.betterIf[locale]}
          </p>
          {a.option.note ? <p className="text-[11px] text-muted-foreground">{a.option.note[locale]}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function QuestionsBlock({ rec, locale, sheetId, initiativeId, coverDays }: { rec: Recommendation; locale: Locale; sheetId: string; initiativeId: string; coverDays: number | null }) {
  if (!rec.questions.length) return null;
  return (
    <div className="space-y-2">
      {rec.questions.map((q) => (
        <FeasibilityQuestion key={q.key} sheetId={sheetId} initiativeId={initiativeId} q={q} locale={locale} coverDays={coverDays} />
      ))}
    </div>
  );
}
