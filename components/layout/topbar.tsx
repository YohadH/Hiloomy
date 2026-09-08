import type { Store } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { ReportingPicker } from "@/components/layout/reporting-picker";
import { StoreSwitcher, type StoreSwitcherStore } from "@/components/layout/store-switcher";

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

// One row of chrome above the page: the store (desktop — on phones the top
// bar in the sidebar carries it) and the date range. Domain, marketing copy,
// org and account moved out (sidebar footer / More sheet) so the product
// starts sooner. Connection state is only shown when something is wrong.
export function Topbar({
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
  // renders as a dropdown; otherwise the store name.
  allStores?: StoreSwitcherStore[];
}) {
  const lang = locale === "he" ? "he" : "en";
  const demoLabel = locale === "he" ? "נתוני הדגמה" : "Demo data";
  const demoTitle = locale === "he" ? "חנות הדגמה — כל הנתונים סינתטיים" : "Demo store — all data is synthetic";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border pb-4">
      <div className="hidden min-w-0 items-center gap-3 lg:flex">
        {allStores && allStores.length > 1 ? (
          <StoreSwitcher currentStoreId={store.id} stores={allStores} locale={lang} />
        ) : (
          <h2 className="truncate text-xl font-semibold tracking-tight">{store.name}</h2>
        )}
        {!store.connected ? (
          <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
            {labels.common.storeSetup}
          </span>
        ) : null}
        {store.isDemo ? (
          <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground" title={demoTitle}>
            {demoLabel}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 lg:hidden">
        {!store.connected ? (
          <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
            {labels.common.storeSetup}
          </span>
        ) : null}
        {store.isDemo ? (
          <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground" title={demoTitle}>
            {demoLabel}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none">
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
          locale={lang}
        />
      </div>
    </div>
  );
}
