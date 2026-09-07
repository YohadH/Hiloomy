import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildDataHealth, type HealthState } from "@/lib/services/decision-inbox-service";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<HealthState, { he: string; en: string }> = {
  healthy: { he: "תקין", en: "Healthy" },
  partial: { he: "כיסוי חלקי", en: "Partial coverage" },
  missing: { he: "חסר", en: "Missing" }
};

const STATE_DOT: Record<HealthState, string> = {
  healthy: "bg-emerald-600",
  partial: "bg-orange-500",
  missing: "border border-current bg-transparent text-muted-foreground"
};

// Data Health — coverage and confidence by source, and what it costs in
// decisions. Hiloomy would rather say "I don't know" than give unreliable
// financial advice; this page shows where that is happening.
export default async function DataHealthPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lc = isHe ? "he" : "en";
  const t = (he: string, en: string) => (isHe ? he : en);
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const [chrome, health] = await Promise.all([getAppChromeData(), buildDataHealth(storeId)]);
  const n = health.suppressedDecisions;

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-8">
        <PageHead
          eyebrow={t("בריאות הנתונים", "Data Health")}
          title={t("על מה ההחלטות נשענות", "What the decisions rest on")}
          description={t(
            "ביטחון וכיסוי לפי מקור. כשראיה פיננסית חסרה, הילומי מעדיפה לא להמליץ מאשר להמליץ על סמך ניחוש.",
            "Confidence and coverage by source. When financial evidence is missing, Hiloomy prefers not to recommend over recommending on a guess."
          )}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card className="divide-y divide-border/70">
            {health.rows.map((r) => (
              <div key={r.key} className="flex items-start gap-4 px-6 py-4">
                <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", STATE_DOT[r.state])} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-base font-semibold">{r.label[lc]}</p>
                    <p className={cn("text-sm font-semibold", r.state === "healthy" ? "text-emerald-700 dark:text-emerald-300" : r.state === "partial" ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground")}>
                      {r.key === "cogs" && r.state !== "healthy"
                        ? t(`${Math.round(health.costCoveragePct * 100)}% כיסוי הכנסות`, `${Math.round(health.costCoveragePct * 100)}% revenue coverage`)
                        : STATE_LABEL[r.state][lc]}
                    </p>
                  </div>
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{r.detail[lc]}</p>
                  {r.fixHref ? (
                    <Link href={r.fixHref as never} className="mt-1 inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300">
                      {t("לשפר", "Improve")}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </Card>

          <div className="space-y-6">
            <Card className="space-y-3 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("ביטחון כולל בנתונים", "Overall data confidence")}</p>
              <p className="text-4xl font-semibold tabular-nums tracking-tight">{health.score === null ? "—" : `${health.score}%`}</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {health.confidence === "high"
                  ? t("הראיות מספיקות לרוב ההחלטות.", "The evidence is sufficient for most decisions.")
                  : health.confidence === "medium"
                    ? t("רוב ההחלטות נתמכות; החלטות רווח מוגבלות בכיסוי העלויות.", "Most decisions are supported; profit decisions are limited by cost coverage.")
                    : t("החיבורים חלקיים. הילומי תגביל את עצמה להחלטות שיש להן ראיות.", "Connections are partial. Hiloomy limits itself to decisions that have evidence.")}
              </p>
            </Card>

            <Card className="space-y-2 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("שימוש ב־AI היום", "AI usage today")}</p>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                ~${health.ai.estimatedUsd.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground"> / ${health.ai.budgetUsd.toFixed(0)} {t("תקציב יומי", "daily budget")}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {t(`${health.ai.calls} קריאות למודל`, `${health.ai.calls} model calls`)}
                {health.ai.byFeature.length > 0
                  ? ` · ${health.ai.byFeature.map((f) => `${f.feature} ~$${f.estimatedUsd.toFixed(2)}`).join(" · ")}`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("אומדן לפי מחירי המודל; החשבון האמיתי אצל ספק המודל. כשהתקציב נגמר, הצ׳אט ותובנות חדשות נעצרים עד מחר; מה שכבר חושב ממשיך להופיע.", "Estimate at the model's prices; the real bill is at the provider. When the budget is spent, chat and new insights pause until tomorrow; already-computed insights keep showing.")}
              </p>
            </Card>

            <Card className="space-y-4 border-orange-200/70 bg-orange-50/30 p-6 dark:border-orange-500/20 dark:bg-orange-500/5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("השפעה על החלטות", "Decision impact")}</p>
              <p className="text-lg font-semibold leading-7">
                {n === 0
                  ? t("אף החלטה לא מושתקת כרגע בגלל חוסר בראיות פיננסיות.", "No decisions are currently suppressed for lack of financial evidence.")
                  : t(
                      `${n} החלטות פוטנציאליות מושתקות כרגע כי הראיות הפיננסיות אינן מספיקות.`,
                      `${n} potential decision${n === 1 ? " is" : "s are"} currently suppressed because financial evidence is insufficient.`
                    )}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {t(
                  `${health.productsMissingCost} מוצרים שנמכרו החודש ללא עלות אמיתית. בלי עלות, הילומי לא תגיד אם הם רווחיים.`,
                  `${health.productsMissingCost} products sold this month have no real cost on file. Without a cost, Hiloomy will not say whether they are profitable.`
                )}
              </p>
              <Link
                href={"/products/costs" as never}
                className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90"
              >
                {t("לשפר את כיסוי העלויות", "Improve COGS coverage")}
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
