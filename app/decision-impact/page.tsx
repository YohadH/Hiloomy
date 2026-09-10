// Decision Impact — the scoreboard for Hiloomy's decision product.
// Measures Hiloomy, not the store: what was surfaced, what changed how
// decisions were made, and what happened afterwards. Every number shows its
// denominator; small samples are said to be small; nothing financial is
// estimated. ?days=7|30|90|all · ?domain=<candidate domain>.

import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  buildDecisionImpactReport,
  formatDuration,
  parseImpactDays,
  MIN_JUDGED_FOR_RATE,
  MIN_OUTCOMES_FOR_RATE,
  MIN_TIMING_SAMPLE,
  type DecisionImpactReport,
  type ImpactPeriodDays
} from "@/lib/services/decision-impact-service";
import { CANDIDATE_DOMAINS, CANDIDATE_DOMAIN_LABEL, type CandidateDomain } from "@/lib/domain/decision-candidate";
import { JUDGMENT_LABEL, displayDecisionId, type HumanChoice } from "@/lib/domain/decision";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Locale = "he" | "en";

const CHOICE_LABEL: Record<HumanChoice, { he: string; en: string }> = {
  pending: { he: "ממתין", en: "Pending" },
  approved: { he: "ההמלצה אושרה", en: "Approved recommendation" },
  alternative: { he: "נבחרה אפשרות אחרת", en: "Chose another option" },
  ignored: { he: "ללא שינוי", en: "No change" },
  auto_closed: { he: "נסגר אוטומטית", en: "Closed automatically" },
  expired: { he: "פג תוקף", en: "Expired" }
};

const OUTCOME_LABEL = {
  win: { he: "שיפור", en: "Win", cls: "text-success" },
  neutral: { he: "ללא שינוי", en: "Neutral", cls: "text-muted-foreground" },
  miss: { he: "החמרה", en: "Miss", cls: "text-danger" },
  no_data: { he: "אין נתונים", en: "No data", cls: "text-muted-foreground" }
} as const;

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

function Stat({ value, label, sub, tone }: { value: string; label: string; sub?: string; tone?: "danger" | "warning" | "muted" }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-3xl font-semibold tabular-nums tracking-tight", tone === "danger" && "text-danger", tone === "warning" && "text-warning", tone === "muted" && "text-muted-foreground")}>{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

// A segmented bar: counts over a shared denominator. No decoration, no
// colour unless the meaning is semantic (wrong/miss = danger, win = success).
function Segments({ parts, total, locale }: { parts: Array<{ label: string; n: number; cls: string }>; total: number; locale: Locale }) {
  if (total === 0) return <p className="text-sm text-muted-foreground">{locale === "he" ? "אין נתונים" : "No data"}</p>;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (p.n > 0 ? <div key={p.label} className={cn("h-full", p.cls)} style={{ width: `${(p.n / total) * 100}%` }} title={`${p.label} ${p.n}`} /> : null))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", p.cls)} />
            {p.label} <b>{p.n}</b> <span className="text-muted-foreground">({pct(p.n, total)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function DecisionImpactPage({ searchParams }: { searchParams: Promise<{ days?: string; domain?: string }> }) {
  const locale = (await getAppLocale()) as Locale;
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const params = await searchParams;
  const days = parseImpactDays(params.days);
  const domain = (CANDIDATE_DOMAINS as string[]).includes(params.domain ?? "") ? (params.domain as CandidateDomain) : null;
  const [chrome, r] = await Promise.all([getAppChromeData(), buildDecisionImpactReport(storeId, days, domain)]);

  const href = (d: ImpactPeriodDays, dom: CandidateDomain | null) => {
    const q = new URLSearchParams();
    q.set("days", d === null ? "all" : String(d));
    if (dom) q.set("domain", dom);
    return `/decision-impact?${q.toString()}`;
  };
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(isHe ? "he-IL" : "en-US", { month: "short", day: "numeric" }) : "—");
  const j = r.judgments;
  const rateReady = j.total >= MIN_JUDGED_FOR_RATE;
  const changedReady = j.changedAnswered >= MIN_JUDGED_FOR_RATE;
  const timingReady = r.timing.sample >= MIN_TIMING_SAMPLE;
  const outcomesReady = r.outcomes.win + r.outcomes.neutral + r.outcomes.miss >= MIN_OUTCOMES_FOR_RATE;
  const tooEarly = (needed: number, have: number) => t(`עדיין מוקדם — ${have} מתוך ${needed} הדרושים לפני שהמדד שימושי.`, `Too early — ${have} of the ${needed} needed before this rate is meaningful.`);
  const wrongShare = j.total ? j.wrong / j.total : 0;
  const obviousShare = j.total ? j.obvious / j.total : 0;

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-8">
        <PageHead
          eyebrow={t("כלים", "Tools")}
          title={t("השפעת החלטות", "Decision Impact")}
          description={t("מה הילומי העלתה, מה באמת שינה את הדרך שבה קיבלתם החלטות, ומה קרה אחר כך.", "What Hiloomy surfaced, what actually changed the way decisions were made, and what happened afterwards.")}
        />

        {/* Filters — shareable query params, no client state */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
            {([7, 30, 90, null] as ImpactPeriodDays[]).map((d) => (
              <Link key={String(d)} href={href(d, domain) as never} aria-current={d === days ? "true" : undefined} className={cn("rounded px-2.5 py-1 font-medium", d === days ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                {d === null ? t("כל הזמן", "All time") : t(`${d} ימים`, `${d} days`)}
              </Link>
            ))}
          </div>
          {r.domainsAvailable.length > 0 ? (
            <div className="inline-flex flex-wrap rounded-md border border-border bg-card p-0.5 text-xs">
              <Link href={href(days, null) as never} aria-current={domain === null ? "true" : undefined} className={cn("rounded px-2.5 py-1 font-medium", domain === null ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                {t("כל התחומים", "All domains")}
              </Link>
              {CANDIDATE_DOMAINS.filter((d) => r.domainsAvailable.includes(d)).map((d) => (
                <Link key={d} href={href(days, d) as never} aria-current={domain === d ? "true" : undefined} className={cn("rounded px-2.5 py-1 font-medium", domain === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                  {CANDIDATE_DOMAIN_LABEL[d][locale]}
                </Link>
              ))}
            </div>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {r.period.start ? `${fmtDate(r.period.start)} – ${fmtDate(r.period.end)}` : t("מאז ההחלטה הראשונה", "Since the first decision")}
          </span>
        </div>

        {r.surfaced === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            {r.memory.recorded > 0
              ? t(`נרשמו ${r.memory.recorded} החלטות בתקופה, אבל אף אחת עדיין לא הוצגה כהחלטה בהיום. אין מה למדוד עד שהחלטה מוצגת.`, `${r.memory.recorded} decisions were recorded in the period, but none was surfaced on Today yet. There is nothing to measure until a decision is shown.`)
              : t("לא הוצגו החלטות בתקופה הזו. נסו טווח רחב יותר או פתחו את היום כדי שהמנועים ירוצו.", "No decisions were surfaced in this period. Try a wider range, or open Today so the engines run.")}
          </Card>
        ) : null}

        {/* 1 — Impact scorecard */}
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Stat value={String(r.surfaced)} label={t("החלטות שהוצגו", "Decisions surfaced")} sub={t("החלטות ייחודיות שהוצגו למנהל בתקופה", "Unique decisions shown to the manager in the period")} />
            <Stat
              value={j.total ? pct(j.useful, j.total) : "—"}
              label={t("סומנו כמועילות", "Marked useful")}
              sub={j.total ? t(`${j.useful} מתוך ${j.total} החלטות שנשפטו`, `${j.useful} / ${j.total} judged decisions`) + (rateReady ? "" : ` · ${tooEarly(MIN_JUDGED_FOR_RATE, j.total)}`) : t("אף החלטה עדיין לא נשפטה", "No decision has been judged yet")}
              tone={rateReady ? undefined : "muted"}
            />
            <Stat
              value={j.changedAnswered ? pct(j.changed, j.changedAnswered) : "—"}
              label={t("שינו את מה שהמנהל התכוון לעשות", "Changed what the manager planned to do")}
              sub={j.changedAnswered ? t(`${j.changed} מתוך ${j.changedAnswered} שענו על השאלה`, `${j.changed} / ${j.changedAnswered} that answered`) + (changedReady ? "" : ` · ${tooEarly(MIN_JUDGED_FOR_RATE, j.changedAnswered)}`) : t("אין עדיין תשובות", "No answers yet")}
              tone={changedReady ? undefined : "muted"}
            />
            <Stat
              value={r.timing.medianMs !== null && timingReady ? formatDuration(r.timing.medianMs, locale) : "—"}
              label={t("זמן חציוני להחלטה", "Median time to decision")}
              sub={r.timing.sample ? (timingReady ? t(`מהצגה בהיום ועד תשובת המנהל · ${r.timing.sample} החלטות`, `From surfacing on Today to the manager's answer · ${r.timing.sample} decisions`) : t(`אין עדיין מספיק נתונים — ${r.timing.sample} מתוך ${MIN_TIMING_SAMPLE}`, `Not enough data yet — ${r.timing.sample} of ${MIN_TIMING_SAMPLE}`)) : t("אין עדיין החלטות שנענו", "No answered decisions yet")}
              tone={timingReady ? undefined : "muted"}
            />
          </div>
        </Card>

        {/* 2 — High-value decisions + judgment distribution */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-base font-semibold">{t("החלטות בעלות ערך גבוה", "High-value decisions")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("החלטות שהמנהל סימן כמועילות ולא מובנות מאליהן.", "Decisions the manager marked useful and not obvious.")}</p>
            <p className="mt-4 text-3xl font-semibold tabular-nums">
              {j.highValue} / {j.total} <span className="text-lg text-muted-foreground">{j.total ? pct(j.highValue, j.total) : ""}</span>
            </p>
            {!rateReady && j.total > 0 ? <p className="mt-1 text-xs text-muted-foreground">{tooEarly(MIN_JUDGED_FOR_RATE, j.total)}</p> : null}
            {j.total > 0 && obviousShare >= 0.5 ? <p className="mt-2 text-sm text-warning">{t(`${Math.round(obviousShare * 100)}% מההחלטות שנשפטו סומנו כמובנות מאליהן — תוצאה חלשה גם כשהן מועילות.`, `${Math.round(obviousShare * 100)}% of judged decisions were marked obvious — a weak result even when they are useful.`)}</p> : null}
            {j.total > 0 && wrongShare >= 0.2 ? <p className="mt-2 text-sm text-danger">{t(`${Math.round(wrongShare * 100)}% סומנו כשגויות.`, `${Math.round(wrongShare * 100)}% were marked wrong.`)}</p> : null}
          </Card>
          <Card className="p-6">
            <h2 className="text-base font-semibold">{t("שיפוט המנהל", "Manager judgment")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("תגיות יכולות לחפוף; המכנה הוא החלטות שנשפטו.", "Tags can overlap; the denominator is judged decisions.")}</p>
            <div className="mt-4">
              <Segments
                locale={locale}
                total={j.total}
                parts={[
                  { label: JUDGMENT_LABEL.useful[locale], n: j.useful, cls: "bg-success" },
                  { label: JUDGMENT_LABEL.obvious[locale], n: j.obvious, cls: "bg-muted-foreground/50" },
                  { label: JUDGMENT_LABEL.wrong[locale], n: j.wrong, cls: "bg-danger" },
                  { label: JUDGMENT_LABEL.missing_context[locale], n: j.missingContext, cls: "bg-warning" }
                ]}
              />
            </div>
          </Card>
        </section>

        {/* 3 — Behaviour change */}
        <Card className="p-6">
          <h2 className="text-base font-semibold">{t("האם הילומי שינתה את ההחלטה?", "Did Hiloomy change behavior?")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("אישור כיוון קיים אינו כישלון — אבל הוא נבדל משינוי התנהגות בפועל.", "Confirming an existing direction is not a failure — but it is distinct from an actual change in behaviour.")}</p>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Stat value={String(j.changed)} label={t("שינו החלטה", "Changed")} sub={t("changedDecision = כן", "changedDecision = yes")} />
            <Stat value={String(j.confirmed)} label={t("אישרו כיוון קיים", "Confirmed existing direction")} sub={t("changedDecision = לא", "changedDecision = no")} />
            <Stat value={String(r.surfaced - j.changedAnswered)} label={t("לא נענה", "Not answered")} sub={t("ללא תשובה לשאלה", "No answer available")} tone="muted" />
          </div>
        </Card>

        {/* 4 — Outcomes */}
        <Card className="p-6">
          <h2 className="text-base font-semibold">{t("מה קרה אחרי ההחלטה?", "What happened after the decision?")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("נמדד ימים אחרי החלטה שהמנהל ענה עליה. תוצאה חיובית אינה הוכחה לסיבתיות ואינה מתורגמת לכסף.", "Measured days after a decision the manager answered. A positive outcome is not proof of causality and is not translated into money.")}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat value={`${r.outcomes.measured} / ${r.outcomes.eligible}`} label={t("תוצאות שנמדדו", "Measured outcomes")} sub={t("מתוך החלטות שנענו", "of decisions answered by a human")} />
            <Stat value={outcomesReady && r.outcomes.winRate !== null ? `${r.outcomes.winRate}%` : "—"} label={t("שיעור שיפור", "Win rate")} sub={r.outcomes.winRate !== null ? (outcomesReady ? t(`${r.outcomes.win} מתוך ${r.outcomes.win + r.outcomes.neutral + r.outcomes.miss} עם תוצאה מדידה`, `${r.outcomes.win} / ${r.outcomes.win + r.outcomes.neutral + r.outcomes.miss} with a measurable outcome`) : tooEarly(MIN_OUTCOMES_FOR_RATE, r.outcomes.win + r.outcomes.neutral + r.outcomes.miss)) : t("אין עדיין תוצאה מדידה", "No measurable outcome yet")} tone={outcomesReady ? undefined : "muted"} />
            <div className="col-span-2">
              <Segments
                locale={locale}
                total={r.outcomes.measured}
                parts={[
                  { label: OUTCOME_LABEL.win[locale], n: r.outcomes.win, cls: "bg-success" },
                  { label: OUTCOME_LABEL.neutral[locale], n: r.outcomes.neutral, cls: "bg-muted-foreground/50" },
                  { label: OUTCOME_LABEL.miss[locale], n: r.outcomes.miss, cls: "bg-danger" },
                  { label: OUTCOME_LABEL.no_data[locale], n: r.outcomes.noData, cls: "bg-border" }
                ]}
              />
            </div>
          </div>
        </Card>

        {/* 5 — Plan impact */}
        <Card className="p-6">
          <h2 className="text-base font-semibold">{t("השפעה על התוכנית", "Plan Impact")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("החלטות שנוצרו מנקודות החלטה בתוכנית השיווקית (Plan × Reality).", "Decisions created from decision hooks in the marketing plan (Plan × Reality).")}</p>
          {r.plan.surfaced === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("לא הוצגו החלטות תוכנית בתקופה. הן נוצרות כשחלון של נקודת החלטה בגאנט מגיע.", "No plan decisions were surfaced in the period. They appear when a decision hook's window in the Gantt arrives.")}</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat value={String(r.plan.surfaced)} label={t("החלטות תוכנית שהוצגו", "Plan decisions surfaced")} sub={t(`${r.plan.changePlanStatus} עם פסק "לשנות תוכנית"`, `${r.plan.changePlanStatus} with a CHANGE PLAN verdict`)} />
              <Stat value={String(r.plan.acted)} label={t("נענו", "Acted upon")} sub={t("תשובת מנהל", "Answered by the manager")} />
              <Stat value={`${r.plan.continuedAsPlanned} / ${r.plan.changedPlan}`} label={t("המשיכו כמתוכנן / שינו", "Continued as planned / changed")} sub={r.plan.optionUnknown ? t(`מהאפשרות שנבחרה · ${r.plan.optionUnknown} ללא אפשרות רשומה`, `From the chosen option · ${r.plan.optionUnknown} with no recorded option`) : t("מהאפשרות שנבחרה", "From the chosen option")} />
              <Stat value={`${r.plan.useful} / ${r.plan.judged}`} label={t("מועילות / נשפטו", "Useful / judged")} sub={t(`${r.plan.changed} שינו את התנהגות המנהל`, `${r.plan.changed} changed the manager's behaviour`)} />
            </div>
          )}
        </Card>

        {/* 6 — Stories */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("החלטות ששווה ללמוד מהן", "Decisions worth learning from")}</h2>
          {r.stories.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">{t("אין עדיין החלטות להצגה בתקופה.", "No decisions to show for the period yet.")}</Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {r.stories.map((s) => (
                <Card key={s.id} className="space-y-3 p-5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{s.question[locale]}</p>
                    <span className="text-xs text-muted-foreground">
                      {CANDIDATE_DOMAIN_LABEL[s.domain][locale]}
                      {s.crossDomain ? ` · ${t("חוצה תחומים", "cross-domain")}` : ""} · {fmtDate(s.surfacedAt)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">{t("למה הופיעה", "Why it appeared")}</dt>
                    <dd>{s.whyNow[locale] || "—"}</dd>
                    <dt className="text-muted-foreground">{t("ההמלצה", "Recommended")}</dt>
                    <dd>{s.recommendation[locale] || "—"}</dd>
                    <dt className="text-muted-foreground">{t("המנהל בחר", "Manager chose")}</dt>
                    <dd>{CHOICE_LABEL[s.choice][locale]}</dd>
                    <dt className="text-muted-foreground">{t("שיפוט", "Judgment")}</dt>
                    <dd>{s.judgment.length ? s.judgment.map((tag) => JUDGMENT_LABEL[tag][locale]).join(" · ") : t("טרם נשפט", "Not judged")}</dd>
                    <dt className="text-muted-foreground">{t("שינה החלטה?", "Changed the decision?")}</dt>
                    <dd>{s.changedDecision === null ? t("לא נענה", "Not answered") : s.changedDecision ? t("כן", "Yes") : t("לא", "No")}</dd>
                    <dt className="text-muted-foreground">{t("תוצאה", "Outcome")}</dt>
                    <dd className={s.outcome ? OUTCOME_LABEL[s.outcome].cls : "text-muted-foreground"}>
                      {s.outcome ? OUTCOME_LABEL[s.outcome][locale] : t("טרם נמדד", "Not measured yet")}
                      {s.outcomeSummary?.[locale] ? <span className="text-muted-foreground"> — {s.outcomeSummary[locale]}</span> : null}
                    </dd>
                  </dl>
                  <Link href={s.href as never} className="inline-flex text-sm font-semibold underline-offset-4 hover:underline">
                    {t("לקבלה", "Open the receipt")} {displayDecisionId(s.id)} →
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* 7 — By domain */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("לפי תחום החלטה", "Performance by decision domain")}</h2>
          <p className="text-sm text-muted-foreground">{t("איפה הילומי באמת מועילה, ואילו מנועים מייצרים החלטות מובנות מאליהן או שגויות.", "Where Hiloomy is actually useful, and which engines produce obvious or wrong decisions.")}</p>
          {r.domains.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">{t("אין נתונים בתקופה.", "No data in the period.")}</Card>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {[t("תחום", "Domain"), t("הוצגו", "Surfaced"), t("נשפטו", "Judged"), t("מועיל", "Useful"), t("ערך גבוה", "High value"), t("שינו החלטה", "Changed"), t("מובן מאליו", "Obvious"), t("שגוי", "Wrong"), t("שיפור / נמדד", "Win / measured")].map((h) => (
                      <th key={h} className="px-3 py-2 text-start font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.domains.map((d) => (
                    <tr key={d.key} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{d.label[locale]}</td>
                      <td className="px-3 py-2">{d.surfaced}</td>
                      <td className="px-3 py-2">{d.judged}</td>
                      <td className="px-3 py-2">{d.judged ? `${d.useful} (${pct(d.useful, d.judged)})` : "—"}</td>
                      <td className="px-3 py-2">{d.judged ? d.highValue : "—"}</td>
                      <td className="px-3 py-2">{d.judged ? d.changed : "—"}</td>
                      <td className={cn("px-3 py-2", d.judged && d.obvious / d.judged >= 0.5 && "text-warning")}>{d.judged ? `${d.obvious} (${pct(d.obvious, d.judged)})` : "—"}</td>
                      <td className={cn("px-3 py-2", d.judged && d.wrong / d.judged >= 0.2 && "text-danger")}>{d.judged ? `${d.wrong} (${pct(d.wrong, d.judged)})` : "—"}</td>
                      <td className="px-3 py-2">{d.measured ? `${d.win} / ${d.measured}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 8 — Time to decision */}
        <Card className="p-6">
          <h2 className="text-base font-semibold">{t("כמה מהר מתקבלות החלטות?", "Time to decision")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("הזמן מהרגע שהילומי הציגה את ההחלטה ועד תשובת המנהל. אין נקודת ייחוס מלפני הילומי, ולכן זה לא 'מהר יותר' — זה פשוט הזמן.", "Time from Hiloomy surfacing a decision to the manager's answer. There is no pre-Hiloomy baseline, so this is not 'faster' — it is simply the time.")}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat value={r.timing.medianMs !== null ? formatDuration(r.timing.medianMs, locale) : "—"} label={t("חציון", "Median")} sub={t(`${r.timing.sample} החלטות`, `${r.timing.sample} decisions`)} tone={timingReady ? undefined : "muted"} />
            <Stat value={r.timing.fastestMs !== null ? formatDuration(r.timing.fastestMs, locale) : "—"} label={t("המהירה ביותר", "Fastest")} />
            <Stat value={r.timing.slowestMs !== null ? formatDuration(r.timing.slowestMs, locale) : "—"} label={t("האיטית ביותר", "Slowest")} />
            <Stat value={String(r.timing.pending)} label={t("עדיין ממתינות", "Still pending")} tone="muted" />
          </div>
          {timingReady ? (
            <div className="mt-4">
              <Segments
                locale={locale}
                total={r.timing.sample}
                parts={[
                  { label: t("פחות משעה", "< 1h"), n: r.timing.buckets.under1h, cls: "bg-foreground" },
                  { label: t("1–4 שעות", "1–4h"), n: r.timing.buckets.h1to4, cls: "bg-foreground/70" },
                  { label: t("4–24 שעות", "4–24h"), n: r.timing.buckets.h4to24, cls: "bg-foreground/50" },
                  { label: t("1–3 ימים", "1–3d"), n: r.timing.buckets.d1to3, cls: "bg-foreground/30" },
                  { label: t("מעל 3 ימים", "> 3d"), n: r.timing.buckets.over3d, cls: "bg-foreground/15" }
                ]}
              />
            </div>
          ) : r.timing.sample > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{t(`ההתפלגות תוצג מ-${MIN_TIMING_SAMPLE} החלטות שנענו.`, `The distribution appears from ${MIN_TIMING_SAMPLE} answered decisions.`)}</p>
          ) : null}
        </Card>

        {/* 9 — Memory readiness */}
        <Card className="p-6">
          <h2 className="text-base font-semibold">{t("זיכרון החלטות", "Decision Memory")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("נאספת היסטוריה שממנה הילומי תוכל לזהות דפוסים חוזרים.", "Decision history is accumulating so repeated patterns can be identified over time.")}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat value={String(r.memory.recorded)} label={t("החלטות שנרשמו", "Decisions recorded")} sub={t("כולל כאלה שלא הוצגו", "Including ones never surfaced")} />
            <Stat value={String(r.memory.withJudgment)} label={t("עם שיפוט", "With judgments")} />
            <Stat value={String(r.memory.withOutcome)} label={t("עם תוצאה מדודה", "With measured outcomes")} />
            <Stat value="—" label={t("פרקים ברי-השוואה", "Comparable episodes")} sub={t("עדיין לא נמדד — אין הגדרה אמינה למצב דומה", "Not measured yet — no reliable definition of a similar situation exists")} tone="muted" />
          </div>
          {r.memory.learnings.length ? (
            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("תובנות מגובות בראיות (90 יום, מהזיכרון)", "Evidence-backed learnings (90 days, from Memory)")}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {r.memory.learnings.map((l, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                    <span>{l[locale]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t("עדיין אין תובנות מגובות בראיות. הילומי לא ממציאה לקחים.", "No evidence-backed learnings yet. Hiloomy does not invent lessons.")}</p>
          )}
        </Card>

        {r.notes.length ? (
          <Card className="p-5 text-sm">
            <p className="font-semibold">{t("הערות על הפנקס", "Ledger notes")}</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">
              {r.notes.map((n, i) => (
                <li key={i}>{n[locale]}</li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
