import { getAppLocale } from "@/lib/i18n";
import { getAnalyticsRepository } from "@/lib/repositories";
import type { GrowthOverviewPayload, GrowthProductRecommendation } from "@/lib/domain/growth-agent-types";
import { describeAbsoluteRange, getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { buildGrowthActionsFromFindings } from "@/lib/services/growth-agent-action-engine";
import { runGrowthAgentAnomalyDetection } from "@/lib/services/growth-agent-anomaly-service";
import {
  ensureGrowthAgentDefaults,
  getGrowthActions,
  getGrowthAgentSettings,
  getGrowthAgentStoreContext,
  getGrowthFindings,
  getGrowthMetricSnapshots,
  getGrowthPlatformConnections,
  replaceGrowthFindings
} from "@/lib/services/growth-agent-service";
import { getGrowthAgentProductRecommendations } from "@/lib/services/growth-agent-product-crawler-service";
import { runGrowthAgentManualSync } from "@/lib/services/growth-agent-sync-service";

function extractProductRecommendations(findings: GrowthOverviewPayload["findings"]): GrowthProductRecommendation[] {
  return findings
    .filter((finding) => finding.findingType === "product_opportunity" && finding.sourceData?.recommendation)
    .map((finding) => finding.sourceData?.recommendation)
    .filter((item): item is GrowthProductRecommendation => Boolean(item));
}

export async function runGrowthAgentManualScan(storeId?: string) {
  const { store } = await getGrowthAgentStoreContext(storeId);
  await ensureGrowthAgentDefaults(store.id);
  await runGrowthAgentManualSync(store.id);
  const [anomalyResult, settings, productRecommendations] = await Promise.all([
    runGrowthAgentAnomalyDetection(store.id),
    getGrowthAgentSettings(store.id),
    getGrowthAgentProductRecommendations(store.id)
  ]);

  const crawlerFindings = productRecommendations.map((recommendation) => ({
    id: `finding-product-${recommendation.id}`,
    findingType: "product_opportunity",
    severity: "info" as const,
    metricName: recommendation.title,
    summary: `Potential product opportunity found: ${recommendation.title}.`,
    possibleCauses: [
      `Matched source: ${recommendation.sourceDomain}`,
      recommendation.price ? `Observed price point: ${recommendation.price}` : "No public price detected"
    ],
    recommendedActions: [
      `Review supplier page: ${recommendation.sourceUrl}`,
      recommendation.matchedKeywords.length ? `Matched keywords: ${recommendation.matchedKeywords.join(", ")}` : "Compare this product against your current catalog positioning"
    ],
    confidenceScore: Math.min(0.96, Math.max(0.61, recommendation.score / 100)),
    timestamp: new Date().toISOString(),
    sourceData: {
      recommendation,
      sourceUrl: recommendation.sourceUrl,
      sourceDomain: recommendation.sourceDomain
    }
  }));

  const allFindings = settings.productResearch.enabled
    ? [...anomalyResult.findings, ...crawlerFindings]
    : anomalyResult.findings;

  await replaceGrowthFindings(allFindings, store.id);
  const actions = await buildGrowthActionsFromFindings(allFindings, store.id);

  return {
    ok: true,
    findingsCount: allFindings.length,
    actionsCreated: actions.length,
    confidence: anomalyResult.confidence,
    productRecommendations: productRecommendations.length,
    scannedAt: new Date().toISOString()
  };
}

export async function getGrowthAgentOverview(storeId?: string): Promise<GrowthOverviewPayload> {
  const { store } = await getGrowthAgentStoreContext(storeId);
  await ensureGrowthAgentDefaults(store.id);

  const locale = await getAppLocale();
  const repository = await getAnalyticsRepository();
  const reportingRange = await getReportingDateRangeSelection(locale);

  const [settings, snapshots, connections, findings, actions, anomalyResult, orders, products] = await Promise.all([
    getGrowthAgentSettings(store.id),
    getGrowthMetricSnapshots(store.id),
    getGrowthPlatformConnections(store.id),
    getGrowthFindings(store.id),
    getGrowthActions(store.id),
    runGrowthAgentAnomalyDetection(store.id),
    repository.getOrders(store.id),
    repository.getProducts(store.id)
  ]);

  const effectiveFindings = findings.length ? findings : anomalyResult.findings;
  const effectiveActions = actions;
  const alertsLast7Days = effectiveFindings.filter((finding) => Date.now() - new Date(finding.timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000).length;
  const productRecommendations = extractProductRecommendations(effectiveFindings);
  const comparisonWindow = reportingRange.comparison.enabled
    ? describeAbsoluteRange(reportingRange.comparison.start, reportingRange.comparison.end, locale)
    : null;

  return {
    status: settings.agentEnabled ? "active" : "paused",
    lastSyncTime: snapshots[0]?.bucketedAt ?? null,
    currentMode: settings.agentMode,
    connectedPlatforms: connections,
    activeRulesCount: Object.values(settings.allowedActions).filter(Boolean).length + Object.keys(settings.thresholds).length,
    alertsLast7Days,
    recentActionsTaken: effectiveActions.filter((action) => action.status === "executed").length,
    topDetectedIssues: effectiveFindings.filter((finding) => finding.severity !== "info").slice(0, 3),
    monitoringCards: anomalyResult.monitoringCards,
    trafficChannels: anomalyResult.trafficChannels,
    findings: effectiveFindings,
    actions: effectiveActions,
    productRecommendations,
    provenance: {
      storeId: store.id,
      storeName: store.name,
      storeDomain: store.domain,
      reportingLabel: reportingRange.label,
      reportingWindow: describeAbsoluteRange(reportingRange.start, reportingRange.end, locale),
      comparisonLabel: reportingRange.comparison.label,
      comparisonWindow,
      ordersAnalyzed: orders.length,
      productsAnalyzed: products.length,
      snapshotCount: snapshots.length,
      connectionCount: connections.length,
      lastSnapshotSource: snapshots[0]?.source ?? null
    }
  };
}
