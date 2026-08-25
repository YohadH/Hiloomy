import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliates, getAffiliateWindowStats } from "@/lib/services/affiliate-portal-service";
import { DataTable } from "@/components/shared/data-table";
import { formatCurrency, formatNumber, repairMojibake } from "@/lib/utils";
import { getAppLocale } from "@/lib/i18n";
import { AffiliateDirectoryActions } from "@/components/affiliate-portal/affiliate-directory-actions";
import { AffiliateInstagramField } from "@/components/affiliate-portal/affiliate-instagram-field";
import { AffiliateStatusActions } from "@/components/affiliate-portal/affiliate-status-actions";

export default async function AffiliatesPage() {
  const [chrome, affiliates, windowStats, locale] = await Promise.all([
    getAppChromeData(),
    getAffiliates(),
    getAffiliateWindowStats(),
    getAppLocale()
  ]);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const dateLocale = isHe ? "he-IL" : "en-US";
  // Dates must render in the STORE's timezone — the server-default UTC
  // render showed midnight-Israel joins as "21:00 the previous day",
  // rolling every date back one calendar day (F-093).
  const timeZone = chrome.store.timezone || "Asia/Jerusalem";
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric"
    });

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
          {
            key: "programName",
            label: lang("תוכנית", "Program"),
            // repairMojibake: bulk-imported Hebrew arrived double-decoded
            // (UTF-8 read as Latin-1) — repair on render until the stored
            // rows are re-encoded (F-091).
            render: (row) => repairMojibake(row.programName)
          },
          {
            key: "status",
            label: lang("סטטוס", "Status"),
            render: (row) => (
              <div className="space-y-1">
                <span
                  className={
                    row.status === "pending"
                      ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                      : row.status === "denied"
                        ? "inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800"
                        : "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                  }
                >
                  {row.status}
                </span>
                <AffiliateStatusActions affiliateId={row.id} status={row.status} isHe={isHe} />
              </div>
            )
          },
          {
            key: "dateJoined",
            label: lang("הצטרפות", "Joined"),
            render: (row) => fmtDate(row.dateJoined)
          },
          {
            key: "lastLogin",
            label: lang("כניסה אחרונה", "Last login"),
            render: (row) => (row.lastLogin ? fmtDate(row.lastLogin) : "-")
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
            // Window-scoped figures (F-082/F-090/F-092): the row columns on
            // the member are LIFETIME totals; the selected date range is
            // what the picker promises, so that is what the main numbers
            // show — lifetime stays as the secondary line.
            key: "sales",
            label: lang("מכירות בטווח", "Sales (window)"),
            render: (row) => {
              const stats = windowStats.get(row.id);
              return (
                <span>
                  {formatCurrency(stats?.sales ?? 0, chrome.store.currency)}
                  <br />
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {lang("כל הזמן: ", "lifetime: ")}
                    {formatCurrency(row.sales, chrome.store.currency)}
                  </span>
                </span>
              );
            }
          },
          {
            key: "id",
            label: lang("הזמנות בטווח", "Orders (window)"),
            render: (row) => {
              const stats = windowStats.get(row.id);
              const orders = stats?.orders ?? 0;
              const aov = orders > 0 ? (stats?.sales ?? 0) / orders : null;
              return (
                <span className="tabular-nums">
                  {formatNumber(orders)}
                  {aov != null ? (
                    <>
                      <br />
                      <span className="text-[11px] font-normal text-muted-foreground">
                        AOV {formatCurrency(aov, chrome.store.currency)}
                      </span>
                    </>
                  ) : null}
                </span>
              );
            }
          },
          {
            key: "commission",
            label: lang("עמלה בטווח", "Commission (window)"),
            render: (row) =>
              formatCurrency(windowStats.get(row.id)?.commission ?? 0, chrome.store.currency)
          },
          {
            key: "email",
            label: lang("קליקים בטווח", "Clicks (window)"),
            render: (row) => {
              const clicks = windowStats.get(row.id)?.clicks ?? 0;
              // No fake zeros: until the tracked links go out, click data
              // simply doesn't exist (F-078/HLA-11).
              return clicks > 0 ? (
                <span className="tabular-nums">{formatNumber(clicks)}</span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              );
            }
          }
        ]}
        rows={affiliates.map((a) => ({
          ...a,
          firstName: repairMojibake(a.firstName),
          lastName: repairMojibake(a.lastName)
        }))}
      />
    </AppShell>
  );
}
