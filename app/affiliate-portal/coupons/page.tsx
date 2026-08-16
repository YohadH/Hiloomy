import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateCoupons, getAffiliates } from "@/lib/services/affiliate-portal-service";
import { getAffiliateCouponBuilderOptions } from "@/lib/services/affiliate-portal-admin-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { DataTable } from "@/components/shared/data-table";
import { AffiliateCouponManager } from "@/components/affiliate-portal/affiliate-coupon-manager";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";

export default async function CouponsPage() {
  // Builder options query the store's LIVE Shopify catalog — they must come
  // from the caller's org store, the same store coupons/create will target.
  const activeStoreId = await resolveActiveStoreId();
  const [chrome, coupons, affiliates, options] = await Promise.all([
    getAppChromeData(),
    getAffiliateCoupons(),
    getAffiliates(),
    getAffiliateCouponBuilderOptions(activeStoreId ?? undefined)
  ]);
  const baseStoreUrl = `https://${chrome.store.domain}`;

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow="Affiliate Portal"
            title="Create Shopify discounts and affiliate links"
            description="Create Shopify discount codes one by one or in bulk, attach them to affiliates, and use the generated apply links for referral tracking."
          />
          <AffiliateAttributionSyncButton storeId={chrome.store.id} />
        </div>
        <AffiliatePortalNav />
      </section>

      <AffiliateCouponManager
        baseStoreUrl={baseStoreUrl}
        affiliates={affiliates}
        products={options.products}
        collections={options.collections}
        customerSegments={options.customerSegments}
        defaultMode="single"
      />

      <DataTable
        title="Connected discounts"
        description="Current affiliate discount mappings stored in the app. The affiliate profile page also keeps the full connection history."
        columns={[
          { key: "code", label: "Code" },
          { key: "affiliateName", label: "Affiliate" },
          { key: "template", label: "Title" },
          { key: "discountLabel", label: "Discount" },
          { key: "assignmentMode", label: "Mode", render: (row) => (row.assignmentMode === "bulk" ? "Bulk" : "Single") },
          { key: "connectionSource", label: "Source", render: (row) => (row.connectionSource === "existing_coupon" ? "Existing coupon" : "Created in Shopify") },
          { key: "createdAt", label: "Last assigned", render: (row) => new Date(row.createdAt).toLocaleString("en-US") },
          {
            key: "applyLink",
            label: "Apply link",
            render: (row) => <span className="block w-full max-w-full sm:max-w-[28rem] break-all text-xs text-muted-foreground">{row.applyLink}</span>
          }
        ]}
        rows={coupons}
      />
    </AppShell>
  );
}
