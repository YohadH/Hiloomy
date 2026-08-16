import type { GrowthFinding, GrowthFindingSeverity } from "@/lib/domain/growth-agent-types";
import type {
  MarketingPlannerInfluencerIntelligence,
  MarketingPlannerMetaAds,
  MarketingPlannerMetaAdsCampaign,
  MarketingPlannerStoreScope
} from "@/lib/domain/marketing-planner-types";
import {
  getGrowthFindings,
  getGrowthMetricSnapshots,
  upsertGrowthFindings
} from "@/lib/services/growth-agent-service";

export type WeeklyAgentInsightChannel = "meta_ads" | "instagram" | "history";

export interface WeeklyAgentInsight {
  id: string;
  channel: WeeklyAgentInsightChannel;
  severity: GrowthFindingSeverity;
  title: string;
  whatAgentThinks: string;
  evidence: string;
  recommendation: string;
  confidenceScore: number;
  learnedFromHistory?: string | null;
}

export interface WeeklyAgentInsightsPayload {
  generatedAt: string;
  dateRangeLabel: string;
  insights: WeeklyAgentInsight[];
  historySignals: string[];
  memorySaved: boolean;
}

function compact(value: string, maxLength = 260) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function safeIdPart(value: string | null | undefined) {
  return String(value ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "unknown";
}

function formatMoney(value: number, currency = "ILS") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function formatCpa(spend: number, purchases: number, currency?: string | null) {
  if (!purchases) return "CPA n/a";
  return `CPA ${formatMoney(spend / purchases, currency ?? "ILS")}`;
}

function cleanLabel(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\{\{[^}]+}}/g, "")
    .replace(/\b[0-9a-f]{18,}\b/gi, "")
    .replace(/[-_ ]{2,}/g, " ")
    .replace(/^[\s_-]+|[\s_-]+$/g, "")
    .trim();

  return cleaned || null;
}

function creativeLabel(creative?: MarketingPlannerMetaAdsCampaign | null) {
  if (!creative) return "Unknown creative";
  return cleanLabel(creative.adName)
    ?? cleanLabel(creative.creativeName)
    ?? cleanLabel(creative.creativeTitle)
    ?? cleanLabel(creative.campaignName)
    ?? "Meta creative";
}

function historyText(findings: GrowthFinding[]) {
  return findings
    .map((finding) => [
      finding.summary,
      ...finding.possibleCauses,
      ...finding.recommendedActions,
      JSON.stringify(finding.sourceData ?? {})
    ].join(" "))
    .join(" ")
    .toLowerCase();
}

function findHistoryMatch(history: string, candidates: Array<string | null | undefined>) {
  const match = candidates
    .map((candidate) => cleanLabel(candidate))
    .filter((candidate): candidate is string => Boolean(candidate && candidate.length > 3))
    .find((candidate) => history.includes(candidate.toLowerCase()));

  return match ?? null;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function buildMetaInsights(input: {
  metaAds: MarketingPlannerMetaAds | null;
  history: string;
  currency: string;
}): WeeklyAgentInsight[] {
  const { metaAds, history, currency } = input;
  if (!metaAds || !metaAds.campaigns.length) {
    return [{
      id: "meta-missing",
      channel: "meta_ads",
      severity: "warning",
      title: "Meta Ads needs a fresh synced window",
      whatAgentThinks: "The agent cannot make a reliable paid-media call yet because there are no stored Meta campaign rows for this weekly date range.",
      evidence: "Meta Ads is either not connected, not synced, or synced for a different date window.",
      recommendation: "Run Meta Ads sync for a preset that covers this week, then review CPA, purchases, and creative winners again.",
      confidenceScore: 0.72
    }];
  }

  const insights: WeeklyAgentInsight[] = [];
  const bestCreative = metaAds.topCreatives[0] ?? null;
  const bestCampaign = metaAds.topCampaigns[0] ?? null;
  const totalPurchases = metaAds.totalPurchases;
  const totalSpend = metaAds.totalSpend;
  const overallCpa = formatCpa(totalSpend, totalPurchases, currency);
  const repeatedCreative = findHistoryMatch(history, [
    bestCreative?.adName,
    bestCreative?.creativeName,
    bestCreative?.creativeTitle,
    bestCampaign?.campaignName
  ]);

  if (bestCreative) {
    const label = creativeLabel(bestCreative);
    const isLowSample = bestCreative.purchases < 3 || bestCreative.spend < 150;
    insights.push({
      id: "meta-best-creative",
      channel: "meta_ads",
      severity: isLowSample ? "warning" : "info",
      title: isLowSample ? "Best creative is still low-sample" : "Meta has a clear creative winner",
      whatAgentThinks: isLowSample
        ? `${label} is showing a promising Meta signal, but the agent does not fully trust it yet because the sample is too small.`
        : `${label} is the strongest paid creative signal in this window because it combines purchases with acceptable efficiency.`,
      evidence: `${label}: ${bestCreative.purchases} purchases, ${formatMoney(bestCreative.spend, currency)} spend, ${formatCpa(bestCreative.spend, bestCreative.purchases, currency)}, Meta ROAS ${bestCreative.purchaseRoas != null ? `${bestCreative.purchaseRoas.toFixed(2)}x` : "n/a"}.`,
      recommendation: isLowSample
        ? "Keep it in test mode until it reaches more purchase volume; do not scale only because ROAS looks high."
        : "Use this creative angle as the benchmark for the next brief and create 2-3 variants around the same hook/product/offer.",
      confidenceScore: isLowSample ? 0.66 : 0.82,
      learnedFromHistory: repeatedCreative
        ? `${repeatedCreative} also appears in prior Growth Agent memory, so this may be a repeated winner rather than a one-week spike.`
        : "No matching prior winner found in Growth Agent memory."
    });
  }

  const weakCampaign = metaAds.watchCampaigns[0] ?? null;
  if (weakCampaign) {
    insights.push({
      id: "meta-watch-campaign",
      channel: "meta_ads",
      severity: weakCampaign.purchases === 0 ? "critical" : "warning",
      title: "A paid campaign needs review",
      whatAgentThinks: `${weakCampaign.campaignName} is absorbing spend without enough clean purchase volume for the selected window.`,
      evidence: `${weakCampaign.campaignName}: ${formatMoney(weakCampaign.spend, currency)} spend, ${weakCampaign.purchases} purchases, ${formatCpa(weakCampaign.spend, weakCampaign.purchases, currency)}.`,
      recommendation: "Check the ad set/creative mix before increasing budget. If this is prospecting, separate it from retargeting before judging it.",
      confidenceScore: 0.78
    });
  }

  const weakDays = metaAds.dailyBreakdown.filter((day) => day.spend > 0 && day.purchases === 0);
  if (weakDays.length) {
    const spend = sum(weakDays.map((day) => day.spend));
    insights.push({
      id: "meta-weak-days",
      channel: "meta_ads",
      severity: "warning",
      title: "Some paid days had spend with no purchases",
      whatAgentThinks: "There may be day-level waste or tracking gaps. The agent would not judge only the weekly total; it would inspect the bad days.",
      evidence: `${weakDays.length} day(s) had spend and 0 purchases, totaling ${formatMoney(spend, currency)}.`,
      recommendation: "Open the weak days and compare landing page, offer, and creative changes. If nothing changed, check pixel/event quality.",
      confidenceScore: 0.74
    });
  }

  insights.push({
    id: "meta-overall",
    channel: "meta_ads",
    severity: totalPurchases >= 20 ? "info" : "warning",
    title: totalPurchases >= 20 ? "Meta Ads has usable weekly volume" : "Meta Ads volume is limited",
    whatAgentThinks: totalPurchases >= 20
      ? "The agent trusts this Meta window enough to use it for next-week planning, especially CPA and purchase volume."
      : "The agent will treat Meta conclusions carefully because the purchase count is still low for confident scaling.",
    evidence: `${formatMoney(totalSpend, currency)} spend, ${totalPurchases} purchases, ${overallCpa}, ${metaAds.totalClicks.toLocaleString("en-US")} clicks.`,
    recommendation: totalPurchases >= 20
      ? "Use purchases and CPA as the primary decision metric; keep Meta ROAS as supporting context only."
      : "Avoid aggressive scaling until the same direction repeats with more purchases or across more days.",
    confidenceScore: totalPurchases >= 20 ? 0.84 : 0.68
  });

  return insights.slice(0, 4);
}

function buildInstagramInsights(input: {
  influencer: MarketingPlannerInfluencerIntelligence | null;
  history: string;
  currency: string;
}): WeeklyAgentInsight[] {
  const { influencer, history, currency } = input;
  const instagram = influencer?.instagramCrawl ?? null;
  if (!instagram) {
    return [{
      id: "instagram-missing",
      channel: "instagram",
      severity: "warning",
      title: "Instagram crawler evidence is missing",
      whatAgentThinks: "The agent cannot judge Instagram content quality yet because no crawler evidence is available for this weekly date window.",
      evidence: "No brand/affiliate public posts were loaded into the weekly summary.",
      recommendation: "Run the public Instagram crawler and make sure affiliate handles are saved in the Affiliate Portal.",
      confidenceScore: 0.7
    }];
  }

  const insights: WeeklyAgentInsight[] = [];
  const posts = instagram.recentPosts;
  const bestPost = [...posts].sort((left, right) =>
    (right.views + right.likes * 10 + right.comments * 25) - (left.views + left.likes * 10 + left.comments * 25)
  )[0] ?? null;
  const brandPosts = posts.filter((post) => post.role === "brand");
  const creatorPosts = posts.filter((post) => post.role === "creator");
  const topCreator = influencer?.topCreators[0] ?? null;
  const repeatedCreator = findHistoryMatch(history, [topCreator?.name, topCreator?.couponCode, topCreator?.affiliateCode]);

  if (bestPost) {
    insights.push({
      id: "instagram-best-post",
      channel: "instagram",
      severity: "info",
      title: "Instagram has a content angle to reuse",
      whatAgentThinks: `The strongest public Instagram post in this window is from @${bestPost.username}. The agent would inspect this hook before writing next week's organic or influencer brief.`,
      evidence: `${bestPost.mediaType} from @${bestPost.username}: ${bestPost.views.toLocaleString("en-US")} views, ${bestPost.likes.toLocaleString("en-US")} likes, ${bestPost.comments.toLocaleString("en-US")} comments. Caption: ${compact(bestPost.captionPreview, 120)}`,
      recommendation: "Turn the winning hook into 2-3 follow-up posts: one brand reel, one creator brief, and one paid creative test if the product matches Meta winners.",
      confidenceScore: bestPost.views || bestPost.likes || bestPost.comments ? 0.78 : 0.62
    });
  } else {
    insights.push({
      id: "instagram-no-posts-window",
      channel: "instagram",
      severity: "warning",
      title: "No Instagram posts match this date window",
      whatAgentThinks: "The crawler may have run, but the selected weekly date range has no stored brand-related posts.",
      evidence: `Profiles checked: ${instagram.profilesCrawled}/${instagram.profilesRequested || instagram.profilesCrawled}. Recent stored posts in this window: 0.`,
      recommendation: "Either widen the date window, run a fresh crawl, or confirm the brand/affiliate posts mention/tag the brand or coupon code.",
      confidenceScore: 0.73
    });
  }

  if (creatorPosts.length && topCreator) {
    insights.push({
      id: "instagram-sales-content-bridge",
      channel: "instagram",
      severity: "info",
      title: "Creator content can be linked to commercial performance",
      whatAgentThinks: `${topCreator.name} is commercially strong, and the crawler has creator-side public posts in the same window. The agent would compare their content format against affiliate sales.`,
      evidence: `${topCreator.name}: ${formatMoney(topCreator.sales, currency)} attributed sales, ${topCreator.orders} orders. Creator posts stored this window: ${creatorPosts.length}.`,
      recommendation: "Use the top creator as the benchmark. Ask weaker creators to copy the format/offer clarity, not necessarily the exact script.",
      confidenceScore: 0.8,
      learnedFromHistory: repeatedCreator
        ? `${repeatedCreator} appears in prior Growth Agent memory, so the creator may be a repeat performer.`
        : "No prior matching creator memory found."
    });
  } else if (brandPosts.length && !creatorPosts.length) {
    insights.push({
      id: "instagram-brand-only",
      channel: "instagram",
      severity: "warning",
      title: "Instagram evidence is brand-heavy, not creator-heavy",
      whatAgentThinks: "The agent sees brand page content, but not enough affiliate creator content in this weekly window.",
      evidence: `${brandPosts.length} brand post(s) stored, ${creatorPosts.length} creator post(s) stored.`,
      recommendation: "Ask affiliates to tag the brand or use their code/link in captions so the crawler can connect content to performance.",
      confidenceScore: 0.76
    });
  }

  if (instagram.affiliateProfiles.some((profile) => profile.postsScanned > 0 && profile.postsFound === 0)) {
    const count = instagram.affiliateProfiles.filter((profile) => profile.postsScanned > 0 && profile.postsFound === 0).length;
    insights.push({
      id: "instagram-unrelated-creator-posts",
      channel: "instagram",
      severity: "warning",
      title: "Some creator profiles posted, but not about the brand",
      whatAgentThinks: "The agent sees creators being scanned, but some recent posts do not mention the brand, tag, hashtag, coupon, or affiliate code.",
      evidence: `${count} scanned creator profile(s) had no brand-related public post match.`,
      recommendation: "For the next brief, require @brand tag, campaign hashtag, or coupon mention so content is measurable.",
      confidenceScore: 0.77
    });
  }

  return insights.slice(0, 4);
}

function buildHistorySignals(findings: GrowthFinding[], snapshots: Awaited<ReturnType<typeof getGrowthMetricSnapshots>>) {
  const plannerFindings = findings.filter((finding) =>
    finding.findingType.includes("marketing_planner")
    || finding.findingType.includes("weekly_summary")
    || finding.metricName.toLowerCase().includes("meta")
    || finding.metricName.toLowerCase().includes("instagram")
  );
  const plannerSnapshots = snapshots.filter((snapshot) =>
    snapshot.source.includes("marketing_planner")
    || snapshot.source.includes("weekly_summary")
  );

  return [
    plannerFindings.length
      ? `Read ${plannerFindings.length} prior Growth Agent finding(s) related to planner, Meta, or Instagram.`
      : "No prior planner/Meta/Instagram findings found yet.",
    plannerSnapshots.length
      ? `Read ${plannerSnapshots.length} historical planner snapshot(s) for context.`
      : "No prior planner metric snapshots found yet."
  ];
}

function insightToFinding(input: {
  insight: WeeklyAgentInsight;
  storeId: string;
  rangeKey: string;
  dateRangeLabel: string;
  generatedAt: string;
}): GrowthFinding {
  const { insight, storeId, rangeKey, dateRangeLabel, generatedAt } = input;
  return {
    id: `weekly-summary-${safeIdPart(storeId)}-${safeIdPart(rangeKey)}-${safeIdPart(insight.id)}`,
    findingType: `weekly_summary_${insight.channel}`,
    severity: insight.severity,
    metricName: insight.channel === "meta_ads" ? "Meta Ads weekly insight" : "Instagram weekly insight",
    summary: compact(insight.whatAgentThinks, 280),
    possibleCauses: [
      compact(insight.evidence, 280),
      insight.learnedFromHistory ? compact(insight.learnedFromHistory, 220) : `Date window: ${dateRangeLabel}`
    ],
    recommendedActions: [compact(insight.recommendation, 260)],
    confidenceScore: insight.confidenceScore,
    timestamp: generatedAt,
    sourceData: {
      source: "weekly_summary_agent",
      channel: insight.channel,
      title: insight.title,
      dateRangeLabel
    }
  };
}

export async function buildWeeklyAgentInsights(input: {
  storeScope: MarketingPlannerStoreScope;
  metaAds: MarketingPlannerMetaAds | null;
  influencer: MarketingPlannerInfluencerIntelligence | null;
  dateRangeLabel: string;
  rangeKey: string;
  currency: string;
}): Promise<WeeklyAgentInsightsPayload> {
  const generatedAt = new Date().toISOString();
  const [findings, snapshots] = await Promise.all([
    input.storeScope.storeId ? getGrowthFindings(input.storeScope.storeId).catch(() => []) : Promise.resolve([]),
    input.storeScope.storeId ? getGrowthMetricSnapshots(input.storeScope.storeId).catch(() => []) : Promise.resolve([])
  ]);
  const currentFindingPrefix = input.storeScope.storeId
    ? `weekly-summary-${safeIdPart(input.storeScope.storeId)}-${safeIdPart(input.rangeKey)}-`
    : "";
  const historicalFindings = currentFindingPrefix
    ? findings.filter((finding) => !finding.id.startsWith(currentFindingPrefix))
    : findings;
  const historicalText = historyText(historicalFindings);
  const insights = [
    ...buildMetaInsights({ metaAds: input.metaAds, history: historicalText, currency: input.currency }),
    ...buildInstagramInsights({ influencer: input.influencer, history: historicalText, currency: input.currency })
  ];
  let memorySaved = false;

  if (input.storeScope.connected && input.storeScope.storeId && insights.length) {
    const memoryFindings = insights.map((insight) => insightToFinding({
      insight,
      storeId: input.storeScope.storeId as string,
      rangeKey: input.rangeKey,
      dateRangeLabel: input.dateRangeLabel,
      generatedAt
    }));
    memorySaved = await upsertGrowthFindings(memoryFindings, input.storeScope.storeId)
      .then(() => true)
      .catch(() => false);
  }

  return {
    generatedAt,
    dateRangeLabel: input.dateRangeLabel,
    insights,
    historySignals: buildHistorySignals(historicalFindings, snapshots),
    memorySaved
  };
}
