import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { SalesSummaryPanel } from "@/components/sales-summary/sales-summary-panel";
import { getAppChromeData } from "@/lib/services/analytics-service";
import {
  listOfflineSalesImports,
  resolveActiveStoreId
} from "@/lib/services/offline-sales-service";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SalesSummaryPage() {
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  const storeId = await resolveActiveStoreId();
  const imports = storeId ? await listOfflineSalesImports(storeId) : [];

  const heading =
    locale === "he"
      ? {
          eyebrow: "סיכום מכירות",
          title: "שורה תחתונה — אונליין ואופליין",
          description:
            "העלאת קובץ אקסל של מכירות אופליין כדי לראות את המכירות הכוללות מול Shopify והערוצים הפיזיים במסך אחד. השורות מותאמות למוצרי Shopify לפי ברקוד."
        }
      : {
          eyebrow: "Sales Summary",
          title: "Online + offline bottom line",
          description:
            "Upload your monthly offline sales spreadsheet to see total sales across Shopify and your physical / wholesale channels in one place. Rows are matched to Shopify products by barcode."
        };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
        <SalesSummaryPanel initialImports={imports} currency={chrome.store.currency} locale={locale} />
      </div>
    </AppShell>
  );
}
