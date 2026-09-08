import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildDecisionInbox } from "@/lib/services/decision-inbox-service";
import { SOURCE_LABEL } from "@/lib/domain/decision";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Watchlist — situations Hiloomy is monitoring that do NOT need a management
// decision yet. The screen exists to say: Hiloomy sees more than it shows.
//
// A plain list with dividers, on purpose: no card per row, no icon bubble.
// Only the decisions on Today deserve a card.
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
      <div className="space-y-6">
        <PageHead
          eyebrow={t("מעקב", "Watchlist")}
          title={t("מה הילומי עוקבת אחריו", "What Hiloomy is watching")}
          description={t(
            `${items.length} מצבים במעקב · ${inbox.stats.reviewed.toLocaleString("en-US")} אותות נסקרו · ${inbox.stats.suppressed.toLocaleString("en-US")} הושתקו. הם יעלו לתיבת ההחלטות רק אם הראיות ישתנו.`,
            `${items.length} situations watched · ${inbox.stats.reviewed.toLocaleString("en-US")} signals reviewed · ${inbox.stats.suppressed.toLocaleString("en-US")} suppressed. They move to the inbox only if the evidence changes.`
          )}
        />

        {items.length === 0 ? (
          <p className="border-t border-border pt-6 text-sm text-muted-foreground">
            {t("אין כרגע מצבים במעקב. הילומי תוסיף כאן כל דבר שמתקרב לסף החלטה.", "Nothing is being watched right now. Hiloomy will list anything approaching a decision threshold here.")}
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {items.map((w) => (
              <li key={w.id} className="py-4">
                <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase">{SOURCE_LABEL[w.source][lc]}</span>
                  <span suppressHydrationWarning>
                    {new Date(w.since).toLocaleDateString(isHe ? "he-IL" : "en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="mt-1 text-base font-semibold leading-6">{w.title[lc]}</p>
                <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{w.detail[lc]}</p>
                {w.decisionId ? (
                  <Link href={`/today/${w.decisionId}` as never} className="mt-1.5 inline-flex min-h-8 items-center text-sm font-semibold text-foreground underline-offset-4 hover:underline">
                    {t("לראות את ההחלטה", "View decision")}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
