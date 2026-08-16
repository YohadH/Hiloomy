import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateContentPerformance } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function AffiliateContentPage() {
  const [chrome, content] = await Promise.all([getAppChromeData(), getAffiliateContentPerformance()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Affiliate Portal"
          title="Affiliate content performance"
          description="See which posts and creative assets are generating clicks, orders, and revenue for each affiliate."
        />
        <AffiliatePortalNav />
      </section>

      <DataTable
        title="Content performance by affiliate"
        columns={[
          { key: "affiliateName", label: "Affiliate" },
          { key: "title", label: "Content" },
          { key: "contentType", label: "Type" },
          { key: "views", label: "Views", render: (row) => formatNumber(row.views) },
          { key: "clicks", label: "Clicks", render: (row) => formatNumber(row.clicks) },
          { key: "orders", label: "Orders", render: (row) => formatNumber(row.orders) },
          { key: "sales", label: "Sales", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
        ]}
        rows={content}
      />
    </AppShell>
  );
}
