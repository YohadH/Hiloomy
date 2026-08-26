import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateCoupons, getAffiliates } from "@/lib/services/affiliate-portal-service";
import { getAffiliateCouponBuilderOptions } from "@/lib/services/affiliate-portal-admin-service";
import { appBaseUrl, getSignupSettings } from "@/lib/services/affiliate-signup-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { TrackedLinkComposer } from "@/components/affiliate-portal/affiliate-link-builder";
import { getAppLocale } from "@/lib/i18n";
import { DataTable } from "@/components/shared/data-table";
import { AffiliateCouponManager } from "@/components/affiliate-portal/affiliate-coupon-manager";
import { AffiliateAttributionSyncButton } from "@/components/affiliate-portal/affiliate-attribution-sync-button";

export default async function CouponsPage() {
  // Builder options query the store's LIVE Shopify catalog — they must come
  // from the caller's org store, the same store coupons/create will target.
  const activeStoreId = await resolveActiveStoreId();
  const [chrome, coupons, affiliates, options, locale] = await Promise.all([
    getAppChromeData(),
    getAffiliateCoupons(),
    getAffiliates(),
    getAffiliateCouponBuilderOptions(activeStoreId ?? undefined),
    getAppLocale()
  ]);
  const signupSettings = activeStoreId
    ? await getSignupSettings(activeStoreId).catch(() => null)
    : null;
  const baseStoreUrl = `https://${chrome.store.domain}`;
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const dateLocale = isHe ? "he-IL" : "en-US";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow={lang("פורטל שותפים", "Affiliate Portal")}
            title={lang("יצירת קודי הנחה וקישורי שותפות", "Create Shopify discounts and affiliate links")}
            description={lang(
              "צרו קודי הנחה בShopify בודדים או בכמות, שייכו אותם לשותפות, והשתמשו בקישורי ההפעלה למעקב המרות.",
              "Create Shopify discount codes one by one or in bulk, attach them to affiliates, and use the generated apply links for referral tracking."
            )}
          />
          <AffiliateAttributionSyncButton storeId={chrome.store.id} locale={isHe ? "he" : "en"} />
        </div>
        <AffiliatePortalNav locale={isHe ? "he" : "en"} />
      </section>

      <AffiliateCouponManager
        baseStoreUrl={baseStoreUrl}
        affiliates={affiliates}
        products={options.products}
        collections={options.collections}
        customerSegments={options.customerSegments}
        defaultMode="single"
        locale={isHe ? "he" : "en"}
      />

      <TrackedLinkComposer
        baseUrl={appBaseUrl()}
        slug={signupSettings?.signupSlug ?? null}
        affiliates={affiliates.map((item) => ({
          id: item.id,
          firstName: item.firstName,
          lastName: item.lastName,
          affiliateCode: item.affiliateCode
        }))}
        coupons={coupons.map((item) => ({ code: item.code, affiliateId: item.affiliateId }))}
        locale={isHe ? "he" : "en"}
      />

      <DataTable
        title={lang("הנחות מחוברות", "Connected discounts")}
        locale={locale}
        description={lang(
          "שיוכי קודי ההנחה לשותפות ששמורים באפליקציה. בפרופיל של כל שותפה יש גם היסטוריית חיבורים מלאה.",
          "Current affiliate discount mappings stored in the app. The affiliate profile page also keeps the full connection history."
        )}
        columns={[
          { key: "code", label: lang("קוד", "Code") },
          { key: "affiliateName", label: lang("שותף/ה", "Affiliate") },
          { key: "template", label: lang("כותרת", "Title") },
          { key: "discountLabel", label: lang("הנחה", "Discount") },
          {
            key: "assignmentMode",
            label: lang("מצב", "Mode"),
            render: (row) =>
              row.assignmentMode === "bulk" ? lang("כמותי", "Bulk") : lang("בודד", "Single")
          },
          {
            key: "connectionSource",
            label: lang("מקור", "Source"),
            render: (row) =>
              row.connectionSource === "existing_coupon"
                ? lang("קופון קיים", "Existing coupon")
                : lang("נוצר בShopify", "Created in Shopify")
          },
          {
            key: "createdAt",
            label: lang("שויך לאחרונה", "Last assigned"),
            render: (row) => new Date(row.createdAt).toLocaleString(dateLocale)
          },
          {
            key: "applyLink",
            label: lang("קישור הפעלה", "Apply link"),
            render: (row) => (
              <span
                dir="ltr"
                className="block w-full max-w-full sm:max-w-[28rem] break-all text-xs text-muted-foreground"
              >
                {row.applyLink}
              </span>
            )
          }
        ]}
        rows={coupons}
      />
    </AppShell>
  );
}
