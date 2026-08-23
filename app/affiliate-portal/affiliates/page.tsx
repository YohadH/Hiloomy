import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliates } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency } from "@/lib/utils";
import { getAppLocale } from "@/lib/i18n";
import { AffiliateDirectoryActions } from "@/components/affiliate-portal/affiliate-directory-actions";
import { AffiliateInstagramField } from "@/components/affiliate-portal/affiliate-instagram-field";

export default async function AffiliatesPage() {
  const [chrome, affiliates, locale] = await Promise.all([
    getAppChromeData(),
    getAffiliates(),
    getAppLocale()
  ]);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const dateLocale = isHe ? "he-IL" : "en-US";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow={lang("פורטל שותפים", "Affiliate Portal")}
            title={lang("ספריית השותפות", "Affiliate directory")}
            description={lang(
              "ניהול השותפות, ייבוא מקובץ, ייצוא הספרייה ופתיחת פרופיל לכל אחת — קופונים וביצועים.",
              "Manage your affiliates, import them from files, export the directory, and open each profile for coupons and performance."
            )}
          />
          <AffiliateDirectoryActions locale={isHe ? "he" : "en"} />
        </div>
        <AffiliatePortalNav locale={isHe ? "he" : "en"} />
      </section>

      <DataTable
        title={lang("כל השותפות", "All affiliates")}
        locale={locale}
        columns={[
          {
            key: "firstName",
            label: lang("שותף/ה", "Affiliate"),
            render: (row) => (
              <Link href={`/affiliate-portal/affiliates/${row.id}`} className="font-semibold hover:underline">
                {row.firstName} {row.lastName}
                <br />
                <span className="font-normal text-muted-foreground">{row.email}</span>
              </Link>
            )
          },
          { key: "programName", label: lang("תוכנית", "Program") },
          { key: "status", label: lang("סטטוס", "Status") },
          {
            key: "dateJoined",
            label: lang("הצטרפות", "Joined"),
            render: (row) => new Date(row.dateJoined).toLocaleString(dateLocale)
          },
          {
            key: "lastLogin",
            label: lang("כניסה אחרונה", "Last login"),
            render: (row) => (row.lastLogin ? new Date(row.lastLogin).toLocaleString(dateLocale) : "-")
          },
          { key: "source", label: lang("מקור", "Source") },
          {
            key: "instagramProfileUrl",
            label: "Instagram",
            render: (row) => (
              <AffiliateInstagramField
                affiliateId={row.id}
                storeId={chrome.store.id}
                initialValue={row.instagramProfileUrl ?? null}
                locale={isHe ? "he" : "en"}
              />
            )
          },
          { key: "couponCode", label: lang("קופון", "Coupon"), render: (row) => row.couponCode ?? "-" },
          {
            key: "sales",
            label: lang("מכירות", "Sales"),
            render: (row) => formatCurrency(row.sales, chrome.store.currency)
          }
        ]}
        rows={affiliates}
      />
    </AppShell>
  );
}
