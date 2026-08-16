import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliates } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency } from "@/lib/utils";
import { AffiliateDirectoryActions } from "@/components/affiliate-portal/affiliate-directory-actions";
import { AffiliateInstagramField } from "@/components/affiliate-portal/affiliate-instagram-field";

export default async function AffiliatesPage() {
  const [chrome, affiliates] = await Promise.all([getAppChromeData(), getAffiliates()]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow="Affiliate Portal"
            title="Affiliate directory"
            description="Manage your affiliates, import them from files, export the directory, and open each profile for coupons and performance."
          />
          <AffiliateDirectoryActions />
        </div>
        <AffiliatePortalNav />
      </section>

      <DataTable
        title="All affiliates"
        columns={[
          {
            key: "firstName",
            label: "Affiliate",
            render: (row) => (
              <Link href={`/affiliate-portal/affiliates/${row.id}`} className="font-semibold hover:underline">
                {row.firstName} {row.lastName}
                <br />
                <span className="font-normal text-muted-foreground">{row.email}</span>
              </Link>
            )
          },
          { key: "programName", label: "Program" },
          { key: "status", label: "Status" },
          { key: "dateJoined", label: "Joined", render: (row) => new Date(row.dateJoined).toLocaleString("en-US") },
          { key: "lastLogin", label: "Last login", render: (row) => (row.lastLogin ? new Date(row.lastLogin).toLocaleString("en-US") : "-") },
          { key: "source", label: "Source" },
          {
            key: "instagramProfileUrl",
            label: "Instagram",
            render: (row) => (
              <AffiliateInstagramField
                affiliateId={row.id}
                storeId={chrome.store.id}
                initialValue={row.instagramProfileUrl ?? null}
              />
            )
          },
          { key: "couponCode", label: "Coupon", render: (row) => row.couponCode ?? "-" },
          { key: "sales", label: "Sales", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
        ]}
        rows={affiliates}
      />
    </AppShell>
  );
}
