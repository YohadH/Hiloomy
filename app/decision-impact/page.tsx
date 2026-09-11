// Decision Impact — does Hiloomy understand the business well enough to
// surface the right decisions, and is it helping the brand decide better?
//
// Order: context → what Hiloomy CHECKED (every domain, with its state and
// data freshness) → attention compression (ONE audit pass) → validation
// funnel (selected period) → action needed → plan × reality → quality →
// outcomes → stories → domains → time → memory (ALL TIME). Scope is written
// on every number: "last check", "selected period" or "all time". Analysis
// is revealed only when the data exists. Three states are kept apart on purpose: NOT MEASURED YET (no
// feedback), a MEASURED ZERO (we looked and it is zero), and MISSING DATA
// (the field does not exist). Nothing financial, no causality, no single
// score. ?days=7|30|90|all · ?domain=<candidate domain>.

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
  MIN_TIMING_SAMPLE,
  type DecisionImpactReport,
  type ImpactPeriodDays
} from "@/lib/services/decision-impact-service";
import { CANDIDATE_DOMAINS, CANDIDATE_DOMAIN_LABEL, type CandidateDomain } from "@/lib/domain/decision-candidate";
import type { CoverageEligibility } from "@/lib/services/decision-impact-service";
import { JUDGMENT_LABEL, displayDecisionId, type HumanChoice } from "@/lib/domain/decision";
import { getAppLocale } from "@/lib/i18n";
import { ConfirmLinkButton } from "@/components/decision-impact/confirm-link-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Locale = "he" | "en";

const CHOICE_LABEL: Record<HumanChoice, { he: string; en: string }> = {
  pending: { he: "ממתין", en: "Pending" },
  approved: { he: "אישר את ההמלצה", en: "Approved the recommendation" },
  alternative: { he: "בחר אפשרות אחרת", en: "Chose another option" },
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

// Coverage states: green = checked, neutral = checked with nothing to surface,
// amber = partial data, muted = not eligible / not measured. Never red for
// "no decision surfaced" — that is the product working.
const ELIGIBILITY: Record<CoverageEligibility, { he: string; en: string; cls: string }> = {
  checked: { he: "נבדק", en: "Checked", cls: "bg-success/15 text-success" },
  partial: { he: "נבדק חלקית", en: "Partially checked", cls: "bg-warning/15 text-warning" },
  not_eligible: { he: "לא נבדק", en: "Not checked", cls: "bg-muted text-muted-foreground" },
  missing_data: { he: "חסר מידע", en: "Missing data", cls: "bg-danger/10 text-danger" },
  not_measured: { he: "טרם נמדד", en: "Not measured yet", cls: "bg-muted text-muted-foreground" }
};

// "X / Y" with the denominator always present — never a bare percentage.
function Ratio({ n, d, label, tone }: { n: number; d: number; label: string; tone?: "danger" | "warning" }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>
        {n} <span className="text-base font-normal text-muted-foreground">/ {d}</span>
      </p>
      <p className="mt-0.5 text-sm">{label}</p>
    </div>
  );
}

function Count({ n, label, sub, muted }: { n: number | string; label: string; sub?: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", muted && "text-muted-foreground")}>{n}</p>
      <p className="mt-0.5 text-sm">{label}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

// A quiet line for the "not measured yet" state — text, not an empty card.
function NotYet({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-s-2 border-border ps-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Segments({ parts, total }: { parts: Array<{ label: string; n: number; cls: string }>; total: number }) {
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (p.n > 0 ? <div key={p.label} className={cn("h-full", p.cls)} style={{ width: `${(p.n / total) * 100}%` }} title={`${p.label} ${p.n}`} /> : null))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", p.cls)} />
            {p.label} <b>{p.n}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// "3h ago · Sep 11, 14:02" — real timestamps only; callers pass null when none exists.
function ago(iso: string, now: Date, isHe: boolean): string {
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  const rel = d >= 1 ? (isHe ? `לפני ${d} ימים` : `${d}d ago`) : h >= 1 ? (isHe ? `לפני ${h} שעות` : `${h}h ago`) : isHe ? "בשעה האחרונה" : "< 1h ago";
  const abs = new Date(iso).toLocaleString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${rel} · ${abs}`;
}

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {intro ? <p className="max-w-2xl text-sm text-muted-foreground">{intro}</p> : null}
      </div>
      {children}
    </section>
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
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(isHe ? "he-IL" : "en-US", { month: "short", day: "numeric" }) : "");
  const periodLabel = days === null ? t("מאז ההחלטה הראשונה", "since the first decision") : t(`ב-${days} הימים האחרונים`, `in the last ${days} days`);
  const now = new Date(r.generatedAt);
  const f = r.funnel;
  const j = r.judgments;
  const enoughJudged = j.total >= MIN_JUDGED_FOR_RATE;
  const measurable = r.outcomes.win + r.outcomes.neutral + r.outcomes.miss;
  const hasJudgment = j.total > 0;
  const hasBehaviourAnswer = j.changedAnswered > 0;
  const hasOutcomes = r.outcomes.measured > 0;
  const hasTiming = r.timing.sample > 0;
  const obviousShare = j.total ? j.obvious / j.total : 0;
  const wrongShare = j.total ? j.wrong / j.total : 0;
  const planPending = r.plan.surfaced - r.plan.acted;

  // The one-line verdict on the validation state.
  const verdict =
    f.surfaced === 0
      ? t("עדיין לא הוצגו החלטות בתקופה הזו", "No decisions were surfaced in this period")
      : !hasJudgment
        ? t("עדיין מוקדם למדוד את ההשפעה של הילומי", "Too early to measure Hiloomy's impact")
        : !enoughJudged
          ? t("סימן מוקדם — עדיין אין מספיק משוב כדי להסיק", "Early signal — not enough feedback to conclude yet")
          : hasOutcomes
            ? t("יש מספיק משוב ותוצאות כדי לשפוט את הילומי", "Enough feedback and outcomes to judge Hiloomy")
            : t("יש מספיק משוב; התוצאות עדיין נמדדות", "Enough feedback; outcomes are still being measured");

  const funnelSteps = [
    { n: f.surfaced, label: t("הוצגו", "Surfaced") },
    { n: f.acted, label: t("המנהל פעל", "Manager acted") },
    { n: f.judged, label: t("קיבלו משוב", "Got feedback") },
    { n: f.measured, label: t("תוצאות נמדדו", "Outcomes measured") }
  ];

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-10">
        <PageHead
          eyebrow={t("כלים", "Tools")}
          title={t("השפעת החלטות", "Decision Impact")}
          description={t("האם הילומי באמת עוזרת לכם לקבל החלטות טובות יותר? אנחנו מודדים שלושה דברים: האם ההחלטות היו מועילות, האם הן שינו פעולה, ומה קרה אחר כך.", "Is Hiloomy actually helping you make better decisions? We measure three things: were the decisions useful, did they change an action, and what happened afterwards.")}
        />

        {/* Filters — quiet, below the heading */}
        <div className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex gap-1">
            {([7, 30, 90, null] as ImpactPeriodDays[]).map((d) => (
              <Link key={String(d)} href={href(d, domain) as never} aria-current={d === days ? "true" : undefined} className={cn("rounded px-2 py-0.5", d === days ? "bg-foreground font-semibold text-background" : "hover:text-foreground")}>
                {d === null ? t("כל הזמן", "All time") : t(`${d} ימים`, `${d} days`)}
              </Link>
            ))}
          </span>
          {r.domainsAvailable.length > 1 ? (
            <span className="inline-flex flex-wrap gap-1">
              <Link href={href(days, null) as never} className={cn("rounded px-2 py-0.5", domain === null ? "bg-foreground font-semibold text-background" : "hover:text-foreground")}>
                {t("כל התחומים", "All domains")}
              </Link>
              {CANDIDATE_DOMAINS.filter((d) => r.domainsAvailable.includes(d)).map((d) => (
                <Link key={d} href={href(days, d) as never} className={cn("rounded px-2 py-0.5", domain === d ? "bg-foreground font-semibold text-background" : "hover:text-foreground")}>
                  {CANDIDATE_DOMAIN_LABEL[d][locale]}
                </Link>
              ))}
            </span>
          ) : null}
        </div>

        {/* 1 — Business context now: calendar truth → brand intent → decision */}
        <Section title={t("מה קורה בעסק עכשיו?", "What's happening in the business right now?")} intro={t("ההקשר שהילומי שוקלת מולו. אירוע בלוח השנה מעלה דחיפות או משנה פרשנות — הוא לעולם לא מצדיק המלצה לבדו.", "The context Hiloomy reasons against. A calendar event raises urgency or changes interpretation — it never justifies a recommendation on its own.")}>
          <p className="text-base font-medium">{r.context.summaryLine[locale]}</p>

          {r.context.events.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {r.context.events.slice(0, 2).map((ev) => {
                const e = ev.calendarEvent;
                const live = ev.state === "active" || ev.state === "starts_today";
                return (
                  <Card key={e.id} className="space-y-4 p-5">
                    {/* Calendar event — system fact */}
                    <div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-lg font-semibold">{e.name[locale]}</h3>
                        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", live ? "bg-success/15 text-success" : ev.daysUntil <= 3 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{ev.timeLabel[locale]}</span>
                      </div>
                      <p className="text-sm">{ev.dateRange[locale]}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("אירוע בלוח השנה", "Calendar event")} · {t("מקור", "Source")}: {e.sourceLabel[locale]} · {e.hebrewDate}
                      </p>
                    </div>

                    {/* Linked initiatives — brand intent, with their OWN dates */}
                    <div className="space-y-3 border-t border-border pt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("יוזמות מסחריות שקשורות לאירוע", "Commercial initiatives linked to this event")}</p>
                      {ev.linkedInitiatives.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("אין בתוכנית יוזמה שמקושרת לאירוע הזה.", "No initiative in the plan is linked to this event.")}</p>
                      ) : (
                        ev.linkedInitiatives.slice(0, 3).map((li) => (
                          <div key={li.id} className="space-y-1 text-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="font-semibold">{li.title}</p>
                              <span className={cn("rounded px-2 py-0.5 text-xs font-medium", li.linkState === "confirmed" ? "bg-muted text-foreground" : "bg-warning/15 text-warning")}>{li.linkState === "confirmed" ? t("קישור מאושר", "Confirmed link") : t("קישור משוער — לא אושר", "Suggested link — unconfirmed")}</span>
                            </div>
                            <p>
                              {fmtDate(li.startDate)} – {fmtDate(li.endDate)} · {li.timeLabel[locale]}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("יוזמה מסחרית", "Commercial initiative")} · {t("מקור: התוכנית המסחרית", "Source: commercial plan")}
                            </p>
                            {li.linkState === "suggested" ? (
                              <div className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
                                <p>{t(`נראה שהיוזמה "${li.title}" קשורה ל${e.name.he}. לקשר?`, `It looks like "${li.title}" relates to ${e.name.en}. Link it?`)}</p>
                                <p className="text-muted-foreground">{li.linkReason[locale]}</p>
                                {r.context.sheetId ? <ConfirmLinkButton sheetId={r.context.sheetId} initiativeId={li.id} eventId={e.id} label={t("כן, לקשר", "Yes, link it")} /> : null}
                              </div>
                            ) : null}
                            {/* Decision — what the manager must decide */}
                            <div className="pt-1">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("החלטה", "Decision")}</p>
                              {li.openQuestion ? (
                                <>
                                  <p className="font-medium">{li.openQuestion[locale]}</p>
                                  {li.openDecisionHref ? (
                                    <Link href={li.openDecisionHref as never} className="font-semibold underline-offset-4 hover:underline">
                                      {t("לקבלה", "Open the receipt")} →
                                    </Link>
                                  ) : null}
                                </>
                              ) : (
                                <p className="text-muted-foreground">{t("אין כרגע החלטה פתוחה על היוזמה.", "No open decision on this initiative.")}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {t("חלון ההחלטה", "Decision window")}: {li.decisionWindow ? `${fmtDate(li.decisionWindow.start)} – ${fmtDate(li.decisionWindow.end)}` : t("אין נקודת החלטה פתוחה בתוכנית", "no open decision point in the plan")} · {t(`${li.relatedDecisionCount} החלטות קשורות · ${li.openDecisionCount} פתוחות`, `${li.relatedDecisionCount} related · ${li.openDecisionCount} open`)}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {ev.decisionUrgency ? <p className="text-sm font-medium text-warning">{ev.decisionUrgency[locale]}</p> : null}
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("אין אירוע בלוח השנה ב-30 הימים הקרובים.", "No calendar event within the next 30 days.")}</p>
          )}

          {/* Campaign windows with NO calendar event — the mandatory fallback: never headed with the event name */}
          {r.context.windows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("יוזמות מסחריות ללא אירוע מקושר", "Commercial initiatives without a linked event")}</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {r.context.windows.slice(0, 2).map((w) => {
                  const live = w.state === "active" || w.state === "starts_today";
                  return (
                    <Card key={w.id} className="space-y-3 p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-base font-semibold">{w.campaignTitle[locale]}</h3>
                        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", live ? "bg-success/15 text-success" : w.state === "starts_soon" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{w.urgency[locale]}</span>
                      </div>
                      <p className="text-sm">
                        {fmtDate(w.start)} – {fmtDate(w.end)} · {live ? t(`הקמפיין פעיל עד ${fmtDate(w.end)}`, `the campaign is active until ${fmtDate(w.end)}`) : t(`הקמפיין מתחיל בעוד ${w.daysUntil} ימים`, `the campaign starts in ${w.daysUntil} days`)}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("יוזמה מסחרית · מקור: התוכנית המסחרית · לא מקושרת לאירוע בלוח השנה", "Commercial initiative · Source: commercial plan · not linked to a calendar event")}</p>
                      <ul className="text-sm">
                        <li>{t(`${w.initiativeCount} מהלכים קשורים`, `${w.initiativeCount} initiatives tied to this window`)}{w.startingToday ? t(` · ${w.startingToday} מתחילים היום`, ` · ${w.startingToday} starting today`) : ""}</li>
                        <li>{t(`${w.relatedDecisions} החלטות קשורות · ${w.openDecisions} פתוחות`, `${w.relatedDecisions} related decisions · ${w.openDecisions} open`)}</li>
                        <li className={w.thinStockProducts ? "text-warning" : undefined}>{w.thinStockProducts ? t(`${w.thinStockProducts} מוצרי המהלך עם פחות מ-14 ימי מלאי`, `${w.thinStockProducts} of the window's products have under 14 days of stock`) : t("אין מוצר קשור עם מלאי דק", "No tied product is thin on stock")}</li>
                        <li className="text-muted-foreground">{t("חלון ההחלטה", "Decision window")}: {w.decisionWindow ? `${fmtDate(w.decisionWindow.start)} – ${fmtDate(w.decisionWindow.end)}` : t("אין נקודת החלטה פתוחה", "no open decision point")}</li>
                      </ul>
                      <div className="border-t border-border pt-3 text-sm">
                        {w.openQuestion ? (
                          <>
                            <p className="text-xs font-medium uppercase tracking-wide text-warning">{t("דורש תשומת לב", "Requires attention")}</p>
                            <p className="font-medium">{w.openQuestion[locale]}</p>
                            {w.openDecisionHref ? (
                              <Link href={w.openDecisionHref as never} className="font-semibold underline-offset-4 hover:underline">
                                {t("לקבלה", "Open the receipt")} →
                              </Link>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-muted-foreground">{t("אין כרגע החלטה נדרשת.", "No decision currently required.")}</p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : r.context.calendarSource === null ? (
            <p className="text-sm text-muted-foreground">{t("אין תוכנית מסחרית מחוברת — אין יוזמות להציג מול לוח השנה.", "No commercial plan connected — there are no initiatives to show against the calendar.")}</p>
          ) : null}

          {r.context.mostUrgent ? (
            <div className="border-s-2 border-foreground ps-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ההחלטה הדחופה ביותר", "The most urgent decision")}</p>
              <p className="text-sm font-semibold">{r.context.mostUrgent.question[locale]}</p>
              <p className="text-xs text-muted-foreground">{r.context.mostUrgent.why[locale]}</p>
              <Link href={r.context.mostUrgent.href as never} className="text-sm font-semibold underline-offset-4 hover:underline">
                {t("לקבלה", "Open the receipt")} →
              </Link>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t(`תאריכי אירועים: ${r.context.calendarSources.map((s) => s.he).join(", ")} (דיוק ברמת יום; החג מתחיל בשקיעה בתאריך ההתחלה). תאריכי קמפיינים: התוכנית המסחרית. קישור משוער הוא הצעה לפי מילים ותאריכים — לא עובדה — עד שהמנהל מאשר. תזמון לוח השנה מוצג כאן ועדיין לא משפיע על דירוג ההחלטות בהיום.`, `Event dates: ${r.context.calendarSources.map((s) => s.en).join(", ")} (date-level precision; a holiday begins at sunset on its start date). Campaign dates: the commercial plan. A suggested link is a word-and-date rule, not a fact, until the manager confirms it. Calendar timing is shown here and is not yet used in decision ranking.`)}
          </p>
        </Section>

        {/* 2 — What Hiloomy checked */}
        <Section title={t("מה הילומי בדקה?", "What Hiloomy checked")} intro={r.compression.asOf ? t(`לפי הבדיקה האחרונה (${ago(r.compression.asOf, now, true)}). 'נבדק' בלי החלטה = הילומי הסתכלה ובחרה לא להפריע.`, `As of the last check (${ago(r.compression.asOf, now, false)}). 'Checked' with no decision = Hiloomy looked and chose not to interrupt.`) : t("עדיין לא נרשמה בדיקה בתקופה — המצב לפי בריאות הנתונים בלבד.", "No check recorded in the period yet — states come from Data Health only.")}>
          {r.coverageSummary.checkedDomains > 0 ? (
            <p className="text-base font-medium">
              {t(`הילומי בדקה ${r.coverageSummary.checkedDomains} תחומים. `, `Hiloomy checked ${r.coverageSummary.checkedDomains} domains. `)}
              {r.coverageSummary.domainsWithSurfaced === 0 ? t(`אף אחד לא הניב החלטה ${periodLabel}.`, `None produced a decision ${periodLabel}.`) : t(`רק ${r.coverageSummary.domainsWithSurfaced} הניבו החלטות ששווה להציג ${periodLabel}.`, `Only ${r.coverageSummary.domainsWithSurfaced} produced decisions worth surfacing ${periodLabel}.`)}
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {[t("תחום", "Domain"), t("מצב", "State"), t("נבדקו (בדיקה אחרונה)", "Checked (last check)"), t("מועמדים (בדיקה אחרונה)", "Candidates (last check)"), t("הוצגו (תקופה)", "Surfaced (period)"), t("רעננות הנתונים", "Data freshness"), ""].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-start font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.coverage.map((c) => {
                  const e = ELIGIBILITY[c.eligibility];
                  const evaluated = c.eligibility === "checked" || c.eligibility === "partial";
                  // Zero surfaced, explained only with facts the audit actually recorded.
                  const zeroNote =
                    evaluated && c.surfaced === 0
                      ? c.candidates !== null && c.candidates > 0 && c.candidatesOnToday === 0
                        ? t(`${c.candidates} מועמדים נבדקו ולא עברו את סף העדיפות הכללי.`, `${c.candidates} candidate${c.candidates === 1 ? " was" : "s were"} evaluated but did not pass the global priority threshold.`)
                        : c.candidates !== null && c.candidates > 0
                          ? t(`${c.candidates} מועמדים; ${c.candidatesOnToday} הגיעו להיום בבדיקה האחרונה, אף אחד לא בתקופה שנבחרה.`, `${c.candidates} candidates; ${c.candidatesOnToday} reached Today at the last check, none in the selected period.`)
                          : c.candidates === 0
                            ? t("נבדק — אף מצב לא הגיע לרמת מועמד.", "Checked — no situation reached candidate level.")
                            : t("נבדק — אין כרגע החלטה שמצדיקה תשומת לב.", "Checked — nothing currently deserves attention.")
                      : "";
                  return (
                    <tr key={c.domain} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{c.label[locale]}</td>
                      <td className="px-3 py-2">
                        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", e.cls)}>{isHe ? e.he : e.en}</span>
                      </td>
                      <td className="px-3 py-2">{c.checkedCount !== null ? `${c.checkedCount} ${c.checkedUnit ?? ""}` : evaluated ? t("טרם נספר", "not counted yet") : ""}</td>
                      <td className="px-3 py-2">{evaluated ? (c.candidates ?? t("טרם נספר", "not counted yet")) : ""}</td>
                      <td className="px-3 py-2">{evaluated || c.surfaced > 0 ? c.surfaced : ""}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{c.sourceSyncedAt ? `${c.sourceSyncLabel?.[locale] ?? ""} ${ago(c.sourceSyncedAt, now, isHe)}` : c.eligibility === "not_eligible" ? "" : t("אין חותמת סנכרון", "no sync timestamp")}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{c.reason ? c.reason[locale] : zeroNote}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t("נבדק = המנוע רץ על נתונים מלאים. נבדק חלקית = רץ, אבל חסר לו מידע (למשל עלויות). לא נבדק = אין מקור מחובר או אין מנוע. טרם נמדד = לא נרשמה בדיקה. 'מועמדים' ו'נבדקו' — מהבדיקה האחרונה; 'הוצגו' — מהתקופה שנבחרה.", "Checked = the engine ran on complete data. Partially checked = it ran with missing inputs (e.g. costs). Not checked = no connected source or no engine. Not measured = no check recorded. 'Candidates' and 'Checked' are from the last check; 'Surfaced' is the selected period.")}</p>
          {r.dominance ? (
            <p className="text-sm">
              {t(`${r.dominance.surfaced} מתוך ${r.dominance.total} ההחלטות ${periodLabel} הן ${r.dominance.label.he}. אי אפשר לדעת מהעמוד הזה אם זה מצב עסקי אמיתי או הטיה של הדירוג — `, `${r.dominance.surfaced} of ${r.dominance.total} decisions ${periodLabel} are ${r.dominance.label.en}. This page cannot tell whether that is a real business condition or a ranking bias — `)}
              <Link href={"/decision-audit" as never} className="font-semibold underline-offset-4 hover:underline">
                {t("בדיקת ההטיה בביקורת ההחלטות", "see the bias diagnostic in the Decision Audit")} →
              </Link>
            </p>
          ) : null}
        </Section>

        {/* 3 — Attention compression: ONE audit pass, monotone by construction */}
        <Section title={t("דחיסת תשומת לב", "Attention compression")} intro={t("הילומי לא מציגה כל שינוי. היא מסננת אותות עסקיים לכמה החלטות שמצדיקות תשומת לב ניהולית. כל שלושת המספרים — מאותה בדיקה.", "Hiloomy does not surface every change. It compresses business signals into the few decisions that deserve management attention. All three numbers come from the same check.")}>
          {r.compression.rawSignals !== null && r.compression.candidates !== null && r.compression.candidatesOnToday !== null ? (
            <>
              <ol className="flex flex-col gap-2 sm:flex-row sm:gap-0">
                {[
                  { n: r.compression.rawSignals, label: t("אותות גולמיים", "Raw signals") },
                  { n: r.compression.candidates, label: t("מועמדים ניהוליים", "Management candidates") },
                  { n: r.compression.candidatesOnToday, label: t("הגיעו להיום", "Reached Today") }
                ].map((step, i, arr) => (
                  <li key={step.label} className="flex items-center gap-2 sm:flex-1 sm:flex-col sm:items-start sm:gap-0">
                    <div className="flex items-baseline gap-2 sm:block">
                      <span className="text-3xl font-semibold tabular-nums tracking-tight">{step.n}</span>
                      <span className="text-sm">{step.label}</span>
                    </div>
                    {i < arr.length - 1 ? <span aria-hidden className="text-muted-foreground sm:hidden">↓</span> : null}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">
                {t(`בדיקה אחרונה: ${ago(r.compression.asOf!, now, true)}.`, `Last check: ${ago(r.compression.asOf!, now, false)}.`)}{" "}
                {r.compression.signalsOnToday !== null ? t(`${r.compression.signalsOnToday} אותות בודדים הוצגו ככרטיסים באותה בדיקה.`, `${r.compression.signalsOnToday} individual signals were shown as cards at that check.`) : ""}
              </p>
            </>
          ) : (
            <NotYet title={t("ספירת האותות והמועמדים עדיין לא נרשמה", "Signal and candidate counts are not recorded yet")} body={t("היא נרשמת בבדיקת התעדוף ותופיע אחרי הריצה הבאה.", "They are recorded by the prioritisation audit and appear after the next pass.")} />
          )}
          <p className="text-sm">
            {t(`החלטות שהוצגו ${periodLabel}: `, `Decisions surfaced ${periodLabel}: `)}
            <b className="tabular-nums">{r.compression.surfacedInPeriod}</b>
            <span className="text-muted-foreground"> {t("(מהיומן — החלטות בודדות לאורך התקופה, לא אותו היקף כמו הבדיקה האחרונה)", "(from the ledger — individual decisions across the period, a different scope from the last check)")}</span>
          </p>
        </Section>

        {/* 4 — Validation status + funnel (selected period) */}
        <Card className="space-y-6 p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`אימות · ${periodLabel}`, `Validation · ${periodLabel}`)}</p>
            <h2 className="text-xl font-semibold tracking-tight">{verdict}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {f.surfaced === 0
                ? r.memory.recorded > 0
                  ? t(`נרשמו ${r.memory.recorded} החלטות ${periodLabel}, אבל אף אחת עדיין לא הוצגה בהיום.`, `${r.memory.recorded} decisions were recorded ${periodLabel}, but none was surfaced on Today yet.`)
                  : t("נסו טווח רחב יותר, או פתחו את היום כדי שהמנועים ירוצו.", "Try a wider range, or open Today so the engines run.")
                : t(`הילומי הציפה ${f.surfaced} החלטות ${periodLabel}.`, `Hiloomy surfaced ${f.surfaced} decisions ${periodLabel}.`)}
            </p>
          </div>

          {f.surfaced > 0 ? (
            <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
              {funnelSteps.map((step, i) => (
                <li key={step.label} className="flex items-center gap-2 sm:flex-1 sm:flex-col sm:items-start sm:gap-0">
                  <div className="flex items-baseline gap-2 sm:block">
                    <span className={cn("text-3xl font-semibold tabular-nums tracking-tight", i > 0 && step.n === 0 && "text-muted-foreground")}>{step.n}</span>
                    <span className="text-sm">{step.label}</span>
                  </div>
                  {i < funnelSteps.length - 1 ? <span aria-hidden className="text-muted-foreground sm:hidden">↓</span> : null}
                </li>
              ))}
            </ol>
          ) : null}

          {f.surfaced > 0 && !hasJudgment ? (
            <p className="text-sm text-muted-foreground">{t("כדי לדעת אם הילומי באמת עוזרת, צריך קודם משוב על ההחלטות שהוצגו.", "To know whether Hiloomy is actually helping, the surfaced decisions need feedback first.")}</p>
          ) : null}

          {r.awaitingFeedback.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium">{t(`${r.awaitingFeedback.length} החלטות מחכות למשוב שלכם`, `${r.awaitingFeedback.length} decisions are waiting for your feedback`)}</p>
              <Link href={(r.awaitingFeedback.length === 1 ? r.awaitingFeedback[0].href : "#awaiting") as never} className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90">
                {t("תנו משוב", "Give feedback")} →
              </Link>
            </div>
          ) : null}
          {f.pending > 0 ? (
            <Link href={"/today" as never} className="inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline">
              {t(`${f.pending} החלטות מחכות לתשובת המנהל בהיום`, `${f.pending} decisions are waiting for the manager on Today`)} →
            </Link>
          ) : null}
        </Card>

        {/* 5 — Action needed: the feedback queue */}
        {r.awaitingFeedback.length > 0 ? (
          <Section title={t("נדרשת פעולה: משוב", "Action needed: feedback")} intro={t("המנהל פעל, אבל עדיין לא אמר איך ההחלטה הייתה. בלי המשוב הזה אי אפשר למדוד את הילומי. המשוב ניתן בקבלה.", "The manager acted but has not yet said how the decision was. Without this feedback Hiloomy cannot be measured. Feedback is given on the receipt.")}>
            <div id="awaiting" className="grid gap-3 lg:grid-cols-2">
              {r.awaitingFeedback.slice(0, 6).map((d) => (
                <Card key={d.id} className="space-y-2 p-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{d.question[locale]}</p>
                    <span className="text-xs text-muted-foreground">
                      {CANDIDATE_DOMAIN_LABEL[d.domain][locale]} · {fmtDate(d.decidedAt ?? d.surfacedAt)}
                    </span>
                  </div>
                  {d.recommendation[locale] ? <p className="text-muted-foreground">{t("ההמלצה", "Recommended")}: {d.recommendation[locale]}</p> : null}
                  <p>
                    {t("המנהל", "Manager")}: {CHOICE_LABEL[d.choice][locale]}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("איך הייתה ההחלטה הזו? מועילה · מובנת מאליה · שגויה · חסר הקשר, והאם היא שינתה את מה שעשיתם.", "How was this decision? Useful · obvious · wrong · missing context, and whether it changed what you did.")}</p>
                  <Link href={d.href as never} className="inline-flex items-center gap-1 rounded-md border border-foreground px-3 py-1 text-sm font-semibold hover:bg-foreground hover:text-background">
                    {t("תנו משוב", "Give feedback")} {displayDecisionId(d.id)} →
                  </Link>
                </Card>
              ))}
            </div>
            {r.awaitingFeedback.length > 6 ? <p className="text-xs text-muted-foreground">{t(`ועוד ${r.awaitingFeedback.length - 6} בזיכרון.`, `And ${r.awaitingFeedback.length - 6} more in Memory.`)}</p> : null}
          </Section>
        ) : null}

        {/* 6 — Plan × Reality (selected period) */}
        <Section title={t("האם המציאות שינתה את התוכנית?", "Did reality change the plan?")} intro={t(`הילומי משווה את התוכנית המסחרית למה שקורה בפועל ומציפה נקודות שבהן כדאי לעצור ולבחון מחדש. ${periodLabel}.`, `Hiloomy compares the commercial plan with what is actually happening and surfaces the points where it is worth stopping to re-examine. Scope: ${periodLabel}.`)}>
          {r.plan.surfaced === 0 ? (
            <NotYet title={t("לא הוצגו החלטות תוכנית בתקופה", "No plan decisions were surfaced in the period")} body={t("הן נוצרות כשחלון של נקודת החלטה בגאנט מגיע.", "They appear when a decision hook's window in the Gantt arrives.")} />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                {r.plan.initiativesEvaluated !== null ? <Count n={r.plan.initiativesEvaluated} label={t("מהלכים שנבדקו (בדיקה אחרונה)", "Initiatives evaluated (last check)")} /> : null}
                <Count n={r.plan.surfaced} label={t("החלטות תוכנית שהוצגו", "Plan decisions surfaced")} sub={r.plan.changePlanStatus ? t(`${r.plan.changePlanStatus} עם המלצה לשנות את התוכנית`, `${r.plan.changePlanStatus} recommended changing the plan`) : undefined} />
                {planPending > 0 ? <Count n={planPending} label={t("מחכות לתשובת המנהל", "Awaiting the manager's answer")} muted /> : null}
                {r.plan.acted > 0 ? <Count n={r.plan.changedPlan} label={t("שינו את התוכנית", "Changed the plan")} sub={r.plan.optionUnknown ? t(`${r.plan.optionUnknown} ללא אפשרות רשומה`, `${r.plan.optionUnknown} with no recorded option`) : undefined} /> : null}
                {r.plan.acted > 0 ? <Count n={r.plan.continuedAsPlanned} label={t("המשיכו כמתוכנן", "Continued as planned")} /> : null}
              </div>
              {r.plan.acted === 0 ? <p className="text-sm text-muted-foreground">{t(`${r.plan.surfaced} החלטות תוכנית עדיין ממתינות לתשובה.`, `${r.plan.surfaced} plan decisions are still awaiting an answer.`)}</p> : null}
              {r.plan.judged > 0 ? <p className="text-sm">{t(`${r.plan.useful} מתוך ${r.plan.judged} עם משוב סומנו כמועילות · ${r.plan.changed} שינו את מה שהמנהל עשה.`, `${r.plan.useful} of ${r.plan.judged} with feedback were marked useful · ${r.plan.changed} changed what the manager did.`)}</p> : null}
            </div>
          )}
        </Section>

        {/* 7 — Decision quality (only with at least one judgment) */}
        {hasJudgment ? (
          <Section title={t("האם ההחלטות באמת מועילות?", "Are the decisions actually useful?")} intro={enoughJudged ? t(`על בסיס ${j.total} החלטות שקיבלו משוב ${periodLabel}.`, `Based on ${j.total} decisions with feedback ${periodLabel}.`) : t(`סימן מוקדם: ${j.total} מתוך ${MIN_JUDGED_FOR_RATE} החלטות עם משוב שנצטרך לפני שהמדד יהיה שימושי (${periodLabel}).`, `Early signal: ${j.total} of the ${MIN_JUDGED_FOR_RATE} judged decisions needed before this is meaningful (${periodLabel}).`)}>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
              <Ratio n={j.useful} d={j.total} label={t("סומנו כמועילות", "Marked useful")} />
              <Ratio n={j.highValue} d={j.total} label={t("בעלות ערך גבוה", "High value")} />
              <Ratio n={j.obvious} d={j.total} label={t("מובנות מאליהן", "Obvious")} tone={obviousShare >= 0.5 ? "warning" : undefined} />
              <Ratio n={j.wrong} d={j.total} label={t("שגויות", "Wrong")} tone={wrongShare >= 0.2 ? "danger" : undefined} />
              <Ratio n={j.missingContext} d={j.total} label={t("חסר הקשר", "Missing context")} />
            </div>
            <p className="text-xs text-muted-foreground">{t("החלטה בעלת ערך גבוה = החלטה שהמנהל סימן כמועילה ולא מובנת מאליה. תגיות יכולות לחפוף.", "High value = marked useful and not obvious. Tags can overlap.")}</p>
            {obviousShare >= 0.5 ? <p className="text-sm text-warning">{t(`${j.obvious} מתוך ${j.total} סומנו כמובנות מאליהן — תוצאה חלשה גם כשהן מועילות.`, `${j.obvious} of ${j.total} were marked obvious — a weak result even when they are useful.`)}</p> : null}
            {wrongShare >= 0.2 ? <p className="text-sm text-danger">{t(`${j.wrong} מתוך ${j.total} סומנו כשגויות.`, `${j.wrong} of ${j.total} were marked wrong.`)}</p> : null}
          </Section>
        ) : f.surfaced > 0 ? (
          <NotYet title={t("עדיין אין מספיק משוב", "Not enough feedback yet")} body={t("ברגע שהמנהלים ישפטו החלטות, נוכל למדוד אילו החלטות היו מועילות, מובנות מאליהן, שגויות או חסרות הקשר.", "Once managers judge decisions, we can measure which were useful, obvious, wrong or missing context.")} />
        ) : null}

        {/* 8 — Behaviour change (only with at least one explicit answer) */}
        {hasBehaviourAnswer ? (
          <Section title={t("האם הילומי שינתה את מה שהמנהל עשה?", "Did Hiloomy change what the manager did?")} intro={t("אישור כיוון קיים אינו כישלון — אבל הוא נבדל משינוי פעולה בפועל.", "Confirming an existing direction is not a failure — but it is distinct from an actual change in action.")}>
            <div className="grid grid-cols-3 gap-6">
              <Count n={j.changed} label={t("שינו פעולה", "Changed an action")} />
              <Count n={j.confirmed} label={t("אישרו כיוון קיים", "Confirmed the existing direction")} />
              <Count n={f.surfaced - j.changedAnswered} label={t("עדיין לא נענו", "Not answered yet")} muted />
            </div>
          </Section>
        ) : null}

        {/* 9 — Outcomes (only when measured) */}
        {hasOutcomes ? (
          <Section title={t("מה קרה אחרי ההחלטה?", "What happened after the decision?")} intro={t("נמדד ימים אחרי החלטה שהמנהל ענה עליה. זו התוצאה אחרי ההחלטה — לא הוכחה שהילומי גרמה לה, ולא כסף.", "Measured days after a decision the manager answered. It is what happened after the decision — not proof Hiloomy caused it, and not money.")}>
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
              <Ratio n={r.outcomes.measured} d={r.outcomes.eligible} label={t("נמדדו מתוך החלטות שנענו", "Measured of answered decisions")} />
              <Segments
                total={r.outcomes.measured}
                parts={[
                  { label: OUTCOME_LABEL.win[locale], n: r.outcomes.win, cls: "bg-success" },
                  { label: OUTCOME_LABEL.neutral[locale], n: r.outcomes.neutral, cls: "bg-muted-foreground/50" },
                  { label: OUTCOME_LABEL.miss[locale], n: r.outcomes.miss, cls: "bg-danger" },
                  { label: OUTCOME_LABEL.no_data[locale], n: r.outcomes.noData, cls: "bg-border" }
                ]}
              />
            </div>
            {measurable > 0 ? <p className="text-sm">{t(`${r.outcomes.win} מתוך ${measurable} עם תוצאה מדידה הסתיימו בשיפור.`, `${r.outcomes.win} of ${measurable} with a measurable outcome ended in an improvement.`)}</p> : null}
          </Section>
        ) : f.acted > 0 ? (
          <NotYet title={t("עדיין אין תוצאות מדודות", "No measured outcomes yet")} body={t("אחרי החלטה הילומי מחכה לחלון המדידה שלה. כשהתוצאה תהיה זמינה היא תופיע כאן.", "After a decision Hiloomy waits for its measurement window. When the outcome is available it appears here.")} />
        ) : null}

        {/* 10 — Stories: only decisions with follow-through (a judgment or an outcome) */}
        {r.stories.length > 0 ? (
          <Section title={t("החלטות ששווה ללמוד מהן", "Decisions worth learning from")} intro={t("רק החלטות שיש להן המשך: מה הוחלט, מה המנהל אמר, ומה קרה.", "Only decisions with follow-through: what was decided, what the manager said, and what happened.")}>
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
                    {s.whyNow[locale] ? (
                      <>
                        <dt className="text-muted-foreground">{t("למה הופיעה", "Why it appeared")}</dt>
                        <dd>{s.whyNow[locale]}</dd>
                      </>
                    ) : null}
                    <dt className="text-muted-foreground">{t("הילומי המליצה", "Hiloomy recommended")}</dt>
                    <dd>{s.recommendation[locale] || t("ללא המלצה", "No recommendation")}</dd>
                    <dt className="text-muted-foreground">{t("המנהל בחר", "Manager chose")}</dt>
                    <dd>{CHOICE_LABEL[s.choice][locale]}</dd>
                    <dt className="text-muted-foreground">{t("משוב", "Feedback")}</dt>
                    <dd>{s.judgment.length ? s.judgment.map((tag) => JUDGMENT_LABEL[tag][locale]).join(" · ") : t("טרם נענה", "Not answered")}</dd>
                    <dt className="text-muted-foreground">{t("שינה פעולה?", "Changed an action?")}</dt>
                    <dd>{s.changedDecision === null ? t("טרם נענה", "Not answered") : s.changedDecision ? t("כן", "Yes") : t("לא", "No")}</dd>
                    <dt className="text-muted-foreground">{t("תוצאה", "Outcome")}</dt>
                    <dd className={s.outcome ? OUTCOME_LABEL[s.outcome].cls : "text-muted-foreground"}>
                      {s.outcome ? OUTCOME_LABEL[s.outcome][locale] : t("עדיין לא נמדד", "Not measured yet")}
                      {s.outcomeSummary?.[locale] ? <span className="text-muted-foreground"> — {s.outcomeSummary[locale]}</span> : null}
                    </dd>
                  </dl>
                  <Link href={s.href as never} className="inline-flex text-sm font-semibold underline-offset-4 hover:underline">
                    {t("לקבלה", "Receipt")} {displayDecisionId(s.id)} →
                  </Link>
                </Card>
              ))}
            </div>
          </Section>
        ) : f.acted > 0 ? (
          <NotYet title={t("עדיין אין החלטות עם מספיק המשך כדי ללמוד מהן.", "No decisions with enough follow-through to learn from yet.")} body={t("ברגע שנדע מה הוחלט ומה קרה אחר כך, החלטות משמעותיות יופיעו כאן.", "Once we know what was decided and what happened next, meaningful decisions appear here.")} />
        ) : null}

        {/* 11 — Domains: quality by domain, only once judgments exist (coverage above shows origin) */}
        {r.domains.length > 0 && hasJudgment ? (
          <Section title={t("לפי תחום החלטה", "By decision domain")} intro={t(`איפה הילומי מועילה, ואילו מנועים מייצרים החלטות מובנות מאליהן או שגויות. ${periodLabel}.`, `Where Hiloomy is useful, and which engines produce obvious or wrong decisions. Scope: ${periodLabel}.`)}>
            {(
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      {[t("תחום", "Domain"), t("הוצגו", "Surfaced"), t("קיבלו משוב", "Feedback"), t("מועיל", "Useful"), t("ערך גבוה", "High value"), ...(hasBehaviourAnswer ? [t("שינו פעולה", "Changed")] : []), t("מובן מאליו", "Obvious"), t("שגוי", "Wrong"), ...(hasOutcomes ? [t("שיפור / נמדד", "Win / measured")] : [])].map((h) => (
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
                        <td className="px-3 py-2">{d.judged ? `${d.useful} / ${d.judged}` : t("טרם", "none yet")}</td>
                        <td className="px-3 py-2">{d.judged ? `${d.highValue} / ${d.judged}` : t("טרם", "none yet")}</td>
                        {hasBehaviourAnswer ? <td className="px-3 py-2">{d.judged ? d.changed : t("טרם", "none yet")}</td> : null}
                        <td className={cn("px-3 py-2", d.judged && d.obvious / d.judged >= 0.5 && "text-warning")}>{d.judged ? `${d.obvious} / ${d.judged}` : t("טרם", "none yet")}</td>
                        <td className={cn("px-3 py-2", d.judged && d.wrong / d.judged >= 0.2 && "text-danger")}>{d.judged ? `${d.wrong} / ${d.judged}` : t("טרם", "none yet")}</td>
                        {hasOutcomes ? <td className="px-3 py-2">{d.measured ? `${d.win} / ${d.measured}` : t("טרם", "none yet")}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        ) : null}

        {/* 12 — Time to decision (only with at least one measured pair) */}
        {hasTiming ? (
          <Section title={t("כמה מהר מתקבלות החלטות?", "How fast are decisions made?")} intro={t("זמן מרגע שהחלטה הוצגה ועד שהמנהל פעל. אין נקודת ייחוס מלפני הילומי, ולכן זה לא 'מהר יותר' — זה פשוט הזמן.", "Time from a decision being surfaced to the manager acting. There is no pre-Hiloomy baseline, so this is not 'faster' — it is simply the time.")}>
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <Count n={formatDuration(r.timing.medianMs!, locale)} label={t("חציון", "Median")} sub={t(`${r.timing.sample} החלטות`, `${r.timing.sample} decisions`) + (r.timing.sample < MIN_TIMING_SAMPLE ? ` · ${t("מדגם קטן", "small sample")}` : "")} />
              <Count n={formatDuration(r.timing.fastestMs!, locale)} label={t("המהירה ביותר", "Fastest")} />
              <Count n={formatDuration(r.timing.slowestMs!, locale)} label={t("האיטית ביותר", "Slowest")} />
              <Count n={r.timing.pending} label={t("עדיין ממתינות", "Still pending")} muted />
            </div>
            {r.timing.sample >= MIN_TIMING_SAMPLE ? (
              <Segments
                total={r.timing.sample}
                parts={[
                  { label: t("פחות משעה", "< 1h"), n: r.timing.buckets.under1h, cls: "bg-foreground" },
                  { label: t("1–4 שעות", "1–4h"), n: r.timing.buckets.h1to4, cls: "bg-foreground/70" },
                  { label: t("4–24 שעות", "4–24h"), n: r.timing.buckets.h4to24, cls: "bg-foreground/50" },
                  { label: t("1–3 ימים", "1–3d"), n: r.timing.buckets.d1to3, cls: "bg-foreground/30" },
                  { label: t("מעל 3 ימים", "> 3d"), n: r.timing.buckets.over3d, cls: "bg-foreground/15" }
                ]}
              />
            ) : null}
          </Section>
        ) : f.surfaced > 0 ? (
          <NotYet title={t("עדיין אין מספיק החלטות סגורות למדוד זמן החלטה.", "Not enough closed decisions to measure time to decision yet.")} body={f.pending > 0 ? t(`${f.pending} החלטות עדיין ממתינות לתשובה בהיום.`, `${f.pending} decisions are still awaiting an answer on Today.`) : t("הזמן נמדד מהצגת ההחלטה ועד שהמנהל פועל.", "Time is measured from surfacing to the manager acting.")} />
        ) : null}

        {/* 13 — Memory: ALL TIME, with the period as a sub-line */}
        <Section title={t("זיכרון החלטות · כל הזמן", "Decision Memory · all time")} intro={t("נאספת היסטוריה שממנה הילומי תוכל לזהות דפוסים חוזרים. המספרים כאן הם מאז ההחלטה הראשונה, לא לפי התקופה שנבחרה.", "Decision history is accumulating so repeated patterns can be identified over time. These numbers are since the first decision, not the selected period.")}>
          <div className="grid grid-cols-3 gap-6 sm:max-w-xl">
            <Count n={r.memory.allTime.recorded} label={t("החלטות שנרשמו", "Decisions recorded")} sub={days !== null ? t(`${r.memory.recorded} ${periodLabel}`, `${r.memory.recorded} ${periodLabel}`) : undefined} />
            <Count n={r.memory.allTime.withJudgment} label={t("עם משוב", "With feedback")} sub={days !== null ? t(`${r.memory.withJudgment} ${periodLabel}`, `${r.memory.withJudgment} ${periodLabel}`) : undefined} />
            <Count n={r.memory.allTime.withOutcome} label={t("עם תוצאה מדודה", "With a measured outcome")} sub={days !== null ? t(`${r.memory.withOutcome} ${periodLabel}`, `${r.memory.withOutcome} ${periodLabel}`) : undefined} />
          </div>
          <p className="text-sm text-muted-foreground">{t("פרקים ברי-השוואה: עדיין אין מספיק פרקים דומים להשוואה, ואין עדיין הגדרה אמינה למצב דומה.", "Comparable episodes: not enough similar episodes yet, and no reliable definition of a similar situation exists yet.")}</p>
          {r.memory.learnings.length ? (
            <ul className="space-y-1 text-sm">
              {r.memory.learnings.map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                  <span>{l[locale]}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        {r.notes.length ? (
          <div className="text-xs text-muted-foreground">
            <p className="font-medium">{t("הערות על הנתונים", "Notes on the data")}</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-5">
              {r.notes.map((n, i) => (
                <li key={i}>{n[locale]}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
