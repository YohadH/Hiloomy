import { Lightbulb, TrendingUp } from "lucide-react";
import type { IdeaEngineReport } from "@/lib/services/idea-engine-service";

function formatIls(value: number, isHe: boolean) {
  return `₪${Math.round(value).toLocaleString(isHe ? "he-IL" : "en-US")}`;
}

// The Idea Engine — ranked by money. Recommend-only: each row is a move
// Hiloma found, ordered by ₪/month ÷ effort, tagged helper (she recommends,
// you approve) or maker (a one-click action once an executor is trusted).
export function IdeaEnginePanel({ report, isHe }: { report: IdeaEngineReport; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);

  if (report.ideas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Lightbulb className="h-4 w-4" aria-hidden />
          {lang(
            "אין כרגע רעיונות מדורגים — או שאין מספיק נתונים (עלויות מוצר, Meta, היסטוריית מכירות), או שהכול נקי. מנוע הרעיונות מדרג רק מהלכים עם ₪ אמיתי מאחוריהם.",
            "No ranked ideas right now — either the inputs are missing (product costs, Meta, sales history) or everything is clean. The engine only ranks moves with real ₪ behind them."
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/70 px-5 py-3">
        <p className="text-sm font-semibold">
          {lang("מדורג לפי כסף — לא לפי חדשנות", "Ranked by money, not novelty")}
        </p>
        <p className="text-xs text-muted-foreground">
          {lang(
            `סך ההזדמנות המדורגת: ${formatIls(report.totalMonthlyImpact, true)}/חודש`,
            `Total ranked opportunity: ${formatIls(report.totalMonthlyImpact, false)}/mo`
          )}
        </p>
      </div>
      <ol className="divide-y divide-border/60">
        {report.ideas.map((idea, i) => (
          <li key={idea.id} className="flex items-start gap-3 px-5 py-3.5">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{isHe ? idea.title.he : idea.title.en}</p>
                <span
                  className={
                    idea.type === "maker"
                      ? "rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                  }
                  title={
                    idea.type === "maker"
                      ? lang("בהמשך: פעולה בלחיצה אחת עם אישורכם", "Later: a one-click action with your approval")
                      : lang("הילומה ממליצה — אתם מאשרים ומבצעים", "Hiloma recommends — you approve and execute")
                  }
                >
                  {idea.type === "maker" ? lang("עושה", "maker") : lang("ממליצה", "helper")}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{isHe ? idea.why.he : idea.why.en}</p>
              {idea.detail ? (
                <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground/80">{isHe ? idea.detail.he : idea.detail.en}</p>
              ) : null}
              <a
                href={idea.href}
                className="mt-1 inline-block text-[13px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                {isHe ? idea.action.he : idea.action.en} →
              </a>
            </div>
            <div className="shrink-0 text-end">
              <p className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                {formatIls(idea.monthlyImpact, isHe)}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{lang("לחודש", "per month")}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
