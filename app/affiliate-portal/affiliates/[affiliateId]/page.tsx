import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliateById } from "@/lib/services/affiliate-portal-service";
import { getAffiliateCouponBuilderOptions } from "@/lib/services/affiliate-portal-admin-service";
import { appBaseUrl, getSignupSettings } from "@/lib/services/affiliate-signup-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getAppLocale } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table";
import { AffiliateCouponManager } from "@/components/affiliate-portal/affiliate-coupon-manager";
import { TrackedLinkComposer } from "@/components/affiliate-portal/affiliate-link-builder";

export default async function AffiliateDetailPage({ params }: { params: Promise<{ affiliateId: string }> }) {
  // Builder options must come from the caller's org store — the same store
  // coupon creation targets — not the globally-newest connected store.
  const activeStoreId = await resolveActiveStoreId();
  const [{ affiliateId }, chrome, options, locale, signupSettings] = await Promise.all([
    params,
    getAppChromeData(),
    getAffiliateCouponBuilderOptions(activeStoreId ?? undefined),
    getAppLocale(),
    activeStoreId ? getSignupSettings(activeStoreId).catch(() => null) : Promise.resolve(null)
  ]);
  const payload = await getAffiliateById(affiliateId);

  if (!payload) notFound();

  const { affiliate, coupons, couponHistory, conversions, content } = payload;
  const baseStoreUrl = `https://${chrome.store.domain}`;
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const dateLocale = isHe ? "he-IL" : "en-US";
  const modeLabel = (mode: string) => (mode === "bulk" ? lang("כמותי", "Bulk") : lang("בודד", "Single"));

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("פורטל שותפים", "Affiliate Portal")}
          title={`${affiliate.firstName} ${affiliate.lastName}`}
          description={lang(
            "ביצועי השותפה, שיוך קודי הנחה חדשים, והיסטוריית החיבורים המלאה של כל קוד.",
            "Review affiliate performance, assign new Shopify discounts, and see the full history of every discount connection for this affiliate."
          )}
        />
        <AffiliatePortalNav locale={isHe ? "he" : "en"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{lang("מכירות", "Sales")}</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(affiliate.sales, chrome.store.currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{lang("עמלה", "Commission")}</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(affiliate.commission, chrome.store.currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{lang("הזמנות", "Orders")}</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(affiliate.orders)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{lang("קליקים", "Clicks")}</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(affiliate.clicks)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{lang("כלי הפניה והנחות", "Referral and discount tools")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{lang("קישור הפניה", "Referral link")}</p>
                <p className="mt-2 break-all text-sm" dir="ltr">{affiliate.referralLink}</p>
              </div>
              {/* Per-affiliate short-link composer — coupon + UTM + destination,
                  minted to a tiny hiloomy.com/l/{token}. Locked to this
                  affiliate (single option in the picker). */}
              <TrackedLinkComposer
                baseUrl={appBaseUrl()}
                slug={signupSettings?.signupSlug ?? null}
                affiliates={[
                  {
                    id: affiliate.id,
                    firstName: affiliate.firstName,
                    lastName: affiliate.lastName,
                    affiliateCode: affiliate.affiliateCode
                  }
                ]}
                coupons={coupons.map((c) => ({ code: c.code, affiliateId: affiliate.id }))}
                locale={isHe ? "he" : "en"}
              />
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
                locale={isHe ? "he" : "en"}
              />
            </CardContent>
          </Card>

          <DataTable
            title={lang("קודי הנחה מחוברים", "Current connected discounts")}
            locale={locale}
            description={lang(
              "כל קודי ההנחה שמשויכים כרגע לשותפה הזו.",
              "All discount codes currently mapped to this affiliate."
            )}
            columns={[
              { key: "code", label: lang("קוד", "Code") },
              { key: "template", label: lang("כותרת", "Title") },
              { key: "discountLabel", label: lang("הנחה", "Discount") },
              { key: "assignmentMode", label: lang("מצב", "Mode"), render: (row) => modeLabel(row.assignmentMode) },
              {
                key: "createdAt",
                label: lang("שויך לאחרונה", "Last assigned"),
                render: (row) => new Date(row.createdAt).toLocaleString(dateLocale)
              },
              {
                key: "applyLink",
                label: lang("קישור הפעלה", "Apply link"),
                render: (row) => <span dir="ltr" className="text-xs break-all">{row.applyLink}</span>
              }
            ]}
            rows={coupons}
          />

          <DataTable
            title={lang("היסטוריית חיבורי הנחות", "Discount connection history")}
            locale={locale}
            description={lang(
              "יומן קבוע של כל קוד הנחה שחובר אי פעם לשותפה הזו.",
              "A permanent log of every discount that has been connected to this affiliate."
            )}
            columns={[
              {
                key: "connectedAt",
                label: lang("חובר בתאריך", "Connected at"),
                render: (row) => new Date(row.connectedAt).toLocaleString(dateLocale)
              },
              { key: "code", label: lang("קוד", "Code") },
              { key: "couponTitle", label: lang("כותרת", "Title") },
              { key: "discountLabel", label: lang("הנחה", "Discount") },
              { key: "assignmentMode", label: lang("מצב", "Mode"), render: (row) => modeLabel(row.assignmentMode) },
              {
                key: "connectionSource",
                label: lang("מקור", "Source"),
                render: (row) =>
                  row.connectionSource === "existing_coupon"
                    ? lang("קופון קיים", "Existing coupon")
                    : lang("נוצר בShopify", "Created in Shopify")
              }
            ]}
            rows={couponHistory}
          />

          <DataTable
            title={lang("ביצועי תוכן ויוצרות", "Content and creator performance")}
            locale={locale}
            description={lang(
              "תוכן שמחובר לשותפה הזו והמכירות שהוא השפיע עליהן עד כה.",
              "Creator content connected to this affiliate and the sales it has influenced so far."
            )}
            columns={[
              { key: "title", label: lang("תוכן", "Content") },
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
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{lang("סטטוס", "Status")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">{affiliate.status}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{lang("פרטי השותפה", "Affiliate details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">{lang("אימייל", "Email")}:</span> {affiliate.email}</p>
              <p><span className="text-muted-foreground">{lang("מדינה", "Country")}:</span> {affiliate.country || "-"}</p>
              <p><span className="text-muted-foreground">{lang("תוכנית", "Program")}:</span> {affiliate.programName}</p>
              <p><span className="text-muted-foreground">{lang("קוד שותפה", "Affiliate code")}:</span> {affiliate.affiliateCode}</p>
              <p><span className="text-muted-foreground">{lang("קופון נוכחי", "Current coupon")}:</span> {affiliate.couponCode ?? "-"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{lang("יתרה מאושרת", "Approved balance")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(affiliate.approvedBalance, chrome.store.currency)}</p>
            </CardContent>
          </Card>
          <DataTable
            title={lang("המרות מחוברות", "Connected conversions")}
            locale={locale}
            columns={[
              { key: "orderNumber", label: lang("הזמנה", "Order") },
              { key: "trackingBy", label: lang("מעקב", "Tracking") },
              {
                key: "date",
                label: lang("תאריך", "Date"),
                render: (row) => new Date(row.date).toLocaleString(dateLocale)
              },
              {
                key: "total",
                label: lang("סה״כ", "Total"),
                render: (row) => formatCurrency(row.total, chrome.store.currency)
              }
            ]}
            rows={conversions}
          />
        </div>
      </section>
    </AppShell>
  );
}
