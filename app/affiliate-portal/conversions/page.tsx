import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";
import { UploadConversionsCsvButton } from "@/components/affiliate-portal/upload-conversions-csv-button";
import { ManualConversionButton } from "@/components/affiliate-portal/manual-conversion-button";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateConversions } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { getAppLocale } from "@/lib/i18n";
import { saasStrings } from "@/lib/i18n/saas-strings";

export default async function ConversionsPage() {
  const [chrome, conversions, locale] = await Promise.all([
    getAppChromeData(),
    getAffiliateConversions(),
    getAppLocale()
  ]);
  const isHe = locale === "he";
  const t = saasStrings[isHe ? "he" : "en"].conversions;
  const heading = isHe
    ? {
        eyebrow: "פורטל שותפים",
        title: "הזמנות שותפים ושיוכים",
        description: "עקבו אחרי אילו הזמנות שויכו לשותפים, איך הן נמדדו ומה העמלה שהן יצרו.",
        exportCsv: "ייצוא CSV",
        sectionTitle: "הזמנות שותפים",
        sectionDescription: "הזמנות ששויכו לשותפים על פי שימוש בקופונים בShopify וההתאמה מBixGrow."
      }
    : {
        eyebrow: "Affiliate Portal",
        title: "Referral orders and attributions",
        description: "Track which affiliate orders were matched, how they were tracked, and what commission they generated.",
        exportCsv: "Export CSV",
        sectionTitle: "Referral orders",
        sectionDescription: "Orders attributed to affiliates from Shopify discount usage and referral matching."
      };

  const dateLocale = isHe ? "he-IL" : "en-US";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
          />
          <div className="flex flex-wrap items-start gap-3">
            <ManualConversionButton locale={isHe ? "he" : "en"} />
            <AffiliateAttributionSyncButton storeId={chrome.store.id} />
            <UploadConversionsCsvButton />
            <a href="/api/affiliate-portal/conversions/export" className={buttonVariants({ variant: "secondary" })}>
              {heading.exportCsv}
            </a>
          </div>
        </div>
        <AffiliatePortalNav />
      </section>

      <DataTable
        title={heading.sectionTitle}
        description={heading.sectionDescription}
        columns={[
          { key: "orderNumber", label: t.order },
          { key: "date", label: t.date, render: (row) => new Date(row.date).toLocaleString(dateLocale) },
          { key: "affiliateName", label: t.affiliate },
          {
            key: "affiliateCode",
            label: t.affiliateId,
            render: (row) =>
              row.affiliateCode ? (
                <span className="font-mono text-xs text-muted-foreground">{row.affiliateCode}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
          },
          {
            key: "couponCode",
            label: t.coupon,
            render: (row) =>
              row.couponCode ? (
                <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-mono font-medium">
                  {row.couponCode}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
          },
          { key: "total", label: t.total, render: (row) => formatCurrency(row.total, chrome.store.currency) },
          { key: "commission", label: t.commission, render: (row) => formatCurrency(row.commission, chrome.store.currency) },
          { key: "status", label: t.status },
          { key: "trackingBy", label: t.tracking },
          { key: "contentTitle", label: t.content }
        ]}
        rows={conversions}
      />
    </AppShell>
  );
}
