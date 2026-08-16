import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateById } from "@/lib/services/affiliate-portal-service";
import { getAffiliateCouponBuilderOptions } from "@/lib/services/affiliate-portal-admin-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table";
import { AffiliateCouponManager } from "@/components/affiliate-portal/affiliate-coupon-manager";

export default async function AffiliateDetailPage({ params }: { params: Promise<{ affiliateId: string }> }) {
  // Builder options must come from the caller's org store — the same store
  // coupon creation targets — not the globally-newest connected store.
  const activeStoreId = await resolveActiveStoreId();
  const [{ affiliateId }, chrome, options] = await Promise.all([
    params,
    getAppChromeData(),
    getAffiliateCouponBuilderOptions(activeStoreId ?? undefined)
  ]);
  const payload = await getAffiliateById(affiliateId);

  if (!payload) notFound();

  const { affiliate, coupons, couponHistory, conversions, content } = payload;
  const baseStoreUrl = `https://${chrome.store.domain}`;

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Affiliate Portal"
          title={`${affiliate.firstName} ${affiliate.lastName}`}
          description="Review affiliate performance, assign new Shopify discounts, and see the full history of every discount connection for this affiliate."
        />
        <AffiliatePortalNav />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Sales</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(affiliate.sales, chrome.store.currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Commission</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(affiliate.commission, chrome.store.currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Orders</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(affiliate.orders)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Clicks</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(affiliate.clicks)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Referral and discount tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Referral link</p>
                <p className="mt-2 break-all text-sm">{affiliate.referralLink}</p>
                <p className="mt-3 text-sm text-muted-foreground">Short link: {affiliate.shortLink}</p>
              </div>
              <AffiliateCouponManager
                baseStoreUrl={baseStoreUrl}
                affiliates={[
                  {
                    id: affiliate.id,
                    firstName: affiliate.firstName,
                    lastName: affiliate.lastName,
                    email: affiliate.email,
                    affiliateCode: affiliate.affiliateCode,
                    couponCode: affiliate.couponCode ?? null
                  }
                ]}
                products={options.products}
                collections={options.collections}
                customerSegments={options.customerSegments}
                lockedAffiliateId={affiliate.id}
                defaultMode="single"
              />
            </CardContent>
          </Card>

          <DataTable
            title="Current connected discounts"
            description="All discount codes currently mapped to this affiliate."
            columns={[
              { key: "code", label: "Code" },
              { key: "template", label: "Title" },
              { key: "discountLabel", label: "Discount" },
              { key: "assignmentMode", label: "Mode", render: (row) => row.assignmentMode === "bulk" ? "Bulk" : "Single" },
              { key: "createdAt", label: "Last assigned", render: (row) => new Date(row.createdAt).toLocaleString("en-US") },
              { key: "applyLink", label: "Apply link", render: (row) => <span className="text-xs break-all">{row.applyLink}</span> }
            ]}
            rows={coupons}
          />

          <DataTable
            title="Discount connection history"
            description="A permanent log of every discount that has been connected to this affiliate."
            columns={[
              { key: "connectedAt", label: "Connected at", render: (row) => new Date(row.connectedAt).toLocaleString("en-US") },
              { key: "code", label: "Code" },
              { key: "couponTitle", label: "Title" },
              { key: "discountLabel", label: "Discount" },
              { key: "assignmentMode", label: "Mode", render: (row) => row.assignmentMode === "bulk" ? "Bulk" : "Single" },
              { key: "connectionSource", label: "Source", render: (row) => row.connectionSource === "existing_coupon" ? "Existing coupon" : "Created in Shopify" }
            ]}
            rows={couponHistory}
          />

          <DataTable
            title="Content and creator performance"
            description="Creator content connected to this affiliate and the sales it has influenced so far."
            columns={[
              { key: "title", label: "Content" },
              { key: "views", label: "Views", render: (row) => formatNumber(row.views) },
              { key: "clicks", label: "Clicks", render: (row) => formatNumber(row.clicks) },
              { key: "orders", label: "Orders", render: (row) => formatNumber(row.orders) },
              { key: "sales", label: "Sales", render: (row) => formatCurrency(row.sales, chrome.store.currency) }
            ]}
            rows={content}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">{affiliate.status}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Affiliate details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">Email:</span> {affiliate.email}</p>
              <p><span className="text-muted-foreground">Country:</span> {affiliate.country || "-"}</p>
              <p><span className="text-muted-foreground">Program:</span> {affiliate.programName}</p>
              <p><span className="text-muted-foreground">Affiliate code:</span> {affiliate.affiliateCode}</p>
              <p><span className="text-muted-foreground">Current coupon:</span> {affiliate.couponCode ?? "-"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Approved balance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(affiliate.approvedBalance, chrome.store.currency)}</p>
            </CardContent>
          </Card>
          <DataTable
            title="Connected conversions"
            columns={[
              { key: "orderNumber", label: "Order" },
              { key: "trackingBy", label: "Tracking" },
              { key: "date", label: "Date", render: (row) => new Date(row.date).toLocaleString("en-US") },
              { key: "total", label: "Total", render: (row) => formatCurrency(row.total, chrome.store.currency) }
            ]}
            rows={conversions}
          />
        </div>
      </section>
    </AppShell>
  );
}
