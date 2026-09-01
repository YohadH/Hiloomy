import { AlertOctagon, Lightbulb } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentOverview } from "@/lib/services/growth-agent-overview-service";
import { getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { getHilomaNextMove } from "@/lib/services/hiloma-next-move-service";
import { listOpenAlerts } from "@/lib/services/alert-writer-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthFindingsList } from "@/components/growth-agent/findings-list";
import { GrowthActionCenter } from "@/components/growth-agent/action-center";
import { NextMoveCard } from "@/components/growth-agent/next-move-card";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import FullGrowthAgentPage from "./_full-page";

// Hiloma's page — slim by design (owner's decision, 1 Sep 2026):
//   1. her next move (one real, data-backed recommendation, refreshed daily)
//   2. insights — what she noticed
//   3. action needed — open alerts + anything waiting for a decision
// No hands: nothing here executes. The original Growth Agent page (status
// tiles, monitoring grid, connectors, sourcing ideas, manual controls) is
// kept at ./_full-page.tsx behind GROWTH_AGENT_FULL=true for later.

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-800",
  high: "border-amber-300 bg-amber-50 text-amber-900",
  medium: "border-border bg-muted/50 text-foreground",
  low: "border-border bg-muted/30 text-muted-foreground"
};

export default async function GrowthAgentPage() {
  if (process.env.GROWTH_AGENT_FULL === "true") return <FullGrowthAgentPage />;

  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, overview, nextMove, alerts] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthAgentOverview(store.id),
    getHilomaNextMove(store.id, isHe ? "he" : "en").catch(() => ({ move: null, pending: false, available: false })),
    listOpenAlerts({ storeId: store.id, limit: 8 }).catch(() => [] as Array<Record<string, unknown>>)
  ]);

  const pendingActions = overview.actions.filter((a) => a.status === "pending_approval" || a.status === "recommended");
  const sevLabel = (s: string) =>
    s === "critical" ? lang("קריטי", "Critical") : s === "high" ? lang("גבוה", "High") : s === "medium" ? lang("בינוני", "Medium") : lang("נמוך", "Low");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={lang("הילומה", "Hiloma")}
          title={lang("מה הילומה רואה — ומה המהלך הבא", "What Hiloma sees — and the next move")}
          description={lang(
            "תובנות מהנתונים החיים של החנות, מה שדורש החלטה עכשיו, והמהלך האחד שהילומה הייתה עושה השבוע. היא ממליצה — ההחלטה והביצוע אצלכם.",
            "Insights from the store's live data, what needs a decision now, and the one move Hiloma would make this week. She recommends — the decision and the execution stay with you."
          )}
        />

        <GrowthAgentNav locale={locale} full={false} />

        {/* 1. Next move */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={lang("המהלך הבא", "Next move")}
            title={lang("מהלך אחד, עם המספרים מאחוריו", "One move, with the numbers behind it")}
            hint={lang("נכתב על ידי הילומה מאותם נתונים וכלים כמו הצ'אט. מתעדכן פעם ביום.", "Written by Hiloma from the same data and tools as the chat. Refreshes daily.")}
          />
          <NextMoveCard move={nextMove.move} pending={nextMove.pending} available={nextMove.available} locale={isHe ? "he" : "en"} />
        </section>

        {/* 2. Action needed */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={lang("דורש פעולה", "Action needed")}
            title={lang("מה מחכה להחלטה שלכם", "What is waiting on your decision")}
            hint={lang("התראות פתוחות מהגלאים, ופעולות שהילומה הציעה וממתינות לאישור.", "Open alerts from the detectors, plus moves Hiloma proposed that await approval.")}
          />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card p-5">
              <p className="flex items-center gap-2 text-sm font-bold">
                <AlertOctagon className="h-4 w-4 text-rose-600" aria-hidden />
                {lang("התראות פתוחות", "Open alerts")}
                <span className="text-xs font-normal text-muted-foreground">({alerts.length})</span>
              </p>
              {alerts.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{lang("אין התראות פתוחות — נקי.", "No open alerts — all clear.")}</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {(alerts as unknown[]).map((a) => {
                    const alert = a as { id: string; title: string; severity: string; recommendedAction?: string | null };
                    return (
                      <li key={alert.id} className={cn("rounded-xl border px-3.5 py-2.5 text-sm", SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.medium)}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold leading-5">{alert.title}</p>
                          <span className="shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            {sevLabel(alert.severity)}
                          </span>
                        </div>
                        {alert.recommendedAction ? <p className="mt-1 text-xs leading-5 opacity-90">{alert.recommendedAction}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <GrowthActionCenter
              actions={pendingActions.slice(0, 6)}
              storeId={store.id}
              title={lang("הצעות שממתינות לאישור", "Proposals awaiting approval")}
              locale={locale}
            />
          </div>
        </section>

        {/* 3. Insights */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={lang("תובנות", "Insights")}
            title={lang("מה הילומה שמה לב אליו", "What Hiloma noticed")}
            hint={lang("ממצאים מהנתונים — מגמות, חריגות ואיתותים ששווה לדעת עליהם גם בלי פעולה מיידית.", "Findings from the data — trends, anomalies and signals worth knowing even without immediate action.")}
          />
          {overview.findings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Lightbulb className="h-4 w-4" aria-hidden />
                {lang("עדיין אין ממצאים — הם מצטברים עם הסנכרונים.", "No findings yet — they accumulate with each sync.")}
              </span>
            </div>
          ) : (
            <GrowthFindingsList findings={overview.findings.slice(0, 8)} title={lang("ממצאים אחרונים", "Recent findings")} locale={locale} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
