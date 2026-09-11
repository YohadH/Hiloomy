// Decision Impact — a management decision surface, not a diagnostics panel.
//
// The eye should travel: what is happening now → what I must decide →
// did Hiloomy see the whole business → how much noise it removed → is it
// proving useful. Explanations of HOW Hiloomy arrived at a number sit
// behind "details" disclosures. Three states stay distinct: NOT MEASURED
// YET, a MEASURED ZERO, and MISSING DATA. Nothing financial, no causality,
// no single score. ?days=7|30|90|all · ?domain=<candidate domain>.
//
// Presentation only — every number comes from `buildDecisionImpactReport`.

import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { ConfirmLinkButton } from "@/components/decision-impact/confirm-link-button";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  buildDecisionImpactReport,
  formatDuration,
  parseImpactDays,
  MIN_JUDGED_FOR_RATE,
  MIN_TIMING_SAMPLE,
  type CoverageEligibility,
  type CoverageRow,
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

// Semantic colour only: green = checked, amber = partial / attention,
// red = missing important data, grey = not checked. Never red for "0 surfaced".
const ELIGIBILITY: Record<CoverageEligibility, { he: string; en: string; cls: string }> = {
  checked: { he: "נבדק", en: "Checked", cls: "bg-success/15 text-success" },
  partial: { he: "נבדק חלקית", en: "Partial", cls: "bg-warning/15 text-warning" },
  not_eligible: { he: "לא נבדק", en: "Not checked", cls: "bg-muted text-muted-foreground" },
  missing_data: { he: "חסר מידע", en: "Missing data", cls: "bg-danger/10 text-danger" },
  not_measured: { he: "טרם נמדד", en: "Not measured", cls: "bg-muted text-muted-foreground" }
};

const UNIT_HE: Record<string, string> = {
  products: "מוצרים",
  "products with a real cost": "מוצרים עם עלות",
  campaigns: "קמפיינים",
  initiatives: "מהלכים",
  competitors: "מתחרים",
  "attributed orders": "הזמנות משויכות",
  orders: "הזמנות"
};

// ---------------------------------------------------------------------------
// Small presentational pieces. No cards unless the thing is an object.

function Chip({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "solid"; className?: string }) {
  const cls = { neutral: "bg-muted text-muted-foreground", success: "bg-success/15 text-success", warning: "bg-warning/15 text-warning", danger: "bg-danger/10 text-danger", solid: "bg-foreground text-background" }[tone];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", cls, className)}>{children}</span>;
}

function SectionHead({ title, label }: { title: string; label?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {label ? <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span> : null}
    </div>
  );
}

// One process, several stages: a horizontal flow on desktop, vertical on
// mobile. Arrows follow the reading direction.
function Flow({ stages, fwd, size = "md" }: { stages: Array<{ n: number | string; label: string; muted?: boolean }>; fwd: string; size?: "md" | "lg" }) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      {stages.map((s, i) => (
        <li key={s.label} className="contents">
          <div className="flex items-baseline gap-2">
            <span className={cn("font-semibold tabular-nums tracking-tight", size === "lg" ? "text-3xl" : "text-2xl", s.muted && "text-muted-foreground")}>{s.n}</span>
            <span className="text-sm text-muted-foreground">{s.label}</span>
          </div>
          {i < stages.length - 1 ? (
            <span aria-hidden className="text-muted-foreground">
              <span className="sm:hidden">↓</span>
              <span className="hidden sm:inline">{fwd}</span>
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Stat({ n, label, sub }: { n: number | string; label: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{n}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{summary}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

// "לפני 12 דקות" — compact relative time; the absolute time sits in a title attribute.
function agoShort(iso: string, now: Date, isHe: boolean): string {
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return isHe ? `לפני ${d} ימים` : `${d}d ago`;
  if (h >= 1) return isHe ? `לפני ${h} שעות` : `${h}h ago`;
  return isHe ? `לפני ${Math.max(1, m)} דקות` : `${Math.max(1, m)}m ago`;
}

export default async function DecisionImpactPage({ searchParams }: { searchParams: Promise<{ days?: string; domain?: string }> }) {
  const locale = (await getAppLocale()) as Locale;
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fwd = isHe ? "←" : "→";
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
  const now = new Date(r.generatedAt);
  const fmtDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(isHe ? "he-IL" : "en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : "");
  const fmtRange = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);
  const unit = (u: string | null) => (u ? (isHe ? (UNIT_HE[u] ?? u) : u) : "");
  const periodLabel = days === null ? t("כל הזמן", "All time") : t(`${days} הימים האחרונים`, `Last ${days} days`);
  const f = r.funnel;
  const j = r.judgments;
  const ctx = r.context;
  const hasJudgment = j.total > 0;
  const enoughJudged = j.total >= MIN_JUDGED_FOR_RATE;
  const hasOutcomes = r.outcomes.measured > 0;
  const hasBehaviourAnswer = j.changedAnswered > 0;
  const hasTiming = r.timing.sample > 0;
  const measurable = r.outcomes.win + r.outcomes.neutral + r.outcomes.miss;
  const evaluated = r.coverage.filter((c) => c.eligibility === "checked" || c.eligibility === "partial");
  const notEvaluated = r.coverage.filter((c) => !(c.eligibility === "checked" || c.eligibility === "partial"));
  const pending = f.pending;
  const awaiting = r.awaitingFeedback.length;
  const primary = ctx.mostUrgent;

  // Context chips: only facts that exist.
  const chips: Array<{ text: string; tone?: "neutral" | "success" | "warning" }> = [];
  const e0 = ctx.events[0];
  if (e0) chips.push({ text: `${e0.calendarEvent.name[locale]} · ${e0.state === "starts_today" ? t("היום", "today") : e0.state === "active" ? t(`עד ${fmtDate(e0.calendarEvent.endDate)}`, `until ${fmtDate(e0.calendarEvent.endDate)}`) : fmtRange(e0.calendarEvent.startDate, e0.calendarEvent.endDate)}`, tone: e0.state === "active" || e0.state === "starts_today" ? "success" : "neutral" });
  if (ctx.summary.activeInitiatives !== null) chips.push({ text: t(`${ctx.summary.activeInitiatives} מהלכים פעילים`, `${ctx.summary.activeInitiatives} initiatives active`) });
  if (ctx.summary.campaignsChecked !== null) chips.push({ text: `Meta · ${ctx.summary.campaignsChecked} ${t("קמפיינים", "campaigns")}` });
  chips.push({ text: t(`${ctx.summary.inventoryRisks} סיכוני מלאי`, `${ctx.summary.inventoryRisks} inventory risks`), tone: ctx.summary.inventoryRisks > 0 ? "warning" : "neutral" });
  chips.push({ text: t(`${ctx.summary.pendingDecisions} החלטות פתוחות`, `${ctx.summary.pendingDecisions} open decisions`), tone: ctx.summary.pendingDecisions > 0 ? "warning" : "neutral" });

  const eventChip = (state: string, daysUntil: number, end: string) =>
    state === "starts_today" ? { text: t("היום", "Today"), tone: "success" as const } : state === "active" ? { text: t(`עד ${fmtDate(end)}`, `until ${fmtDate(end)}`), tone: "success" as const } : daysUntil <= 3 ? { text: t(`בעוד ${daysUntil} ימים`, `in ${daysUntil} days`), tone: "warning" as const } : { text: t(`בעוד ${daysUntil} ימים`, `in ${daysUntil} days`), tone: "neutral" as const };

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-12">
        {/* Title + quiet filters */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t("כלים", "Tools")}</p>
            <h1 className="text-3xl font-semibold tracking-tight">{t("השפעת החלטות", "Decision Impact")}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex gap-1">
              {([7, 30, 90, null] as ImpactPeriodDays[]).map((d) => (
                <Link key={String(d)} href={href(d, domain) as never} aria-current={d === days ? "true" : undefined} className={cn("rounded-full px-2.5 py-0.5", d === days ? "bg-foreground font-semibold text-background" : "hover:text-foreground")}>
                  {d === null ? t("כל הזמן", "All time") : t(`${d} ימים`, `${d} days`)}
                </Link>
              ))}
            </span>
            {r.domainsAvailable.length > 1 ? (
              <span className="inline-flex flex-wrap gap-1">
                <Link href={href(days, null) as never} className={cn("rounded-full px-2.5 py-0.5", domain === null ? "bg-foreground font-semibold text-background" : "hover:text-foreground")}>
                  {t("כל התחומים", "All domains")}
                </Link>
                {CANDIDATE_DOMAINS.filter((d) => r.domainsAvailable.includes(d)).map((d) => (
                  <Link key={d} href={href(days, d) as never} className={cn("rounded-full px-2.5 py-0.5", domain === d ? "bg-foreground font-semibold text-background" : "hover:text-foreground")}>
                    {CANDIDATE_DOMAIN_LABEL[d][locale]}
                  </Link>
                ))}
              </span>
            ) : null}
          </div>
        </div>

        {/* 1 — Executive snapshot */}
        <section className="space-y-5">
          <h2 className="text-xl font-semibold tracking-tight">{t("עכשיו בעסק", "In the business now")}</h2>
          <p className="max-w-3xl text-lg leading-relaxed sm:text-xl">{ctx.summaryLine[locale]}</p>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <Chip key={c.text} tone={c.tone}>
                {c.text}
              </Chip>
            ))}
          </div>

          {ctx.events.length > 0 || ctx.windows.length > 0 ? (
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Calendar events — compact rows; a linked initiative nests underneath */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("אירועים מסחריים קרובים", "Upcoming commercial events")}</h3>
                {ctx.events.length === 0 ? <p className="text-sm text-muted-foreground">{t("אין אירוע ב-30 הימים הקרובים.", "No event in the next 30 days.")}</p> : null}
                <ul className="divide-y divide-border">
                  {ctx.events.slice(0, 4).map((ev) => {
                    const e = ev.calendarEvent;
                    const chip = eventChip(ev.state, ev.daysUntil, e.endDate);
                    return (
                      <li key={e.id} className="space-y-2 py-3 first:pt-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-3">
                            <span className="text-base font-semibold">{e.name[locale]}</span>
                            <span className="text-sm text-muted-foreground tabular-nums">{ev.dateRange[locale]}</span>
                          </div>
                          <Chip tone={chip.tone}>{chip.text}</Chip>
                        </div>
                        {ev.linkedInitiatives.slice(0, 3).map((li) => (
                          <div key={li.id} className="ms-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-s-2 border-border ps-3 text-sm">
                            <span aria-hidden className="text-muted-foreground">↳</span>
                            <span className="font-medium">{li.title}</span>
                            <span className="text-muted-foreground tabular-nums">{fmtRange(li.startDate, li.endDate)}</span>
                            {li.linkState === "suggested" ? <Chip tone="warning">{t("קישור מוצע — דורש אישור", "Suggested link — needs confirmation")}</Chip> : null}
                            {li.openDecisionCount > 0 ? <Chip tone="warning">{t(`${li.openDecisionCount} החלטה פתוחה`, `${li.openDecisionCount} open decision`)}</Chip> : null}
                            {li.linkState === "suggested" ? (
                              <details className="basis-full text-xs text-muted-foreground">
                                <summary className="cursor-pointer select-none underline-offset-4 hover:underline">{t("פרטים", "Details")}</summary>
                                <p className="mt-1">{li.linkReason[locale]}</p>
                                {ctx.sheetId ? <ConfirmLinkButton sheetId={ctx.sheetId} initiativeId={li.id} eventId={e.id} label={t("כן, לקשר", "Yes, link it")} /> : null}
                              </details>
                            ) : null}
                          </div>
                        ))}
                        {ev.decisionUrgency ? <p className="ms-4 text-sm text-warning">{ev.decisionUrgency[locale]}</p> : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] text-muted-foreground">{t(`מקור: ${ctx.calendarSources.map((s) => s.he).join(", ")} · יוזמות: התוכנית המסחרית`, `Source: ${ctx.calendarSources.map((s) => s.en).join(", ")} · initiatives: the commercial plan`)}</p>
              </div>

              {/* Active initiatives — objects, so small cards; visually distinct from events */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("יוזמות פעילות", "Active initiatives")}</h3>
                {ctx.windows.length === 0 ? <p className="text-sm text-muted-foreground">{ctx.calendarSource === null ? t("אין תוכנית מסחרית מחוברת.", "No commercial plan connected.") : t("כל היוזמות הקרובות מקושרות לאירוע.", "Every upcoming initiative is linked to an event.")}</p> : null}
                <div className="grid gap-2">
                  {ctx.windows.slice(0, 3).map((w) => {
                    const live = w.state === "active" || w.state === "starts_today";
                    return (
                      <Card key={w.id} className="space-y-1.5 p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-base font-semibold">{w.campaignTitle[locale]}</span>
                          <Chip tone={live ? "success" : w.state === "starts_soon" ? "warning" : "neutral"}>{live ? t("קמפיין פעיל", "Campaign active") : t(`מתחיל בעוד ${w.daysUntil} ימים`, `starts in ${w.daysUntil} days`)}</Chip>
                        </div>
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {fmtRange(w.start, w.end)} · {t(`${w.initiativeCount} מהלכים קשורים`, `${w.initiativeCount} initiatives`)}
                          {w.thinStockProducts ? <span className="text-warning"> · {t(`${w.thinStockProducts} מוצרים במלאי דק`, `${w.thinStockProducts} thin on stock`)}</span> : null}
                        </p>
                        {w.openQuestion ? (
                          <Link href={(w.openDecisionHref ?? "/today") as never} className="text-sm font-medium underline-offset-4 hover:underline">
                            {w.openQuestion[locale]} {fwd}
                          </Link>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* 2 — Needs your decision */}
        <section className="space-y-4">
          <SectionHead title={t("דורש ממך החלטה", "Needs your decision")} />
          {primary ? (
            <Card className="space-y-4 border-foreground/20 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ההחלטה הדחופה ביותר", "Highest priority")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {primary.status === "act" ? <Chip tone="warning">{t("דורש תשומת לב", "Needs attention")}</Chip> : null}
                  {primary.deadline ? <Chip tone={primary.deadline <= r.generatedAt.slice(0, 10) ? "danger" : "warning"}>{t(`עד ${fmtDate(primary.deadline)}`, `by ${fmtDate(primary.deadline)}`)}</Chip> : null}
                </div>
              </div>
              <h3 className="text-xl font-semibold leading-snug sm:text-2xl">{primary.question[locale]}</h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("למה עכשיו", "Why now")}</dt>
                  <dd className="mt-0.5">{primary.whyNow[locale] || primary.why[locale]}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ההמלצה", "Recommendation")}</dt>
                  <dd className="mt-0.5">{primary.recommendation[locale] || t("ללא המלצה — לבחינה", "No recommendation — review")}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link href={primary.href as never} className="inline-flex items-center gap-1 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90">
                  {t("פתח החלטה", "Open decision")} {fwd}
                </Link>
                <Link href={primary.href as never} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {t("ראה ראיות", "See evidence")}
                </Link>
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">{t("אין כרגע החלטה פתוחה.", "No open decision right now.")}</p>
          )}

          {pending > 0 || awaiting > 0 ? (
            <div className="flex flex-col gap-2">
              {pending > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3">
                  <p className="text-base font-semibold">{t(`${pending} החלטות מחכות לתגובה`, `${pending} decisions await your response`)}</p>
                  <Link href={"/today" as never} className="inline-flex items-center gap-1 rounded-md border border-foreground px-3 py-1.5 text-sm font-semibold hover:bg-foreground hover:text-background">
                    {t("עבור להחלטות", "Go to decisions")} {fwd}
                  </Link>
                </div>
              ) : null}
              {awaiting > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3">
                  <p className="text-base font-semibold">{t(`${awaiting} החלטות מחכות למשוב שלך`, `${awaiting} decisions await your feedback`)}</p>
                  <Link href={(awaiting === 1 ? r.awaitingFeedback[0].href : "#feedback") as never} className="inline-flex items-center gap-1 rounded-md border border-foreground px-3 py-1.5 text-sm font-semibold hover:bg-foreground hover:text-background">
                    {t("תן משוב", "Give feedback")} {fwd}
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 3 — Does Hiloomy see the whole picture? */}
        <section className="space-y-4">
          <SectionHead title={t("האם Hiloomy רואה את כל התמונה?", "Does Hiloomy see the whole picture?")} label={r.compression.asOf ? t(`הבדיקה האחרונה · ${agoShort(r.compression.asOf, now, true)}`, `Last check · ${agoShort(r.compression.asOf, now, false)}`) : undefined} />
          <p className="text-lg">
            {r.coverageSummary.checkedDomains > 0
              ? t(`Hiloomy בדקה ${r.coverageSummary.checkedDomains} מתוך ${r.coverage.length} תחומים. `, `Hiloomy checked ${r.coverageSummary.checkedDomains} of ${r.coverage.length} domains. `) + (r.coverageSummary.domainsWithSurfaced === 0 ? t("אף אחד לא יצר החלטה בתקופה.", "None produced a decision in the period.") : t(`רק ${r.coverageSummary.domainsWithSurfaced} יצרו החלטות.`, `Only ${r.coverageSummary.domainsWithSurfaced} produced decisions.`))
              : t("עדיין לא נרשמה בדיקה — המצב לפי בריאות הנתונים בלבד.", "No check recorded yet — states come from Data Health only.")}
          </p>
          <ul className="divide-y divide-border">
            {evaluated.map((c) => (
              <li key={c.domain} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-28 shrink-0 font-medium">{c.label[locale]}</span>
                <Chip tone={c.eligibility === "checked" ? "success" : "warning"}>{ELIGIBILITY[c.eligibility][locale]}</Chip>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {c.checkedCount !== null ? t(`${c.checkedCount} ${unit(c.checkedUnit)} נבדקו`, `${c.checkedCount} ${unit(c.checkedUnit)} checked`) : t("טרם נספר", "not counted yet")}
                  {c.candidates !== null ? ` · ${t(`${c.candidates} מועמדים`, `${c.candidates} candidates`)}` : ""}
                  {` · ${t(`${c.surfaced} הוצגו`, `${c.surfaced} surfaced`)}`}
                </span>
                {c.sourceSyncedAt ? (
                  <span className="text-[11px] text-muted-foreground" title={new Date(c.sourceSyncedAt).toLocaleString(isHe ? "he-IL" : "en-US")}>
                    {t(`עודכן ${agoShort(c.sourceSyncedAt, now, true)}`, `updated ${agoShort(c.sourceSyncedAt, now, false)}`)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {notEvaluated.length ? (
            <p className="text-sm text-muted-foreground">
              {t("לא נבדק: ", "Not checked: ")}
              {notEvaluated.map((c, i) => (
                <span key={c.domain}>
                  {i > 0 ? " · " : ""}
                  <span className={c.domain === "paid_media" ? "text-danger" : undefined}>{c.label[locale]}</span>
                  {c.reason ? <span className="text-[11px]"> ({c.reason[locale]})</span> : null}
                </span>
              ))}
            </p>
          ) : null}
          {r.dominance ? (
            <p className="text-sm text-muted-foreground">
              {t(`${r.dominance.surfaced} מתוך ${r.dominance.total} ההחלטות הן ${r.dominance.label.he}. `, `${r.dominance.surfaced} of ${r.dominance.total} decisions are ${r.dominance.label.en}. `)}
              <Link href={"/decision-audit" as never} className="underline-offset-4 hover:underline">
                {t("האם זה מצב אמיתי או הטיית דירוג?", "Real condition or ranking bias?")} {fwd}
              </Link>
            </p>
          ) : null}
          <Details summary={t("הצג פירוט תחומים", "Show domain details")}>
            <CoverageTable rows={r.coverage} locale={locale} t={t} unit={unit} now={now} isHe={isHe} />
          </Details>
        </section>

        {/* 4 — How Hiloomy removed the noise (ONE evaluation) */}
        <section className="space-y-3">
          <SectionHead title={t("איך Hiloomy צמצמה את הרעש?", "How Hiloomy removed the noise")} label={r.compression.asOf ? t(`הבדיקה האחרונה · ${agoShort(r.compression.asOf, now, true)}`, `Latest evaluation · ${agoShort(r.compression.asOf, now, false)}`) : t("הבדיקה האחרונה", "Latest evaluation")} />
          {r.compression.rawSignals !== null && r.compression.candidates !== null && r.compression.candidatesOnToday !== null ? (
            <Flow fwd={fwd} size="lg" stages={[{ n: r.compression.rawSignals, label: t("אותות", "signals") }, { n: r.compression.candidates, label: t("מועמדים", "candidates") }, { n: r.compression.candidatesOnToday, label: t("החלטות", "decisions") }]} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("ספירת האותות תופיע אחרי הבדיקה הבאה.", "Signal counts appear after the next evaluation.")}</p>
          )}
          <p className="text-sm text-muted-foreground">{t("Hiloomy סיננה את הנתונים והעבירה רק מה שמצדיק תשומת לב ניהולית.", "Hiloomy filtered the data and passed on only what deserves management attention.")}</p>
        </section>

        {/* 5 — Is Hiloomy actually helping? (the selected period) */}
        <section className="space-y-4">
          <SectionHead title={t("האם Hiloomy באמת עוזרת?", "Is Hiloomy actually helping?")} label={periodLabel} />
          {f.surfaced === 0 ? (
            <p className="text-sm text-muted-foreground">{r.memory.recorded > 0 ? t(`נרשמו ${r.memory.recorded} החלטות בתקופה, אבל אף אחת עדיין לא הוצגה בהיום.`, `${r.memory.recorded} decisions were recorded in the period, but none was surfaced on Today yet.`) : t("עדיין לא הוצגו החלטות בתקופה הזו.", "No decisions were surfaced in this period.")}</p>
          ) : (
            <>
              <div className="rounded-lg border border-dashed border-border px-4 py-4">
                <Flow fwd={fwd} stages={[{ n: f.surfaced, label: t("הוצגו", "surfaced") }, { n: f.acted, label: t("המנהל פעל", "manager acted"), muted: f.acted === 0 }, { n: f.judged, label: t("משוב", "feedback"), muted: f.judged === 0 }, { n: f.measured, label: t("תוצאות נמדדו", "measured outcomes"), muted: f.measured === 0 }]} />
              </div>
              {!hasJudgment ? (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{t("עדיין מוקדם למדוד השפעה", "Too early to measure impact")}</h3>
                  <p className="text-sm text-muted-foreground">{t(`${f.surfaced} החלטות הוצגו, אבל עדיין לא התקבל מספיק משוב מהמנהל.`, `${f.surfaced} decisions were surfaced, but not enough manager feedback has come in yet.`)}</p>
                  {pending > 0 ? (
                    <Link href={"/today" as never} className="inline-flex items-center gap-1 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90">
                      {t(`${pending} החלטות מחכות לתגובה`, `${pending} decisions await your response`)} {fwd}
                    </Link>
                  ) : awaiting > 0 ? (
                    <Link href={(awaiting === 1 ? r.awaitingFeedback[0].href : "#feedback") as never} className="inline-flex items-center gap-1 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90">
                      {t(`${awaiting} החלטות מחכות למשוב`, `${awaiting} decisions await feedback`)} {fwd}
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  {!enoughJudged ? <p className="text-sm text-muted-foreground">{t(`סימן מוקדם: ${j.total} מתוך ${MIN_JUDGED_FOR_RATE} החלטות עם משוב שנדרשות לפני שהמדד משמעותי.`, `Early signal: ${j.total} of the ${MIN_JUDGED_FOR_RATE} judged decisions needed before this is meaningful.`)}</p> : null}
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                    <Stat n={`${j.useful} / ${j.total}`} label={t("מועילות", "Useful")} />
                    <Stat n={`${j.highValue} / ${j.total}`} label={t("ערך גבוה", "High value")} />
                    <Stat n={`${j.obvious} / ${j.total}`} label={t("מובנות מאליהן", "Obvious")} />
                    <Stat n={`${j.wrong} / ${j.total}`} label={t("שגויות", "Wrong")} />
                  </div>
                  {hasBehaviourAnswer ? <p className="text-sm">{t(`${j.changed} שינו פעולה · ${j.confirmed} אישרו כיוון קיים`, `${j.changed} changed an action · ${j.confirmed} confirmed the existing direction`)}</p> : null}
                  {hasOutcomes ? (
                    <p className="text-sm">
                      {t(`${r.outcomes.measured} מתוך ${r.outcomes.eligible} החלטות שנענו נמדדו`, `${r.outcomes.measured} of ${r.outcomes.eligible} answered decisions were measured`)}
                      {measurable > 0 ? t(` · ${r.outcomes.win} שיפור · ${r.outcomes.neutral} ללא שינוי · ${r.outcomes.miss} החמרה`, ` · ${r.outcomes.win} win · ${r.outcomes.neutral} neutral · ${r.outcomes.miss} miss`) : ""}
                      <span className="text-muted-foreground"> {t("(מה קרה אחרי ההחלטה — לא הוכחת סיבתיות, לא כסף)", "(what happened after the decision — not causality, not money)")}</span>
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}

          {awaiting > 0 ? (
            <div id="feedback">
              <Details summary={t(`החלטות שמחכות למשוב (${awaiting})`, `Decisions awaiting feedback (${awaiting})`)}>
                <ul className="divide-y divide-border">
                  {r.awaitingFeedback.slice(0, 8).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium">{d.question[locale]}</span>
                        <span className="text-xs text-muted-foreground"> · {CANDIDATE_DOMAIN_LABEL[d.domain][locale]} · {CHOICE_LABEL[d.choice][locale]}</span>
                      </span>
                      <Link href={d.href as never} className="text-sm font-semibold underline-offset-4 hover:underline">
                        {t("תן משוב", "Give feedback")} {displayDecisionId(d.id)} {fwd}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Details>
            </div>
          ) : null}

          {r.stories.length > 0 || (r.domains.length > 0 && hasJudgment) || hasTiming ? (
            <Details summary={t("פירוט: לפי תחום, זמן החלטה, החלטות ששווה ללמוד מהן", "Details: by domain, time to decision, decisions worth learning from")}>
              <div className="space-y-6">
                {r.domains.length > 0 && hasJudgment ? (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm tabular-nums">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          {[t("תחום", "Domain"), t("הוצגו", "Surfaced"), t("משוב", "Feedback"), t("מועיל", "Useful"), t("ערך גבוה", "High value"), t("מובן מאליו", "Obvious"), t("שגוי", "Wrong"), ...(hasOutcomes ? [t("שיפור / נמדד", "Win / measured")] : [])].map((h) => (
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
                            <td className="px-3 py-2">{d.judged ? `${d.useful} / ${d.judged}` : "—"}</td>
                            <td className="px-3 py-2">{d.judged ? `${d.highValue} / ${d.judged}` : "—"}</td>
                            <td className={cn("px-3 py-2", d.judged && d.obvious / d.judged >= 0.5 && "text-warning")}>{d.judged ? `${d.obvious} / ${d.judged}` : "—"}</td>
                            <td className={cn("px-3 py-2", d.judged && d.wrong / d.judged >= 0.2 && "text-danger")}>{d.judged ? `${d.wrong} / ${d.judged}` : "—"}</td>
                            {hasOutcomes ? <td className="px-3 py-2">{d.measured ? `${d.win} / ${d.measured}` : "—"}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {hasTiming ? (
                  <p className="text-sm">
                    {t("זמן מהצגה עד פעולה", "Time from surfacing to action")}: {t("חציון", "median")} <b>{formatDuration(r.timing.medianMs!, locale)}</b> · {t("המהירה", "fastest")} {formatDuration(r.timing.fastestMs!, locale)} · {t("האיטית", "slowest")} {formatDuration(r.timing.slowestMs!, locale)} · {t(`${r.timing.sample} החלטות`, `${r.timing.sample} decisions`)}
                    {r.timing.sample < MIN_TIMING_SAMPLE ? <span className="text-muted-foreground"> · {t("מדגם קטן", "small sample")}</span> : null}
                    <span className="text-muted-foreground"> · {t("אין נקודת ייחוס מלפני Hiloomy", "no pre-Hiloomy baseline")}</span>
                  </p>
                ) : null}
                {r.stories.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {r.stories.map((s) => (
                      <Card key={s.id} className="space-y-2 p-4 text-sm">
                        <p className="font-semibold">{s.question[locale]}</p>
                        <p className="text-xs text-muted-foreground">
                          {CANDIDATE_DOMAIN_LABEL[s.domain][locale]} · {fmtDate(s.surfacedAt)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">{t("המליצה", "Recommended")}:</span> {s.recommendation[locale] || t("ללא", "none")} · <span className="text-muted-foreground">{t("המנהל", "Manager")}:</span> {CHOICE_LABEL[s.choice][locale]}
                        </p>
                        <p>
                          <span className="text-muted-foreground">{t("משוב", "Feedback")}:</span> {s.judgment.length ? s.judgment.map((tag) => JUDGMENT_LABEL[tag][locale]).join(" · ") : t("טרם", "none yet")} · <span className="text-muted-foreground">{t("תוצאה", "Outcome")}:</span>{" "}
                          <span className={s.outcome ? OUTCOME_LABEL[s.outcome].cls : "text-muted-foreground"}>{s.outcome ? OUTCOME_LABEL[s.outcome][locale] : t("טרם נמדד", "not measured yet")}</span>
                        </p>
                        <Link href={s.href as never} className="text-sm font-semibold underline-offset-4 hover:underline">
                          {t("לקבלה", "Receipt")} {displayDecisionId(s.id)} {fwd}
                        </Link>
                      </Card>
                    ))}
                  </div>
                ) : null}
              </div>
            </Details>
          ) : null}
        </section>

        {/* 6 — Plan × Reality, only when relevant */}
        {r.plan.surfaced > 0 ? (
          <section className="space-y-3">
            <SectionHead title={t("האם המציאות שינתה את התוכנית?", "Did reality change the plan?")} label={periodLabel} />
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {r.plan.initiativesEvaluated !== null ? <Stat n={r.plan.initiativesEvaluated} label={t("מהלכים נבדקו", "initiatives checked")} /> : null}
              <Stat n={r.plan.surfaced} label={t("החלטות תוכנית הוצגו", "plan decisions surfaced")} sub={r.plan.changePlanStatus ? t(`${r.plan.changePlanStatus} עם המלצה לשנות`, `${r.plan.changePlanStatus} recommended a change`) : undefined} />
              {r.plan.surfaced - r.plan.acted > 0 ? <Stat n={r.plan.surfaced - r.plan.acted} label={t("מחכות לתגובה", "awaiting response")} /> : null}
              {r.plan.acted > 0 ? <Stat n={r.plan.changedPlan} label={t("שינו את התוכנית", "changed the plan")} /> : null}
              {r.plan.acted > 0 ? <Stat n={r.plan.continuedAsPlanned} label={t("המשיכו כמתוכנן", "continued as planned")} /> : null}
              {r.plan.judged > 0 ? <Stat n={`${r.plan.useful} / ${r.plan.judged}`} label={t("מועילות", "useful")} /> : null}
            </div>
          </section>
        ) : null}

        {/* 7 — Decision memory: all time, low on the page */}
        <section className="space-y-3 border-t border-border pt-8">
          <SectionHead title={t("זיכרון החלטות", "Decision memory")} label={t("כל הזמן", "All time")} />
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <Stat n={r.memory.allTime.recorded} label={t("החלטות נרשמו", "decisions recorded")} />
            <Stat n={r.memory.allTime.withOutcome} label={t("תוצאות נמדדו", "measured outcomes")} />
            <Stat n={r.memory.allTime.withJudgment} label={t("עם משוב", "judgments")} />
          </div>
          <p className="text-xs text-muted-foreground">{t("נתונים היסטוריים מכל התקופות.", "Historical data from all periods.")}</p>
          {r.memory.learnings.length ? (
            <ul className="space-y-1 text-sm">
              {r.memory.learnings.map((l, i) => (
                <li key={i}>· {l[locale]}</li>
              ))}
            </ul>
          ) : null}
          {r.notes.length ? (
            <Details summary={t("הערות על הנתונים", "Notes on the data")}>
              <ul className="list-disc space-y-0.5 ps-5 text-xs text-muted-foreground">
                {r.notes.map((n, i) => (
                  <li key={i}>{n[locale]}</li>
                ))}
              </ul>
            </Details>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

// The full technical table — behind a disclosure. Scope on every column.
function CoverageTable({ rows, locale, t, unit, now, isHe }: { rows: CoverageRow[]; locale: Locale; t: (he: string, en: string) => string; unit: (u: string | null) => string; now: Date; isHe: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            {[t("תחום", "Domain"), t("מצב", "State"), t("נבדקו (בדיקה אחרונה)", "Checked (last check)"), t("מועמדים (בדיקה אחרונה)", "Candidates (last check)"), t("הגיעו להיום", "Reached Today"), t("הוצגו (תקופה)", "Surfaced (period)"), t("רעננות", "Freshness"), ""].map((h, i) => (
              <th key={i} className="px-3 py-2 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const e = ELIGIBILITY[c.eligibility];
            const evaluated = c.eligibility === "checked" || c.eligibility === "partial";
            const zeroNote =
              evaluated && c.surfaced === 0
                ? c.candidates !== null && c.candidates > 0 && c.candidatesOnToday === 0
                  ? t(`${c.candidates} מועמדים נבדקו ולא עברו את סף העדיפות.`, `${c.candidates} candidate${c.candidates === 1 ? " was" : "s were"} evaluated but did not pass the priority threshold.`)
                  : c.candidates === 0
                    ? t("אף מצב לא הגיע לרמת מועמד.", "No situation reached candidate level.")
                    : t("אין כרגע החלטה שמצדיקה תשומת לב.", "Nothing currently deserves attention.")
                : "";
            return (
              <tr key={c.domain} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{c.label[locale]}</td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", e.cls)}>{e[locale]}</span>
                </td>
                <td className="px-3 py-2">{c.checkedCount !== null ? `${c.checkedCount} ${unit(c.checkedUnit)}` : evaluated ? t("טרם נספר", "not counted") : ""}</td>
                <td className="px-3 py-2">{evaluated ? (c.candidates ?? "—") : ""}</td>
                <td className="px-3 py-2">{evaluated ? (c.candidatesOnToday ?? "—") : ""}</td>
                <td className="px-3 py-2">{evaluated || c.surfaced > 0 ? c.surfaced : ""}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground" title={c.sourceSyncedAt ? new Date(c.sourceSyncedAt).toLocaleString(isHe ? "he-IL" : "en-US") : undefined}>
                  {c.sourceSyncedAt ? `${c.sourceSyncLabel?.[locale] ?? ""} · ${agoShort(c.sourceSyncedAt, now, isHe)}` : c.eligibility === "not_eligible" ? "" : t("אין חותמת סנכרון", "no sync timestamp")}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{c.reason ? c.reason[locale] : zeroNote}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-muted-foreground">{t("'נבדקו' ו'מועמדים' — מהבדיקה האחרונה; 'הוצגו' — מהתקופה שנבחרה. תזמון לוח השנה אינו משפיע על דירוג ההחלטות.", "'Checked' and 'Candidates' are from the last check; 'Surfaced' is the selected period. Calendar timing does not affect decision ranking.")}</p>
    </div>
  );
}
