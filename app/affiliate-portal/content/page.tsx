import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateContentPerformance } from "@/lib/services/affiliate-portal-service";
import { getAppLocale } from "@/lib/i18n";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function AffiliateContentPage() {
  const [chrome, content, locale] = await Promise.all([
    getAppChromeData(),
    getAffiliateContentPerformance(),
    getAppLocale()
  ]);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("פורטל שותפים", "Affiliate Portal")}
          title={lang("ביצועי תוכן של שותפות", "Affiliate content performance")}
          description={lang(
            "אילו פוסטים ונכסי קריאייטיב מייצרים קליקים, הזמנות והכנסה לכל שותפה.",
            "See which posts and creative assets are generating clicks, orders, and revenue for each affiliate."
          )}
        />
        <AffiliatePortalNav locale={isHe ? "he" : "en"} />
      </section>

      <DataTable
        title={lang("ביצועי תוכן לפי שותפה", "Content performance by affiliate")}
        columns={[
          { key: "affiliateName", label: lang("שותף/ה", "Affiliate") },
          { key: "title", label: lang("תוכן", "Content") },
          { key: "contentType", label: lang("סוג", "Type") },
          { key: "views", label: lang("צפיות", "Views"), render: (row) => formatNumber(row.views) },
          { key: "clicks", label: lang("קליקים", "Clicks"), render: (row) => formatNumber(row.clicks) },
          { key: "orders", label: lang("הזמנות", "Orders"), render: (row) => formatNumber(row.orders) },
          {
            key: "sales",
            label: lang("מכירות", "Sales"),
            render: (row) => formatCurrency(row.sales, chrome.store.currency)
          }
        ]}
        rows={content}
      />
    </AppShell>
  );
}
