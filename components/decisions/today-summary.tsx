"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
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
  change_plan: "bg-orange-400",
  test: "bg-emerald-500",
  watch: "bg-muted-foreground/50",
  do_not_act: "bg-muted-foreground/50"
};

// Top of Today: greeting, the one number that matters, the split by status
// ("1 ACT · 2 WATCH · 2 DO NOT ACT"), and on the side the proof of work in
// one quiet line. Not KPI tiles.
export function TodaySummary({
  locale,
  storeName,
  canSwitchBrand,
  stats,
  updatedAt
}: {
  locale: Locale;
  storeName: string;
  canSwitchBrand: boolean;
  stats: InboxStats;
  updatedAt: string;
}) {
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
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          {greetingFor(hour, locale)}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline}</h2>
        {breakdown.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {breakdown.map((s, i) => (
              <span key={s} className="inline-flex items-center gap-2">
                {i > 0 ? <span aria-hidden className="text-border">·</span> : null}
                <span aria-hidden className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                <span className="font-semibold tabular-nums">{stats.byStatus[s]}</span>
                <span className={cn("text-xs font-bold uppercase tracking-[0.14em]", s === "watch" || s === "do_not_act" ? "text-muted-foreground" : "text-foreground")}>
                  {DECISION_STATUS_LABEL[s][locale]}
                </span>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        {canSwitchBrand ? (
          <Link
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            href={"/portfolio" as any}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-accent"
          >
            {storeName}
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold">{storeName}</span>
        )}
        <p className="text-xs text-muted-foreground sm:text-end">
          {t(
            `${stats.reviewed.toLocaleString("en-US")} אותות נסקרו · ${stats.suppressed.toLocaleString("en-US")} הושתקו`,
            `${stats.reviewed.toLocaleString("en-US")} signals reviewed · ${stats.suppressed.toLocaleString("en-US")} suppressed`
          )}
          {stats.confidencePct !== null ? ` · ${t("ביטחון בנתונים", "Data confidence")} ${stats.confidencePct}%` : ""}
        </p>
        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
          {now === null ? "" : relative(updatedAt, locale, now)}
        </p>
      </div>
    </div>
  );
}
