import type { GrowthAction, GrowthFinding, GrowthRiskLevel } from "@/lib/domain/growth-agent-types";
import type { MarketingPlannerResult, MarketingRecommendation } from "@/lib/domain/marketing-planner-types";
import {
  createGrowthMetricSnapshot,
  upsertGrowthActions,
  upsertGrowthFindings
} from "@/lib/services/growth-agent-service";

function safeIdPart(value: string | null | undefined) {
  return String(value ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unknown";
}

function compact(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function riskFromImpact(impact: MarketingRecommendation["impact"]): GrowthRiskLevel {
  if (impact === "High") return "high";
  if (impact === "Med") return "medium";
  return "low";
}

function confidenceFromResult(result: MarketingPlannerResult) {
  const connectedSources = [
    result.previousMonthBaseline,
    result.customerVoice,
    result.influencerIntelligence,
    result.metaAds,
    result.discountDiagnostics.length ? result.discountDiagnostics : null
  ].filter(Boolean).length;

  return Math.min(0.94, 0.68 + connectedSources * 0.05);
}

function buildFindingId(result: MarketingPlannerResult, suffix: string) {
  return `growth-finding-planner-${safeIdPart(result.storeScope.storeId)}-${safeIdPart(result.planningMonth)}-${safeIdPart(suffix)}`;
}

function buildActionId(result: MarketingPlannerResult, suffix: string) {
  return `growth-action-planner-${safeIdPart(result.storeScope.storeId)}-${safeIdPart(result.planningMonth)}-${safeIdPart(suffix)}`;
}

function buildSummaryFinding(result: MarketingPlannerResult, generatedAt: string): GrowthFinding {
  const topSources = [
    result.previousMonthBaseline ? "previous-month Shopify baseline" : null,
    result.customerVoice ? "Flashy reviews" : null,
    result.influencerIntelligence ? "affiliate/influencer data" : null,
    result.metaAds ? "Meta Ads daily/creative data" : null
  ].filter(Boolean);

  return {
    id: buildFindingId(result, "summary"),
    findingType: "marketing_planner_learning",
    severity: "info",
    metricName: "Marketing Planner",
    summary: `Marketing GANT generated for ${result.planningMonth} and stored as Growth Agent memory.`,
    possibleCauses: [
      `Store: ${result.storeScope.storeDomain}`,
      topSources.length ? `Data sources used: ${topSources.join(", ")}` : "Generated with limited connected data"
    ],
    recommendedActions: result.insights.recommendations.slice(0, 3).map((item) => item.recommendation),
    confidenceScore: confidenceFromResult(result),
    timestamp: generatedAt,
    sourceData: {
      source: "marketing_planner",
      planningMonth: result.planningMonth,
      fileName: result.fileName,
      focus: result.plannerFocus,
      campaigns: result.campaigns.length,
      recommendations: result.insights.recommendations.length
    }
  };
}

function buildIssueFindings(result: MarketingPlannerResult, generatedAt: string): GrowthFinding[] {
  return result.insights.issues.slice(0, 4).map((issue, index) => ({
    id: buildFindingId(result, `issue-${index}`),
    findingType: "marketing_planner_issue",
    severity: "warning" as const,
    metricName: "GANT issue",
    summary: compact(issue, 260),
    possibleCauses: [
      "Detected while translating the brief against last-month performance and connected channel data.",
      result.metaAds ? "Meta Ads daily/creative data was available." : "Meta Ads data was not fully available."
    ],
    recommendedActions: result.insights.recommendations.slice(0, 3).map((item) => item.recommendation),
    confidenceScore: confidenceFromResult(result),
    timestamp: generatedAt,
    sourceData: {
      source: "marketing_planner",
      planningMonth: result.planningMonth,
      issue,
      index
    }
  }));
}

function buildPerformanceFindings(result: MarketingPlannerResult, generatedAt: string): GrowthFinding[] {
  const findings: GrowthFinding[] = [];
  const bestCreative = result.metaAds?.topCreatives[0] ?? null;
  const bestCreator = result.influencerIntelligence?.topCreators[0] ?? null;

  if (result.previousMonthBaseline?.topProducts.length) {
    findings.push({
      id: buildFindingId(result, "previous-month-products"),
      findingType: "marketing_planner_previous_month",
      severity: "info",
      metricName: "Previous month winners",
      summary: `Previous-month product winners: ${result.previousMonthBaseline.topProducts.slice(0, 3).join(", ")}.`,
      possibleCauses: result.previousMonthBaseline.summaryLines.slice(0, 2),
      recommendedActions: [
        "Use the winning products as offer, content, or landing-page anchors in the next GANT.",
        "Check whether the brief gives them enough site, email, and paid support."
      ],
      confidenceScore: confidenceFromResult(result),
      timestamp: generatedAt,
      sourceData: {
        source: "marketing_planner",
        planningMonth: result.planningMonth,
        previousMonthBaseline: {
          monthLabel: result.previousMonthBaseline.monthLabel,
          revenue: result.previousMonthBaseline.revenue,
          orders: result.previousMonthBaseline.orders,
          topProducts: result.previousMonthBaseline.topProducts,
          topDiscountCodes: result.previousMonthBaseline.topDiscountCodes
        }
      }
    });
  }

  if (bestCreative) {
    findings.push({
      id: buildFindingId(result, "best-meta-creative"),
      findingType: "marketing_planner_paid_ads",
      severity: "info",
      metricName: "Meta creative",
      summary: `Best synced Meta creative: ${bestCreative.creativeTitle ?? bestCreative.adName ?? bestCreative.campaignName}.`,
      possibleCauses: [
        `Spend ${Math.round(bestCreative.spend)}, purchases ${bestCreative.purchases}, ROAS ${bestCreative.purchaseRoas != null ? bestCreative.purchaseRoas.toFixed(2) : "n/a"}.`,
        bestCreative.creativePreviewUrl ? "Creative preview link is available." : "Creative preview link was not exposed by Meta."
      ],
      recommendedActions: [
        "Reuse the winning hook, offer, or format in the next campaign brief.",
        "Compare this creative against weak days before scaling budget."
      ],
      confidenceScore: confidenceFromResult(result),
      timestamp: generatedAt,
      sourceData: {
        source: "marketing_planner",
        planningMonth: result.planningMonth,
        creative: bestCreative
      }
    });
  }

  if (bestCreator) {
    findings.push({
      id: buildFindingId(result, "best-creator"),
      findingType: "marketing_planner_influencer",
      severity: "info",
      metricName: "Influencer winner",
      summary: `Best creator signal: ${bestCreator.name} with ${Math.round(bestCreator.sales)} sales and ${bestCreator.orders} orders.`,
      possibleCauses: [bestCreator.reason],
      recommendedActions: [
        "Use this creator as a benchmark for next-month influencer selection.",
        "Brief similar creators around the same product, format, or offer mechanics."
      ],
      confidenceScore: confidenceFromResult(result),
      timestamp: generatedAt,
      sourceData: {
        source: "marketing_planner",
        planningMonth: result.planningMonth,
        creator: bestCreator
      }
    });
  }

  return findings;
}

function actionTypeForRecommendation(recommendation: MarketingRecommendation): GrowthAction["actionType"] {
  const recommendationText = recommendation.recommendation.toLowerCase();
  const placementText = recommendation.ganttPlacement.toLowerCase();
  if (recommendationText.includes("creative") || recommendationText.includes("reel") || recommendationText.includes("creator")) return "GENERATE_CREATIVE_BRIEF";
  if (
    recommendationText.includes("meta")
    || recommendationText.includes("paid ads")
    || recommendationText.includes("ad campaign")
    || placementText.includes("meta paid")
  ) return "CREATE_AD_DRAFT";
  return "CREATE_RECOMMENDATION";
}

function buildRecommendationActions(result: MarketingPlannerResult, generatedAt: string): GrowthAction[] {
  return result.insights.recommendations.slice(0, 5).map((recommendation, index) => ({
    id: buildActionId(result, `recommendation-${index}`),
    actionType: actionTypeForRecommendation(recommendation),
    status: "recommended",
    title: compact(`[${recommendation.impact}] ${recommendation.recommendation}`, 180),
    reason: compact(`${recommendation.why} Placement: ${recommendation.ganttPlacement}`, 360),
    payload: {
      source: "marketing_planner",
      planningMonth: result.planningMonth,
      focus: result.plannerFocus,
      recommendation,
      fileName: result.fileName
    },
    estimatedImpact: {
      impact: recommendation.impact,
      expectedOutcome: recommendation.why,
      ganttPlacement: recommendation.ganttPlacement
    },
    riskLevel: riskFromImpact(recommendation.impact),
    confidenceScore: confidenceFromResult(result),
    approvalRequired: false,
    createdAt: generatedAt
  }));
}

async function savePlannerMetricSnapshot(result: MarketingPlannerResult, generatedAt: string) {
  await createGrowthMetricSnapshot({
    source: "marketing_planner_gant",
    bucketedAt: generatedAt,
    confidenceScore: confidenceFromResult(result),
    metrics: {
      planningMonth: result.planningMonth,
      fileName: result.fileName,
      focus: result.plannerFocus,
      executionMode: result.executionMode,
      campaigns: result.campaigns.length,
      specialDays: result.specialDays.length,
      recommendations: result.insights.recommendations.length,
      issues: result.insights.issues.length,
      previousMonthRevenue: result.previousMonthBaseline?.revenue ?? null,
      previousMonthOrders: result.previousMonthBaseline?.orders ?? null,
      previousMonthTopProducts: result.previousMonthBaseline?.topProducts ?? [],
      metaSpend: result.metaAds?.totalSpend ?? null,
      metaPurchases: result.metaAds?.totalPurchases ?? null,
      metaAverageRoas: result.metaAds?.averagePurchaseRoas ?? null,
      metaTopCreatives: result.metaAds?.topCreatives.slice(0, 3).map((creative) => ({
        adName: creative.adName,
        creativeTitle: creative.creativeTitle,
        campaignName: creative.campaignName,
        spend: creative.spend,
        purchases: creative.purchases,
        roas: creative.purchaseRoas,
        previewUrl: creative.creativePreviewUrl ?? creative.creativePermalinkUrl ?? creative.creativeObjectUrl ?? null
      })) ?? [],
      topCreators: result.influencerIntelligence?.topCreators.slice(0, 3).map((creator) => ({
        name: creator.name,
        sales: creator.sales,
        orders: creator.orders,
        clicks: creator.clicks
      })) ?? [],
      customerVoiceTopics: [
        ...(result.customerVoice?.positiveTopics.slice(0, 3) ?? []),
        ...(result.customerVoice?.negativeTopics.slice(0, 3) ?? [])
      ].map((topic) => ({
        label: topic.label,
        sentiment: topic.sentiment,
        mentions: topic.mentions,
        summary: topic.summary
      }))
    }
  }, result.storeScope.storeId ?? undefined);
}

export async function saveMarketingPlannerLearnings(result: MarketingPlannerResult) {
  if (!result.storeScope.connected || !result.storeScope.storeId) {
    return { ok: true, skipped: true, reason: "No connected store in planner result." };
  }

  const generatedAt = new Date().toISOString();
  const findings = [
    buildSummaryFinding(result, generatedAt),
    ...buildIssueFindings(result, generatedAt),
    ...buildPerformanceFindings(result, generatedAt)
  ];
  const actions = buildRecommendationActions(result, generatedAt);

  await Promise.all([
    upsertGrowthFindings(findings, result.storeScope.storeId),
    upsertGrowthActions(actions, result.storeScope.storeId),
    savePlannerMetricSnapshot(result, generatedAt)
  ]);

  return {
    ok: true,
    findings: findings.length,
    actions: actions.length,
    snapshot: true
  };
}
