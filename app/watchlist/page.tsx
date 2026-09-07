import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildDecisionInbox } from "@/lib/services/decision-inbox-service";
import { SOURCE_LABEL } from "@/lib/domain/decision";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Watchlist — situations Hiloomy is monitoring that do NOT need a management
// decision yet. The screen exists to say: Hiloomy sees more than it shows.
export default async function WatchlistPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lc = isHe ? "he" : "en";
  const t = (he: string, en: string) => (isHe ? he : en);
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const [chrome, inbox] = await Promise.all([getAppChromeData(), buildDecisionInbox(storeId)]);
  const items = inbox.watchlist;

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-8">
        <PageHead
          eyebrow={t("מעקב", "Watchlist")}
          title={t("מה הילומי עוקבת אחריו", "What Hiloomy is watching")}
          description={t(
            "מצבים שהילומי מנטרת אבל לא מאמינה שדורשים החלטה ניהולית כרגע. הם יעלו לתיבת ההחלטות רק אם הראיות ישתנו.",
            "Situations Hiloomy is monitoring that do not need a management decision yet. They move to the inbox only if the evidence changes."
          )}
        />

        <p className="text-sm text-muted-foreground">
          {t(
            `${items.length} מצבים במעקב · ${inbox.stats.reviewed.toLocaleString("en-US")} אותות נסקרו · ${inbox.stats.suppressed.toLocaleString("en-US")} הושתקו`,
            `${items.length} situations watched · ${inbox.stats.reviewed.toLocaleString("en-US")} signals reviewed · ${inbox.stats.suppressed.toLocaleString("en-US")} suppressed`
          )}
        </p>

        {items.length === 0 ? (
          <Card className="p-8 text-sm text-muted-foreground">
            {t("אין כרגע מצבים במעקב. הילומי תוסיף כאן כל דבר שמתקרב לסף החלטה.", "Nothing is being watched right now. Hiloomy will list anything approaching a decision threshold here.")}
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((w) => (
              <li key={w.id}>
                <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                    <Eye className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {SOURCE_LABEL[w.source][lc]}
                      </span>
                      <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                        {new Date(w.since).toLocaleDateString(isHe ? "he-IL" : "en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className="text-base font-semibold leading-6">{w.title[lc]}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{w.detail[lc]}</p>
                  </div>
                  {w.decisionId ? (
                    <Link
                      href={`/today/${w.decisionId}` as never}
                      className="shrink-0 text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                    >
                      {t("לראות את ההחלטה", "View decision")}
                    </Link>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
