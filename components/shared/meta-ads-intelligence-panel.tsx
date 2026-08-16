import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  MarketingPlannerDirection,
  MarketingPlannerMetaAds
} from "@/lib/domain/marketing-planner-types";

function getDirectionClasses(direction: MarketingPlannerDirection) {
  return direction === "rtl" ? "text-end" : "text-start";
}

function formatMoney(value: number, currency = "ILS") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function formatMetricDateRange(startDate: string, endDate: string) {
  if (!startDate && !endDate) return "date unknown";
  if (!endDate || startDate === endDate) return startDate;
  return `${startDate} - ${endDate}`;
}

function formatCostPerPurchase(spend: number, purchases: number, currency = "ILS") {
  if (!purchases) return "CPA n/a";
  return `CPA ${formatMoney(spend / purchases, currency)}`;
}

function formatMetaRoas(row: { purchaseRoas: number | null; purchases: number; spend: number }) {
  if (row.purchaseRoas == null) return "Meta ROAS n/a";
  const label = `Meta ROAS ${row.purchaseRoas.toFixed(2)}x`;

  if (row.purchases < 3 || row.spend < 150) {
    return `${label} (low sample)`;
  }

  return label;
}

function cleanCreativeLabel(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const withoutPlaceholders = raw
    .replace(/\{\{[^}]+}}/g, "")
    .replace(/\b[0-9a-f]{18,}\b/gi, "")
    .replace(/[-_ ]{2,}/g, " ")
    .replace(/^[\s_-]+|[\s_-]+$/g, "")
    .trim();

  if (!withoutPlaceholders) return null;
  if (/^\d{4}-\d{2}-\d{2}$/i.test(withoutPlaceholders)) return null;
  return withoutPlaceholders;
}

function getCreativeLabel(creative: MarketingPlannerMetaAds["topCreatives"][number]) {
  return cleanCreativeLabel(creative.adName)
    ?? cleanCreativeLabel(creative.creativeName)
    ?? cleanCreativeLabel(creative.creativeTitle)
    ?? cleanCreativeLabel(creative.campaignName)
    ?? "Meta ad creative";
}

export function MetaAdsIntelligencePanel({
  metaAds,
  direction = "ltr",
  dateRangeLabel
}: {
  metaAds: MarketingPlannerMetaAds | null;
  direction?: MarketingPlannerDirection;
  dateRangeLabel?: string | null;
}) {
  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Meta Ads intelligence</CardTitle>
        <CardDescription>
          Daily campaign performance plus ad-level creative signals from the connected Meta ad account.
          {dateRangeLabel ? ` Showing stored rows inside ${dateRangeLabel}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {metaAds ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Campaigns</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.campaigns.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Creatives</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.topCreatives.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Spend</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(metaAds.totalSpend, metaAds.currency ?? "ILS")}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Purchases</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.totalPurchases}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Clicks</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.totalClicks.toLocaleString("en-US")}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">Avg ROAS</p>
                <p className="mt-1 text-lg font-semibold">
                  {metaAds.averagePurchaseRoas != null ? metaAds.averagePurchaseRoas.toFixed(2) : "-"}
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {metaAds.summaryLines.map((line, index) => (
                <li key={`meta-summary-${index}`}>{line}</li>
              ))}
            </ul>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Best campaigns</p>
                {metaAds.topCampaigns.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.topCampaigns.slice(0, 4).map((campaign) => (
                      <div key={`meta-top-${campaign.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{campaign.campaignName}</p>
                                <Badge>{formatCostPerPurchase(campaign.spend, campaign.purchases, metaAds.currency ?? "ILS")}</Badge>
                              </div>
                              <p className="mt-1 text-muted-foreground">
                          {formatMoney(campaign.spend, metaAds.currency ?? "ILS")} spend - {campaign.purchases} purchases - CTR {campaign.ctr.toFixed(2)}%
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatMetaRoas(campaign)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No synced Meta campaigns yet for this date window.</p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Campaigns to review</p>
                {metaAds.watchCampaigns.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.watchCampaigns.slice(0, 4).map((campaign) => (
                      <div key={`meta-watch-${campaign.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{campaign.campaignName}</p>
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                            {formatCostPerPurchase(campaign.spend, campaign.purchases, metaAds.currency ?? "ILS")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatMoney(campaign.spend, metaAds.currency ?? "ILS")} spend - {campaign.purchases} purchases
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatMetaRoas(campaign)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No obvious Meta Ads red flags in the selected window.</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Top running creatives / ads</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ranked by attributed purchases first, then Meta-reported ROAS, so low-volume spikes do not hide real winners.
                </p>
                {metaAds.topCreatives.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.topCreatives.slice(0, 6).map((creative) => {
                      const creativeLabel = getCreativeLabel(creative);
                      const primaryLink = creative.creativePreviewUrl ?? creative.creativePermalinkUrl ?? creative.creativeObjectUrl ?? null;
                      const campaignLabel = cleanCreativeLabel(creative.campaignName);

                      return (
                        <div key={`meta-creative-${creative.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                          <div className="flex gap-3">
                            {creative.creativeThumbnailUrl ? (
                              <img
                                src={creative.creativeThumbnailUrl}
                                alt={creativeLabel}
                                className="h-20 w-20 rounded-lg border border-border object-cover"
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">{creativeLabel}</p>
                                <Badge>{formatCostPerPurchase(creative.spend, creative.purchases, metaAds.currency ?? "ILS")}</Badge>
                              </div>
                              <p className="mt-1 text-muted-foreground">
                                {campaignLabel ? `${campaignLabel} - ` : ""}
                                {formatMoney(creative.spend, metaAds.currency ?? "ILS")} spend - {creative.purchases} purchases - CTR {creative.ctr.toFixed(2)}%
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{formatMetaRoas(creative)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Reporting dates: {formatMetricDateRange(creative.dateStart, creative.dateStop)}
                              </p>
                              {creative.creativeBody ? (
                                <p className="mt-2 line-clamp-2 text-muted-foreground">{creative.creativeBody}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-2">
                                {primaryLink ? (
                                  <a
                                    href={primaryLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    Open creative
                                  </a>
                                ) : null}
                                {creative.creativePermalinkUrl && creative.creativePermalinkUrl !== primaryLink ? (
                                  <a
                                    href={creative.creativePermalinkUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    Public post
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No ad-level creative rows yet. Sync Meta Ads again after saving a token with ads_read access.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Daily performance</p>
                {metaAds.dailyBreakdown.length ? (
                  <div className="mt-3 space-y-2">
                    {metaAds.dailyBreakdown.slice(-14).map((day) => (
                      <div key={`meta-day-${day.id}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div>
                          <p className="font-medium">{day.dateStart}</p>
                          <p className="mt-1 text-muted-foreground">
                            {day.purchases} purchases - {day.clicks.toLocaleString("en-US")} clicks
                          </p>
                        </div>
                        <div className="text-start">
                          <p className="font-semibold">{formatMoney(day.spend, metaAds.currency ?? "ILS")}</p>
                          <p className="mt-1 text-muted-foreground">
                            {formatCostPerPurchase(day.spend, day.purchases, metaAds.currency ?? "ILS")}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatMetaRoas(day)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No daily Meta breakdown was found in this date window.</p>
                )}
              </div>
            </div>

            {metaAds.dataWarnings.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Meta data warnings</p>
                <ul className="mt-2 space-y-2 leading-6">
                  {metaAds.dataWarnings.map((warning, index) => (
                    <li key={`meta-warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Meta Ads is not connected or has not been synced yet. Add the token and ad account in Settings to include paid-media insights.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
