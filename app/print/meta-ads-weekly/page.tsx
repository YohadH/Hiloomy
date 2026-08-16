import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  buildMetaAdsWeeklyReport,
  type MetaAdsReportBrand,
  type MetaAdsReportDailyRow,
  type MetaAdsReportFunnel
} from "@/lib/services/meta-ads-report-service";
import {
  generateBrandInsights,
  type BrandInsights,
  type PriorWeekSnapshot
} from "@/lib/services/meta-ads-report-insights-service";
import {
  generateInstagramInsights,
  type InstagramInsights
} from "@/lib/services/instagram-report-insights-service";
import { buildMarketingPlannerInfluencerIntelligence } from "@/lib/services/marketing-planner-influencer-service";
import {
  buildReconciliationReport,
  type ReconciliationReport
} from "@/lib/services/reconciliation-engine-service";
import {
  buildChannelPerformanceReport,
  type ChannelPerformanceReport
} from "@/lib/services/channel-performance-engine-service";
import {
  buildCampaignShopifyAttribution,
  type CampaignShopifyAttributionReport
} from "@/lib/services/campaign-shopify-attribution-service";
import {
  buildAffiliateDeepDive,
  type AffiliateDeepDiveReport
} from "@/lib/services/affiliate-deep-dive-service";
import {
  buildRestockHeroAlerts,
  type RestockHeroAlertReport
} from "@/lib/services/restock-hero-alert-service";
import {
  measureOutcomesForResolvedAlerts,
  getRecentlyResolvedWithOutcomes,
  type ResolvedAlertWithOutcome
} from "@/lib/services/alert-outcome-service";
import { listOpenAlerts } from "@/lib/services/alert-writer-service";
import {
  buildCompetitorWeekSection,
  type CompetitorWeekSection
} from "@/lib/services/competitor-intel-service";
import { COMPETITOR_INTEL_LATEST } from "@/lib/data/competitor-intel-latest";
import {
  fetchCompetitorActivity,
  type CompetitorActivityEntry
} from "@/lib/clients/rivalsweeper-client";
import {
  buildRecommendation,
  DEFAULT_TARGETS,
  type Recommendation
} from "@/lib/services/recommendation-engine-service";
import { getDb } from "@/lib/server/db";
import { dayBoundsUtc, lastCompleteDaysRange } from "@/lib/server/reporting-date-range";
import { getAppLocale } from "@/lib/i18n";
import {
  generateWeeklyBiCommentary,
  type BiWeeklyCommentary
} from "@/lib/services/weekly-report-bi-commentary-service";
import {
  readCachedInsights,
  writeCachedInsights
} from "@/lib/services/weekly-report-cache";

// Print-only weekly Meta Ads report. Server-rendered, no client JS,
// captured to PDF by Playwright (or visible directly in a browser).
//
// URL: /print/meta-ads-weekly?from=YYYY-MM-DD&to=YYYY-MM-DD&storeId=...&locale=he
//
// Visual language: clean black-and-white, A4-friendly. Sections:
//   • Header (title + date range)
//   • Cross-brand totals
//   • Per brand:
//       - AI insights (hookline + observations + actions)
//       - KPI tiles (spend / CPC / CPM / CTR / clicks / impressions / purchases / ROAS)
//       - Funnel (Impressions → Clicks → Landing → ATC → Checkout → Purchase)
//       - Daily breakdown
//       - All campaigns table
//       - All ads table
//   • Instagram / affiliates
//   • Footer

export const dynamic = "force-dynamic";

interface SearchParams {
  from?: string;
  to?: string;
  storeId?: string;
  locale?: string;
  // "1" → extended report with the diagnostic/deep-dive appendix sections.
  appendix?: string;
}

// Date-window resolution moved to store-timezone-aware helpers in
// lib/server/reporting-date-range (dayBoundsUtc / lastCompleteDaysRange).
// The old local versions had three parity bugs vs Shopify Analytics and
// the founder's manual Meta report:
//   1. Defaulted to a window ENDING NOW — a partial day where Meta hasn't
//      synced yet, so spend/ROAS never matched a hand-checked Ads Manager
//      window of complete days.
//   2. Computed midnight boundaries in UTC — Israel is UTC+3, so orders
//      placed 00:00–03:00 local time fell into the previous day vs
//      Shopify's own reports.
//   3. Parsed ?to= as bare UTC midnight — excluding ~the entire final day
//      of Shopify orders while Meta's date-keyed rows still included it,
//      making the report disagree WITH ITSELF.

function formatCurrencyILS(value: number): string {
  return `₪${Math.round(value).toLocaleString("en-US")}`;
}

function formatNumberShort(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function formatPct(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

function formatDateRange(start: Date, end: Date, locale: "he" | "en"): string {
  const fmt = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function formatDayShort(dateKey: string, locale: "he" | "en"): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    day: "numeric",
    month: "short"
  }).format(d);
}

export default async function MetaAdsWeeklyPrintPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await getAuthContext();
  if (!auth.orgId) return notFound();

  const params = await searchParams;
  // Locale: URL param wins, cookie fallback, default Hebrew.
  const cookieLocale = await getAppLocale();
  const urlLocale = params.locale === "he" || params.locale === "en" ? params.locale : null;
  const locale: "he" | "en" = urlLocale ?? cookieLocale;
  const isHe = locale === "he";
  const direction: "rtl" | "ltr" = isHe ? "rtl" : "ltr";

  const storeId = params.storeId?.trim() || (await resolveActiveStoreId());

  // Report depth. The DEFAULT is the concise executive report — summary,
  // insights, actions, competitors and the money tables. `appendix=1` adds
  // the deep/diagnostic sections (data reconciliation, product rollup,
  // per-brand raw tables, Instagram roster, affiliate breakdown) that made
  // the default export feel overloaded.
  const includeAppendix = params.appendix === "1";

  // Resolve the store's timezone BEFORE computing day boundaries — the
  // window must line up with Shopify Analytics, which reports in store
  // time (Asia/Jerusalem for the current tenants), not UTC.
  const storeTimeZone = storeId
    ? await getDb()
        .store.findUnique({ where: { id: storeId }, select: { timezone: true } })
        .then((s: { timezone: string } | null) => s?.timezone || "UTC")
        .catch(() => "UTC")
    : "UTC";

  const explicitStart = params.from ? dayBoundsUtc(params.from, storeTimeZone) : null;
  const explicitEnd = params.to ? dayBoundsUtc(params.to, storeTimeZone) : null;
  const { start, end } =
    explicitStart && explicitEnd
      ? { start: explicitStart.start, end: explicitEnd.end }
      : lastCompleteDaysRange(7, storeTimeZone);
  let report = null as Awaited<ReturnType<typeof buildMetaAdsWeeklyReport>> | null;
  let diagnostic: string | null = null;
  let reconciliation: ReconciliationReport | null = null;
  let channels: ChannelPerformanceReport | null = null;
  let campaignAttribution: CampaignShopifyAttributionReport | null = null;
  let affiliateDeepDive: AffiliateDeepDiveReport | null = null;
  let restockAlerts: RestockHeroAlertReport | null = null;
  let competitorWeek: CompetitorWeekSection | null = null;
  if (!storeId) {
    diagnostic = "no_store";
  } else {
    // Run all the data builds in parallel so the cumulative cost is the
    // slowest single query, not the sum of them all.
    [report, reconciliation, channels, campaignAttribution, affiliateDeepDive, restockAlerts, competitorWeek] = await Promise.all([
      buildMetaAdsWeeklyReport({ storeId, start, end }),
      buildReconciliationReport({ storeId, start, end }).catch(() => null),
      buildChannelPerformanceReport({ storeId, start, end }).catch(() => null),
      buildCampaignShopifyAttribution({ storeId, start, end }).catch(() => null),
      buildAffiliateDeepDive({ storeId, start, end }).catch(() => null),
      buildRestockHeroAlerts({ storeId, start, end }).catch(() => null),
      buildCompetitorWeekSection({ storeId, start, end }).catch(() => null)
    ]);
    if (!report) diagnostic = "no_meta_connection";
    // Closed-loop: refresh outcome measurements + read for the report. Lives
    // here so the PDF shows the same loop the founder sees on the Command
    // Center. Measurement is cheap + idempotent; safe on every PDF render.
    await measureOutcomesForResolvedAlerts({ storeId }).catch(() => null);
  }
  const closedLoop = storeId
    ? await getRecentlyResolvedWithOutcomes({ storeId, lookbackDays: 14, limit: 8 }).catch(() => [])
    : [];

  // Live competitor activity from RivalSweeper (ads / news / homepage links).
  // The provider caches identical requests for a day, so this is cheap.
  // Null in mock mode or on failure — the block simply doesn't render.
  const competitorActivity = storeId
    ? await fetchCompetitorActivity({ timeoutMs: 15_000 }).catch(() => null)
    : null;

  // Open action queue — every alert still awaiting a decision. The report
  // doesn't just describe the week; it hands the founder the same
  // approve/resolve queue the Command Center shows, so the PDF/email is
  // actionable on its own.
  const openActions: OpenActionItem[] = storeId
    ? ((await listOpenAlerts({ storeId, limit: 10 }).catch(() => [])) as unknown as Array<{
        id: string;
        type: string;
        severity: "critical" | "high" | "medium" | "low";
        title: string;
        description: string | null;
        recommendedAction: string | null;
        periodLabel: string | null;
      }>)
    : [];

  // Try the WeeklyReport insight cache first — reads the scheduled cron's
  // stored biCommentary / brandInsights / igInsights when they're < 24h
  // old. Turns a 60-90s PDF render into a 3-5s one when the operator
  // re-opens the same window.
  const cachedInsights = storeId
    ? await readCachedInsights(storeId, start, end).catch(() => null)
    : null;

  // BI agent executive commentary. Best-effort: null if the agent is
  // unconfigured or throws — the section just won't render.
  // KICKED OFF here but AWAITED only after the brand/IG insight stages:
  // with the live local gateway each generation is a real agent turn
  // (30-120s), and running them sequentially blew past the PDF renderer's
  // navigation timeout. Concurrent = wall time of the slowest stage, not
  // the sum.
  let biCommentary: BiWeeklyCommentary | null = null;
  const biCommentaryPromise: Promise<BiWeeklyCommentary | null> = cachedInsights?.biCommentary
    ? Promise.resolve(cachedInsights.biCommentary)
    : storeId && report
      ? generateWeeklyBiCommentary({
          storeName: null, // print page doesn't load the store name; agent infers from data
          periodStart: start.toISOString().slice(0, 10),
          periodEnd: end.toISOString().slice(0, 10),
          locale,
          metaAds: report,
          affiliateDeepDive,
          restockAlerts,
          roasCollapseAlerts: null,
          competitorWeek,
          competitorActivity
        }).catch(() => null)
      : Promise.resolve(null);

  // Build a prior-week snapshot per brand so the insights service can frame
  // observations as trends, not snapshots. The prior window is the same
  // length as the current window, ending the day before it starts.
  const priorByBrand = new Map<string, PriorWeekSnapshot>();
  if (report && report.brands.length > 0 && storeId) {
    const windowMs = end.getTime() - start.getTime();
    const priorEnd = new Date(start.getTime() - 1);
    const priorStart = new Date(priorEnd.getTime() - windowMs);
    const priorReport = await buildMetaAdsWeeklyReport({
      storeId,
      start: priorStart,
      end: priorEnd
    }).catch(() => null);
    if (priorReport) {
      for (const priorBrand of priorReport.brands) {
        priorByBrand.set(priorBrand.name, {
          spend: priorBrand.kpis.spend,
          clicks: priorBrand.kpis.clicks,
          impressions: priorBrand.kpis.impressions,
          purchases: priorBrand.kpis.purchases,
          purchaseRoas: priorBrand.kpis.purchaseRoas,
          ctr: priorBrand.kpis.ctr,
          cpc: priorBrand.kpis.cpc
        });
      }
    }
  }

  const insightsByBrand = new Map<string, BrandInsights>();
  if (report && report.brands.length > 0) {
    // Seed from cache first, then only regenerate brands the cache misses.
    // A partial cache is common when a new brand was added since last run.
    const cachedBrandInsights = cachedInsights?.brandInsights ?? {};
    const brandsToGenerate = report.brands.filter(
      (brand) => !cachedBrandInsights[brand.name]
    );
    for (const brand of report.brands) {
      const cached = cachedBrandInsights[brand.name];
      if (cached) insightsByBrand.set(brand.name, cached);
    }
    if (brandsToGenerate.length > 0) {
      const results = await Promise.all(
        brandsToGenerate.map((brand) =>
          generateBrandInsights(brand, report!.dateRange, isHe ? "he" : "en", {
            prior: priorByBrand.get(brand.name) ?? null
          }).then((insights) => [brand.name, insights] as const)
        )
      );
      for (const [name, insights] of results) insightsByBrand.set(name, insights);
    }
  }

  let influencer: Awaited<ReturnType<typeof buildMarketingPlannerInfluencerIntelligence>> | null = null;
  // 30-day window for Instagram posts so creators who don't post every week
  // still surface. The Meta Ads numbers stay on the report's own window.
  const postsWindowEnd = new Date(end);
  const postsWindowStart = new Date(end);
  postsWindowStart.setUTCDate(postsWindowStart.getUTCDate() - 30);
  let widePosts: Array<{
    username: string;
    captionPreview: string;
    likes: number;
    comments: number;
    postedAt: string;
  }> = [];
  if (storeId) {
    try {
      const db = getDb();
      const store = await db.store.findUnique({
        where: { id: storeId },
        select: { name: true, domain: true }
      });
      if (store) {
        influencer = await buildMarketingPlannerInfluencerIntelligence(
          { storeId, storeName: store.name, storeDomain: store.domain, connected: true },
          end,
          { start, end, periodLabel: `${params.from ?? ""} → ${params.to ?? ""}` }
        );
      }
      // Pull recent posts over the wider 30-day window directly so even
      // infrequent posters get represented. Sort by engagement.
      const rawPosts = await db.creatorPost.findMany({
        where: {
          storeId,
          postedAt: { gte: postsWindowStart, lte: postsWindowEnd }
        },
        include: { creatorProfile: { select: { username: true } } },
        orderBy: { postedAt: "desc" },
        take: 50
      });
      widePosts = (rawPosts as any[])
        .map((p) => ({
          username: p.creatorProfile?.username ?? "?",
          captionPreview: String(p.caption ?? "").slice(0, 120),
          likes: Number(p.likeCount ?? 0),
          comments: Number(p.commentsCount ?? 0),
          postedAt: p.postedAt.toISOString().slice(0, 10)
        }))
        .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
        .slice(0, 10);
    } catch {
      influencer = null;
    }
  }

  // Instagram AI insights — fed off the same data the section renders.
  let igInsights: InstagramInsights | null = cachedInsights?.igInsights ?? null;
  if (!igInsights && influencer) {
    const profiles = influencer.instagramCrawl?.affiliateProfiles ?? [];
    const topCreatorsLookup = new Map<string, { sales: number; orders: number }>();
    for (const c of influencer.topCreators ?? []) {
      const handle = (c.couponCode ?? c.affiliateCode ?? c.name ?? "").toLowerCase();
      topCreatorsLookup.set(handle, { sales: c.sales, orders: c.orders });
    }
    igInsights = await generateInstagramInsights(
      {
        dateRange: { start: postsWindowStart.toISOString().slice(0, 10), end: postsWindowEnd.toISOString().slice(0, 10) },
        affiliates: profiles.map((p) => ({
          username: p.username,
          displayName: p.affiliateName ?? null,
          status: p.status,
          postsStored: p.postsStored ?? 0,
          lastPostAt: p.lastPostAt ?? null,
          attributedSales: topCreatorsLookup.get(p.username.toLowerCase())?.sales ?? 0,
          attributedOrders: topCreatorsLookup.get(p.username.toLowerCase())?.orders ?? 0
        })),
        recentPosts: widePosts
      },
      isHe ? "he" : "en"
    ).catch(() => null);
  }

  // Join the commentary generation that ran concurrently with the brand/IG
  // stages above.
  biCommentary = await biCommentaryPromise;

  // Write freshly-generated insights back into the cache so subsequent
  // renders (email cron re-send, second PDF download) skip the expensive
  // BI + OpenAI calls. No-op when no WeeklyReport row exists for this
  // window — see writeCachedInsights contract.
  if (storeId && !cachedInsights) {
    const brandInsightsRecord: Record<string, BrandInsights> = {};
    for (const [name, insights] of insightsByBrand) {
      brandInsightsRecord[name] = insights;
    }
    await writeCachedInsights(storeId, start, end, {
      biCommentary,
      brandInsights: brandInsightsRecord,
      igInsights
    }).catch(() => undefined);
  }

  const t = isHe
    ? {
        eyebrow: "דוח ביצועים שבועי",
        title: "סיכום שבועי – Meta Ads",
        subtitle: "ביצועי קמפיינים, משפיענים ומסקנות לפעולה",
        accountLabel: "חשבון מודעות",
        // Totals
        totalsTitle: "סיכום כללי",
        totalSpend: "סה״כ הוצאה",
        totalImpressions: "חשיפות",
        totalClicks: "קליקים",
        totalPurchases: "רכישות",
        // Page 4 / 5 — Meta-attributed only (Meta's own purchase tracking).
        // Page 1 uses a different "blended" ROAS label so the two never
        // collide visually.
        weightedRoas: "ROAS לפי Meta",
        brandsLabel: "מותגים",
        campaignsTotal: "קמפיינים",
        adsTotal: "מודעות",
        // KPI tiles
        spend: "הוצאה",
        cpc: "CPC",
        cpm: "CPM",
        ctr: "CTR",
        clicks: "קליקים",
        impressions: "חשיפות",
        purchases: "רכישות",
        roas: "ROAS",
        // Insights
        insightsHook: "מסקנה השבוע",
        observationsLabel: "מה קרה",
        actionsLabel: "פעולות לשבוע הבא",
        // Funnel
        funnelTitle: "משפך המרה",
        funnelImpr: "חשיפות",
        funnelClicks: "קליקים",
        funnelLPV: "צפיות בדף נחיתה",
        funnelATC: "הוספה לסל",
        funnelIC: "התחלת checkout",
        funnelPurch: "רכישה",
        // Daily
        dailyTitle: "פירוט יומי",
        dailyDate: "תאריך",
        // Tables
        campaignsTitle: "כל הקמפיינים",
        campaignName: "שם קמפיין",
        adsTitle: "כל המודעות",
        adsetLabel: "ערכת מודעות",
        adLabel: "מודעה",
        noAds: "אין מודעות פעילות בטווח התאריכים שנבחר.",
        // Instagram
        instagramTitle: "Instagram ושיתופי פעולה",
        instagramSubtitle: "ביצועי משפיענים ופוסטים בשבוע הנבחר",
        topCreatorsLabel: "המשפיענים המובילים",
        topPostsLabel: "פוסטים מובילים (לפי לייקים + תגובות)",
        noInfluencer: "אין נתוני משפיענים זמינים לטווח התאריכים שנבחר.",
        likesLabel: "לייקים",
        commentsLabel: "תגובות",
        salesLabel: "מכירות",
        ordersLabel: "הזמנות",
        clicksLabelIg: "קליקים",
        allAffiliatesLabel: "כל המשפיענים המוגדרים",
        profileStatusLabel: "מצב",
        profilePostsLabel: "פוסטים שמורים",
        profileLastPostLabel: "פוסט אחרון",
        statusStored: "פעיל (יש פוסטים)",
        statusScanned: "נסרק (אין פוסטים)",
        statusHandleSaved: "ממתין לסריקה",
        statusMissing: "לא נמצא",
        windowLabel: "חלון נתונים: 30 הימים האחרונים",
        // Diagnostics
        noBrands: "לא נמצאו קמפיינים לתקופה זו.",
        noRules: "לא הוגדרו כללי שיוך מותגים – כל הקמפיינים מקובצים יחד.",
        diagNoStore: "לא נמצאה חנות פעילה.",
        diagNoMeta: "לא קיים חיבור Meta Ads לחנות הפעילה.",
        diagTitle: "הדוח לא נוצר",
        footer: "נוצר אוטומטית",
        campaignsWord: "קמפיינים",
        adsWord: "מודעות"
      }
    : {
        eyebrow: "WEEKLY PERFORMANCE REPORT",
        title: "Weekly Summary – Meta Ads",
        subtitle: "Campaign performance, creators, and actions for next week",
        accountLabel: "Ad account",
        totalsTitle: "Overview",
        totalSpend: "Total spend",
        totalImpressions: "Impressions",
        totalClicks: "Clicks",
        totalPurchases: "Purchases",
        weightedRoas: "Meta-attributed ROAS",
        brandsLabel: "Brands",
        campaignsTotal: "Campaigns",
        adsTotal: "Ads",
        spend: "Spend",
        cpc: "CPC",
        cpm: "CPM",
        ctr: "CTR",
        clicks: "Clicks",
        impressions: "Impressions",
        purchases: "Purchases",
        roas: "ROAS",
        insightsHook: "This week",
        observationsLabel: "What happened",
        actionsLabel: "Actions for next week",
        funnelTitle: "Conversion funnel",
        funnelImpr: "Impressions",
        funnelClicks: "Clicks",
        funnelLPV: "Landing page views",
        funnelATC: "Add to cart",
        funnelIC: "Initiate checkout",
        funnelPurch: "Purchase",
        dailyTitle: "Daily breakdown",
        dailyDate: "Date",
        campaignsTitle: "All campaigns",
        campaignName: "Campaign name",
        adsTitle: "All ads",
        adsetLabel: "Ad set",
        adLabel: "Ad",
        noAds: "No ads in the selected window.",
        instagramTitle: "Instagram & affiliates",
        instagramSubtitle: "Creator and post performance for the selected week",
        topCreatorsLabel: "Top creators",
        topPostsLabel: "Top posts (by likes + comments)",
        noInfluencer: "No influencer data available for the selected window.",
        likesLabel: "Likes",
        commentsLabel: "Comments",
        salesLabel: "Sales",
        ordersLabel: "Orders",
        clicksLabelIg: "Clicks",
        allAffiliatesLabel: "All configured creators",
        profileStatusLabel: "Status",
        profilePostsLabel: "Posts stored",
        profileLastPostLabel: "Last post",
        statusStored: "Active (posts present)",
        statusScanned: "Scanned (no posts)",
        statusHandleSaved: "Awaiting first crawl",
        statusMissing: "Not found",
        windowLabel: "Data window: last 30 days",
        noBrands: "No campaigns found in this period.",
        noRules: "No brand rules configured – all campaigns grouped together.",
        diagNoStore: "No active store found.",
        diagNoMeta: "No Meta Ads connection for the active store.",
        diagTitle: "Report could not be generated",
        footer: "Auto-generated",
        campaignsWord: "campaigns",
        adsWord: "ads"
      };

  // Cross-brand totals computed from the per-brand KPIs.
  const totals = report
    ? {
        spend: report.brands.reduce((s, b) => s + b.kpis.spend, 0),
        clicks: report.brands.reduce((s, b) => s + b.kpis.clicks, 0),
        impressions: report.brands.reduce((s, b) => s + b.kpis.impressions, 0),
        purchases: report.brands.reduce((s, b) => s + b.kpis.purchases, 0),
        brands: report.brands.length,
        campaigns: report.totals.campaignCount,
        ads: report.brands.reduce((s, b) => s + b.ads.length, 0),
        roas: (() => {
          let num = 0;
          let den = 0;
          for (const b of report.brands) {
            if (b.kpis.purchaseRoas != null && b.kpis.spend > 0) {
              num += b.kpis.purchaseRoas * b.kpis.spend;
              den += b.kpis.spend;
            }
          }
          return den > 0 ? num / den : null;
        })()
      }
    : null;

  // Hard-prefixed CSS so styles don't leak into the rest of the app. Clean
  // print look: white background, black text, gray dividers, no gradients.
  const css = `
    .pwr-root {
      direction: ${direction};
      min-height: 100vh;
      padding: 28px 28px 40px;
      background: #ffffff;
      color: #0f172a;
      font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, "Noto Sans Hebrew", "Heebo", sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .pwr-report { max-width: 740px; margin: 0 auto; }
    .pwr-hero { padding: 0 0 18px; border-bottom: 2px solid #0f172a; margin-bottom: 18px; }
    .pwr-eyebrow {
      margin: 0 0 6px;
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #64748b;
    }
    .pwr-title { margin: 0 0 4px; font-size: 28px; font-weight: 800; letter-spacing: -0.01em; color: #0f172a; }
    .pwr-subtitle { margin: 0 0 10px; font-size: 13px; color: #475569; }
    .pwr-date {
      display: inline-block;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .pwr-section { margin-top: 22px; }
    .pwr-section + .pwr-section { margin-top: 22px; }
    .pwr-section-title {
      margin: 0 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #0f172a;
      font-size: 14px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0f172a;
      font-weight: 700;
    }
    .pwr-brand-block {
      margin-top: 24px;
      padding-top: 14px;
      border-top: 2px solid #0f172a;
    }
    .pwr-brand-block:first-of-type { margin-top: 18px; }
    .pwr-brand-name { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
    .pwr-brand-meta { font-size: 11px; color: #64748b; }
    .pwr-kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 12px;
    }
    .pwr-kpi {
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
    }
    .pwr-kpi-label {
      margin: 0 0 2px;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }
    .pwr-kpi-value { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
    .pwr-insights {
      margin-top: 14px;
      padding: 12px 14px;
      border: 1px solid #0f172a;
      border-radius: 4px;
      background: #f8fafc;
    }
    .pwr-insights-hook { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.5; }
    .pwr-insights-label {
      margin: 8px 0 4px;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }
    .pwr-insights-list { margin: 0; padding: 0; list-style: none; }
    .pwr-insights-list li {
      padding: 2px 0 2px 12px;
      position: relative;
      font-size: 12px;
      line-height: 1.55;
      color: #0f172a;
    }
    .pwr-insights-list li::before {
      content: "•";
      position: absolute;
      ${isHe ? "right" : "left"}: 0;
      color: #0f172a;
    }
    [dir="rtl"] .pwr-insights-list li {
      padding-${isHe ? "left" : "right"}: 0;
      padding-${isHe ? "right" : "left"}: 12px;
    }
    .pwr-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 8px;
    }
    .pwr-table thead th {
      text-align: ${isHe ? "right" : "left"};
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #475569;
      padding: 6px 8px;
      border-bottom: 2px solid #0f172a;
      background: #f1f5f9;
      font-weight: 700;
    }
    .pwr-table tbody td {
      padding: 6px 8px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .pwr-table tbody tr:last-child td { border-bottom: 1px solid #0f172a; }
    .pwr-table tbody tr:nth-child(even) td { background: #fafafa; }
    .pwr-funnel { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-top: 8px; }
    .pwr-funnel-cell { padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; }
    .pwr-funnel-label { margin: 0 0 4px; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
    .pwr-funnel-value { margin: 0; font-size: 14px; font-weight: 800; color: #0f172a; }
    .pwr-funnel-rate { margin: 4px 0 0; font-size: 10px; color: #475569; }
    .pwr-block-title {
      margin: 14px 0 4px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0f172a;
      font-weight: 700;
    }
    .pwr-ig-card { margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; }
    .pwr-ig-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
      color: #0f172a;
    }
    .pwr-ig-row:last-child { border-bottom: none; }
    .pwr-ig-name { flex: 1; min-width: 0; word-break: break-word; font-weight: 600; }
    .pwr-ig-stats {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
      font-size: 11px;
      color: #475569;
      white-space: nowrap;
    }
    .pwr-ig-stat-num { color: #0f172a; font-weight: 700; }
    .pwr-warning {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 4px;
      background: #fef9c3;
      border: 1px solid #ca8a04;
      color: #713f12;
      font-size: 11px;
      line-height: 1.5;
    }
    .pwr-footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #64748b; }
    /* Executive page styling — Pages 1, 2, 3 of the new 11-page report */
    .pwr-exec-page {
      page-break-after: always;
      padding-bottom: 24px;
    }
    .pwr-exec-page:last-child {
      page-break-after: auto;
    }
    .pwr-exec-page-tag {
      display: inline-block;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 4px;
    }
    .pwr-exec-page-title {
      font-size: 22px;
      font-weight: 800;
      margin: 0 0 4px;
      color: #0f172a;
    }
    .pwr-exec-page-sub {
      font-size: 12px;
      color: #475569;
      margin: 0 0 18px;
    }
    .pwr-bottom-line {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .pwr-bottom-line .pwr-kpi {
      padding: 10px 12px;
    }
    .pwr-bottom-line .pwr-kpi-value {
      font-size: 18px;
    }
    .pwr-src {
      display: inline-block;
      vertical-align: super;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 1px 4px;
      margin-${isHe ? "right" : "left"}: 4px;
      border-radius: 3px;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
    }
    .pwr-src-meta { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
    .pwr-src-shopify { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
    .pwr-src-calc { color: #6b21a8; background: #faf5ff; border-color: #d8b4fe; }
    .pwr-src-blended { color: #b45309; background: #fffbeb; border-color: #fde68a; }
    .pwr-highlight-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }
    .pwr-highlight {
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
    }
    .pwr-highlight-label {
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 4px;
    }
    .pwr-highlight-value {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
      line-height: 1.3;
    }
    .pwr-highlight-detail {
      font-size: 11px;
      color: #475569;
      margin: 3px 0 0;
      line-height: 1.4;
    }
    .pwr-exec-summary {
      padding: 14px 16px;
      border: 2px solid #0f172a;
      border-radius: 4px;
      background: #f8fafc;
      margin: 16px 0 0;
    }
    .pwr-exec-summary p {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      color: #0f172a;
    }
    .pwr-recon-warning {
      padding: 10px 12px;
      border-radius: 4px;
      margin-bottom: 8px;
      font-size: 11px;
      line-height: 1.5;
    }
    .pwr-recon-warning-error { background: #fef2f2; border: 1px solid #fecaca; color: #7f1d1d; }
    .pwr-recon-warning-warning { background: #fefce8; border: 1px solid #fde68a; color: #713f12; }
    .pwr-recon-warning-info { background: #f0f9ff; border: 1px solid #bae6fd; color: #075985; }
    .pwr-flag-banner {
      margin: 0 0 14px 0;
      padding: 12px 14px;
      background: #fef2f2;
      border-left: 4px solid #dc2626;
      border-right: 1px solid #fecaca;
      border-top: 1px solid #fecaca;
      border-bottom: 1px solid #fecaca;
      border-radius: 4px;
      page-break-inside: avoid;
    }
    .pwr-flag-banner-title {
      font-size: 13px;
      font-weight: 800;
      color: #7f1d1d;
      letter-spacing: 0.02em;
      margin: 0 0 6px 0;
    }
    .pwr-flag-banner-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pwr-flag-banner-item {
      padding: 6px 0;
      border-top: 1px dashed #fecaca;
      font-size: 11.5px;
      color: #450a0a;
      line-height: 1.55;
    }
    .pwr-flag-banner-item:first-child { border-top: none; padding-top: 2px; }
    .pwr-flag-banner-item strong { color: #7f1d1d; }
    .pwr-flag-card {
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
      background: #ffffff;
      page-break-inside: avoid;
    }
    .pwr-flag-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }
    .pwr-flag-card-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .pwr-flag-card-rank {
      font-size: 10px;
      font-weight: 600;
      color: #7f1d1d;
      background: #fef2f2;
      border: 1px solid #fecaca;
      padding: 2px 6px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .pwr-flag-card-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .pwr-flag-card-stat {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 6px 8px;
    }
    .pwr-flag-card-stat-label { font-size: 9px; color: #64748b; letter-spacing: 0.04em; text-transform: uppercase; }
    .pwr-flag-card-stat-value { font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 1px; }
    .pwr-flag-card-action {
      font-size: 11.5px;
      color: #7f1d1d;
      background: #fef2f2;
      border: 1px dashed #fecaca;
      border-radius: 4px;
      padding: 8px 10px;
      line-height: 1.55;
    }
    .pwr-conf {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .pwr-conf-high { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .pwr-conf-medium { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .pwr-conf-low { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    @media print {
      @page { size: A4; margin: 14mm 12mm; }
      body { background: #ffffff !important; }
      .pwr-root { padding: 0; min-height: 0; }
      .pwr-brand-block { page-break-inside: avoid; }
      .pwr-section { page-break-inside: avoid; }
      .pwr-exec-page { page-break-after: always; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="pwr-root">
        <div className="pwr-report">
          <header className="pwr-hero">
            <p className="pwr-eyebrow">{t.eyebrow}</p>
            <h1 className="pwr-title">{t.title}</h1>
            <p className="pwr-subtitle">{t.subtitle}</p>
            <span className="pwr-date">{formatDateRange(start, end, locale)}</span>
          </header>

          {diagnostic ? (
            <div className="pwr-section">
              <h2 className="pwr-section-title">{t.diagTitle}</h2>
              <p style={{ margin: 0, fontSize: 13 }}>
                {diagnostic === "no_store" ? t.diagNoStore : t.diagNoMeta}
              </p>
              <p style={{ marginTop: 10, fontSize: 10, color: "#64748b" }}>
                storeId: <code>{storeId ?? "(none)"}</code> · range:{" "}
                <code>{params.from ?? "(default)"} → {params.to ?? "(default)"}</code>
              </p>
            </div>
          ) : null}

          {/* Red-flag banner — pinned above Page 1 so restocked heroes are
              the first thing the founder sees on opening the PDF. */}
          {restockAlerts && restockAlerts.flags.length > 0 ? (
            <RestockHeroBanner alerts={restockAlerts} isHe={isHe} />
          ) : null}

          {/* BI agent executive commentary — top of report. The agent
              wrote this from a digest of this week's KPIs. */}
          {biCommentary ? (
            <section className="pwr-exec-page" style={{ marginBottom: 20 }}>
              <p className="pwr-exec-page-tag">{isHe ? "סיכום BI" : "BI EXECUTIVE SUMMARY"}</p>
              <h2 className="pwr-exec-page-title" style={{ marginBottom: 4, lineHeight: 1.3 }}>
                <BoldedText text={biCommentary.headline} />
              </h2>
              <p className="pwr-exec-page-sub" style={{ marginBottom: 14, fontStyle: "italic", color: "#64748b" }}>
                {isHe ? "נכתב על-ידי סוכן הBI של Hiloomy" : "Written by the Hiloomy BI agent"}
                {" · "}
                {new Date(biCommentary.generatedAt).toLocaleString(isHe ? "he-IL" : "en-US", {
                  dateStyle: "medium",
                  timeStyle: "short"
                })}
              </p>

              {biCommentary.insights.length > 0 ? (
                <>
                  <div className="pwr-block-title" style={{ marginTop: 0 }}>
                    {isHe ? "מה קרה השבוע" : "What happened this week"}
                  </div>
                  <ul className="pwr-insights" style={{ paddingInlineStart: 18, margin: "6px 0 14px 0", listStyleType: "disc" }}>
                    {biCommentary.insights.slice(0, 3).map((insight, i) => (
                      <li key={`insight-${i}`} style={{ marginBottom: 4, lineHeight: 1.45 }}>
                        <BoldedText text={insight} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {biCommentary.actions.length > 0 ? (
                <>
                  <div className="pwr-block-title" style={{ marginTop: 0 }}>
                    {isHe ? "מה לעשות השבוע" : "What to do this week"}
                  </div>
                  <ol className="pwr-insights" style={{ paddingInlineStart: 22, margin: "6px 0 0 0", listStyleType: "decimal" }}>
                    {biCommentary.actions.slice(0, 3).map((action, i) => (
                      <li key={`action-${i}`} style={{ marginBottom: 4, lineHeight: 1.45 }}>
                        <BoldedText text={action} />
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
            </section>
          ) : null}

          {/* PAGE 1 — Executive Summary (the 60-second view) */}
          {reconciliation && report ? (
            <ExecutiveSummaryPage
              recon={reconciliation}
              report={report}
              influencer={influencer}
              widePosts={widePosts}
              metaInsights={insightsByBrand}
              isHe={isHe}
            />
          ) : null}

          {/* Closed Loop — what happened after the founder acted on prior
              recommendations. Lives between Exec Summary and Hot Restocks
              so the founder reads "what worked / what didn't" BEFORE
              triaging this week's new asks. */}
          {closedLoop.length > 0 ? (
            <ClosedLoopPage items={closedLoop} isHe={isHe} />
          ) : null}

          {/* Action queue — open alerts still awaiting a decision. Directly
              after the closed loop: first "what happened when you acted",
              then "here's what's waiting for you now". Mirrors the
              Command Center queue so the PDF is actionable standalone. */}
          {openActions.length > 0 ? (
            <ActionQueuePage items={openActions} isHe={isHe} />
          ) : null}

          {/* Competitors — what the tracked comp set did this week. Sits
              right after the closed loop so the founder reads "what worked"
              and then "what the market did" before this week's asks. */}
          {competitorWeek && competitorWeek.competitors.length > 0 ? (
            <CompetitorsPage data={competitorWeek} activity={competitorActivity} isHe={isHe} />
          ) : null}

          {/* Hot Restocks — dedicated action page right after the closed loop. */}
          {restockAlerts && restockAlerts.flags.length > 0 ? (
            <RestockHeroActionPage alerts={restockAlerts} isHe={isHe} />
          ) : null}

          {/* PAGE 2 — Executive Growth Insights (Hebrew 4-section block) */}
          {reconciliation && report ? (
            <ExecutiveGrowthInsightsPage
              recon={reconciliation}
              report={report}
              influencer={influencer}
              widePosts={widePosts}
              metaInsights={insightsByBrand}
              igInsights={igInsights}
              isHe={isHe}
            />
          ) : null}

          {/* PAGE 3 — Data Reconciliation. Diagnostic material — appendix only. */}
          {includeAppendix && reconciliation ? (
            <DataReconciliationPage recon={reconciliation} isHe={isHe} />
          ) : null}

          {/* PAGE 5 — Channel Performance (Shopify orders bucketed by source) */}
          {channels ? <ChannelPerformancePage channels={channels} isHe={isHe} /> : null}

          {/* PAGE 6 — Campaign Performance (Meta vs Shopify + recommendations) */}
          {campaignAttribution && report ? (
            <CampaignPerformancePage attribution={campaignAttribution} report={report} isHe={isHe} />
          ) : null}

          {/* PAGE 6b — Product-level rollup grouped from ad-name prefix.
              Deep-dive material — appendix only. */}
          {includeAppendix && report ? <ProductPerformancePage report={report} isHe={isHe} /> : null}

          {/* Account-wide totals — only meaningful with 2+ brands. For a
              single-brand account these tiles are an exact re-render of
              the brand block's own KPI row (one brand == the whole
              account), so we skip them and save a duplicated page. The
              no-rules warning moves to the brand block area via footer. */}
          {report && totals && report.brands.length > 1 ? (
            <section className="pwr-section">
              <h2 className="pwr-section-title">{t.totalsTitle}</h2>
              <div className="pwr-kpi-row">
                <Tile label={t.totalSpend} value={formatCurrencyILS(totals.spend)} />
                <Tile label={t.totalClicks} value={formatNumberShort(totals.clicks)} />
                <Tile label={t.totalImpressions} value={formatNumberShort(totals.impressions)} />
                <Tile label={t.totalPurchases} value={formatNumberShort(totals.purchases)} />
              </div>
              <div className="pwr-kpi-row" style={{ marginTop: 6 }}>
                <Tile label={t.weightedRoas} value={totals.roas != null ? `${formatRatio(totals.roas)}x` : "—"} source="M" />
                <Tile label={t.brandsLabel} value={String(totals.brands)} />
                <Tile label={t.campaignsTotal} value={String(totals.campaigns)} />
                <Tile label={t.adsTotal} value={String(totals.ads)} />
              </div>
            </section>
          ) : null}

          {/* No-brand-rules note — OUTSIDE the multi-brand totals gate, because
              single-brand accounts (which skip the totals section entirely)
              are exactly the ones running without brand rules configured. */}
          {report && !report.rulesActive ? (
            <div className="pwr-warning">{t.noRules}</div>
          ) : null}

          {report && report.brands.length === 0 ? (
            <div className="pwr-section">
              <h2 className="pwr-section-title">{t.diagTitle}</h2>
              <p style={{ margin: 0, fontSize: 13 }}>{t.noBrands}</p>
            </div>
          ) : null}

          {/* Brand deep-dive blocks — pure data (KPIs / funnel / daily /
              campaigns / ads). Appendix material — EXCEPT when the exec
              pages did not render (no reconciliation data): then this is
              the only place the per-brand insights appear, so it stays. */}
          {report && (includeAppendix || !reconciliation)
            ? report.brands.map((brand) => (
                <BrandBlock
                  key={brand.name}
                  brand={brand}
                  insights={reconciliation ? null : insightsByBrand.get(brand.name) ?? null}
                  t={t}
                  locale={locale}
                />
              ))
            : null}

          {/* Instagram roster + posts tables — appendix only (the influencer
              insights already render on page 2). */}
          {includeAppendix && influencer ? (
            <InstagramSection
              influencer={influencer}
              widePosts={widePosts}
              igInsights={reconciliation && report ? null : igInsights}
              t={t}
            />
          ) : null}

          {/* Affiliate Performance — detailed breakdown per affiliate. Appendix only. */}
          {includeAppendix && affiliateDeepDive && affiliateDeepDive.affiliates.length > 0 ? (
            <AffiliatePerformancePage deepDive={affiliateDeepDive} isHe={isHe} />
          ) : null}

          {!includeAppendix ? (
            <p style={{ margin: "10px 0 0 0", fontSize: 10, color: "#94a3b8" }}>
              {isHe
                ? "דוח תקציר. הגרסה המלאה (התאמת נתונים, פירוט מוצרים, צלילת מותג, אינסטגרם ושותפים) זמינה בייצוא המורחב."
                : "Concise report. The full version (reconciliation, product rollup, brand deep dives, Instagram, affiliates) is available via the extended export."}
            </p>
          ) : null}

          <p className="pwr-footer">
            {t.footer}
            {report?.account ? ` · ${t.accountLabel}: ${report.account.name ?? report.account.id}` : ""}
          </p>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Executive helpers (Phase 1)
// ─────────────────────────────────────────────────────────────────────

type ConfLevel = "high" | "medium" | "low";

function confidenceFromSpend(spend: number, purchases: number): ConfLevel {
  // High = enough money + signal. Medium = some signal. Low = noise.
  if (spend >= 1000 && purchases >= 5) return "high";
  if (spend >= 200 && purchases >= 1) return "medium";
  return "low";
}

function SourceTag({ source }: { source: "M" | "S" | "Calc" | "Blended" }) {
  const cls =
    source === "M"
      ? "pwr-src pwr-src-meta"
      : source === "S"
        ? "pwr-src pwr-src-shopify"
        : source === "Blended"
          ? "pwr-src pwr-src-blended"
          : "pwr-src pwr-src-calc";
  return <span className={cls}>{source}</span>;
}

// Minimal markdown bold renderer. Only handles **text** → <strong>text</strong>.
// Used for the BI commentary block so the agent's emphasis on KPI numbers
// (e.g. **₪184,067**, **ROAS 7.5×**) renders as visually weighted text in
// the PDF, not as literal asterisks. Anything else (code, links, italic)
// passes through unchanged — the agent is prompted to use only bold.
function BoldedText({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function ConfBadge({ level, isHe }: { level: ConfLevel; isHe: boolean }) {
  const labelHe = level === "high" ? "ביטחון גבוה" : level === "medium" ? "ביטחון בינוני" : "ביטחון נמוך";
  const labelEn = level === "high" ? "HIGH CONF" : level === "medium" ? "MED CONF" : "LOW CONF";
  return <span className={`pwr-conf pwr-conf-${level}`}>{isHe ? labelHe : labelEn}</span>;
}

// Pick the campaign that best earns the "best of week" label across the
// brands we have. Rank: purchases first, then ROAS, then spend.
function pickBestCampaign(
  brands: MetaAdsReportBrand[]
): { name: string; spend: number; purchases: number; roas: number | null } | null {
  let best: { name: string; spend: number; purchases: number; roas: number | null } | null = null;
  for (const b of brands) {
    for (const c of b.campaigns) {
      const candidate = { name: c.campaignName, spend: c.spend, purchases: c.purchases, roas: c.purchaseRoas };
      if (!best) {
        best = candidate;
        continue;
      }
      if (
        candidate.purchases > best.purchases ||
        (candidate.purchases === best.purchases && (candidate.roas ?? 0) > (best.roas ?? 0)) ||
        (candidate.purchases === best.purchases && (candidate.roas ?? 0) === (best.roas ?? 0) && candidate.spend > best.spend)
      ) {
        best = candidate;
      }
    }
  }
  return best;
}

type AdHighlight = { name: string; spend: number; purchases: number; roas: number | null };

// Pick the two flavours of "best ad" — by volume (purchases) and by
// efficiency (ROAS with a real-spend floor). The Paz/influencer creative
// often has the best ROAS but lower purchase count; the evergreen creative
// often has the highest absolute purchases. A founder wants to see both.
function pickBestAds(brands: MetaAdsReportBrand[]): {
  byPurchases: AdHighlight | null;
  byRoas: AdHighlight | null;
} {
  const MIN_SPEND_FOR_VOLUME = 50; // ignore noise candidates for "most purchases"
  const MIN_SPEND_FOR_ROAS = 200; // a higher floor for ROAS pick — keep one-purchase flukes out
  let byPurchases: AdHighlight | null = null;
  let byRoas: AdHighlight | null = null;
  for (const b of brands) {
    for (const a of b.ads) {
      const candidate: AdHighlight = {
        name: a.adName ?? "?",
        spend: a.spend,
        purchases: a.purchases,
        roas: a.purchaseRoas
      };

      // by purchases — primary rank is purchase count, ties broken by ROAS, then spend.
      if (candidate.spend >= MIN_SPEND_FOR_VOLUME) {
        if (
          !byPurchases ||
          candidate.purchases > byPurchases.purchases ||
          (candidate.purchases === byPurchases.purchases && (candidate.roas ?? 0) > (byPurchases.roas ?? 0)) ||
          (candidate.purchases === byPurchases.purchases && (candidate.roas ?? 0) === (byPurchases.roas ?? 0) && candidate.spend > byPurchases.spend)
        ) {
          byPurchases = candidate;
        }
      }

      // by ROAS — only ads with real delivery (≥₪200) AND at least 3 purchases
      // qualify, so a single fluke doesn't crown the wrong creative.
      if (candidate.spend >= MIN_SPEND_FOR_ROAS && candidate.purchases >= 3 && candidate.roas != null) {
        if (!byRoas || (candidate.roas ?? 0) > (byRoas.roas ?? 0)) {
          byRoas = candidate;
        }
      }
    }
  }

  // Edge case: if the same ad wins both, only show it once (as the ROAS winner
  // since that's the more interesting signal).
  if (byPurchases && byRoas && byPurchases.name === byRoas.name) {
    byPurchases = null;
  }
  return { byPurchases, byRoas };
}

// Pick the best influencer. Priority order:
//   1) Sales-attributed creator (coupon/UTM/affiliate code matched).
//   2) Engagement winner from the 30-day post window — there might not BE a
//      sales-attributed creator yet (no coupon codes wired) but we still want
//      to highlight whoever is driving real awareness for the brand.
// We label the source differently so the founder knows which one they're
// looking at.
function pickBestInfluencer(
  influencer: Awaited<ReturnType<typeof buildMarketingPlannerInfluencerIntelligence>> | null,
  widePosts: Array<{ username: string; likes: number; comments: number; postedAt: string }>
): { name: string; primaryLine: string; secondaryLine: string | null; mode: "sales" | "engagement" } | null {
  if (influencer?.topCreators?.length) {
    const top = influencer.topCreators[0];
    return {
      name: top.name,
      primaryLine: `₪${Math.round(top.sales).toLocaleString("en-US")} · ${top.orders} orders`,
      secondaryLine: null,
      mode: "sales"
    };
  }
  if (widePosts.length === 0) return null;
  // Aggregate engagement per username across the 30-day window.
  const byUser = new Map<string, { likes: number; comments: number; posts: number }>();
  for (const p of widePosts) {
    const cur = byUser.get(p.username) ?? { likes: 0, comments: 0, posts: 0 };
    cur.likes += p.likes;
    cur.comments += p.comments;
    cur.posts += 1;
    byUser.set(p.username, cur);
  }
  let best: { name: string; likes: number; comments: number; posts: number } | null = null;
  for (const [name, stats] of byUser.entries()) {
    const score = stats.likes + stats.comments;
    const bestScore = best ? best.likes + best.comments : -1;
    if (score > bestScore) best = { name, ...stats };
  }
  if (!best) return null;
  return {
    name: `@${best.name}`,
    primaryLine: `${best.likes.toLocaleString("en-US")} likes · ${best.comments} comments`,
    secondaryLine: `${best.posts} posts (engagement-based, no sales attribution)`,
    mode: "engagement"
  };
}

function pickMainRisk(
  recon: ReconciliationReport,
  isHe: boolean
): string {
  // The top-risk card on page 1 is for BUSINESS attention, not data-pipeline
  // warnings. Sync gaps, missing-day info and other kind:"data" notes live
  // in the reconciliation section (page 3) and shouldn't be repeated here.
  // Business-severity errors still win (missing Meta connection blocks the
  // whole report, so it must escalate to the top).
  const err = recon.validation.warnings.find((w) => w.severity === "error" && w.kind === "business");
  if (err) return isHe ? err.messageHe : err.messageEn;
  const businessWarn = recon.validation.warnings.find((w) => w.severity === "warning" && w.kind === "business");
  if (businessWarn) return isHe ? businessWarn.messageHe : businessWarn.messageEn;
  if (recon.blended.roas != null && recon.blended.roas < 2) {
    return isHe
      ? `ROAS המשוקלל נמוך מ2x (${recon.blended.roas.toFixed(2)}x). יש לבחון את הקמפיינים החזקים והחלשים בפירוט.`
      : `Blended ROAS is below 2x (${recon.blended.roas.toFixed(2)}x). Drill into top + worst campaigns.`;
  }
  // Fall back to a data-error only if there's genuinely nothing else — e.g.,
  // no Meta connection means the whole report is empty and the founder needs
  // to know before scrolling further.
  const criticalDataErr = recon.validation.warnings.find((w) => w.severity === "error");
  if (criticalDataErr) return isHe ? criticalDataErr.messageHe : criticalDataErr.messageEn;
  return isHe ? "אין סיכונים מהותיים שעלו מתהליך האימות." : "No material risks raised during validation.";
}

function pickMainAction(
  metaInsights: Map<string, BrandInsights>,
  brands: MetaAdsReportBrand[]
): string | null {
  // Use the first action of the highest-spend brand's insight set.
  const top = [...brands].sort((a, b) => b.kpis.spend - a.kpis.spend)[0];
  if (!top) return null;
  const ins = metaInsights.get(top.name);
  return ins?.actions[0] ?? null;
}

interface ExecPageProps {
  recon: ReconciliationReport;
  report: NonNullable<Awaited<ReturnType<typeof buildMetaAdsWeeklyReport>>>;
  influencer: Awaited<ReturnType<typeof buildMarketingPlannerInfluencerIntelligence>> | null;
  widePosts: Array<{ username: string; captionPreview: string; likes: number; comments: number; postedAt: string }>;
  metaInsights: Map<string, BrandInsights>;
  isHe: boolean;
}

function ExecutiveSummaryPage(props: ExecPageProps) {
  const { recon, report, influencer, widePosts, metaInsights, isHe } = props;
  const lang = (he: string, en: string) => (isHe ? he : en);
  const blendedRoas = recon.blended.roas;
  const cpa = recon.blended.cpa;
  const aov = recon.shopify.aov;
  const bestCampaign = pickBestCampaign(report.brands);
  const bestAds = pickBestAds(report.brands); // returns { byPurchases, byRoas }
  const bestInfluencer = pickBestInfluencer(influencer, widePosts);
  const mainRisk = pickMainRisk(recon, isHe);
  const mainAction = pickMainAction(metaInsights, report.brands);
  const conf = confidenceFromSpend(recon.meta.spend, recon.shopify.orders);

  // Meta-attributed ROAS + revenue — this is the number the founder writes
  // in their manual weekly summary ("ROAS כולל 4.8"). Blended ROAS mixes
  // Meta spend against ALL Shopify revenue (including affiliates who often
  // drive 40-60% of orders) and reads as inflated when quoted alone. We
  // now surface Meta ROAS as the primary tile and keep Blended as a
  // supporting metric with an explicit label so founders can compare.
  const metaRoas = report.totals.spend > 0
    ? report.brands.reduce((sum, b) => {
        const roas = b.kpis.purchaseRoas ?? 0;
        return sum + roas * b.kpis.spend;
      }, 0) / report.totals.spend
    : null;
  const metaAttributedRevenue = report.brands.reduce((sum, b) => {
    const roas = b.kpis.purchaseRoas ?? 0;
    return sum + roas * b.kpis.spend;
  }, 0);

  // Hebrew narrative summary — concrete, references the real numbers.
  // Leads with Meta ROAS (the honest attribution number) rather than the
  // blended ratio, which is mathematically fine but conversationally
  // misleading when affiliates drive a big chunk of revenue.
  const summarySentence = lang(
    `השבוע הושקעו ₪${Math.round(recon.meta.spend).toLocaleString("he-IL")} בMeta עם ${report.totals.purchases} רכישות מיוחסות לMeta וROAS ${metaRoas != null ? metaRoas.toFixed(2) + "x" : "n/a"}. סה״כ Shopify: ₪${Math.round(recon.shopify.netRevenue).toLocaleString("he-IL")} ב${recon.shopify.orders} הזמנות (כולל אורגני ואפיליאייטס). ${bestCampaign ? `הקמפיין החזק היה "${bestCampaign.name}".` : ""}${mainAction ? " פעולה מומלצת: " + mainAction : ""}`,
    `This week we spent ₪${Math.round(recon.meta.spend).toLocaleString()} on Meta with ${report.totals.purchases} Meta-attributed purchases and ROAS ${metaRoas != null ? metaRoas.toFixed(2) + "x" : "n/a"}. Total Shopify: ₪${Math.round(recon.shopify.netRevenue).toLocaleString()} across ${recon.shopify.orders} orders (including organic + affiliates). ${bestCampaign ? `Top campaign: "${bestCampaign.name}".` : ""}${mainAction ? " Recommended: " + mainAction : ""}`
  );

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 1", "PAGE 1")}</p>
      <h2 className="pwr-exec-page-title">{lang("השורה התחתונה", "Executive summary")}</h2>
      <p className="pwr-exec-page-sub">{lang("התמונה הכוללת של השבוע — Shopify כמקור אמת להכנסות, Meta כמקור אמת להוצאות.", "The big picture — Shopify as source of truth for revenue, Meta for spend.")}</p>

      {/* Primary row — the four Meta numbers a founder writes in their own
          summary: what they spent, what Meta says they earned, the ROAS on
          that, and how many purchases Meta attributed. */}
      <div className="pwr-bottom-line">
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("הוצאה Meta", "Meta spend")}<SourceTag source="M" /></p>
          <p className="pwr-kpi-value">₪{Math.round(recon.meta.spend).toLocaleString("en-US")}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("הכנסות Meta", "Meta revenue")}<SourceTag source="M" /></p>
          <p className="pwr-kpi-value">₪{Math.round(metaAttributedRevenue).toLocaleString("en-US")}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("ROAS לפי Meta", "Meta ROAS")}<SourceTag source="M" /></p>
          <p className="pwr-kpi-value">{metaRoas != null ? `${metaRoas.toFixed(2)}x` : "—"}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("רכישות Meta", "Meta purchases")}<SourceTag source="M" /></p>
          <p className="pwr-kpi-value">{report.totals.purchases}</p>
        </div>
      </div>
      {/* Supporting row — total Shopify picture (includes organic +
          affiliates), plus the blended ratio labelled honestly so the
          founder sees WHY it's larger than Meta ROAS. */}
      <div className="pwr-bottom-line" style={{ marginTop: 6 }}>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("סה״כ Shopify", "Total Shopify")}<SourceTag source="S" /></p>
          <p className="pwr-kpi-value">₪{Math.round(recon.shopify.netRevenue).toLocaleString("en-US")}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("סה״כ הזמנות", "Total orders")}<SourceTag source="S" /></p>
          <p className="pwr-kpi-value">{recon.shopify.orders}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("ROAS משוקלל (כל המקורות)", "Blended ROAS (all sources)")}<SourceTag source="Blended" /></p>
          <p className="pwr-kpi-value">{blendedRoas != null ? `${blendedRoas.toFixed(2)}x` : "—"}</p>
        </div>
        <div className="pwr-kpi">
          <p className="pwr-kpi-label">{lang("AOV", "AOV")}<SourceTag source="Calc" /></p>
          <p className="pwr-kpi-value">{aov > 0 ? `₪${aov.toFixed(0)}` : "—"}</p>
        </div>
      </div>
      {(() => {
        const identified = recon.shopify.newCustomers + recon.shopify.returningCustomers;
        const orders = recon.shopify.orders;
        const guests = recon.shopify.guestOrders;
        // Reconcile customers ↔ orders: identified + guest + repeat = orders.
        // We surface this explicitly so the founder doesn't have to wonder
        // why 89+61=150 doesn't equal the 155-order top number.
        const repeatOrders = Math.max(0, orders - identified - guests);
        if (orders === 0 || (guests === 0 && repeatOrders === 0)) return null;
        const parts: string[] = [];
        parts.push(
          lang(`${identified} לקוחות מזוהים`, `${identified} identified customers`)
        );
        if (guests > 0) parts.push(lang(`${guests} הזמנות אורח`, `${guests} guest orders`));
        if (repeatOrders > 0)
          parts.push(
            lang(
              `${repeatOrders} הזמנות חוזרות (אותו לקוח, יותר מפעם אחת)`,
              `${repeatOrders} repeat orders (same customer, multiple purchases)`
            )
          );
        parts.push(lang(`סה״כ ${orders} הזמנות`, `= ${orders} total orders`));
        return (
          <p style={{ margin: "4px 4px 0", fontSize: 10, color: "#64748b", textAlign: isHe ? "right" : "left" }}>
            {parts.join(" · ")}
          </p>
        );
      })()}

      <div className="pwr-highlight-grid">
        <div className="pwr-highlight">
          <p className="pwr-highlight-label">{lang("קמפיין מוביל", "Top campaign")}<SourceTag source="M" /></p>
          <p className="pwr-highlight-value">{bestCampaign?.name ?? "—"}</p>
          {bestCampaign ? (
            <p className="pwr-highlight-detail">
              ₪{Math.round(bestCampaign.spend).toLocaleString("en-US")} · {bestCampaign.purchases} {lang("רכישות", "purchases")} · ROAS {bestCampaign.roas != null ? bestCampaign.roas.toFixed(2) + "x" : "—"}
            </p>
          ) : null}
        </div>
        <div className="pwr-highlight">
          <p className="pwr-highlight-label">{lang("מודעות מובילות", "Top creatives")}<SourceTag source="M" /></p>
          {bestAds.byPurchases ? (
            <>
              <p className="pwr-highlight-value" style={{ fontSize: 12 }}>
                {lang("ברכישות", "By purchases")}: {bestAds.byPurchases.name}
              </p>
              <p className="pwr-highlight-detail">
                {bestAds.byPurchases.purchases} {lang("רכישות", "purchases")} · ROAS {bestAds.byPurchases.roas != null ? bestAds.byPurchases.roas.toFixed(2) + "x" : "—"} · ₪{Math.round(bestAds.byPurchases.spend).toLocaleString("en-US")}
              </p>
            </>
          ) : null}
          {bestAds.byRoas ? (
            <>
              <p className="pwr-highlight-value" style={{ fontSize: 12, marginTop: bestAds.byPurchases ? 6 : 0 }}>
                {lang("בROAS", "By ROAS")}: {bestAds.byRoas.name}
              </p>
              <p className="pwr-highlight-detail">
                ROAS {bestAds.byRoas.roas!.toFixed(2)}x · {bestAds.byRoas.purchases} {lang("רכישות", "purchases")} · ₪{Math.round(bestAds.byRoas.spend).toLocaleString("en-US")}
              </p>
            </>
          ) : null}
          {!bestAds.byPurchases && !bestAds.byRoas ? (
            <p className="pwr-highlight-value">—</p>
          ) : null}
        </div>
        <div className="pwr-highlight">
          <p className="pwr-highlight-label">
            {bestInfluencer?.mode === "engagement"
              ? lang("משפיענית מובילה (מעורבות)", "Top influencer (engagement)")
              : lang("משפיענית מובילה (מכירות)", "Top influencer (sales)")}
            <SourceTag source={bestInfluencer?.mode === "engagement" ? "Calc" : "S"} />
          </p>
          <p className="pwr-highlight-value">{bestInfluencer?.name ?? lang("אין נתונים", "no data")}</p>
          {bestInfluencer ? (
            <>
              <p className="pwr-highlight-detail">{bestInfluencer.primaryLine}</p>
              {bestInfluencer.secondaryLine ? (
                <p className="pwr-highlight-detail" style={{ marginTop: 1, fontSize: 10, fontStyle: "italic" }}>
                  {bestInfluencer.mode === "engagement"
                    ? lang("מבוסס מעורבות, ללא שיוך מכירות", bestInfluencer.secondaryLine)
                    : bestInfluencer.secondaryLine}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="pwr-highlight">
          <p className="pwr-highlight-label">{lang("סיכון מרכזי", "Main risk")}</p>
          <p className="pwr-highlight-detail" style={{ marginTop: 0 }}>{mainRisk}</p>
        </div>
      </div>

      <div className="pwr-exec-summary">
        <p>
          <ConfBadge level={conf} isHe={isHe} />{" "}
          {summarySentence}
        </p>
      </div>
    </section>
  );
}

function ExecutiveGrowthInsightsPage(props: ExecPageProps & { igInsights: InstagramInsights | null }) {
  const { report, metaInsights, igInsights, isHe } = props;
  const lang = (he: string, en: string) => (isHe ? he : en);
  const topBrand = [...report.brands].sort((a, b) => b.kpis.spend - a.kpis.spend)[0];
  const metaIns = topBrand ? metaInsights.get(topBrand.name) ?? null : null;

  // Worst campaign = real spend but weakest ROAS — that's the next-action target.
  let worstCampaign: { name: string; spend: number; roas: number | null } | null = null;
  for (const b of report.brands) {
    for (const c of b.campaigns) {
      if (c.spend < 200) continue;
      if (!worstCampaign || (c.purchaseRoas ?? 99) < (worstCampaign.roas ?? 99)) {
        worstCampaign = { name: c.campaignName, spend: c.spend, roas: c.purchaseRoas };
      }
    }
  }

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 2", "PAGE 2")}</p>
      <h2 className="pwr-exec-page-title">{lang("דוח מנהלים — שורה תחתונה והמלצות תקציב", "Executive growth insights")}</h2>
      <p className="pwr-exec-page-sub">{lang("ארבעת הסעיפים שמנהל ימלא בהם תוך 60 שניות.", "The four sections a founder reads in 60 seconds.")}</p>

      <div className="pwr-block-title">{lang("מה עבד הכי טוב השבוע", "What worked best")}</div>
      <div className="pwr-insights">
        {metaIns ? (
          <>
            <p className="pwr-insights-hook"><BoldedText text={metaIns.hookLine} /></p>
            {metaIns.observations.length > 0 ? (
              <>
                <p className="pwr-insights-label">{lang("מה קרה", "What happened")}</p>
                <ul className="pwr-insights-list">
                  {metaIns.observations.slice(0, 3).map((o, i) => (
                    <li key={i}><BoldedText text={o} /></li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{lang("אין תובנות זמינות.", "No insights available.")}</p>
        )}
      </div>

      <div className="pwr-block-title">{lang("מה דורש שיפור", "What needs work")}</div>
      <div className="pwr-insights">
        {worstCampaign ? (
          <p className="pwr-insights-hook">
            {lang(
              `הקמפיין "${worstCampaign.name}" צרך ₪${Math.round(worstCampaign.spend).toLocaleString("he-IL")} עם ROAS ${worstCampaign.roas != null ? worstCampaign.roas.toFixed(2) + "x" : "—"} — דורש בחינה.`,
              `Campaign "${worstCampaign.name}" spent ₪${Math.round(worstCampaign.spend).toLocaleString()} at ROAS ${worstCampaign.roas != null ? worstCampaign.roas.toFixed(2) + "x" : "—"} — needs review.`
            )}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            {lang("לא זוהה קמפיין עם ביצועים חלשים מובהקים.", "No campaign stood out as clearly weak.")}
          </p>
        )}
        {igInsights && igInsights.observations.length > 0 ? (
          <>
            <p className="pwr-insights-label">{lang("מצד המשפיענים", "On the influencer side")}</p>
            <ul className="pwr-insights-list">
              {igInsights.observations.slice(0, 2).map((o, i) => (
                <li key={i}><BoldedText text={o} /></li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="pwr-block-title">{lang("מה עושים בשבוע הבא", "What to do next week")}</div>
      <div className="pwr-insights">
        {metaIns && metaIns.actions.length > 0 ? (
          <ul className="pwr-insights-list">
            {metaIns.actions.map((a, i) => (
              <li key={i}><BoldedText text={a} /></li>
            ))}
          </ul>
        ) : null}
        {igInsights && igInsights.actions.length > 0 ? (
          <>
            <p className="pwr-insights-label">{lang("Instagram", "Instagram")}</p>
            <ul className="pwr-insights-list">
              {igInsights.actions.slice(0, 2).map((a, i) => (
                <li key={i}><BoldedText text={a} /></li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}

function DataReconciliationPage({ recon, isHe }: { recon: ReconciliationReport; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 3", "PAGE 3")}</p>
      <h2 className="pwr-exec-page-title">{lang("השוואת מקורות נתונים", "Data reconciliation")}</h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "השוואה בין Meta לShopify לתקופה — אם המספרים סוטים זה מזה, הפער מוצג כאזהרה ולא מוסתר.",
          "Side-by-side Meta vs Shopify for the period. Gaps are surfaced as warnings, never hidden."
        )}
      </p>

      <div style={{ marginBottom: 12 }}>
        {recon.validation.warnings.length === 0 ? (
          <div className="pwr-recon-warning pwr-recon-warning-info">
            {lang("כל בדיקות התקינות עברו בהצלחה.", "All validation checks passed.")}
          </div>
        ) : (
          recon.validation.warnings.map((w, i) => (
            <div key={i} className={`pwr-recon-warning pwr-recon-warning-${w.severity}`}>
              {isHe ? w.messageHe : w.messageEn}
            </div>
          ))
        )}
      </div>

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("מקור", "Source")}</th>
            <th>{lang("הוצאה", "Spend")}</th>
            <th>{lang("הכנסות", "Revenue")}</th>
            <th>{lang("רכישות / הזמנות", "Purchases / Orders")}</th>
            <th>ROAS</th>
            <th>{lang("הערות", "Notes")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <SourceTag source="M" /> Meta Ads
            </td>
            <td>{fmt(recon.meta.spend)}</td>
            <td>{lang("לא זמין", "n/a")}</td>
            <td>{recon.meta.attributedPurchases}</td>
            <td>{lang("Meta-attributed", "Meta-attributed")}</td>
            <td>{recon.meta.daysWithData}/{recon.meta.expectedDays} {lang("ימים מסונכרנים", "days synced")}</td>
          </tr>
          <tr>
            <td>
              <SourceTag source="S" /> Shopify
            </td>
            <td>—</td>
            <td>{fmt(recon.shopify.netRevenue)}</td>
            <td>{recon.shopify.orders}</td>
            <td>—</td>
            <td>
              {(() => {
                const identified = recon.shopify.newCustomers + recon.shopify.returningCustomers;
                const repeats = Math.max(0, recon.shopify.orders - identified - recon.shopify.guestOrders);
                const segments: string[] = [];
                segments.push(
                  lang(
                    `${recon.shopify.newCustomers} חדשים · ${recon.shopify.returningCustomers} חוזרים`,
                    `${recon.shopify.newCustomers} new · ${recon.shopify.returningCustomers} returning`
                  )
                );
                if (recon.shopify.guestOrders > 0)
                  segments.push(lang(`${recon.shopify.guestOrders} אורחים`, `${recon.shopify.guestOrders} guest`));
                if (repeats > 0)
                  segments.push(lang(`${repeats} הזמנות חוזרות`, `${repeats} repeat orders`));
                return segments.join(" · ");
              })()}
            </td>
          </tr>
          <tr>
            <td>
              <SourceTag source="Blended" /> {lang("משוקלל", "Blended")}
            </td>
            <td>{fmt(recon.meta.spend)}</td>
            <td>{fmt(recon.shopify.netRevenue)}</td>
            <td>
              {recon.validation.purchaseDelta.diff > 0
                ? lang(
                    `פער ${recon.validation.purchaseDelta.diff} לטובת Meta`,
                    `+${recon.validation.purchaseDelta.diff} Meta`
                  )
                : recon.validation.purchaseDelta.diff < 0
                  ? lang(
                      `פער ${Math.abs(recon.validation.purchaseDelta.diff)} לטובת Shopify`,
                      `+${Math.abs(recon.validation.purchaseDelta.diff)} Shopify`
                    )
                  : lang("תואם", "match")}
            </td>
            <td>{recon.blended.roas != null ? `${recon.blended.roas.toFixed(2)}x` : "—"}</td>
            <td>{recon.blended.label}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function ChannelPerformancePage({ channels, isHe }: { channels: ChannelPerformanceReport; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
  const qualityLabel = (q: "high" | "medium" | "low") =>
    q === "high"
      ? lang("גבוהה", "high")
      : q === "medium"
        ? lang("בינונית", "medium")
        : lang("נמוכה", "low");
  const channelDisplay = (c: string) => {
    if (!isHe) return c;
    switch (c) {
      case "Meta Ads":
        return "Meta Ads";
      case "Instagram (organic)":
        return "Instagram אורגני";
      case "Email":
        return "אימייל";
      case "Influencers":
        return "משפיענים";
      case "Google (organic)":
        return "Google אורגני";
      case "Direct":
        return "ישיר";
      case "Other / Unknown":
        return "אחר / לא ידוע";
      default:
        return c;
    }
  };

  const coverage = Math.round(channels.attributionCoverage * 100);
  const top = channels.rows[0];

  // Quick written conclusion — names winners explicitly.
  const winnerByRevenue = [...channels.rows].sort((a, b) => b.revenue - a.revenue)[0];
  const winnerByOrders = [...channels.rows].sort((a, b) => b.orders - a.orders)[0];

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 5", "PAGE 5")}</p>
      <h2 className="pwr-exec-page-title">{lang("ביצועי ערוצים", "Channel performance")}</h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "מי הביא תנועה, לקוחות והזמנות השבוע. הנתונים מבוססים על Shopify בלבד (UTM + referrer + קופונים).",
          "Who drove traffic, customers, and orders this week. Shopify-only data (UTM + referrer + coupons)."
        )}
      </p>

      {coverage < 50 ? (
        <div className="pwr-recon-warning pwr-recon-warning-warning">
          {lang(
            `כיסוי שיוך נמוך — רק ${coverage}% מההזמנות נושאות UTM/Referrer ניתן לזהוי. שאר ${channels.unknownOrders} ההזמנות נכנסו לקטגוריית "אחר".`,
            `Attribution coverage is only ${coverage}% — the other ${channels.unknownOrders} orders fell into "Other".`
          )}
        </div>
      ) : null}

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("ערוץ", "Channel")}</th>
            <th>{lang("הזמנות", "Orders")}</th>
            <th>{lang("הכנסות", "Revenue")}</th>
            <th>AOV</th>
            <th>{lang("חדשים", "New")}</th>
            <th>{lang("חוזרים", "Returning")}</th>
            <th>{lang("איכות נתונים", "Data quality")}</th>
          </tr>
        </thead>
        <tbody>
          {channels.rows.map((r) => (
            <tr key={r.channel}>
              <td>{channelDisplay(r.displayName)}</td>
              <td>{r.orders}</td>
              <td>{fmt(r.revenue)}</td>
              <td>{r.avgOrderValue > 0 ? `₪${r.avgOrderValue.toFixed(0)}` : "—"}</td>
              <td>{r.newCustomers}</td>
              <td>{r.returningCustomers}</td>
              <td>
                <span className={`pwr-conf pwr-conf-${r.dataQuality}`}>{qualityLabel(r.dataQuality)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {winnerByRevenue && winnerByOrders ? (
        <div className="pwr-exec-summary" style={{ marginTop: 12 }}>
          <p>
            {lang(
              `${channelDisplay(winnerByRevenue.displayName)} הוביל בהכנסות (${fmt(winnerByRevenue.revenue)}). ${channelDisplay(winnerByOrders.displayName)} הוביל בנפח הזמנות (${winnerByOrders.orders} הזמנות). כיסוי שיוך כולל: ${coverage}%.`,
              `${channelDisplay(winnerByRevenue.displayName)} led on revenue (${fmt(winnerByRevenue.revenue)}). ${channelDisplay(winnerByOrders.displayName)} led on order volume (${winnerByOrders.orders} orders). Attribution coverage: ${coverage}%.`
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function CampaignPerformancePage({
  attribution,
  report,
  isHe
}: {
  attribution: CampaignShopifyAttributionReport;
  report: NonNullable<Awaited<ReturnType<typeof buildMetaAdsWeeklyReport>>>;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;

  // For each campaign in the attribution report, look up Meta-side metrics
  // from the main report's brand.campaigns so we can show spend / CTR / CPC
  // alongside the Shopify attribution numbers.
  const metaByCampaign = new Map<string, { spend: number; clicks: number; ctr: number; cpc: number; purchaseRoas: number | null }>();
  for (const brand of report.brands) {
    for (const c of brand.campaigns) {
      metaByCampaign.set(c.campaignId, {
        spend: c.spend,
        clicks: c.clicks,
        ctr: c.ctr,
        cpc: c.cpc,
        purchaseRoas: c.purchaseRoas
      });
    }
  }

  // Generate one recommendation per campaign.
  const recs = new Map<string, Recommendation>();
  for (const c of attribution.campaigns) {
    const meta = metaByCampaign.get(c.campaignId);
    if (!meta) continue;
    // Trust Shopify when we have decent match coverage AND Shopify orders exist
    // for this campaign. Otherwise fall back to Meta.
    const shopifyTrustworthy = c.shopifyOrders > 0 && c.matchConfidence !== "low";
    const shopifyRoas = meta.spend > 0 && c.shopifyOrders > 0 ? c.shopifyRevenue / meta.spend : null;
    const primaryRoas = shopifyTrustworthy ? shopifyRoas : meta.purchaseRoas;
    const primarySource: "shopify" | "meta" = shopifyTrustworthy ? "shopify" : "meta";
    const primarySalesCount = shopifyTrustworthy ? c.shopifyOrders : c.metaAttributedPurchases;
    recs.set(
      c.campaignId,
      buildRecommendation({
        campaignName: c.campaignName,
        spend: meta.spend,
        clicks: meta.clicks,
        ctr: meta.ctr,
        primaryRoas,
        primaryRoasSource: primarySource,
        primarySalesCount,
        metaAttributedPurchases: c.metaAttributedPurchases,
        shopifyOrders: c.shopifyOrders,
        weekOverWeekSpendChangePct: null,
        weekOverWeekPurchasesChangePct: null,
        currentDailyBudget: null, // Meta doesn't expose this on insight rows; show as "—"
        targets: DEFAULT_TARGETS
      })
    );
  }

  const lowCoverage = attribution.shopifyMatchCoverage < 0.3;

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 6", "PAGE 6")}</p>
      <h2 className="pwr-exec-page-title">{lang("ביצועי קמפיינים — Meta מול Shopify", "Campaign performance — Meta vs Shopify")}</h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "Meta הוא מקור האמת להוצאה; Shopify הוא מקור האמת להכנסות. ההמלצה נשענת על Shopify כשאפשר.",
          "Meta is source of truth for spend; Shopify for revenue. Recommendations lean on Shopify when match coverage allows."
        )}
      </p>

      {lowCoverage ? (
        <div className="pwr-recon-warning pwr-recon-warning-warning">
          {lang(
            `כיסוי שיוך נמוך (${Math.round(attribution.shopifyMatchCoverage * 100)}% מההזמנות התאימו לקמפיין Meta) — ההמלצות עשויות להישען על נתוני Meta בלבד. שפרו תיוג UTM למודעות לדיוק טוב יותר.`,
            `Low match coverage (${Math.round(attribution.shopifyMatchCoverage * 100)}% of orders tied to a Meta campaign) — recommendations may rely on Meta numbers. Improve UTM tagging for better accuracy.`
          )}
        </div>
      ) : null}

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("קמפיין", "Campaign")}</th>
            <th>{lang("הוצאה", "Spend")}<SourceTag source="M" /></th>
            <th>{lang("רכישות (Meta)", "Purchases (Meta)")}<SourceTag source="M" /></th>
            <th>{lang("הזמנות (Shopify)", "Orders (Shopify)")}<SourceTag source="S" /></th>
            <th>{lang("הכנסות (Shopify)", "Revenue (Shopify)")}<SourceTag source="S" /></th>
            <th>ROAS<SourceTag source="Blended" /></th>
            <th>{lang("המלצה", "Recommendation")}</th>
          </tr>
        </thead>
        <tbody>
          {attribution.campaigns.map((c) => {
            const meta = metaByCampaign.get(c.campaignId);
            const rec = recs.get(c.campaignId);
            const shopifyRoas = meta && meta.spend > 0 && c.shopifyOrders > 0 ? c.shopifyRevenue / meta.spend : null;
            return (
              <tr key={c.campaignId}>
                <td style={{ maxWidth: 180, wordBreak: "break-word" }}>{c.campaignName}</td>
                <td>{meta ? fmt(meta.spend) : "—"}</td>
                <td>{c.metaAttributedPurchases}</td>
                <td>{c.shopifyOrders}</td>
                <td>{fmt(c.shopifyRevenue)}</td>
                <td>{shopifyRoas != null ? `${shopifyRoas.toFixed(2)}x` : "—"}</td>
                <td style={{ maxWidth: 200 }}>
                  {rec ? (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        {isHe ? rec.actionLabelHe : rec.actionLabelEn}
                        {" "}
                        <span className={`pwr-conf pwr-conf-${rec.confidence}`}>
                          {rec.confidence === "high" ? lang("גבוה", "high") : rec.confidence === "medium" ? lang("בינוני", "med") : lang("נמוך", "low")}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, lineHeight: 1.4, color: "#475569" }}>
                        {isHe ? rec.reasonHe : rec.reasonEn}
                      </div>
                    </>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// Group ads by product using their name prefix. The account uses a
// consistent `<Product>_<Type>_<...>_<date>` convention:
//   Intense50_Perfume_Vid3_070526     → Intense 50
//   SecondSkin_PazsPics_VID1_160626   → Second Skin
//   SECONDSKIN_Perfume_Vid5_110626    → Second Skin (case-insensitive)
//   Emerge_Men_Perfume_Pic1_100626    → Emerge Men
//   150FF_Evergreen_7_5_26            → 15% Off promo
//   Influencer_PazsPics_VID1_230426   → Influencer collab
//   static_omer / Static_Omer_2       → Signups
//
// Founders think in products ("Intense 50 did 5x on ₪10k"), not in
// individual creatives. Grouping matches how the operator writes their
// weekly summary by hand — so the report finally reads like theirs.
function groupAdByProduct(adName: string | null | undefined): { key: string; label: string } {
  const name = (adName ?? "").trim();
  const upper = name.toUpperCase();
  if (!name) return { key: "unknown", label: "אחר" };
  if (/^INTENSE\s*50/.test(upper)) return { key: "intense50", label: "Intense 50" };
  if (/^(SECOND[_\s]?SKIN|SECONDSKIN)/.test(upper)) return { key: "secondskin", label: "Second Skin" };
  if (/^EMERGE/.test(upper)) return { key: "emerge", label: "Emerge Men" };
  if (/^(150?FF|15OFF)/.test(upper)) return { key: "150ff", label: "15% Off Promo" };
  if (/^INFLUENCER/.test(upper)) return { key: "influencer", label: "Influencer collab" };
  if (/(STATIC_OMER|SIGNUP)/.test(upper)) return { key: "signups", label: "Signups" };
  // Fallback — use the first token before _ or -.
  const first = name.split(/[_\-\s]/)[0];
  return { key: first.toLowerCase(), label: first };
}

interface ProductRow {
  key: string;
  label: string;
  spend: number;
  purchases: number;
  attributedRevenue: number;
  roas: number | null;
  clicks: number;
  adCount: number;
}

function aggregateAdsByProduct(
  report: NonNullable<Awaited<ReturnType<typeof buildMetaAdsWeeklyReport>>>
): ProductRow[] {
  const buckets = new Map<string, ProductRow>();
  for (const brand of report.brands) {
    for (const ad of brand.ads) {
      const { key, label } = groupAdByProduct(ad.adName);
      const attributedRevenue = (ad.purchaseRoas ?? 0) * ad.spend;
      const existing = buckets.get(key) ?? {
        key,
        label,
        spend: 0,
        purchases: 0,
        attributedRevenue: 0,
        roas: null,
        clicks: 0,
        adCount: 0
      };
      existing.spend += ad.spend;
      existing.purchases += ad.purchases;
      existing.attributedRevenue += attributedRevenue;
      existing.clicks += ad.clicks;
      existing.adCount += 1;
      buckets.set(key, existing);
    }
  }
  const rows = [...buckets.values()];
  for (const r of rows) {
    r.roas = r.spend > 0 ? r.attributedRevenue / r.spend : null;
  }
  return rows.sort((a, b) => b.spend - a.spend);
}

function ProductPerformancePage({
  report,
  isHe
}: {
  report: NonNullable<Awaited<ReturnType<typeof buildMetaAdsWeeklyReport>>>;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const rows = aggregateAdsByProduct(report);
  if (rows.length === 0) return null;

  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

  // A verdict tag on each row so the founder sees at a glance what to
  // do — kept short, no LLM. Mirrors the manual summary language they
  // already use ("להגדיל", "לבחון", "לצמצם").
  const verdict = (r: ProductRow) => {
    if (r.spend < 200) return { label: lang("מעט נתונים", "Low data"), tone: "neutral" as const };
    if (r.roas != null && r.roas >= 5) return { label: lang("להגדיל", "Scale"), tone: "good" as const };
    if (r.roas != null && r.roas >= 3) return { label: lang("להמשיך", "Hold"), tone: "neutral" as const };
    if (r.roas != null && r.roas < 2) return { label: lang("לבחון / לצמצם", "Review / cut"), tone: "bad" as const };
    if (r.purchases === 0) return { label: lang("ללא רכישות", "No purchases"), tone: "bad" as const };
    return { label: lang("לבחון", "Review"), tone: "neutral" as const };
  };

  const toneColor = (tone: "good" | "neutral" | "bad") =>
    tone === "good" ? "#059669" : tone === "bad" ? "#dc2626" : "#64748b";

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 6ב", "PAGE 6b")}</p>
      <h2 className="pwr-exec-page-title">
        {lang("ביצועי מוצרים בMeta", "Product performance on Meta")}
      </h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "המודעות מקובצות לפי המוצר — תמונת המחיר-לרכישה שבעלת החנות רושמת בסיכום הידני שלה.",
          "Ads grouped by product — the price-per-purchase view a founder writes in their own weekly summary."
        )}
      </p>

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("מוצר / קבוצה", "Product / group")}</th>
            <th style={{ textAlign: "end" }}>{lang("הוצאה", "Spend")}<SourceTag source="M" /></th>
            <th style={{ textAlign: "end" }}>{lang("רכישות", "Purchases")}<SourceTag source="M" /></th>
            <th style={{ textAlign: "end" }}>{lang("הכנסות (Meta)", "Revenue (Meta)")}<SourceTag source="M" /></th>
            <th style={{ textAlign: "end" }}>ROAS</th>
            <th style={{ textAlign: "end" }}>{lang("% תקציב", "% budget")}</th>
            <th style={{ textAlign: "end" }}>{lang("מודעות", "Ads")}</th>
            <th>{lang("המלצה", "Verdict")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = verdict(r);
            const share = totalSpend > 0 ? (r.spend / totalSpend) * 100 : 0;
            return (
              <tr key={r.key}>
                <td style={{ fontWeight: 600 }}>{r.label}</td>
                <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>{fmt(r.spend)}</td>
                <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>{r.purchases}</td>
                <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>{fmt(r.attributedRevenue)}</td>
                <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>
                  {r.roas != null ? `${r.roas.toFixed(2)}x` : "—"}
                </td>
                <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums", color: "#64748b" }}>
                  {share.toFixed(0)}%
                </td>
                <td style={{ textAlign: "end", color: "#64748b" }}>{r.adCount}</td>
                <td style={{ color: toneColor(v.tone), fontWeight: 600 }}>{v.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ fontSize: 10, color: "#64748b", marginTop: 8 }}>
        {lang(
          "הכנסות Meta מחושבות כהוצאה × ROAS ברמת מודעה — לא כוללות מכירות אורגניות ואפיליאייטס.",
          "Meta revenue = spend × ad-level ROAS — organic and affiliate sales are NOT included in this view."
        )}
      </p>
    </section>
  );
}

// Open alert awaiting a decision — the print-side projection of the
// Command Center queue (subset of the Alert row the report needs).
type OpenActionItem = {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string | null;
  recommendedAction: string | null;
  periodLabel: string | null;
};

function ActionQueuePage({ items, isHe }: { items: OpenActionItem[]; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const RANK: Record<OpenActionItem["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  };
  const sorted = [...items].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const SEVERITY_LABEL: Record<OpenActionItem["severity"], { he: string; en: string; color: string; bg: string; border: string }> = {
    critical: { he: "קריטי", en: "CRITICAL", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
    high: { he: "גבוה", en: "HIGH", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
    medium: { he: "בינוני", en: "MEDIUM", color: "#a16207", bg: "#fefce8", border: "#fde68a" },
    low: { he: "נמוך", en: "LOW", color: "#475569", bg: "#f8fafc", border: "#e2e8f0" }
  };

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag" style={{ color: "#475569" }}>
        {lang("ממתין להחלטה", "ACTION QUEUE")}
      </p>
      <h2 className="pwr-exec-page-title">
        {lang("פעולות שמחכות לכם", "Actions awaiting your decision")}
      </h2>
      <p className="pwr-exec-page-sub">
        {lang(
          `${sorted.length} התראות פתוחות עם פעולה מומלצת. כל החלטה (טופל / להתעלם) נמדדת אחרי 3–7 ימים ומופיעה בדוח הבא תחת "מה קרה אחרי הפעולה שלכם".`,
          `${sorted.length} open alerts with a recommended action. Every decision (resolve / ignore) is measured 3–7 days later and shows up in next week's report under "What happened after you acted".`
        )}
      </p>

      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {sorted.map((item, idx) => {
          const sev = SEVERITY_LABEL[item.severity];
          return (
            <li
              key={item.id}
              style={{
                background: sev.bg,
                border: `1px solid ${sev.border}`,
                borderRadius: 4,
                padding: "8px 10px",
                marginTop: idx === 0 ? 0 : 6,
                fontSize: 11.5,
                lineHeight: 1.55
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    color: sev.color,
                    fontWeight: 700,
                    fontSize: 9.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    flexShrink: 0
                  }}
                >
                  {isHe ? sev.he : sev.en}
                </span>
                <p style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>{item.title}</p>
                {item.periodLabel ? (
                  <span style={{ color: "#94a3b8", fontSize: 10, flexShrink: 0 }}>{item.periodLabel}</span>
                ) : null}
              </div>
              {item.description ? (
                <p style={{ margin: "3px 0 0 0", color: "#334155" }}>{item.description}</p>
              ) : null}
              {item.recommendedAction ? (
                <p style={{ margin: "3px 0 0 0", color: "#0f172a" }}>
                  <span style={{ fontWeight: 700 }}>{lang("מה לעשות:", "Do this:")}</span>{" "}
                  {item.recommendedAction}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ClosedLoopPage({
  items,
  isHe
}: {
  items: ResolvedAlertWithOutcome[];
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const wins = items.filter((i) => i.outcome.verdict === "win").length;
  const misses = items.filter((i) => i.outcome.verdict === "miss").length;
  const neutral = items.filter((i) => i.outcome.verdict === "neutral").length;

  // Group by type so the page reads "restock actions" / "campaign actions" /
  // "stockout actions" — easier to skim on a CEO report.
  const TYPE_LABEL_HE: Record<string, string> = {
    restock_hero: "מוצרים שחזרו למלאי",
    stockout_imminent: "אזהרות אזילה",
    roas_collapse: "קמפיינים בעייתיים"
  };
  const TYPE_LABEL_EN: Record<string, string> = {
    restock_hero: "Restock heroes",
    stockout_imminent: "Stockout warnings",
    roas_collapse: "Problem campaigns"
  };
  const grouped = new Map<string, ResolvedAlertWithOutcome[]>();
  for (const item of items) {
    const list = grouped.get(item.type) ?? [];
    list.push(item);
    grouped.set(item.type, list);
  }

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag" style={{ color: "#475569" }}>
        {lang("הלולאה נסגרת", "CLOSED LOOP")}
      </p>
      <h2 className="pwr-exec-page-title">
        {lang("מה קרה אחרי הפעולה שלכם", "What happened after you acted")}
      </h2>
      <p className="pwr-exec-page-sub">
        {lang(
          `מעקב על ההמלצות מהשבועות האחרונים. ${wins} עבדו · ${misses} לא · ${neutral} ניטרליות — הכישלונות הם הלמידה היקרה ביותר.`,
          `Tracking recommendations from the last 2 weeks. ${wins} worked · ${misses} didn't · ${neutral} neutral — failures are the most valuable learning.`
        )}
      </p>

      {Array.from(grouped.entries()).map(([type, list]) => (
        <div key={type} style={{ marginBottom: 16 }}>
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#64748b",
              margin: "0 0 6px 0"
            }}
          >
            {isHe ? TYPE_LABEL_HE[type] ?? type : TYPE_LABEL_EN[type] ?? type}
          </h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {list.map((item, idx) => {
              const v = item.outcome.verdict;
              const marker = v === "win" ? "✅" : v === "miss" ? "❌" : "➖";
              const color = v === "win" ? "#047857" : v === "miss" ? "#b91c1c" : "#64748b";
              const tone =
                v === "win"
                  ? "#ecfdf5"
                  : v === "miss"
                    ? "#fef2f2"
                    : "#f8fafc";
              const border =
                v === "win"
                  ? "#a7f3d0"
                  : v === "miss"
                    ? "#fecaca"
                    : "#e2e8f0";
              return (
                <li
                  key={item.id}
                  style={{
                    background: tone,
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    padding: "8px 10px",
                    marginTop: idx === 0 ? 0 : 4,
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    display: "flex",
                    gap: 8
                  }}
                >
                  <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{marker}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, color: "#0f172a" }}>
                      {isHe ? item.outcome.summary.he : item.outcome.summary.en}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: 9,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em"
                      }}
                    >
                      {lang("נסגר", "Closed")}:{" "}
                      {new Date(item.resolvedAt).toLocaleDateString(isHe ? "he-IL" : "en-US", {
                        month: "short",
                        day: "numeric"
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

// Live activity block — what RivalSweeper already sees on each competitor
// (Meta ads volume + themes, press, homepage pushes). Renders in BOTH the
// collapsed (no promo signals yet) and full competitor states.
function CompetitorActivityBlock({
  activity,
  isHe
}: {
  activity: CompetitorActivityEntry[] | null;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const withData = (activity ?? []).filter(
    (a) => (a.adsActive ?? 0) > 0 || a.news.length > 0 || a.homepageLinks.length > 0
  );
  if (withData.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <p className="pwr-insights-label" style={{ marginBottom: 6 }}>
        {lang("פעילות שנקלטה במעקב החי", "Live tracked activity")}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {withData.map((a) => {
          const bits: string[] = [];
          if ((a.adsActive ?? 0) > 0) {
            bits.push(
              lang(
                `${(a.adsActive as number).toLocaleString("he-IL")} מודעות מטא פעילות${a.adHeadlines.length ? ` (בין הכותרות: ${a.adHeadlines.slice(0, 2).join(" · ")})` : ""}`,
                `${(a.adsActive as number).toLocaleString()} active Meta ads${a.adHeadlines.length ? ` (themes: ${a.adHeadlines.slice(0, 2).join(" · ")})` : ""}`
              )
            );
          }
          if (a.homepageLinks.length > 0) {
            bits.push(
              lang(`בראש דף הבית: ${a.homepageLinks.slice(0, 3).join(", ")}`, `Homepage pushes: ${a.homepageLinks.slice(0, 3).join(", ")}`)
            );
          }
          for (const n of a.news.slice(0, 2)) {
            bits.push(lang(`בתקשורת: "${n.title}" (${n.source})`, `Press: "${n.title}" (${n.source})`));
          }
          return (
            <li
              key={a.domain}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                padding: "7px 10px",
                marginBottom: 5,
                fontSize: 11,
                lineHeight: 1.55
              }}
            >
              <b>{a.name}</b> — {bits.join(" · ")}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CompetitorsPage({
  data,
  activity,
  isHe
}: {
  data: CompetitorWeekSection;
  activity?: CompetitorActivityEntry[] | null;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const { totals } = data;
  const headline =
    totals.openedPromo > 0
      ? lang(
          `${totals.openedPromo} מתחרים פתחו מבצעים השבוע${totals.maxDiscountPct !== null ? ` — עד ${Math.round(totals.maxDiscountPct)}% הנחה` : ""}.`,
          `${totals.openedPromo} competitor(s) opened promos this week${totals.maxDiscountPct !== null ? ` — up to ${Math.round(totals.maxDiscountPct)}% off` : ""}.`
        )
      : lang(
          `${totals.tracked} מתחרים במעקב — ללא מבצעים חדשים השבוע.`,
          `${totals.tracked} competitor(s) tracked — no new promos this week.`
        );

  const CHANGE_MARKER: Record<string, string> = {
    opened_promo: "🔻",
    deepened_discount: "🔻",
    closed_promo: "🟢",
    reduced_discount: "🟢",
    unchanged: "➖",
    no_data: "•"
  };

  // When NO competitor has any signal yet (fresh monitoring, crawlers still
  // filling), a full page of "אין נתונים השבוע" cards is pure noise — the
  // whole section collapses to one honest line.
  const allNoData = data.competitors.every((entry) => entry.change.kind === "no_data");
  if (allNoData) {
    return (
      <section className="pwr-exec-page" style={{ paddingBottom: 8 }}>
        <p className="pwr-exec-page-tag" style={{ color: "#475569" }}>
          {lang("מבט החוצה", "COMPETITIVE LANDSCAPE")}
        </p>
        <h2 className="pwr-exec-page-title">
          {lang("מה המתחרים עשו השבוע", "What competitors did this week")}
        </h2>
        <p className="pwr-exec-page-sub">
          {lang(
            `${totals.tracked} מתחרים במעקב (${data.competitors.map((c) => c.name).join(", ")}). איסוף הנתונים האוטומטי החל — האיתותים הראשונים יופיעו בדוח הבא.`,
            `${totals.tracked} competitors tracked (${data.competitors.map((c) => c.name).join(", ")}). Automated collection has started — first signals will appear in the next report.`
          )}
        </p>
        {/* Until the crawlers fill, the latest manual intel sweep keeps the
            CEO oriented instead of leaving the section empty. */}
        <p className="pwr-insights-label" style={{ marginTop: 6 }}>
          {lang(`בינתיים, מהסקירה הידנית (${COMPETITOR_INTEL_LATEST.generatedAt}):`, `Meanwhile, from the manual sweep (${COMPETITOR_INTEL_LATEST.generatedAt}):`)}
        </p>
        <ul style={{ margin: "4px 0 0 0", paddingInlineStart: 16, fontSize: 11.5, lineHeight: 1.55, color: "#334155" }}>
          {COMPETITOR_INTEL_LATEST.competitors.map((c) => (
            <li key={c.name} style={{ marginBottom: 3 }}>
              <b>{c.name}:</b> {c.move}
            </li>
          ))}
        </ul>
        <CompetitorActivityBlock activity={activity ?? null} isHe={isHe} />
      </section>
    );
  }

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag" style={{ color: "#475569" }}>
        {lang("מבט החוצה", "COMPETITIVE LANDSCAPE")}
      </p>
      <h2 className="pwr-exec-page-title">
        {lang("מה המתחרים עשו השבוע", "What competitors did this week")}
      </h2>
      <p className="pwr-exec-page-sub">{headline}</p>

      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {data.competitors.map((entry, idx) => {
          const kind = entry.change.kind;
          const marker = CHANGE_MARKER[kind] ?? "•";
          const isThreat = kind === "opened_promo" || kind === "deepened_discount";
          const tone = isThreat ? "#fef2f2" : "#f8fafc";
          const border = isThreat ? "#fecaca" : "#e2e8f0";
          return (
            <li
              key={entry.competitorId}
              style={{
                background: tone,
                border: `1px solid ${border}`,
                borderRadius: 4,
                padding: "8px 10px",
                marginTop: idx === 0 ? 0 : 4,
                fontSize: 11.5,
                lineHeight: 1.55,
                display: "flex",
                gap: 8,
                pageBreakInside: "avoid"
              }}
            >
              <span
                style={{
                  color: isThreat ? "#b91c1c" : "#64748b",
                  fontWeight: 700,
                  flexShrink: 0
                }}
              >
                {marker}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: "#0f172a" }}>
                  <strong>{entry.name}</strong>
                  {" — "}
                  {isHe ? entry.change.summary.he : entry.change.summary.en}
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 9,
                    color: "#64748b",
                    letterSpacing: "0.02em"
                  }}
                >
                  <span dir="ltr">{entry.domain}</span>
                  {entry.current.activePromoCount > 0
                    ? ` · ${lang(
                        `${entry.current.activePromoCount} מבצעים פעילים`,
                        `${entry.current.activePromoCount} active promo(s)`
                      )}`
                    : ` · ${lang("ללא מבצע פעיל", "no active promo")}`}
                  {entry.current.freeShippingThreshold !== null
                    ? ` · ${lang(
                        `משלוח חינם מעל ₪${Math.round(entry.current.freeShippingThreshold)}`,
                        `free shipping over ${Math.round(entry.current.freeShippingThreshold)}`
                      )}`
                    : ""}
                </p>
                {entry.current.homepageMessage ? (
                  <p style={{ margin: "3px 0 0", fontSize: 10, color: "#475569", fontStyle: "italic" }}>
                    „{entry.current.homepageMessage}"
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <CompetitorActivityBlock activity={activity ?? null} isHe={isHe} />

      <p style={{ margin: "10px 0 0", fontSize: 9, color: "#94a3b8" }}>
        {lang(
          "מקור: RivalSweeper — נתוני מבצעים ומחירים ציבוריים של המתחרים המוגדרים בהגדרות.",
          "Source: RivalSweeper — public promo/pricing signals for the competitor set defined in Settings."
        )}
      </p>
    </section>
  );
}

function RestockHeroBanner({
  alerts,
  isHe
}: {
  alerts: RestockHeroAlertReport;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
  const flags = alerts.flags.slice(0, 3); // banner stays compact — full detail on the dedicated page
  return (
    <div className="pwr-flag-banner">
      <p className="pwr-flag-banner-title">
        {lang(
          `🚩 ${alerts.flags.length} מוצר${alerts.flags.length === 1 ? "" : "ים"} שחזר${alerts.flags.length === 1 ? "" : "ו"} למלאי — נדרשת פעולה השבוע`,
          `🚩 ${alerts.flags.length} hero${alerts.flags.length === 1 ? "" : "es"} restocked — needs action this week`
        )}
      </p>
      <ul className="pwr-flag-banner-list">
        {flags.map((f) => (
          <li key={f.productId} className="pwr-flag-banner-item">
            <strong>{f.title}</strong>
            {f.sku ? ` (${f.sku})` : ""} ·{" "}
            {lang(
              `הכנסה ב90 הימים שלפני: ${fmt(f.priorRevenue)}`,
              `90-day prior revenue: ${fmt(f.priorRevenue)}`
            )}{" "}
            ·{" "}
            {lang(
              `חסר במלאי ${f.gapDays} ימים`,
              `${f.gapDays}-day OOS gap`
            )}
            {f.currentInventory != null ? (
              <>
                {" · "}
                {lang(
                  `${f.currentInventory} יח׳ במלאי`,
                  `${f.currentInventory} units in stock`
                )}
              </>
            ) : null}
          </li>
        ))}
        {alerts.flags.length > flags.length ? (
          <li className="pwr-flag-banner-item" style={{ color: "#7f1d1d", fontStyle: "italic" }}>
            {lang(
              `+ עוד ${alerts.flags.length - flags.length} (פירוט בעמוד הבא)`,
              `+ ${alerts.flags.length - flags.length} more (see next page)`
            )}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function RestockHeroActionPage({
  alerts,
  isHe
}: {
  alerts: RestockHeroAlertReport;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag" style={{ color: "#dc2626" }}>
        {lang("התראה", "ALERT")}
      </p>
      <h2 className="pwr-exec-page-title">
        {lang("מוצרים שחזרו למלאי — דחפו אותם השבוע", "Hot restocks — push these now")}
      </h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "מוצרים שהיו בין המובילים בהכנסות ב90 הימים האחרונים, יצאו מהמלאי, וחזרו עכשיו. הגיע הזמן להגביר תקציב Meta ולנצל את הביקוש שהצטבר.",
          "Products that were top-revenue performers in the last 90 days, went out of stock, and just came back. Time to scale Meta budget and capture the backlogged demand."
        )}
      </p>

      {alerts.flags.map((f) => (
        <div key={f.productId} className="pwr-flag-card">
          <div className="pwr-flag-card-header">
            <h3 className="pwr-flag-card-title">{f.title}</h3>
            <span className="pwr-flag-card-rank">
              {lang(`דירוג #${f.priorRank}`, `Rank #${f.priorRank}`)}
            </span>
          </div>

          <div className="pwr-flag-card-stats">
            <div className="pwr-flag-card-stat">
              <p className="pwr-flag-card-stat-label">
                {lang("הכנסה בעבר", "Prior revenue")}
              </p>
              <p className="pwr-flag-card-stat-value">{fmt(f.priorRevenue)}</p>
            </div>
            <div className="pwr-flag-card-stat">
              <p className="pwr-flag-card-stat-label">
                {lang("ימי OOS", "OOS days")}
              </p>
              <p className="pwr-flag-card-stat-value">{f.gapDays}</p>
            </div>
            <div className="pwr-flag-card-stat">
              <p className="pwr-flag-card-stat-label">
                {lang("מלאי עכשיו", "In stock now")}
              </p>
              <p className="pwr-flag-card-stat-value">
                {f.currentInventory != null ? f.currentInventory : "—"}
              </p>
            </div>
            <div className="pwr-flag-card-stat">
              <p className="pwr-flag-card-stat-label">
                {lang("מכירות השבוע", "Sales this week")}
              </p>
              <p className="pwr-flag-card-stat-value">
                {f.ordersThisWindow > 0
                  ? `${f.ordersThisWindow} · ${fmt(f.revenueThisWindow)}`
                  : "0"}
              </p>
            </div>
          </div>

          <div className="pwr-flag-card-action">
            <strong>{lang("פעולה מומלצת:", "Suggested action:")}</strong>{" "}
            {isHe ? f.suggestedAction.he : f.suggestedAction.en}
          </div>

          {f.sku ? (
            <p style={{ marginTop: 6, fontSize: 10, color: "#64748b" }}>
              {lang("מק״ט", "SKU")}: {f.sku} ·{" "}
              {lang(
                `יצא מהמלאי ${f.gapStart} → ${f.gapEnd}`,
                `OOS window ${f.gapStart} → ${f.gapEnd}`
              )}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function AffiliatePerformancePage({
  deepDive,
  isHe
}: {
  deepDive: AffiliateDeepDiveReport;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  // Top 10 in the table — anything beyond gets rolled into a footnote.
  const TOP_LIMIT = 10;
  const tableRows = deepDive.affiliates.slice(0, TOP_LIMIT);
  const tailCount = Math.max(0, deepDive.affiliates.length - TOP_LIMIT);
  const tailSales = deepDive.affiliates
    .slice(TOP_LIMIT)
    .reduce((sum, r) => sum + r.sales, 0);

  const sharePct =
    deepDive.totals.affiliateShareOfStoreRevenue != null
      ? Math.round(deepDive.totals.affiliateShareOfStoreRevenue * 100)
      : null;

  const topAff = deepDive.affiliates[0] ?? null;

  return (
    <section className="pwr-exec-page">
      <p className="pwr-exec-page-tag">{lang("עמוד 7", "PAGE 7")}</p>
      <h2 className="pwr-exec-page-title">
        {lang("ביצועי משווקים שותפים", "Affiliate performance")}
      </h2>
      <p className="pwr-exec-page-sub">
        {lang(
          "פירוט מלא לכל משווקת — מכירות, עמלות, סוג מעקב, וחלוקת לקוחות חדשים מול חוזרים.",
          "Detailed per-affiliate view — sales, commission, tracking method, and new vs returning customer mix."
        )}
      </p>

      <div className="pwr-kpi-row" style={{ marginBottom: 10 }}>
        <Tile label={lang("סה״כ מכירות", "Total sales")} value={fmt(deepDive.totals.sales)} source="S" />
        <Tile label={lang("הזמנות", "Orders")} value={String(deepDive.totals.orders)} source="S" />
        <Tile
          // Renamed from "Commission paid" — AffiliateAttribution stores
          // ONLY the accrued amount (commissionAmount). Payout status
          // (unpaid / approved / paid) lives on AffiliateConversion.
          // Showing ₪0 under a "paid" label was misleading; "accrued"
          // is what the number actually represents.
          label={lang("עמלות שנצברו", "Commission accrued")}
          value={fmt(deepDive.totals.commission)}
          source="Calc"
        />
        <Tile
          label={lang("נתח מסך החנות", "Share of store revenue")}
          value={sharePct != null ? `${sharePct}%` : "—"}
          source="Calc"
        />
      </div>
      {deepDive.totals.commission === 0 && deepDive.totals.sales > 0 ? (
        <p className="pwr-recon-warning pwr-recon-warning-info" style={{ marginBottom: 10 }}>
          {lang(
            "עמלות מוצגות כ₪0 מפני שהעמלה למשווקות לא הוגדרה בהגדרות התוכנית. הגדירו אחוז עמלה כדי לראות את הסכומים המחושבים.",
            "Commission shows as ₪0 because no commission rate is configured on the affiliate program. Set a rate in program settings to see the calculated amounts."
          )}
        </p>
      ) : null}

      <div className="pwr-kpi-row" style={{ marginBottom: 14 }}>
        <Tile
          label={lang("משווקות פעילות", "Active affiliates")}
          value={String(deepDive.totals.activeAffiliates)}
        />
        <Tile
          label={lang("משווקות שקטות", "Silent affiliates")}
          value={String(deepDive.totals.silentAffiliates)}
        />
        <Tile
          label={lang("הכנסה נטו לחנות", "Net revenue to store")}
          value={fmt(deepDive.totals.sales - deepDive.totals.commission)}
          source="Calc"
        />
        <Tile
          label={lang("AOV ממוצע", "Average AOV")}
          value={
            deepDive.totals.orders > 0
              ? `₪${Math.round(deepDive.totals.sales / deepDive.totals.orders)}`
              : "—"
          }
          source="Calc"
        />
      </div>

      <table className="pwr-table">
        <thead>
          <tr>
            <th>{lang("משווקת", "Affiliate")}</th>
            <th>{lang("הזמנות", "Orders")}</th>
            <th>{lang("מכירות", "Sales")}</th>
            <th>{lang("עמלה", "Commission")}</th>
            <th>AOV</th>
            <th>{lang("חדשים/חוזרים", "New / Returning")}</th>
            <th>{lang("קופון/לינק", "Coupon / Link")}</th>
            <th>{lang("מוצרים מובילים", "Top products")}</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((r) => {
            const totalCust = r.newCustomers + r.returningCustomers;
            const newShare = totalCust > 0 ? r.newCustomers / totalCust : 0;
            const couponShare = r.orders > 0 ? r.couponOrders / r.orders : 0;
            return (
              <tr key={r.affiliateMemberId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.affiliateName}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>
                    {r.email}
                    {r.couponCode ? ` · ${r.couponCode}` : ""}
                  </div>
                </td>
                <td>{r.orders}</td>
                <td>{fmt(r.sales)}</td>
                <td>{fmt(r.commission)}</td>
                <td>{r.aov > 0 ? `₪${Math.round(r.aov)}` : "—"}</td>
                <td>
                  {totalCust > 0 ? (
                    <>
                      {r.newCustomers}/{r.returningCustomers}
                      <div style={{ fontSize: 10, color: "#64748b" }}>
                        {pct(newShare)} {lang("חדשים", "new")}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>—</span>
                  )}
                  {r.guestOrders > 0 ? (
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>
                      +{r.guestOrders} {lang("אורחים", "guest")}
                    </div>
                  ) : null}
                </td>
                <td>
                  {r.couponOrders}/{r.linkOrders}
                  {r.orders > 0 ? (
                    <div style={{ fontSize: 10, color: "#64748b" }}>
                      {pct(couponShare)} {lang("דרך קופון", "via coupon")}
                    </div>
                  ) : null}
                </td>
                <td>
                  {r.topProducts.length === 0 ? (
                    <span style={{ color: "#94a3b8" }}>—</span>
                  ) : (
                    <ol style={{ margin: 0, paddingInlineStart: 16, fontSize: 10 }}>
                      {r.topProducts.map((p) => (
                        <li key={p.title}>
                          {p.title} · {p.units}
                          {lang(" יח׳", " u")}
                        </li>
                      ))}
                    </ol>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {tailCount > 0 ? (
        <p style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
          {lang(
            `+ עוד ${tailCount} משווקות נוספות בסך ${fmt(tailSales)}`,
            `+ ${tailCount} more affiliates totalling ${fmt(tailSales)}`
          )}
        </p>
      ) : null}

      {topAff ? (
        <div className="pwr-exec-summary" style={{ marginTop: 12 }}>
          <p>
            {lang(
              `${topAff.affiliateName} הובילה עם ${fmt(topAff.sales)} ב-${topAff.orders} הזמנות (עמלה ${fmt(topAff.commission)}). כלל המשווקות הביאו ${pct(deepDive.totals.affiliateShareOfStoreRevenue ?? 0)} מסך הכנסות החנות בחלון.`,
              `${topAff.affiliateName} led with ${fmt(topAff.sales)} across ${topAff.orders} orders (commission ${fmt(topAff.commission)}). All affiliates combined drove ${pct(deepDive.totals.affiliateShareOfStoreRevenue ?? 0)} of store revenue in the window.`
            )}
          </p>
          {deepDive.totals.silentAffiliates > 0 ? (
            <p style={{ marginTop: 6 }}>
              {lang(
                `${deepDive.totals.silentAffiliates} משווקות רשומות ללא מכירה בחלון — שווה לבדוק פנייה חוזרת.`,
                `${deepDive.totals.silentAffiliates} configured affiliates produced zero sales — worth a re-engagement nudge.`
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Tile({ label, value, source }: { label: string; value: string; source?: "M" | "S" | "Calc" | "Blended" }) {
  return (
    <div className="pwr-kpi">
      <p className="pwr-kpi-label">
        {label}
        {source ? <SourceTag source={source} /> : null}
      </p>
      <p className="pwr-kpi-value">{value}</p>
    </div>
  );
}

function FunnelCell({ label, value, rate }: { label: string; value: string; rate?: string }) {
  return (
    <div className="pwr-funnel-cell">
      <p className="pwr-funnel-label">{label}</p>
      <p className="pwr-funnel-value">{value}</p>
      {rate ? <p className="pwr-funnel-rate">{rate}</p> : null}
    </div>
  );
}

function BrandBlock({
  brand,
  insights,
  t,
  locale
}: {
  brand: MetaAdsReportBrand;
  insights: BrandInsights | null;
  t: Record<string, string>;
  locale: "he" | "en";
}) {
  return (
    <section className="pwr-brand-block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h2 className="pwr-brand-name">{brand.name}</h2>
        <span className="pwr-brand-meta">
          {brand.campaigns.length} {t.campaignsWord} · {brand.ads.length} {t.adsWord}
        </span>
      </div>

      {insights ? (
        <div className="pwr-insights">
          <p className="pwr-insights-hook">{insights.hookLine}</p>
          {insights.observations.length > 0 ? (
            <>
              <p className="pwr-insights-label">{t.observationsLabel}</p>
              <ul className="pwr-insights-list">
                {insights.observations.map((o, i) => (
                  <li key={`obs-${i}`}>{o}</li>
                ))}
              </ul>
            </>
          ) : null}
          {insights.actions.length > 0 ? (
            <>
              <p className="pwr-insights-label">{t.actionsLabel}</p>
              <ul className="pwr-insights-list">
                {insights.actions.map((a, i) => (
                  <li key={`act-${i}`}>{a}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="pwr-kpi-row" style={{ marginTop: 14 }}>
        <Tile label={t.spend} value={formatCurrencyILS(brand.kpis.spend)} />
        <Tile label={t.cpc} value={brand.kpis.cpc > 0 ? `₪${brand.kpis.cpc.toFixed(2)}` : "—"} />
        <Tile label={t.cpm} value={brand.kpis.cpm > 0 ? `₪${brand.kpis.cpm.toFixed(2)}` : "—"} />
        <Tile label={t.ctr} value={brand.kpis.ctr > 0 ? formatPct(brand.kpis.ctr) : "—"} />
      </div>
      <div className="pwr-kpi-row" style={{ marginTop: 6 }}>
        <Tile label={t.clicks} value={formatNumberShort(brand.kpis.clicks)} />
        <Tile label={t.impressions} value={formatNumberShort(brand.kpis.impressions)} />
        <Tile label={t.purchases} value={formatNumberShort(brand.kpis.purchases)} source="M" />
        <Tile label={t.roas} value={brand.kpis.purchaseRoas != null ? `${formatRatio(brand.kpis.purchaseRoas)}x` : "—"} source="M" />
      </div>

      <FunnelBlock funnel={brand.funnel} t={t} />

      {brand.daily.length > 0 ? (
        <>
          <p className="pwr-block-title">{t.dailyTitle}</p>
          <table className="pwr-table">
            <thead>
              <tr>
                <th>{t.dailyDate}</th>
                <th>{t.spend}</th>
                <th>{t.clicks}</th>
                <th>{t.impressions}</th>
                <th>{t.purchases}</th>
                <th>{t.roas}</th>
              </tr>
            </thead>
            <tbody>
              {brand.daily.map((d: MetaAdsReportDailyRow) => (
                <tr key={d.date}>
                  <td>{formatDayShort(d.date, locale)}</td>
                  <td>{formatCurrencyILS(d.spend)}</td>
                  <td>{formatNumberShort(d.clicks)}</td>
                  <td>{formatNumberShort(d.impressions)}</td>
                  <td>{formatNumberShort(d.purchases)}</td>
                  <td>{d.purchaseRoas != null ? `${formatRatio(d.purchaseRoas)}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <p className="pwr-block-title">{t.campaignsTitle}</p>
      <table className="pwr-table">
        <thead>
          <tr>
            <th>{t.campaignName}</th>
            <th>{t.spend}</th>
            <th>{t.clicks}</th>
            <th>{t.cpc}</th>
            <th>{t.ctr}</th>
            <th>{t.purchases}</th>
            <th>{t.roas}</th>
          </tr>
        </thead>
        <tbody>
          {brand.campaigns.map((c) => (
            <tr key={c.id}>
              <td>{c.campaignName}</td>
              <td>{formatCurrencyILS(c.spend)}</td>
              <td>{formatNumberShort(c.clicks)}</td>
              <td>{c.cpc > 0 ? `₪${c.cpc.toFixed(2)}` : "—"}</td>
              <td>{c.ctr > 0 ? formatPct(c.ctr) : "—"}</td>
              <td>{formatNumberShort(c.purchases)}</td>
              <td>{c.purchaseRoas != null ? `${formatRatio(c.purchaseRoas)}x` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pwr-block-title">{t.adsTitle}</p>
      {brand.ads.length === 0 ? (
        <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0" }}>{t.noAds}</p>
      ) : (
        (() => {
          // Collapse zero-signal rows: an ad with under ₪50 spend and no
          // purchases tells the founder nothing — but a dozen of them
          // (every paused/new creative) used to bury the rows that matter.
          // They roll up into one summary line at the bottom instead.
          const LOW_SIGNAL_SPEND = 50;
          const visible = brand.ads.filter(
            (ad) => ad.spend >= LOW_SIGNAL_SPEND || ad.purchases > 0
          );
          const hidden = brand.ads.filter(
            (ad) => ad.spend < LOW_SIGNAL_SPEND && ad.purchases === 0
          );
          const hiddenSpend = hidden.reduce((s, ad) => s + ad.spend, 0);
          const isHeLocale = locale === "he";
          return (
            <table className="pwr-table">
              <thead>
                <tr>
                  <th>{t.adLabel}</th>
                  <th>{t.adsetLabel}</th>
                  <th>{t.spend}</th>
                  <th>{t.clicks}</th>
                  <th>{t.cpc}</th>
                  <th>{t.purchases}</th>
                  <th>{t.roas}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((ad, i) => (
                  <tr key={`${ad.adName}-${ad.adsetName}-${i}`}>
                    <td>{ad.adName ?? "—"}</td>
                    <td>{ad.adsetName ?? "—"}</td>
                    <td>{formatCurrencyILS(ad.spend)}</td>
                    <td>{formatNumberShort(ad.clicks)}</td>
                    <td>{ad.cpc > 0 ? `₪${ad.cpc.toFixed(2)}` : "—"}</td>
                    <td>{formatNumberShort(ad.purchases)}</td>
                    <td>{ad.purchaseRoas != null ? `${formatRatio(ad.purchaseRoas)}x` : "—"}</td>
                  </tr>
                ))}
                {hidden.length > 0 ? (
                  <tr>
                    <td colSpan={7} style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>
                      {isHeLocale
                        ? `+ עוד ${hidden.length} מודעות בהוצאה נמוכה (מתחת ל₪${LOW_SIGNAL_SPEND}, ללא רכישות) — סה״כ ${formatCurrencyILS(hiddenSpend)}.`
                        : `+ ${hidden.length} more low-spend ads (under ₪${LOW_SIGNAL_SPEND}, no purchases) — ${formatCurrencyILS(hiddenSpend)} total.`}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          );
        })()
      )}
    </section>
  );
}

function FunnelBlock({ funnel, t }: { funnel: MetaAdsReportFunnel; t: Record<string, string> }) {
  // Show conversion rate from previous step in parentheses under each.
  const rate = (numerator: number, denominator: number) =>
    denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "";
  return (
    <>
      <p className="pwr-block-title">{t.funnelTitle}</p>
      <div className="pwr-funnel">
        <FunnelCell label={t.funnelImpr} value={formatNumberShort(funnel.impressions)} />
        <FunnelCell label={t.funnelClicks} value={formatNumberShort(funnel.clicks)} rate={rate(funnel.clicks, funnel.impressions)} />
        <FunnelCell label={t.funnelLPV} value={formatNumberShort(funnel.landingPageViews)} rate={rate(funnel.landingPageViews, funnel.clicks)} />
        <FunnelCell label={t.funnelATC} value={formatNumberShort(funnel.addToCart)} rate={rate(funnel.addToCart, funnel.landingPageViews)} />
        <FunnelCell label={t.funnelIC} value={formatNumberShort(funnel.initiateCheckout)} rate={rate(funnel.initiateCheckout, funnel.addToCart)} />
        <FunnelCell label={t.funnelPurch} value={formatNumberShort(funnel.purchases)} rate={rate(funnel.purchases, funnel.initiateCheckout)} />
      </div>
    </>
  );
}

function InstagramSection({
  influencer,
  widePosts,
  igInsights,
  t
}: {
  influencer: NonNullable<Awaited<ReturnType<typeof buildMarketingPlannerInfluencerIntelligence>>>;
  widePosts: Array<{ username: string; captionPreview: string; likes: number; comments: number; postedAt: string }>;
  igInsights: InstagramInsights | null;
  t: Record<string, string>;
}) {
  const topCreators = (influencer.topCreators ?? []).slice(0, 8);
  // Every configured affiliate profile, including silent ones — sorted so
  // the ones with the most stored posts appear first.
  const allProfiles = (influencer.instagramCrawl?.affiliateProfiles ?? [])
    .slice()
    .sort((a, b) => (b.postsStored ?? 0) - (a.postsStored ?? 0));

  const statusLabel = (status: string) => {
    if (status === "stored") return t.statusStored;
    if (status === "scanned") return t.statusScanned;
    if (status === "handle_saved") return t.statusHandleSaved;
    return t.statusMissing;
  };

  return (
    <section className="pwr-section">
      <h2 className="pwr-section-title">{t.instagramTitle}</h2>
      <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b" }}>{t.instagramSubtitle}</p>

      {igInsights ? (
        <div className="pwr-insights">
          <p className="pwr-insights-hook">{igInsights.hookLine}</p>
          {igInsights.observations.length > 0 ? (
            <>
              <p className="pwr-insights-label">{t.observationsLabel}</p>
              <ul className="pwr-insights-list">
                {igInsights.observations.map((o, i) => (
                  <li key={`ig-obs-${i}`}>{o}</li>
                ))}
              </ul>
            </>
          ) : null}
          {igInsights.actions.length > 0 ? (
            <>
              <p className="pwr-insights-label">{t.actionsLabel}</p>
              <ul className="pwr-insights-list">
                {igInsights.actions.map((a, i) => (
                  <li key={`ig-act-${i}`}>{a}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {/* All configured creators — including silent ones, with crawl status. */}
      <div className="pwr-ig-card">
        <p className="pwr-block-title" style={{ marginTop: 0 }}>{t.allAffiliatesLabel}</p>
        {allProfiles.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.noInfluencer}</p>
        ) : (
          <table className="pwr-table">
            <thead>
              <tr>
                <th>@</th>
                <th>{t.profileStatusLabel}</th>
                <th>{t.profilePostsLabel}</th>
                <th>{t.profileLastPostLabel}</th>
              </tr>
            </thead>
            <tbody>
              {allProfiles.map((p) => (
                <tr key={`profile-${p.username}`}>
                  <td>@{p.username}</td>
                  <td>{statusLabel(p.status)}</td>
                  <td>{formatNumberShort(p.postsStored ?? 0)}</td>
                  <td>{p.lastPostAt ? p.lastPostAt.slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Top creators with attributed sales (uses the report window). */}
      {topCreators.length > 0 ? (
        <div className="pwr-ig-card" style={{ marginTop: 8 }}>
          <p className="pwr-block-title" style={{ marginTop: 0 }}>{t.topCreatorsLabel}</p>
          {topCreators.map((c) => (
            <div className="pwr-ig-row" key={`top-creator-${c.id}`}>
              <span className="pwr-ig-name">{c.name}</span>
              <span className="pwr-ig-stats">
                <span>
                  {t.salesLabel}: <span className="pwr-ig-stat-num">{formatCurrencyILS(c.sales)}</span>
                </span>
                <span>
                  {t.ordersLabel}: <span className="pwr-ig-stat-num">{formatNumberShort(c.orders)}</span>
                </span>
                <span>
                  {t.clicksLabelIg}: <span className="pwr-ig-stat-num">{formatNumberShort(c.clicks)}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Top posts across the wider 30-day window so creators who post less
          often than weekly still get a representative entry. */}
      <div className="pwr-ig-card" style={{ marginTop: 8 }}>
        <p className="pwr-block-title" style={{ marginTop: 0 }}>{t.topPostsLabel}</p>
        <p style={{ margin: "0 0 6px", fontSize: 10, color: "#64748b" }}>{t.windowLabel}</p>
        {widePosts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.noInfluencer}</p>
        ) : (
          widePosts.map((p, i) => (
            <div className="pwr-ig-row" key={`wide-post-${i}`}>
              <span className="pwr-ig-name">
                @{p.username} <span style={{ color: "#94a3b8", fontWeight: 400 }}>· {p.postedAt}</span>
                {" — "}
                {p.captionPreview || "(no caption)"}
              </span>
              <span className="pwr-ig-stats">
                <span>
                  {t.likesLabel}: <span className="pwr-ig-stat-num">{formatNumberShort(p.likes)}</span>
                </span>
                <span>
                  {t.commentsLabel}: <span className="pwr-ig-stat-num">{formatNumberShort(p.comments)}</span>
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
