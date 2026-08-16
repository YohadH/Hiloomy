import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar, type TopbarControls } from "@/components/layout/topbar";
import { TrialBanner } from "@/components/billing/trial-banner";
import type { Store } from "@/lib/domain/types";
import { getAppLocale, getDictionary, type AppLocale } from "@/lib/i18n";
import { listAllStoresForSwitcher } from "@/lib/services/offline-sales-service";
import { getSubscriptionStatus } from "@/lib/billing/subscription-status";
import { gateTrialAccess } from "@/lib/billing/trial-gate";
import { getDisabledModules, getLockedModules } from "@/lib/server/module-flags";
import { ChatWidget } from "@/components/chat/chat-widget";

export async function AppShell({
  children,
  store,
  controls,
  localeOverride
}: {
  children: React.ReactNode;
  store: Store;
  controls?: TopbarControls;
  localeOverride?: AppLocale;
}) {
  const locale = localeOverride ?? (await getAppLocale());
  const dictionary = getDictionary(locale);

  // Paywall gate. Reads the request pathname (set by middleware) and
  // redirects to /trial-expired if the user's trial has expired AND
  // they aren't on an exempt path (/billing, /settings/*, etc).
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/";
  await gateTrialAccess(pathname);

  // Fetch the list of every installed brand here in the shell (single
  // query, runs once per request). The Topbar receives them and renders
  // the StoreSwitcher next to the current store name.
  const allStores = await listAllStoresForSwitcher();
  // Subscription status — drives the trial banner above the topbar.
  // Best-effort: if it throws (no auth context, no org), we just skip
  // the banner.
  const sub = await getSubscriptionStatus().catch(() => null);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        storeName={store.name}
        locale={locale}
        labels={dictionary}
        showPortfolio={allStores.length >= 2}
        disabledModules={getDisabledModules()}
        lockedModules={getLockedModules()}
      />
      <main className="flex-1">
        {sub ? <TrialBanner info={sub} locale={locale === "he" ? "he" : "en"} /> : null}
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:gap-8 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
          <Topbar
            store={store}
            controls={controls}
            locale={locale}
            labels={dictionary}
            allStores={allStores}
          />
          {children}
        </div>
      </main>
      {/* Floating chat launcher — BI analyst + customer support, all pages. */}
      <ChatWidget locale={locale === "he" ? "he" : "en"} />
    </div>
  );
}
