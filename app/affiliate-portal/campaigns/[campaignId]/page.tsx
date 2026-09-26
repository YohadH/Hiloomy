// /affiliate-portal/campaigns/{id} — one campaign: status, briefs per
// creator (add many at once), ready links, clicks per brief.

import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { CampaignBriefs } from "@/components/affiliate-portal/campaign-briefs";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliates } from "@/lib/services/affiliate-portal-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getCampaign, listCampaigns } from "@/lib/services/affiliate-campaign-service";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const activeStoreId = await resolveActiveStoreId();
  if (!activeStoreId) notFound();
  const [chrome, campaign, affiliates, summaries, locale] = await Promise.all([
    getAppChromeData(),
    getCampaign(activeStoreId, campaignId).catch(() => null),
    getAffiliates(),
    listCampaigns(activeStoreId).catch(() => []),
    getAppLocale()
  ]);
  if (!campaign) notFound();
  const summary = summaries.find((c) => c.id === campaign.id);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const money = (n: number) =>
    new Intl.NumberFormat(isHe ? "he-IL" : "en-US", { style: "currency", currency: chrome.store.currency ?? "ILS", maximumFractionDigits: 0 }).format(n);

  const tiles = [
    { label: lang("קליקים", "Clicks"), value: (summary?.clicks ?? 0).toLocaleString() },
    { label: lang("הזמנות", "Orders"), value: (summary?.orders ?? 0).toLocaleString() },
    { label: lang("מכירות", "Sales"), value: money(summary?.sales ?? 0) },
    { label: lang("עמלות", "Commission"), value: money(summary?.commission ?? 0) },
    { label: lang("בריפים · פורסמו", "Briefs · posted"), value: `${campaign.briefs.length} · ${campaign.briefs.filter((b) => b.status === "posted").length}` }
  ];

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("פורטל שותפים · קמפיין", "Affiliate Portal · Campaign")}
          title={campaign.name}
          description={
            [
              campaign.promoText,
              campaign.couponCode ? lang(`קופון: ${campaign.couponCode}`, `Coupon: ${campaign.couponCode}`) : null,
              campaign.destinationPath && campaign.destinationPath !== "/" ? lang(`יעד: ${campaign.destinationPath}`, `Landing: ${campaign.destinationPath}`) : null,
              lang(`קוד לקישור: -${campaign.code}`, `Link code: -${campaign.code}`)
            ]
              .filter(Boolean)
              .join(" · ")
          }
        />
        <AffiliatePortalNav locale={isHe ? "he" : "en"} />
        <Link href={"/affiliate-portal/campaigns" as never} className="inline-block text-sm text-primary hover:underline">
          {lang("← כל הקמפיינים", "← All campaigns")}
        </Link>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{tile.value}</p>
          </div>
        ))}
      </div>

      <CampaignBriefs
        campaign={{
          id: campaign.id,
          name: campaign.name,
          code: campaign.code,
          status: campaign.status,
          promoText: campaign.promoText ?? null,
          couponCode: campaign.couponCode ?? null,
          destinationPath: campaign.destinationPath
        }}
        briefs={campaign.briefs}
        affiliates={affiliates.map((a) => ({ id: a.id, firstName: a.firstName, lastName: a.lastName, affiliateCode: a.affiliateCode, status: a.status }))}
        locale={isHe ? "he" : "en"}
      />
    </AppShell>
  );
}
