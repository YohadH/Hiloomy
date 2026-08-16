// Single source of truth for "build a weekly report's data."
//
// Called by:
//   • The on-demand PDF export route — when the user clicks Export PDF, we
//     build the data and immediately render it.
//   • The Sunday cron — generates every store's report, persists it, then
//     emails it.
//   • The history view — reads a previously persisted report and re-renders
//     the PDF on demand from the stored JSON.
//   • The monthly meta-report — pulls the last 4 stored weekly reports and
//     produces a rollup.
//
// Why this lives separate from buildMetaAdsWeeklyReport: the latter only
// knows about Meta Ads. This service composes Meta Ads + Instagram + AI
// insights into a single bundle so the persistence layer + email body can
// reference one shape.

import {
  buildMetaAdsWeeklyReport,
  type MetaAdsWeeklyReport
} from "@/lib/services/meta-ads-report-service";
import {
  generateBrandInsights,
  type BrandInsights,
  type PriorWeekSnapshot
} from "@/lib/services/meta-ads-report-insights-service";
import {
  generateInstagramInsights,
  type InstagramInsights,
  type InstagramAffiliateSummary
} from "@/lib/services/instagram-report-insights-service";
import { buildMarketingPlannerInfluencerIntelligence } from "@/lib/services/marketing-planner-influencer-service";
import { listOpenAlerts } from "@/lib/services/alert-writer-service";
import {
  fetchCompetitorActivity,
  type CompetitorActivityEntry
} from "@/lib/clients/rivalsweeper-client";
import {
  buildAffiliateDeepDive,
  type AffiliateDeepDiveReport
} from "@/lib/services/affiliate-deep-dive-service";
import {
  buildRestockHeroAlerts,
  type RestockHeroAlertReport
} from "@/lib/services/restock-hero-alert-service";
import {
  buildStockoutImminentReport,
  type StockoutImminentReport
} from "@/lib/services/stockout-imminent-service";
import {
  buildRoasCollapseFromReport,
  type RoasCollapseReport
} from "@/lib/services/roas-collapse-service";
import { getDb } from "@/lib/server/db";
import { formatDateInTimeZone } from "@/lib/server/reporting-date-range";
import {
  generateWeeklyBiCommentary,
  type BiWeeklyCommentary
} from "@/lib/services/weekly-report-bi-commentary-service";
import {
  buildCompetitorWeekSection,
  type CompetitorWeekSection
} from "@/lib/services/competitor-intel-service";

export interface WeeklyReportBundle {
  storeId: string;
  storeName: string | null;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  generatedAt: string;
  locale: "he" | "en";
  metaAds: MetaAdsWeeklyReport | null;
  metaAdsInsightsByBrand: Record<string, BrandInsights>;
  // Slimmed-down Instagram payload — the full MarketingPlannerInfluencerIntelligence
  // is heavy and changes shape; we copy only what the report and the monthly
  // rollup actually read.
  instagram: {
    affiliates: Array<{
      username: string;
      displayName: string | null;
      status: InstagramAffiliateSummary["status"];
      postsStored: number;
      lastPostAt: string | null;
      attributedSales: number;
      attributedOrders: number;
    }>;
    widePosts: Array<{
      username: string;
      captionPreview: string;
      likes: number;
      comments: number;
      postedAt: string;
    }>;
    topCreators: Array<{
      id: string;
      name: string;
      sales: number;
      orders: number;
      clicks: number;
    }>;
  } | null;
  instagramInsights: InstagramInsights | null;
  affiliateDeepDive: AffiliateDeepDiveReport | null;
  restockAlerts: RestockHeroAlertReport | null;
  stockoutAlerts: StockoutImminentReport | null;
  roasCollapseAlerts: RoasCollapseReport | null;
  // Competitor promo/pricing week section (RivalSweeper Feed A). Mirrored
  // here AND fetched in the print page's own data pass — keep both wired
  // when the shape changes (the print page is what the PDF renders from).
  competitorWeek: CompetitorWeekSection | null;
  // Live competitor activity (RivalSweeper ads/news/homepage links) —
  // mirrored here AND fetched in the print page's own data pass.
  competitorActivity: CompetitorActivityEntry[] | null;
  // Open action queue — alerts still awaiting a decision at build time.
  // Mirrored here AND fetched in the print page's own data pass (same
  // contract as competitorWeek above).
  openActions: Array<{
    id: string;
    type: string;
    severity: "critical" | "high" | "medium" | "low";
    title: string;
    description: string | null;
    recommendedAction: string | null;
    periodLabel: string | null;
  }>;
  // BI agent's executive summary (3 insights + 3 actions) — rendered at
  // the top of the print page. Null when the BI agent is unconfigured or
  // fails; the section just hides. See weekly-report-bi-commentary-service.
  biAgentCommentary: BiWeeklyCommentary | null;
}

export interface BuildWeeklyReportInput {
  storeId: string;
  start: Date;
  end: Date;
  locale?: "he" | "en";
  // Store timezone the window boundaries were computed in. Drives the
  // periodStart/periodEnd label serialization — a store-TZ instant
  // (July 1 00:00 Israel = June 30 21:00Z) serialized via toISOString
  // labels the PREVIOUS calendar day, and the print page (which
  // re-parses those labels in store TZ) would then render a window one
  // day earlier than the bundle's. Defaults to the store's own timezone.
  timeZone?: string;
}

export async function buildWeeklyReportBundle(
  input: BuildWeeklyReportInput
): Promise<WeeklyReportBundle> {
  const locale = input.locale ?? "he";
  const db = getDb();

  const store = await db.store.findUnique({
    where: { id: input.storeId },
    select: { name: true, domain: true, timezone: true }
  });

  const timeZone = input.timeZone || store?.timezone || "UTC";
  const periodStart = formatDateInTimeZone(input.start, timeZone);
  const periodEnd = formatDateInTimeZone(input.end, timeZone);

  // Meta Ads — main payload.
  const metaAds = await buildMetaAdsWeeklyReport({
    storeId: input.storeId,
    start: input.start,
    end: input.end
  });

  // ROAS-collapse detector — reuses the Meta Ads report we just built so we
  // don't double-call the Meta Insights API. Writes alerts via the writer
  // protocol and returns the report shape too (for PDF rendering).
  const roasCollapseAlerts = metaAds
    ? await buildRoasCollapseFromReport({
        storeId: input.storeId,
        report: metaAds,
        window: { start: input.start, end: input.end }
      }).catch(() => null)
    : null;

  // Prior-week snapshot for trend-aware insights.
  const priorByBrand = new Map<string, PriorWeekSnapshot>();
  if (metaAds && metaAds.brands.length > 0) {
    const windowMs = input.end.getTime() - input.start.getTime();
    const priorEnd = new Date(input.start.getTime() - 1);
    const priorStart = new Date(priorEnd.getTime() - windowMs);
    const prior = await buildMetaAdsWeeklyReport({
      storeId: input.storeId,
      start: priorStart,
      end: priorEnd
    }).catch(() => null);
    if (prior) {
      for (const b of prior.brands) {
        priorByBrand.set(b.name, {
          spend: b.kpis.spend,
          clicks: b.kpis.clicks,
          impressions: b.kpis.impressions,
          purchases: b.kpis.purchases,
          purchaseRoas: b.kpis.purchaseRoas,
          ctr: b.kpis.ctr,
          cpc: b.kpis.cpc
        });
      }
    }
  }

  const metaAdsInsightsByBrand: Record<string, BrandInsights> = {};
  if (metaAds && metaAds.brands.length > 0) {
    const entries = await Promise.all(
      metaAds.brands.map((brand) =>
        generateBrandInsights(brand, metaAds.dateRange, locale, {
          prior: priorByBrand.get(brand.name) ?? null
        }).then((insights) => [brand.name, insights] as const)
      )
    );
    for (const [name, insights] of entries) metaAdsInsightsByBrand[name] = insights;
  }

  // Affiliate deep-dive + restock-hero alerts + stockout-imminent — run in
  // parallel with the Instagram build below so report build time doesn't grow.
  const [affiliateDeepDive, restockAlerts, stockoutAlerts, competitorWeek, openAlertRows] =
    await Promise.all([
      buildAffiliateDeepDive({
        storeId: input.storeId,
        start: input.start,
        end: input.end
      }).catch(() => null),
      buildRestockHeroAlerts({
        storeId: input.storeId,
        start: input.start,
        end: input.end
      }).catch(() => null),
      buildStockoutImminentReport({
        storeId: input.storeId,
        asOf: input.end
      }).catch(() => null),
      buildCompetitorWeekSection({
        storeId: input.storeId,
        start: input.start,
        end: input.end
      }).catch(() => null),
      listOpenAlerts({ storeId: input.storeId, limit: 10 }).catch(() => [])
    ]);

  const competitorActivity = await fetchCompetitorActivity({ timeoutMs: 15_000 }).catch(() => null);

  const openActions: WeeklyReportBundle["openActions"] = (openAlertRows as any[]).map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    description: a.description ?? null,
    recommendedAction: a.recommendedAction ?? null,
    periodLabel: a.periodLabel ?? null
  }));

  // Instagram payload — wider post window (30 days) for engagement context.
  let instagram: WeeklyReportBundle["instagram"] = null;
  let instagramInsights: InstagramInsights | null = null;
  if (store) {
    try {
      const influencer = await buildMarketingPlannerInfluencerIntelligence(
        { storeId: input.storeId, storeName: store.name, storeDomain: store.domain, connected: true },
        input.end,
        { start: input.start, end: input.end }
      );
      const postsWindowEnd = new Date(input.end);
      const postsWindowStart = new Date(input.end);
      postsWindowStart.setUTCDate(postsWindowStart.getUTCDate() - 30);
      const rawPosts = await db.creatorPost.findMany({
        where: {
          storeId: input.storeId,
          postedAt: { gte: postsWindowStart, lte: postsWindowEnd }
        },
        include: { creatorProfile: { select: { username: true } } },
        orderBy: { postedAt: "desc" },
        take: 50
      });
      const widePosts = (rawPosts as any[])
        .map((p) => ({
          username: p.creatorProfile?.username ?? "?",
          captionPreview: String(p.caption ?? "").slice(0, 120),
          likes: Number(p.likeCount ?? 0),
          comments: Number(p.commentsCount ?? 0),
          postedAt: p.postedAt.toISOString().slice(0, 10)
        }))
        .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
        .slice(0, 10);

      const profiles = influencer?.instagramCrawl?.affiliateProfiles ?? [];
      const topCreatorsLookup = new Map<string, { sales: number; orders: number }>();
      for (const c of influencer?.topCreators ?? []) {
        const handle = String(c.couponCode ?? c.affiliateCode ?? c.name ?? "").toLowerCase();
        topCreatorsLookup.set(handle, { sales: c.sales, orders: c.orders });
      }

      instagram = {
        affiliates: profiles.map((p) => ({
          username: p.username,
          displayName: p.affiliateName ?? null,
          status: p.status,
          postsStored: p.postsStored ?? 0,
          lastPostAt: p.lastPostAt ?? null,
          attributedSales: topCreatorsLookup.get(p.username.toLowerCase())?.sales ?? 0,
          attributedOrders: topCreatorsLookup.get(p.username.toLowerCase())?.orders ?? 0
        })),
        widePosts,
        topCreators: (influencer?.topCreators ?? []).slice(0, 8).map((c) => ({
          id: c.id,
          name: c.name,
          sales: c.sales,
          orders: c.orders,
          clicks: c.clicks
        }))
      };

      instagramInsights = await generateInstagramInsights(
        {
          dateRange: {
            start: postsWindowStart.toISOString().slice(0, 10),
            end: postsWindowEnd.toISOString().slice(0, 10)
          },
          affiliates: instagram.affiliates,
          recentPosts: widePosts
        },
        locale
      ).catch(() => null);
    } catch {
      instagram = null;
    }
  }

  // BI agent commentary — feeds the agent a compact digest of the week's
  // KPIs and gets back 3 insights + 3 prescribed actions. Best-effort: a
  // failure or unconfigured agent just returns null and the print page
  // hides the section. Runs last so prior failures don't block it.
  const biAgentCommentary = await generateWeeklyBiCommentary({
    storeName: store?.name ?? null,
    periodStart,
    periodEnd,
    locale,
    metaAds,
    affiliateDeepDive,
    restockAlerts,
    roasCollapseAlerts,
    competitorWeek,
    competitorActivity
  });

  return {
    storeId: input.storeId,
    storeName: store?.name ?? null,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    locale,
    metaAds,
    metaAdsInsightsByBrand,
    instagram,
    instagramInsights,
    affiliateDeepDive,
    restockAlerts,
    stockoutAlerts,
    roasCollapseAlerts,
    competitorWeek,
    competitorActivity,
    openActions,
    biAgentCommentary
  };
}

// Persist a bundle to the WeeklyReport table. Returns the row id so callers
// can wire it to the email send.
export async function persistWeeklyReport(input: {
  bundle: WeeklyReportBundle;
  kind?: "weekly" | "monthly";
}): Promise<{ id: string }> {
  const db = getDb() as any;
  const row = await db.weeklyReport.create({
    data: {
      storeId: input.bundle.storeId,
      kind: input.kind ?? "weekly",
      periodStart: new Date(input.bundle.periodStart),
      periodEnd: new Date(input.bundle.periodEnd),
      dataJson: input.bundle as unknown as object,
      // Cache shape matches lib/services/weekly-report-cache.ts so
      // subsequent PDF renders (email re-send, on-demand download) can
      // read directly from here instead of calling OpenAI / BI agent
      // again. biCommentary is included so the exec-summary section
      // renders in ~5s instead of ~60s on second view.
      insightsJson: {
        brandInsights: input.bundle.metaAdsInsightsByBrand,
        igInsights: input.bundle.instagramInsights,
        biCommentary: input.bundle.biAgentCommentary ?? null
      } as unknown as object
    },
    select: { id: true }
  });
  return { id: row.id };
}

export async function getWeeklyReport(id: string): Promise<WeeklyReportBundle | null> {
  const db = getDb() as any;
  const row = await db.weeklyReport.findUnique({ where: { id } });
  if (!row) return null;
  return row.dataJson as WeeklyReportBundle;
}

export async function listWeeklyReportsForStore(
  storeId: string,
  options: { kind?: "weekly" | "monthly"; take?: number } = {}
): Promise<
  Array<{
    id: string;
    kind: string;
    periodStart: Date;
    periodEnd: Date;
    generatedAt: Date;
    sentAt: Date | null;
  }>
> {
  const db = getDb() as any;
  return db.weeklyReport.findMany({
    where: { storeId, ...(options.kind ? { kind: options.kind } : {}) },
    orderBy: { periodEnd: "desc" },
    take: options.take ?? 50,
    select: { id: true, kind: true, periodStart: true, periodEnd: true, generatedAt: true, sentAt: true }
  });
}
