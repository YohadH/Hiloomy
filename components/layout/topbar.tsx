import { Badge } from "@/components/ui/badge";
import type { Store } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { ReportingPicker } from "@/components/layout/reporting-picker";
import { SyncNowButton } from "@/components/layout/sync-now-button";
import { AccountMenu } from "@/components/layout/account-menu";
import {
  StoreSwitcher,
  type StoreSwitcherStore
} from "@/components/layout/store-switcher";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";

export interface TopbarControls {
  dateRangeLabel?: string;
  comparisonLabel?: string;
  startDate?: string;
  endDate?: string;
  preset?: string;
  comparison?: {
    mode: string;
    enabled: boolean;
    startDate: string;
    endDate: string;
    label: string;
  };
}

export async function Topbar({
  store,
  controls,
  labels,
  locale,
  allStores
}: {
  store: Store;
  controls?: TopbarControls;
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
  };
  // List of every installed brand. When length > 1, the StoreSwitcher
  // renders as a dropdown next to the brand name. When length <= 1, it
  // renders as a subtle "+ Connect another brand" link.
  allStores?: StoreSwitcherStore[];
}) {
  // Auth context for the account menu — bail to anonymous-friendly
  // defaults if not signed in (legacy path during Phase 1 rollout).
  const auth = await getAuthContext().catch(() => null);
  let orgName: string | null = null;
  if (auth?.orgId) {
    try {
      const db = getDb();
      const org = (await db.organization.findUnique({
        where: { id: auth.orgId },
        select: { name: true }
      })) as { name: string } | null;
      orgName = org?.name ?? null;
    } catch {
      // ignore
    }
  }
  return (
    <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:pb-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge className="whitespace-nowrap">
            {store.connected ? labels.common.connectedStore : labels.common.storeSetup}
          </Badge>
          {store.isDemo ? (
            <span
              className="inline-flex items-center whitespace-nowrap rounded-full border border-violet-300 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800"
              title={
                locale === "he"
                  ? "חנות הדגמה — כל הנתונים סינתטיים"
                  : "Demo store — all data is synthetic"
              }
            >
              {locale === "he" ? "נתוני הדגמה" : "Demo data"}
            </span>
          ) : null}
          <p className="text-sm text-muted-foreground truncate max-w-full">{store.domain}</p>
          {allStores ? (
            <StoreSwitcher currentStoreId={store.id} stores={allStores} locale={locale === "he" ? "he" : "en"} />
          ) : null}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl break-words">{store.name}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.common.founderAnalyticsCopy}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
        <SyncNowButton locale={locale === "he" ? "he" : "en"} />
        {auth?.email ? (
          <AccountMenu
            email={auth.email}
            displayName={null}
            orgName={orgName}
            locale={locale === "he" ? "he" : "en"}
          />
        ) : null}
        <ReportingPicker
          storeId={store.id}
          storeConnected={store.connected}
          initialPreset={(controls?.preset as never) ?? "last_30"}
          initialStart={controls?.startDate ?? new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
          initialEnd={controls?.endDate ?? new Date().toISOString().slice(0, 10)}
          initialComparisonMode={(controls?.comparison?.mode as never) ?? "prev_period"}
          initialComparisonStart={controls?.comparison?.startDate ?? ""}
          initialComparisonEnd={controls?.comparison?.endDate ?? ""}
          initialRangeLabel={controls?.dateRangeLabel ?? "Last 30 days"}
          initialComparisonLabel={controls?.comparisonLabel ?? "Previous period"}
          exportLabel={labels.common.exportSummary}
          locale={locale === "he" ? "he" : "en"}
        />
      </div>
    </div>
  );
}
