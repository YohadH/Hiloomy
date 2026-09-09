"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DECISION_STATUS_LABEL, type DecisionStatus, type InboxStats } from "@/lib/domain/decision";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

function greetingFor(hour: number, locale: Locale): string {
  if (locale === "he") return hour < 5 ? "לילה טוב" : hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";
  return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function relative(iso: string, locale: Locale, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (locale === "he") {
    if (mins < 1) return "עודכן הרגע";
    if (mins < 60) return `עודכן לפני ${mins} דקות`;
    return `עודכן לפני ${Math.round(mins / 60)} שעות`;
  }
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const h = Math.round(mins / 60);
  return `Updated ${h} hour${h === 1 ? "" : "s"} ago`;
}

const STATUS_ORDER: DecisionStatus[] = ["act", "change_plan", "test", "watch", "do_not_act"];

const STATUS_DOT: Record<DecisionStatus, string> = {
  act: "bg-primary",
  change_plan: "bg-warning",
  test: "bg-success",
  watch: "bg-muted-foreground/50",
  do_not_act: "bg-muted-foreground/50"
};

// Top of Today, and the page's only header: greeting → the one number that
// matters → the split by status ("1 ACT · 2 WATCH") → proof of work in one
// quiet line. Not KPI tiles, not a page title.
export function TodaySummary({ locale, stats, updatedAt }: { locale: Locale; stats: InboxStats; updatedAt: string }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const hour = now === null ? 9 : new Date(now).getHours();
  const n = stats.decisions;
  const needsCall = stats.byStatus.act + stats.byStatus.change_plan + stats.byStatus.test;
  const headline =
    n === 0
      ? t("אין החלטות שממתינות לכם", "No decisions are waiting for you")
      : needsCall === 0
        ? t("הכול במעקב — אין צורך בפעולה", "Everything is under watch — no action needed")
        : needsCall === 1
          ? t("החלטה אחת דורשת את תשומת הלב שלכם", "1 decision needs your attention")
          : t(`${needsCall} החלטות דורשות את תשומת הלב שלכם`, `${needsCall} decisions need your attention`);
  const breakdown = STATUS_ORDER.filter((s) => stats.byStatus[s] > 0);

  return (
    <header className="space-y-3">
      <p className="text-sm text-muted-foreground" suppressHydrationWarning>
        {greetingFor(hour, locale)}
      </p>
      <h1 className="max-w-3xl text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{headline}</h1>
      {breakdown.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {breakdown.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-2">
              {i > 0 ? <span aria-hidden className="text-border">·</span> : null}
              <span aria-hidden className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
              <span className="font-semibold">{stats.byStatus[s]}</span>
              <span className={cn("text-xs font-semibold uppercase", s === "watch" || s === "do_not_act" ? "text-muted-foreground" : "text-foreground")}>
                {DECISION_STATUS_LABEL[s][locale]}
              </span>
            </span>
          ))}
        </p>
      ) : null}
      {stats.plan ? (
        <p className="text-sm">
          <span className="font-semibold">{t("בתוכנית", "In the plan")}: </span>
          <span className="text-muted-foreground">
            {t(`${stats.plan.today} יוזמות היום`, `${stats.plan.today} initiatives today`)}
            {stats.plan.upcoming7 > 0 ? ` · ${t(`${stats.plan.upcoming7} מתחילות בשבוע הקרוב`, `${stats.plan.upcoming7} start this week`)}` : ""}
            {stats.plan.blocked > 0 ? (
              <>
                {" · "}
                <span className="font-semibold text-danger">{t(`${stats.plan.blocked} חסומות`, `${stats.plan.blocked} blocked`)}</span>
              </>
            ) : ""}
          </span>{" "}
          <Link href={"/marketing-planner" as never} className="font-semibold text-foreground underline-offset-4 hover:underline">
            {t("לתוכנית", "Open Plan")}
          </Link>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
        {t(
          `${stats.reviewed.toLocaleString("en-US")} אותות נסקרו · ${stats.suppressed.toLocaleString("en-US")} הושתקו`,
          `${stats.reviewed.toLocaleString("en-US")} signals reviewed · ${stats.suppressed.toLocaleString("en-US")} suppressed`
        )}
        {stats.confidencePct !== null ? ` · ${t("ביטחון בנתונים", "Data confidence")} ${stats.confidencePct}%` : ""}
        {now === null ? "" : ` · ${relative(updatedAt, locale, now)}`}
      </p>
    </header>
  );
}
