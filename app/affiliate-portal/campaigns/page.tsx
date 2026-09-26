// /affiliate-portal/campaigns — campaigns + briefs for affiliates (ported
// from the Creators project into our models, 2026-09-26).

import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { CampaignManager } from "@/components/affiliate-portal/campaign-manager";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { listCampaigns } from "@/lib/services/affiliate-campaign-service";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const activeStoreId = await resolveActiveStoreId();
  const [chrome, campaigns, locale] = await Promise.all([
    getAppChromeData(),
    activeStoreId ? listCampaigns(activeStoreId).catch(() => []) : Promise.resolve([]),
    getAppLocale()
  ]);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("פורטל שותפים", "Affiliate Portal")}
          title={lang("קמפיינים ובריפים", "Campaigns and briefs")}
          description={lang(
            "קמפיין = מהלך עם קוד קצר. הקוד נוסף לקישור של כל משפיענית, אז הקליקים וההזמנות מתגלגלים לקמפיין בלי הגדרות נוספות. בריף = מה כל משפיענית מפרסמת ומתי.",
            "A campaign is a push with a short code. The code is appended to every creator's link, so clicks and orders roll up to the campaign with no extra setup. A brief is what each creator posts and when."
          )}
        />
        <AffiliatePortalNav locale={isHe ? "he" : "en"} />
      </section>
      <CampaignManager campaigns={campaigns} currency={chrome.store.currency ?? "ILS"} locale={isHe ? "he" : "en"} />
    </AppShell>
  );
}
