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

function formatMetricDateRange(startDate: string, endDate: string, isHe: boolean) {
  if (!startDate && !endDate) return isHe ? "תאריך לא ידוע" : "date unknown";
  if (!endDate || startDate === endDate) return startDate;
  return `${startDate} - ${endDate}`;
}

function formatCostPerPurchase(spend: number, purchases: number, currency = "ILS", isHe = false) {
  if (!purchases) return isHe ? "CPA לא זמין" : "CPA n/a";
  return `CPA ${formatMoney(spend / purchases, currency)}`;
}

function formatMetaRoas(
  row: { purchaseRoas: number | null; purchases: number; spend: number },
  isHe: boolean
) {
  if (row.purchaseRoas == null) return isHe ? "ROAS של Meta לא זמין" : "Meta ROAS n/a";
  const label = isHe
    ? `ROAS של Meta ${row.purchaseRoas.toFixed(2)}x`
    : `Meta ROAS ${row.purchaseRoas.toFixed(2)}x`;

  if (row.purchases < 3 || row.spend < 150) {
    return `${label} ${isHe ? "(מדגם קטן)" : "(low sample)"}`;
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

function getCreativeLabel(creative: MarketingPlannerMetaAds["topCreatives"][number], isHe: boolean) {
  return cleanCreativeLabel(creative.adName)
    ?? cleanCreativeLabel(creative.creativeName)
    ?? cleanCreativeLabel(creative.creativeTitle)
    ?? cleanCreativeLabel(creative.campaignName)
    ?? (isHe ? "קריאייטיב של Meta" : "Meta ad creative");
}

export function MetaAdsIntelligencePanel({
  metaAds,
  direction = "ltr",
  dateRangeLabel,
  locale = "he"
}: {
  metaAds: MarketingPlannerMetaAds | null;
  direction?: MarketingPlannerDirection;
  dateRangeLabel?: string | null;
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{lang("תובנות Meta Ads", "Meta Ads intelligence")}</CardTitle>
        <CardDescription>
          {lang(
            "ביצועי קמפיינים יומיים ואותות קריאייטיב ברמת המודעה, מחשבון הפרסום המחובר ב-Meta.",
            "Daily campaign performance plus ad-level creative signals from the connected Meta ad account."
          )}
          {dateRangeLabel
            ? lang(` מוצגות שורות שנשמרו בתוך ${dateRangeLabel}.`, ` Showing stored rows inside ${dateRangeLabel}.`)
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {metaAds ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{lang("קמפיינים", "Campaigns")}</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.campaigns.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{lang("קריאייטיבים", "Creatives")}</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.topCreatives.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{lang("הוצאה", "Spend")}</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(metaAds.totalSpend, metaAds.currency ?? "ILS")}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{lang("רכישות", "Purchases")}</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.totalPurchases}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{lang("קליקים", "Clicks")}</p>
                <p className="mt-1 text-lg font-semibold">{metaAds.totalClicks.toLocaleString("en-US")}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{lang("ROAS ממוצע", "Avg ROAS")}</p>
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
                <p className="text-sm font-semibold text-foreground">{lang("הקמפיינים המובילים", "Best campaigns")}</p>
                {metaAds.topCampaigns.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.topCampaigns.slice(0, 4).map((campaign) => (
                      <div key={`meta-top-${campaign.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{campaign.campaignName}</p>
                                <Badge>{formatCostPerPurchase(campaign.spend, campaign.purchases, metaAds.currency ?? "ILS", isHe)}</Badge>
                              </div>
                              <p className="mt-1 text-muted-foreground">
                          {formatMoney(campaign.spend, metaAds.currency ?? "ILS")} {lang("הוצאה", "spend")} - {campaign.purchases} {lang("רכישות", "purchases")} - CTR {campaign.ctr.toFixed(2)}%
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatMetaRoas(campaign, isHe)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {lang(
                      "אין עדיין קמפיינים מסונכרנים מ-Meta בחלון התאריכים הזה.",
                      "No synced Meta campaigns yet for this date window."
                    )}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">{lang("קמפיינים לבדיקה", "Campaigns to review")}</p>
                {metaAds.watchCampaigns.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.watchCampaigns.slice(0, 4).map((campaign) => (
                      <div key={`meta-watch-${campaign.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{campaign.campaignName}</p>
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                            {formatCostPerPurchase(campaign.spend, campaign.purchases, metaAds.currency ?? "ILS", isHe)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatMoney(campaign.spend, metaAds.currency ?? "ILS")} {lang("הוצאה", "spend")} - {campaign.purchases} {lang("רכישות", "purchases")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatMetaRoas(campaign, isHe)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {lang(
                      "לא נמצאו נורות אזהרה בולטות ב-Meta Ads בחלון הנבחר.",
                      "No obvious Meta Ads red flags in the selected window."
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {lang("הקריאייטיבים והמודעות המובילים", "Top running creatives / ads")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lang(
                    "הדירוג מתבסס קודם על רכישות משויכות ורק אחר כך על ה-ROAS ש-Meta מדווחת, כדי שקפיצות בנפח נמוך לא יסתירו מנצחים אמיתיים.",
                    "Ranked by attributed purchases first, then Meta-reported ROAS, so low-volume spikes do not hide real winners."
                  )}
                </p>
                {metaAds.topCreatives.length ? (
                  <div className="mt-3 space-y-3">
                    {metaAds.topCreatives.slice(0, 6).map((creative) => {
                      const creativeLabel = getCreativeLabel(creative, isHe);
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
                                <Badge>{formatCostPerPurchase(creative.spend, creative.purchases, metaAds.currency ?? "ILS", isHe)}</Badge>
                              </div>
                              <p className="mt-1 text-muted-foreground">
                                {campaignLabel ? `${campaignLabel} - ` : ""}
                                {formatMoney(creative.spend, metaAds.currency ?? "ILS")} {lang("הוצאה", "spend")} - {creative.purchases} {lang("רכישות", "purchases")} - CTR {creative.ctr.toFixed(2)}%
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{formatMetaRoas(creative, isHe)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {lang("תאריכי דיווח:", "Reporting dates:")}{" "}
                                <span dir="ltr">{formatMetricDateRange(creative.dateStart, creative.dateStop, isHe)}</span>
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
                                    {lang("פתיחת הקריאייטיב", "Open creative")}
                                  </a>
                                ) : null}
                                {creative.creativePermalinkUrl && creative.creativePermalinkUrl !== primaryLink ? (
                                  <a
                                    href={creative.creativePermalinkUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                  >
                                    {lang("הפוסט הציבורי", "Public post")}
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
                    {lang(
                      "אין עדיין שורות קריאייטיב ברמת מודעה. סנכרנו את Meta Ads שוב אחרי שמירת טוקן עם הרשאת ads_read.",
                      "No ad-level creative rows yet. Sync Meta Ads again after saving a token with ads_read access."
                    )}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">{lang("ביצועים יומיים", "Daily performance")}</p>
                {metaAds.dailyBreakdown.length ? (
                  <div className="mt-3 space-y-2">
                    {metaAds.dailyBreakdown.slice(-14).map((day) => (
                      <div key={`meta-day-${day.id}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div>
                          <p className="font-medium" dir="ltr">{day.dateStart}</p>
                          <p className="mt-1 text-muted-foreground">
                            {day.purchases} {lang("רכישות", "purchases")} - {day.clicks.toLocaleString("en-US")} {lang("קליקים", "clicks")}
                          </p>
                        </div>
                        <div className="text-start">
                          <p className="font-semibold">{formatMoney(day.spend, metaAds.currency ?? "ILS")}</p>
                          <p className="mt-1 text-muted-foreground">
                            {formatCostPerPurchase(day.spend, day.purchases, metaAds.currency ?? "ILS", isHe)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatMetaRoas(day, isHe)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {lang(
                      "לא נמצא פילוח יומי של Meta בחלון התאריכים הזה.",
                      "No daily Meta breakdown was found in this date window."
                    )}
                  </p>
                )}
              </div>
            </div>

            {metaAds.dataWarnings.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">{lang("אזהרות נתונים מ-Meta", "Meta data warnings")}</p>
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
            {lang(
              "Meta Ads לא מחובר או שעדיין לא בוצע סנכרון. הוסיפו את הטוקן ואת חשבון הפרסום במסך ההגדרות כדי לכלול תובנות מדיה בתשלום.",
              "Meta Ads is not connected or has not been synced yet. Add the token and ad account in Settings to include paid-media insights."
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
