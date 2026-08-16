import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { InstagramCrawlEvidencePanel } from "@/components/shared/instagram-crawl-evidence-panel";
import { MetaAdsIntelligencePanel } from "@/components/shared/meta-ads-intelligence-panel";
import { ExportMetaAdsPdfButton } from "@/components/weekly-summary/export-meta-ads-pdf-button";
import type {
  MarketingPlannerDirection,
  MarketingPlannerInfluencerIntelligence
} from "@/lib/domain/marketing-planner-types";
import { describeAbsoluteRange, getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { buildMarketingPlannerInfluencerIntelligence } from "@/lib/services/marketing-planner-influencer-service";
import { buildMarketingPlannerMetaAds } from "@/lib/services/meta-ads-service";
import { getLatestSummary } from "@/lib/services/summary-service";
import {
  buildWeeklyAgentInsights,
  type WeeklyAgentInsightsPayload
} from "@/lib/services/weekly-summary-insights-service";
import { getAppLocale, getDictionary, type AppLocale } from "@/lib/i18n";
import { formatCurrency, formatNumber } from "@/lib/utils";

function getDirectionClasses(direction: MarketingPlannerDirection) {
  return direction === "rtl" ? "text-right" : "text-left";
}

function InfluencerWeeklyEvidence({
  influencer,
  direction,
  currency,
  locale = "en"
}: {
  influencer: MarketingPlannerInfluencerIntelligence | null;
  direction: MarketingPlannerDirection;
  currency: string;
  locale?: AppLocale;
}) {
  return (
    <Card dir={direction} className={getDirectionClasses(direction)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {locale === "he" ? "ראיות לביצועי משפיענים" : "Influencer performance evidence"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {locale === "he"
            ? "מכירות שותפים, קליקים ותוכן יוצרים, מסוננים לחלון התאריכים של הסיכום השבועי."
            : "Affiliate sales, clicks, and creator content filtered to the current weekly-summary date window."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {influencer ? (
          <>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{locale === "he" ? "תקופה" : "Period"}</p>
                <p className="mt-1 font-semibold">{influencer.periodLabel}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{locale === "he" ? "יוצרים פעילים" : "Active creators"}</p>
                <p className="mt-1 font-semibold">{formatNumber(influencer.activeCreators)} / {formatNumber(influencer.totalCreators)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{locale === "he" ? "מכירות" : "Sales"}</p>
                <p className="mt-1 font-semibold">{formatCurrency(influencer.totalSales, currency)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{locale === "he" ? "הזמנות" : "Orders"}</p>
                <p className="mt-1 font-semibold">{formatNumber(influencer.totalOrders)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs text-muted-foreground">{locale === "he" ? "קליקים" : "Clicks"}</p>
                <p className="mt-1 font-semibold">{formatNumber(influencer.totalClicks)}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {locale === "he" ? "יוצרים להגדיל" : "Creators to scale"}
                </p>
                {influencer.topCreators.length ? (
                  <div className="mt-3 space-y-3">
                    {influencer.topCreators.slice(0, 4).map((creator) => (
                      <div key={`weekly-scale-${creator.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{creator.name}</p>
                          <Badge>{creator.role}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatCurrency(creator.sales, currency)} - {formatNumber(creator.orders)} {locale === "he" ? "הזמנות" : "orders"} - {locale === "he" ? "קוד" : "code"} {creator.couponCode ?? creator.affiliateCode}
                        </p>
                        <p className="mt-2 leading-6 text-muted-foreground">{creator.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {locale === "he"
                      ? "אין עדיין יוצר עם מכירות מיוחסות בחלון התאריכים הזה."
                      : "No creator has attributed sales in this date window yet."}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {locale === "he" ? "יוצרים לבדוק / להשהות" : "Creators to check / pause"}
                </p>
                {influencer.watchCreators.length ? (
                  <div className="mt-3 space-y-3">
                    {influencer.watchCreators.slice(0, 4).map((creator) => (
                      <div key={`weekly-watch-${creator.id}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{creator.name}</p>
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700">{creator.role}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatCurrency(creator.sales, currency)} - {formatNumber(creator.orders)} {locale === "he" ? "הזמנות" : "orders"} - {formatNumber(creator.clicks)} {locale === "he" ? "קליקים" : "clicks"}
                        </p>
                        <p className="mt-2 leading-6 text-muted-foreground">{creator.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {locale === "he"
                      ? "אין יוצר שדורש דגל אזהרה בחלון התאריכים הזה."
                      : "No creator needs a warning flag in this date window."}
                  </p>
                )}
              </div>
            </div>

            {influencer.suggestedActions.length ? (
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {locale === "he" ? "פעולות להעביר לתכנון" : "Actions to carry into planning"}
                </p>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {influencer.suggestedActions.map((action, index) => (
                    <div key={`weekly-influencer-action-${index}`} className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{action.impact}</Badge>
                        <p className="font-medium">{action.action}</p>
                      </div>
                      <p className="mt-2 leading-6 text-muted-foreground">{action.why}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <strong className="text-foreground">{locale === "he" ? "איפה:" : "Where:"}</strong> {action.ganttPlacement}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {influencer.dataWarnings.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">
                  {locale === "he" ? "אזהרות נתוני משפיענים" : "Influencer data warnings"}
                </p>
                <ul className="mt-2 space-y-2 leading-6">
                  {influencer.dataWarnings.map((warning, index) => (
                    <li key={`weekly-influencer-warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {locale === "he"
              ? "אין עדיין נתוני משפיענים לחנות הזו. הוסיפו שותפים וחשבונות אינסטגרם, והריצו את הקראולר/סנכרון כדי למלא את שכבת ההוכחה."
              : "Influencer data is not available for this store yet. Add affiliates, Instagram handles, and run the crawler/sync to populate this proof layer."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyAgentInsightsPanel({
  payload,
  direction,
  locale = "en"
}: {
  payload: WeeklyAgentInsightsPayload;
  direction: MarketingPlannerDirection;
  locale?: AppLocale;
}) {
  const channelLabel = {
    meta_ads: "Meta Ads",
    instagram: "Instagram",
    history: locale === "he" ? "היסטוריה" : "History"
  } satisfies Record<string, string>;

  const severityClass = {
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    critical: "border-red-200 bg-red-50 text-red-800"
  } satisfies Record<string, string>;

  return (
    <section className="space-y-3">
      <SectionHead
        eyebrow={locale === "he" ? "חשיבת הסוכן" : "Agent thinking"}
        title={locale === "he" ? "מה הסוכן חושב על Meta Ads ואינסטגרם" : "What the agent thinks about Meta Ads and Instagram"}
        hint={locale === "he"
          ? `נוצר על בסיס חלון התאריכים הזה ועל סמך זיכרון קודם של סוכן הצמיחה: ${payload.dateRangeLabel}.`
          : `Generated from this date window plus prior Growth Agent memory: ${payload.dateRangeLabel}.`}
      />
      <Card dir={direction} className={getDirectionClasses(direction)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {locale === "he" ? "תובנות צמיחה שבועיות" : "Weekly growth insights"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {locale === "he"
              ? "אלה לא רק מספרים גולמיים. הסוכן משווה את האיתותים הנוכחיים מMeta ומאינסטגרם לממצאים היסטוריים, ושומר את המסקנות של השבוע לקראת הקריאה הבאה."
              : "These are not just raw metrics. The agent compares current Meta/Instagram signals with historical findings and stores this week's conclusions for the next readout."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-2">
            {payload.insights.map((insight) => (
              <div key={insight.id} className={`rounded-2xl border p-4 text-sm ${severityClass[insight.severity]}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{insight.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-white/70 text-current">{channelLabel[insight.channel]}</Badge>
                    <Badge className="bg-white/70 text-current">
                      {Math.round(insight.confidenceScore * 100)}% {locale === "he" ? "ביטחון" : "confidence"}
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 leading-6">{insight.whatAgentThinks}</p>
                <div className="mt-3 rounded-xl border border-white/70 bg-white/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
                    {locale === "he" ? "ראיות" : "Evidence"}
                  </p>
                  <p className="mt-1 leading-6">{insight.evidence}</p>
                </div>
                <div className="mt-3 rounded-xl border border-white/70 bg-white/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
                    {locale === "he" ? "פעולה מומלצת" : "Recommended action"}
                  </p>
                  <p className="mt-1 leading-6">{insight.recommendation}</p>
                </div>
                {insight.learnedFromHistory ? (
                  <p className="mt-3 text-xs font-medium opacity-85">
                    {locale === "he" ? "נלמד מההיסטוריה: " : "Learned from history: "}{insight.learnedFromHistory}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">
                {locale === "he" ? "היסטוריה שבה הסוכן השתמש" : "History used by the agent"}
              </p>
              <Badge>
                {payload.memorySaved
                  ? (locale === "he" ? "נשמר בזיכרון" : "Saved to memory")
                  : (locale === "he" ? "שמירת הזיכרון דולגה" : "Memory save skipped")}
              </Badge>
            </div>
            <ul className="mt-2 space-y-1 leading-6 text-muted-foreground">
              {payload.historySignals.map((signal, index) => (
                <li key={`history-signal-${index}`}>{signal}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export default async function WeeklySummaryPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const [summary, chrome, range] = await Promise.all([
    getLatestSummary(),
    getAppChromeData(),
    getReportingDateRangeSelection(locale)
  ]);
  const direction: MarketingPlannerDirection = locale === "he" ? "rtl" : "ltr";
  const dateRangeLabel = describeAbsoluteRange(range.start, range.end, locale);
  const storeScope = {
    storeId: chrome.store.id,
    storeName: chrome.store.name,
    storeDomain: chrome.store.domain,
    connected: Boolean(chrome.store.id)
  };
  const [influencerIntelligence, metaAds] = await Promise.all([
    buildMarketingPlannerInfluencerIntelligence(storeScope, range.end, {
      start: range.start,
      end: range.end,
      periodLabel: dateRangeLabel
    }).catch(() => null),
    buildMarketingPlannerMetaAds(storeScope, {
      start: range.start,
      end: range.end
    }).catch(() => null)
  ]);
  const weeklyAgentInsights = await buildWeeklyAgentInsights({
    storeScope,
    metaAds,
    influencer: influencerIntelligence,
    dateRangeLabel,
    rangeKey: `${range.startInput}-${range.endInput}`,
    currency: chrome.store.currency
  });

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PageHead
            eyebrow={dictionary.weeklySummary.eyebrow}
            title={dictionary.weeklySummary.title}
            description={dictionary.weeklySummary.description}
          />
          {/* Dead Copy/Share no-op buttons removed — a button that does
              nothing erodes trust in the ones that work. Two real exports:
              the concise executive PDF (default) and the extended one with
              the diagnostic appendix. */}
          <div className="flex flex-wrap gap-2">
            <ExportMetaAdsPdfButton
              from={range.startInput}
              to={range.endInput}
              storeId={chrome.store.id}
              labelDownload={locale === "he" ? "ייצוא PDF" : "Export PDF"}
              labelGenerating={locale === "he" ? "מייצר…" : "Generating…"}
            />
            <ExportMetaAdsPdfButton
              from={range.startInput}
              to={range.endInput}
              storeId={chrome.store.id}
              appendix
              labelDownload={locale === "he" ? "ייצוא מורחב" : "Extended export"}
              labelGenerating={locale === "he" ? "מייצר…" : "Generating…"}
            />
          </div>
        </div>

        <NarrativeBanner
          eyebrow={locale === "he" ? "קריאה שבועית" : "Weekly readout"}
          headline={summary.headline}
          body={locale === "he"
            ? `נוצר ב${new Date(summary.generatedAt).toLocaleString()} — שתפו עם הצוות או העתיקו לסלאק.`
            : `Generated ${new Date(summary.generatedAt).toLocaleString()} — share this with your team or copy it into Slack.`}
          tone="up"
          toneLabel={locale === "he" ? "מוכן לשיתוף" : "Ready to share"}
        />

        <WeeklyAgentInsightsPanel payload={weeklyAgentInsights} direction={direction} locale={locale} />

        {/* The money — Meta Ads gets its own prominent section. */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "הכסף" : "The money"}
            title={locale === "he" ? "ביצועי Meta Ads בחלון" : "Meta Ads performance"}
            hint={locale === "he"
              ? `הנתונים נקראים מהמסד עבור ${dateRangeLabel} — אותו חלון של הסיכום והייצוא.`
              : `Read from the DB for ${dateRangeLabel} — the same window as the summary and the export.`}
          />
          <MetaAdsIntelligencePanel
            metaAds={metaAds}
            direction={direction}
            dateRangeLabel={dateRangeLabel}
          />
        </section>

        {/* Deep evidence (Instagram crawl + influencer breakdown) — moved
            behind progressive disclosure. It's verification material, not
            the weekly story; keeping it expanded was the page's main
            overload. */}
        <details className="group rounded-2xl border border-border bg-card/40 open:bg-card">
          <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-semibold text-foreground hover:bg-muted/40">
            <span className="inline-flex w-full items-center gap-2">
              <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
              {locale === "he" ? "נתוני עומק: אינסטגרם ומשפיענים" : "Deep data: Instagram & influencers"}
              <span className="ms-auto text-xs font-normal text-muted-foreground">
                {locale === "he" ? "לחצו לפתיחה" : "click to expand"}
              </span>
            </span>
          </summary>
          <div className="space-y-3 border-t border-border px-5 py-4">
            {influencerIntelligence?.instagramCrawl ? (
              <InstagramCrawlEvidencePanel
                instagram={influencerIntelligence.instagramCrawl}
                direction={direction}
                dateRangeLabel={dateRangeLabel}
                description={locale === "he"
                  ? "שכבת הוכחה לעמוד המותג ולחשבונות האינסטגרם של השותפים, בתוך חלון התאריכים של הסיכום."
                  : "Proof layer for the brand page and affiliate Instagram handles, within the summary's date range."}
              />
            ) : (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  {locale === "he"
                    ? "אין עדיין נתוני סריקת אינסטגרם לחנות הזו. הוסיפו חשבונות אינסטגרם של שותפים והריצו את הסורק כדי למלא את הקטע."
                    : "Instagram crawl evidence is not available yet for this store. Add affiliate Instagram handles and run the crawler to populate this section."}
                </CardContent>
              </Card>
            )}
            <InfluencerWeeklyEvidence
              influencer={influencerIntelligence}
              direction={direction}
              currency={chrome.store.currency}
              locale={locale}
            />
          </div>
        </details>

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "לשיתוף" : "To share"}
            title={locale === "he" ? "הנרטיב של השבוע" : "The week's narrative"}
            hint={locale === "he"
              ? "כל בלוק הוא קטע עצמאי שאפשר להעתיק לסטנדאפ השבועי."
              : "Each block is a self-contained section you can copy into your weekly stand-up."}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {summary.sections.map((section) => (
              <Card key={section.title}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {section.items.map((item) => (
                    <p key={item} className="text-sm leading-7 text-muted-foreground">
                      • {item}
                    </p>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
