import { headers } from "next/headers";
import { Sidebar, type SidebarAccount } from "@/components/layout/sidebar";
import { Topbar, type TopbarControls } from "@/components/layout/topbar";
import { TrialBanner } from "@/components/billing/trial-banner";
import type { Store } from "@/lib/domain/types";
import { getAppLocale, getDictionary, type AppLocale } from "@/lib/i18n";
import { listAllStoresForSwitcher } from "@/lib/services/offline-sales-service";
import { getSubscriptionStatus } from "@/lib/billing/subscription-status";
import { gateTrialAccess } from "@/lib/billing/trial-gate";
import { getDisabledModules, getLockedModules } from "@/lib/server/module-flags";
import { getAuthContext, listUserOrgsForSwitcher } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { ChatWidget } from "@/components/chat/chat-widget";
import { SyncStatusProvider } from "@/components/sync/sync-status-provider";
import { SyncStatusDock } from "@/components/sync/sync-status-dock";

// Who is signed in, for the sidebar footer (desktop) and the More sheet
// (phones). Best-effort: anonymous-friendly defaults if not signed in.
async function resolveAccount(): Promise<SidebarAccount | null> {
  const auth = await getAuthContext().catch(() => null);
  if (!auth?.email) return null;
  let orgName: string | null = null;
  if (auth.orgId) {
    try {
      const org = (await getDb().organization.findUnique({ where: { id: auth.orgId }, select: { name: true } })) as { name: string } | null;
      orgName = org?.name ?? null;
    } catch {
      // ignore
    }
  }
  // Orgs the user can switch between (own + any they were invited into).
  // Never swallow this silently: a throw here hides the org switcher for
  // EVERY multi-org user, and that is indistinguishable from "one org".
  const orgs = await listUserOrgsForSwitcher().catch((error) => {
    console.error("[app-shell] listUserOrgsForSwitcher failed:", error instanceof Error ? error.message : error);
    return [];
  });
  return { email: auth.email, orgName, orgs };
}

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
  // query, runs once per request). Sidebar (phone top bar) and Topbar
  // (desktop) both render the StoreSwitcher from it.
  const [allStores, sub, account] = await Promise.all([
    listAllStoresForSwitcher(),
    // Subscription status — drives the trial banner above the topbar.
    // Best-effort: if it throws (no auth context, no org), we just skip
    // the banner.
    getSubscriptionStatus().catch(() => null),
    resolveAccount()
  ]);

  // SyncStatusProvider wraps the whole shell so background syncs survive
  // modal close AND client-side navigation — it sits above the router
  // outlet and is never unmounted by either.
  return (
    <SyncStatusProvider locale={locale === "he" ? "he" : "en"}>
      <div className="min-h-screen lg:flex">
        <Sidebar
          storeName={store.name}
          currentStoreId={store.id}
          stores={allStores}
          locale={locale}
          showPortfolio={allStores.length >= 2}
          disabledModules={getDisabledModules()}
          lockedModules={getLockedModules()}
          account={account}
        />
        <main className="min-w-0 flex-1">
          {sub ? <TrialBanner info={sub} locale={locale === "he" ? "he" : "en"} /> : null}
          {/* Bottom padding reserves the phone bottom nav (--hl-bottom-nav)
              plus the floating chat launcher, so the last block on any page
              never renders under either. */}
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 pt-4 pb-[calc(var(--hl-bottom-nav)+5.5rem+env(safe-area-inset-bottom))] sm:gap-8 sm:px-6 sm:pt-5 lg:px-10 lg:pt-6">
            <Topbar store={store} controls={controls} locale={locale} labels={dictionary} allStores={allStores} />
            {children}
          </div>
        </main>
        {/* Floating chat launcher — BI analyst + customer support, all pages. */}
        <ChatWidget locale={locale === "he" ? "he" : "en"} />
        {/* Background-sync dock — visible on every page while a sync runs. */}
        <SyncStatusDock locale={locale === "he" ? "he" : "en"} />
      </div>
    </SyncStatusProvider>
  );
}
