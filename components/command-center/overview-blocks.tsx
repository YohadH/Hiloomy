import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DECISION_STATUS_LABEL, type DecisionStatus } from "@/lib/domain/decision";
import type { DecisionInboxSummary, MarketSummary } from "@/lib/services/command-center-summary-service";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

const STATUS_ORDER: DecisionStatus[] = ["act", "change_plan", "test", "watch", "do_not_act"];
const STATUS_DOT: Record<DecisionStatus, string> = {
  act: "bg-primary",
  change_plan: "bg-warning",
  test: "bg-success",
  watch: "bg-muted-foreground/50",
  do_not_act: "bg-muted-foreground/50"
};

function relative(iso: string, locale: Locale): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (locale === "he") return mins < 60 ? `לפני ${mins} דקות` : mins < 1440 ? `לפני ${Math.round(mins / 60)} שעות` : `לפני ${Math.round(mins / 1440)} ימים`;
  return mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
}

// "3 decisions need your attention today · 1 ACT · 1 TEST · [Open Today]".
// A pointer, not a list: Today is the only place decisions are made.
export function DecisionSummaryBlock({ summary, locale }: { summary: DecisionInboxSummary | null; locale: Locale }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const needsCall = summary ? summary.byStatus.act + summary.byStatus.change_plan + summary.byStatus.test : 0;
  const headline = !summary
    ? t("ההחלטות של היום מחכות בעמוד היום", "Today's decisions are waiting on the Today page")
    : summary.decisions === 0
      ? t("אין החלטות שממתינות לכם", "No decisions are waiting for you")
      : needsCall === 0
        ? t("הכול במעקב — אין צורך בפעולה", "Everything is under watch — no action needed")
        : needsCall === 1
          ? t("החלטה אחת דורשת את תשומת הלב שלכם", "1 decision needs your attention")
          : t(`${needsCall} החלטות דורשות את תשומת הלב שלכם`, `${needsCall} decisions need your attention`);
  const breakdown = summary ? STATUS_ORDER.filter((s) => summary.byStatus[s] > 0) : [];
  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between", needsCall > 0 ? "border-primary/40" : "border-border")}>
      <div className="space-y-1.5">
        <p className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{headline}</p>
        {breakdown.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {breakdown.map((s, i) => (
              <span key={s} className="inline-flex items-center gap-2">
                {i > 0 ? <span aria-hidden className="text-border">·</span> : null}
                <span aria-hidden className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                <span className="font-semibold">{summary!.byStatus[s]}</span>
                <span className={cn("text-xs font-semibold uppercase", s === "watch" || s === "do_not_act" ? "text-muted-foreground" : "text-foreground")}>{DECISION_STATUS_LABEL[s][locale]}</span>
              </span>
            ))}
          </p>
        ) : null}
        {summary ? (
          <p className="text-xs text-muted-foreground">
            {t(`${summary.watching} במעקב · הוערך ${relative(summary.updatedAt, locale)}`, `${summary.watching} watched · evaluated ${relative(summary.updatedAt, locale)}`)}
          </p>
        ) : null}
      </div>
      <Link
        href={"/today" as never}
        className={cn(
          "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-semibold sm:h-10",
          needsCall > 0 ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border bg-card hover:bg-accent"
        )}
      >
        {t("לפתוח את היום", "Open Today")}
        <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
      </Link>
    </div>
  );
}

// One line. Competitors are context; the only thing worth saying here is
// whether any move opened a decision this week.
export function MarketLine({ summary, locale }: { summary: MarketSummary | null; locale: Locale }) {
  if (!summary) return null;
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const n = summary.relevantThisWeek;
  const status = !summary.hasData
    ? t("הסריקה הראשונה עדיין לא רצה", "first crawl has not run yet")
    : n === 0
      ? t("אין שינוי רלוונטי השבוע", "no relevant change this week")
      : n === 1
        ? t("שינוי רלוונטי אחד השבוע", "1 relevant change this week")
        : t(`${n} שינויים רלוונטיים השבוע`, `${n} relevant changes this week`);
  return (
    <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-y border-border py-3 text-sm">
      <span>
        <span className="font-semibold">{t("שוק", "Market")}: </span>
        <span className={cn(n > 0 ? "font-medium text-warning" : "text-muted-foreground")}>
          {t(`${summary.monitored} מתחרים במעקב · ${status}`, `${summary.monitored} competitors monitored · ${status}`)}
        </span>
      </span>
      <Link href={"/market" as never} className="inline-flex min-h-8 items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline">
        {t("לפתוח את השוק", "Open Market")}
        <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
      </Link>
    </p>
  );
}
