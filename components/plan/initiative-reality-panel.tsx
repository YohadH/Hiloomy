// "מצב היוזמה" — what was planned, what is happening now, what changed.
// Presentational only; used on the decision receipt (before the
// recommendation) and on /plan/initiative/[id]. Initiative-specific numbers
// and broader brand context are never rendered in the same block.

import Link from "next/link";
import type { InitiativeRealitySummary, InitiativeMetric } from "@/lib/domain/initiative-reality";
import { MAPPING_KIND_LABEL } from "@/lib/domain/initiative-reality";
import { ContextCompletion } from "@/components/plan/context-completion";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

const STATUS: Record<InitiativeRealitySummary["status"], { he: string; en: string; cls: string }> = {
  on_track: { he: "במסלול", en: "On track", cls: "bg-success/15 text-success" },
  off_track: { he: "מחוץ למסלול", en: "Off track", cls: "bg-danger/10 text-danger" },
  no_issue_detected: { he: "לא נמצאה בעיה", en: "No issue detected", cls: "bg-success/15 text-success" },
  needs_attention: { he: "דורש תשומת לב", en: "Needs attention", cls: "bg-warning/15 text-warning" },
  needs_context: { he: "דורש השלמה", en: "Needs context", cls: "bg-warning/15 text-warning" },
  insufficient_data: { he: "אין מספיק מידע", en: "Insufficient data", cls: "bg-muted text-muted-foreground" }
};
const QUALITY: Record<InitiativeMetric["quality"], { he: string; en: string }> = {
  known: { he: "ידוע", en: "Known" },
  calculated: { he: "מחושב", en: "Calculated" },
  estimated: { he: "אומדן", en: "Estimated" },
  unavailable: { he: "לא זמין", en: "Unavailable" }
};
const LINE_CLS: Record<InitiativeRealitySummary["lines"][number]["state"], string> = {
  healthy: "text-success",
  above: "text-success",
  acceptable: "text-foreground",
  below: "text-warning",
  risk: "text-danger",
  unknown: "text-muted-foreground"
};

function ago(iso: string | null, now: Date, isHe: boolean): string {
  if (!iso) return isHe ? "לא סונכרן" : "not synced";
  const m = Math.max(1, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return isHe ? `לפני ${d} ימים` : `${d}d ago`;
  if (h >= 1) return isHe ? `לפני ${h} שעות` : `${h}h ago`;
  return isHe ? `לפני ${m} דקות` : `${m}m ago`;
}

export function InitiativeRealityPanel({ r, locale, now, showPlan = true, mappingHref }: { r: InitiativeRealitySummary; locale: Locale; now: Date; showPlan?: boolean; mappingHref?: string }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fwd = isHe ? "←" : "→";
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" });
  const specific = r.metrics.filter((m) => m.scope === "initiative");
  const store = r.metrics.filter((m) => m.scope === "store");
  const changes = r.findings.filter((f) => f.kind !== "progressing" && f.kind !== "sales_vs_prior");
  const st = STATUS[r.status];
  const live = r.period.start <= r.period.today && r.period.end >= r.period.today;

  return (
    <div className="space-y-6">
      {showPlan ? (
        <section className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("מה תוכנן", "What was planned")}</p>
          <p className="text-base font-semibold">{r.title}</p>
          <p className="text-sm text-muted-foreground">
            {fmt(r.period.start)} – {fmt(r.period.end)}
            {r.offer.discountPct !== null ? ` · ${r.offer.discountPct}%` : ""}
            {r.offer.couponCode ? ` · ${r.offer.couponCode}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{t("יעד", "Goal")}: {r.goalNote[locale]}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("מה קורה עכשיו", "What is happening now")}</p>
          <span className="text-xs text-muted-foreground tabular-nums">{live ? t(`יום ${r.period.dayIndex} מתוך ${r.period.totalDays}`, `Day ${r.period.dayIndex} of ${r.period.totalDays}`) : r.period.start > r.period.today ? t("טרם התחיל", "Not started") : t("הסתיים", "Ended")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", st.cls)}>{isHe ? st.he : st.en}</span>
          {r.evidenceBasis === "provisional" && r.status !== "needs_context" ? <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">{t("מצב ראשוני — דורש אימות", "Provisional — needs verification")}</span> : null}
          <span className="text-sm">{r.statusReason[locale]}</span>
        </div>
        {r.context.required > 0 || r.context.rows.some((row) => row.action === "confirm") ? <ContextCompletion context={r.context} locale={locale} href={mappingHref ?? null} /> : null}
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {r.lines.map((l) => (
            <li key={l.label.en} className="flex gap-2">
              <span className="w-20 shrink-0 text-muted-foreground">{l.label[locale]}</span>
              <span className={LINE_CLS[l.state]}>{l.text[locale]}</span>
            </li>
          ))}
        </ul>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {specific.map((m) => (
            <div key={m.key} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 text-sm">
              <dt className="text-muted-foreground">{m.label[locale]}</dt>
              <dd className="text-end">
                <span className={cn("font-semibold tabular-nums", m.value === null && "text-muted-foreground")}>{m.value ?? t("לא זמין", "unavailable")}</span>
                <span className="ms-2 text-[11px] text-muted-foreground">{QUALITY[m.quality][locale]}</span>
                {m.note ? <span className="block text-[11px] text-muted-foreground">{m.note[locale]}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
        {store.length ? (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
            <p className="font-medium text-muted-foreground">{t("הקשר רחב — כל המותג (לא ביצועי היוזמה)", "Broader brand context — not initiative performance")}</p>
            <p className="tabular-nums">{store.map((m) => `${m.label[locale]}: ${m.value}${m.note ? ` (${m.note[locale]})` : ""}`).join(" · ")}</p>
          </div>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {t("ביטחון", "Confidence")}: {r.confidence === "high" ? t("גבוה", "high") : r.confidence === "medium" ? t("בינוני", "medium") : t("נמוך", "low")} · {r.confidenceReason[locale]}
          {" · "}
          {t("Shopify", "Shopify")} {ago(r.freshness.shopify, now, isHe)} · Meta {ago(r.freshness.meta, now, isHe)} · {t("תוכנית", "Plan")} {ago(r.freshness.plan, now, isHe)}
          {r.stale ? <span className="text-warning"> · {t("נתונים לא טריים", "stale data")}</span> : null}
        </p>
      </section>

      {changes.length ? (
        <section className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("מה השתנה / מה חשוב", "What changed / matters")}</p>
          <ul className="space-y-1 text-sm">
            {changes.map((f, i) => (
              <li key={i} className={cn(f.severity === "risk" ? "text-danger" : f.severity === "attention" ? "text-warning" : "")}>
                {f.statement[locale]}
                {f.basis === "provisional" ? <span className="text-[11px] text-muted-foreground"> · {t("על התאמה אוטומטית שטרם אושרה", "on an automatic match not yet confirmed")}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {r.missingEvidence.length ? (
        <section className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("מה Hiloomy לא יכולה לענות עליו", "What Hiloomy cannot answer yet")}</p>
          <ul className="list-disc space-y-0.5 ps-5 text-sm text-muted-foreground">
            {r.missingEvidence.map((m) => (
              <li key={m.key}>{m.label[locale]}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {r.mappings.map((m) => `${MAPPING_KIND_LABEL[m.kind][locale]}: ${m.detail[locale]}`).join(" · ")}
          </p>
          {mappingHref ? (
            <Link href={mappingHref as never} className="inline-flex text-sm font-semibold underline-offset-4 hover:underline">
              {r.evidenceBasis === "provisional" ? t("אשר את המיפויים כדי להפוך את הנתונים למאומתים", "Confirm the mappings to make the data verified") : t("להשלים את מיפוי היוזמה", "Complete initiative mapping")} {fwd}
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
