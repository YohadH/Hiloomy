import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { PayoutsView } from "@/components/affiliate-portal/payouts-view";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";

export default async function PayoutsPage() {
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  const isHe = locale === "he";

  const heading = isHe
    ? {
        eyebrow: "פורטל שותפים",
        title: "תשלומים ועמלות",
        description:
          "מצב עמלות לפי שותף/ה: כמה בהמתנה (טרם אושר), כמה מאושר לתשלום, וכפתור לסימון תשלום. אחרי הסימון העמלה עוברת לסטטוס \"שולם\" עם חותמת זמן."
      }
    : {
        eyebrow: "Affiliate Portal",
        title: "Payouts & approved balances",
        description:
          "Commission state per affiliate: how much is pending approval, how much is payout-ready, and one-click mark-as-paid. Once marked paid, commissions carry a timestamp and drop out of the queue."
      };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={heading.eyebrow}
          title={heading.title}
          description={heading.description}
        />
        <AffiliatePortalNav />
      </section>

      <PayoutsView locale={isHe ? "he" : "en"} currency={chrome.store.currency} />
    </AppShell>
  );
}
