import { AppShell } from "@/components/layout/app-shell";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { InventoryClient } from "@/components/dashboard-v2/inventory-client";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAnalyticsRepository } from "@/lib/repositories";
import { getDb } from "@/lib/server/db";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getAppLocale } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";

export const metadata = {
  title: "Product follow-ups"
};

export default async function ProductFollowUpsPage() {
  const repository = await getAnalyticsRepository();
  const [chrome, stock, locale, storeId] = await Promise.all([
    getAppChromeData(),
    repository.getProductStock(),
    getAppLocale(),
    resolveActiveStoreId()
  ]);

  // Inventory freshness — Shopify doesn't bump product.updated_at on
  // inventory-only changes, so the only signal of "is this number
  // current?" is the timestamp of the last FULL product re-sync.
  const db = getDb();
  const connection = storeId
    ? await db.shopifyConnection.findFirst({
        where: { storeId },
        select: { lastProductsSyncAt: true }
      })
    : null;
  const lastSyncedAt = connection?.lastProductsSyncAt ?? null;
  const syncAgeMinutes = lastSyncedAt
    ? Math.max(0, Math.round((Date.now() - lastSyncedAt.getTime()) / 60000))
    : null;
  const freshnessLabel = (() => {
    if (syncAgeMinutes === null) {
      return locale === "he" ? "מלאי טרם סונכרן" : "Inventory never synced";
    }
    if (syncAgeMinutes < 1) {
      return locale === "he" ? "מלאי מסונכרן כעת" : "Inventory synced just now";
    }
    if (syncAgeMinutes < 60) {
      return locale === "he"
        ? `מלאי סונכרן לפני ${syncAgeMinutes} דק'`
        : `Inventory synced ${syncAgeMinutes} min ago`;
    }
    const hours = Math.round(syncAgeMinutes / 60);
    return locale === "he"
      ? `מלאי סונכרן לפני ${hours} שעות`
      : `Inventory synced ${hours}h ago`;
  })();
  const freshnessIsStale = syncAgeMinutes === null || syncAgeMinutes > 6 * 60;

  const critical = stock.filter((row) => row.flag === "critical");
  const red = stock.filter((row) => row.flag === "red");
  const yellow = stock.filter((row) => row.flag === "yellow");
  const green = stock.filter((row) => row.flag === "green");

  const urgentCount = critical.length + red.length;
  const tone = critical.length > 0 ? "down" : red.length > 0 ? "down" : yellow.length > 0 ? "neutral" : "up";
  const headline =
    critical.length > 0
      ? locale === "he"
        ? `${formatNumber(critical.length)} מוצרים במצב חירום — פחות מ5 יחידות. לחדש מלאי עכשיו.`
        : `${critical.length} product${critical.length === 1 ? "" : "s"} in emergency — below 5 units. Restock now.`
      : red.length > 0
        ? locale === "he"
          ? `${formatNumber(red.length)} מוצרים במלאי קריטי — לחדש מלאי היום.`
          : `${red.length} product${red.length === 1 ? "" : "s"} critically low — restock today.`
        : yellow.length > 0
          ? locale === "he"
            ? `${formatNumber(yellow.length)} מוצרים מתקרבים לסוף המלאי — לתכנן הזמנה השבוע.`
            : `${yellow.length} product${yellow.length === 1 ? "" : "s"} running low — plan a reorder this week.`
          : locale === "he"
            ? "כל המוצרים במעקב במצב מלאי בריא."
            : "All tracked products are at healthy stock levels.";

  const body = [
    locale === "he"
      ? `${formatNumber(stock.length)} מוצרים בקטלוג · ${formatNumber(green.length)} במצב בריא.`
      : `${formatNumber(stock.length)} products in catalog · ${formatNumber(green.length)} healthy.`,
    urgentCount > 0
      ? locale === "he"
        ? `לחדש ${formatNumber(urgentCount)} פריטים כדי לשמור על תקציב פרסום יעיל ולמנוע חוסר במוצרים מובילים.`
        : `Restock ${formatNumber(urgentCount)} item${urgentCount === 1 ? "" : "s"} to keep ad spend efficient and avoid stockouts on bestsellers.`
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={locale === "he" ? "מעקבי מוצרים" : "Product follow-ups"}
          title={locale === "he" ? "התראות מלאי ותור חידוש" : "Stock alerts & restock queue"}
          description={
            locale === "he"
              ? "רק SKU פעילים — טיוטות ומוצרים בארכיון מסוננים. מצב חירום (<5), קריטי (<20), נמוך (<50)."
              : "Active SKUs only — drafts and archived products filtered out. Emergency (<5), critical (<20), low (<50)."
          }
        />

        <NarrativeBanner
          eyebrow={locale === "he" ? "דופק המלאי" : "Stock pulse"}
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={
            tone === "down"
              ? locale === "he"
                ? "נדרשת פעולה"
                : "Action needed"
              : tone === "neutral"
                ? locale === "he"
                  ? "לעקוב מקרוב"
                  : "Watch closely"
                : locale === "he"
                  ? "הכל תקין"
                  : "All good"
          }
        />

        <InventoryClient
          stock={stock}
          locale={locale}
          freshnessLabel={freshnessLabel}
          freshnessIsStale={freshnessIsStale}
          lastSyncedAtIso={lastSyncedAt ? lastSyncedAt.toISOString() : null}
        />
      </div>
    </AppShell>
  );
}
