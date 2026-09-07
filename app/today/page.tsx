import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { DecisionInbox } from "@/components/decisions/decision-inbox";
import { TodaySummary } from "@/components/decisions/today-summary";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { listAllStoresForSwitcher, resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildDecisionInbox } from "@/lib/services/decision-inbox-service";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = { title: "Today — Hiloomy" };

// Today — the Commercial Decision Inbox. Hiloomy reviewed the business and
// the market, suppressed routine noise, and lists only the decisions that
// deserve management attention. Zero cards is a success state.
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const storeId = await resolveActiveStoreId();
  // No connected store → the Command Center owns onboarding.
  if (!storeId) redirect("/dashboard" as never);

  const [chrome, inbox, allStores, params] = await Promise.all([
    getAppChromeData(),
    buildDecisionInbox(storeId),
    listAllStoresForSwitcher().catch(() => []),
    searchParams
  ]);

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-7 sm:space-y-8">
        <PageHead eyebrow={t("היום", "Today")} title={t("תיבת ההחלטות המסחריות", "Commercial Decision Inbox")} />

        <TodaySummary
          locale={isHe ? "he" : "en"}
          storeName={chrome.store.name}
          canSwitchBrand={allStores.length > 1}
          stats={inbox.stats}
          updatedAt={inbox.updatedAt}
        />

        <DecisionInbox
          decisions={inbox.decisions}
          locale={isHe ? "he" : "en"}
          reviewed={inbox.stats.reviewed}
          initialOpenId={params.open ?? null}
        />

        <p className="text-xs text-muted-foreground">
          {t(
            `${inbox.stats.watching} מצבים נוספים במעקב — ללא צורך בהחלטה כרגע. `,
            `${inbox.stats.watching} more situations are being watched with no decision needed yet. `
          )}
          <Link href={"/watchlist" as never} className="font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300">
            {t("לרשימת המעקב", "Open the Watchlist")}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
