import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { SalesSummaryPanel } from "@/components/sales-summary/sales-summary-panel";
import { getAppChromeData } from "@/lib/services/analytics-service";
import {
  listOfflineSalesImports,
  resolveActiveStoreId
} from "@/lib/services/offline-sales-service";
import { getAppLocale } from "@/lib/i18n";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getSalesByChannel, getProductsByChannel } from "@/lib/services/sales-channel-service";
import { ChannelBreakdown, PosVsOnlineTable } from "@/components/sales-summary/channel-breakdown";

export const dynamic = "force-dynamic";

export default async function SalesSummaryPage() {
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  const storeId = await resolveActiveStoreId();
  const imports = storeId ? await listOfflineSalesImports(storeId) : [];
  // Where the synced orders came from (online / POS / manual), for the
  // picker's window — so the manager knows what is already in Hiloomy
  // before uploading anything, and can compare POS to online per product.
  const range = await getReportingDateRangeSelection(locale === "he" ? "he" : "en");
  const byChannel = storeId ? await getSalesByChannel(storeId, { start: range.start, end: range.end }).catch(() => null) : null;
  const posVsOnline = storeId && byChannel?.hasPos ? await getProductsByChannel(storeId, { start: range.start, end: range.end }).catch(() => []) : [];

  const heading =
    locale === "he"
      ? {
          eyebrow: "סיכום מכירות",
          title: "אונליין, קופה ואופליין",
          description:
            "מה נמכר באתר, מה נמכר בקופת Shopify, ומה נמכר בערוצים שלא עוברים דרך Shopify. מכירות הקופה כבר מסונכרנות; קובץ אקסל מעלים רק לערוצים חיצוניים, והשורות מותאמות לפי ברקוד."
        }
      : {
          eyebrow: "Sales Summary",
          title: "Online, POS and offline",
          description:
            "What sells on the site, what sells at Shopify POS, and what sells through channels outside Shopify. POS sales are already synced; upload a spreadsheet only for external channels, matched by barcode."
        };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
        {byChannel ? <ChannelBreakdown data={byChannel} currency={chrome.store.currency} locale={locale === "he" ? "he" : "en"} rangeLabel={range.label} /> : null}
        {byChannel?.hasPos ? <PosVsOnlineTable rows={posVsOnline} currency={chrome.store.currency} locale={locale === "he" ? "he" : "en"} /> : null}
        <SalesSummaryPanel initialImports={imports} currency={chrome.store.currency} locale={locale} />
      </div>
    </AppShell>
  );
}
