// The briefing blocks shared by the receipt and the initiative page:
// Diagnosis → Recommendation → Alternatives (with the condition under which
// each becomes better) → What would change → Questions Hiloomy asks.
// Presentational; the questions are the only interactive part.

import type { BusinessDiagnosis } from "@/lib/domain/business-diagnosis";
import type { DecisionOption, Recommendation } from "@/lib/domain/decision-space";
import { FULFILLMENT_STATE_LABEL, INTENT_AUDIENCE_LABEL, INTENT_CHANNEL_LABEL, INTENT_GOAL_LABEL, type InitiativeIntent, type IntentFulfillment } from "@/lib/domain/intent-fulfillment";
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
  measured: "bg-muted text-foreground",
  in_use: "bg-muted text-foreground",
  unused: "bg-warning/15 text-warning",
  unknown: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
  not_running: "bg-muted text-muted-foreground",
  not_needed: "bg-muted text-muted-foreground",
  ended: "bg-muted text-muted-foreground",
  fulfilled: "bg-success/15 text-success",
  partial: "bg-warning/15 text-warning",
  diverging: "bg-danger/10 text-danger",
  insufficient: "bg-muted text-muted-foreground",
  not_set: "bg-muted text-muted-foreground"
};
const STATE_LABEL: Record<string, { he: string; en: string }> = {
  strong: { he: "חזק", en: "strong" },
  healthy: { he: "בריא", en: "healthy" },
  weak: { he: "חלש", en: "weak" },
  mixed: { he: "מעורב", en: "mixed" },
  measured: { he: "נמדד", en: "measured" },
  in_use: { he: "בשימוש", en: "in use" },
  unused: { he: "לא בשימוש", en: "unused" },
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
  ended: { he: "הסתיים", en: "ended" },
  fulfilled: FULFILLMENT_STATE_LABEL.fulfilled,
  partial: FULFILLMENT_STATE_LABEL.partial,
  diverging: FULFILLMENT_STATE_LABEL.diverging,
  insufficient: FULFILLMENT_STATE_LABEL.insufficient,
  not_set: FULFILLMENT_STATE_LABEL.not_set
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
    ...(d.intent ? ([[t("כוונה", "Intent"), d.intent]] as Array<[string, { state: string; evidence: { he: string; en: string } }]>) : []),
    [t("חנויות", "Stores"), d.offline],
    [t("Meta", "Meta"), d.paid],
    [t("קריאייטורים", "Creators"), d.creators],
    [t("מלאי", "Inventory"), d.inventory],
    [t("חידוש מלאי", "Replenishment"), d.replenishment],
    [t("מרווח", "Margin"), d.margin],
    [t("הצעה", "Offer"), d.offer],
    [t("זמן", "Time"), d.time]
  ];
  const shown = compact ? dims.filter(([, x]) => x.state !== "unknown" && x.state !== "none" && x.state !== "not_needed" && x.state !== "not_running" && x.state !== "not_set") : dims.filter(([, x]) => x.state !== "none" && x.state !== "not_needed");
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

// Intent vs reality: what we meant to sell / where / to whom, and what
// happened. The purchase breakdown sits behind "details".
export function IntentBlock({ intent = null, f, locale }: { intent?: InitiativeIntent | null; f: IntentFulfillment; locale: Locale }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
  const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
  const p = f.purchase;
  const rows: Array<{ label: string; intended: string; actual: string; state: string }> = [];
  if (p) {
    rows.push({
      label: t("רכישה", "Purchase"),
      intended: p.intendedLabel + (p.mode === "together" ? t(" (כולם באותה הזמנה)", " (all in one order)") : ""),
      actual: p.orderShare === null ? t(`${p.totalOrders} הזמנות — מעט מדי`, `${p.totalOrders} orders — too few`) : t(`${pct(p.orderShare)} מההזמנות (${p.intendedOrders} מתוך ${p.totalOrders}) · ${pct(p.revenueShare)} מההכנסות`, `${pct(p.orderShare)} of orders (${p.intendedOrders} of ${p.totalOrders}) · ${pct(p.revenueShare)} of revenue`),
      state: p.orderShare === null ? "insufficient" : p.orderShare < 0.35 ? "diverging" : p.orderShare < 0.6 ? "partial" : "fulfilled"
    });
  }
  if (f.channel) {
    rows.push({
      label: t("ערוץ", "Channel"),
      intended: INTENT_CHANNEL_LABEL[f.channel.intended][locale],
      actual: f.channel.onlineShare === null ? t("לא נמדד", "not measured") : t(`אונליין ${pct(f.channel.onlineShare)} · חנויות ${pct(f.channel.offlineShare)}`, `online ${pct(f.channel.onlineShare)} · stores ${pct(f.channel.offlineShare)}`),
      state: f.channel.state === "matches" ? "fulfilled" : f.channel.state === "diverges" ? "diverging" : "insufficient"
    });
  }
  if (f.audience) {
    rows.push({
      label: t("קהל", "Audience"),
      intended: INTENT_AUDIENCE_LABEL[f.audience.intended][locale],
      actual: f.audience.newShare === null ? t("לא נמדד", "not measured") : t(`חדשים ${pct(f.audience.newShare)} · קיימים ${pct(1 - f.audience.newShare)}${f.audience.knownShare < 1 ? ` · ${pct(f.audience.knownShare)} עם לקוח מזוהה` : ""}`, `new ${pct(f.audience.newShare)} · existing ${pct(1 - f.audience.newShare)}${f.audience.knownShare < 1 ? ` · ${pct(f.audience.knownShare)} with a known customer` : ""}`),
      state: f.audience.state === "matches" ? "fulfilled" : f.audience.state === "diverges" ? "diverging" : "insufficient"
    });
  }
  if (f.goal) {
    const fmt = (n: number) => (f.goal!.kind === "revenue" ? ils(n) : String(Math.round(n)));
    rows.push({
      label: t("יעד", "Goal"),
      intended: `${fmt(f.goal.target)} ${INTENT_GOAL_LABEL[f.goal.kind][locale]}`,
      actual: t(`${fmt(f.goal.actual)} (${pct(f.goal.progress)})${f.goal.pace !== "unknown" ? ` · ${f.goal.pace === "ahead" ? "מקדים" : f.goal.pace === "on_track" ? "במסלול" : "מאחור"}` : ""}`, `${fmt(f.goal.actual)} (${pct(f.goal.progress)})${f.goal.pace !== "unknown" ? ` · ${f.goal.pace.replace("_", " ")}` : ""}`),
      state: f.goal.pace === "behind" ? "partial" : f.goal.pace === "unknown" ? "insufficient" : "fulfilled"
    });
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[f.state])}>{FULFILLMENT_STATE_LABEL[f.state][locale]}</span>
        <p className="text-base font-semibold leading-snug">{f.headline[locale]}</p>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-start font-medium"></th>
                <th className="py-1 text-start font-medium">{t("הכוונה", "Intended")}</th>
                <th className="py-1 text-start font-medium">{t("בפועל", "Actual")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-1.5 pe-3 font-medium">{r.label}</td>
                  <td className="py-1.5 pe-3">{r.intended}</td>
                  <td className="py-1.5">
                    <span className={cn("me-2 inline-block h-2 w-2 rounded-full align-middle", r.state === "fulfilled" ? "bg-success" : r.state === "diverging" ? "bg-danger" : r.state === "partial" ? "bg-warning" : "bg-muted-foreground/40")} aria-hidden />
                    {r.actual}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {intent?.note ? <p className="text-xs text-muted-foreground">{intent.note}</p> : null}
      {p && p.mix.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer select-none text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("מה אנשים קנו בפועל — פירוט", "What people actually bought — breakdown")}</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 text-start font-medium">{t("מוצר", "Product")}</th>
                  <th className="py-1 text-end font-medium">{t("הזמנות", "Orders")}</th>
                  <th className="py-1 text-end font-medium">{t("יח׳", "Units")}</th>
                  <th className="py-1 text-end font-medium">{t("הכנסה", "Revenue")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.mix.slice(0, 15).map((m) => (
                  <tr key={m.productId ?? m.title} className={cn(!m.initiativeProduct && "text-muted-foreground")}>
                    <td className="py-1 pe-2">
                      {m.title}
                      {m.intended ? <span className="ms-2 rounded-full bg-success/15 px-1.5 text-[10px] text-success">{t("ההצעה", "the offer")}</span> : !m.initiativeProduct ? <span className="ms-2 rounded-full bg-muted px-1.5 text-[10px]">{t("מוצר אחר באותה הזמנה", "other product, same order")}</span> : null}
                    </td>
                    <td className="py-1 text-end tabular-nums">{m.orders}</td>
                    <td className="py-1 text-end tabular-nums">{m.units}</td>
                    <td className="py-1 text-end tabular-nums">{ils(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.targetsNeverSold.length ? <p className="mt-2 text-xs text-warning">{t(`לא נמכר כלל: ${p.targetsNeverSold.join(", ")}`, `Never sold: ${p.targetsNeverSold.join(", ")}`)}</p> : null}
          </div>
        </details>
      ) : null}
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
      {rec.versus.length ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {rec.versus.map((v) => (
            <li key={v.type}>
              <span className="text-foreground">{t("למה לא", "Why not")} "{v.label[locale]}":</span> {v.reason[locale]}
            </li>
          ))}
        </ul>
      ) : null}
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
          {rec.versus.find((v) => v.type === a.option.type) ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">{t("למה לא עכשיו", "Why not now")}:</span> {rec.versus.find((v) => v.type === a.option.type)!.reason[locale]}
            </p>
          ) : null}
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
