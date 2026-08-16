import type { GrowthAction, GrowthActionType, GrowthFinding, GrowthPlatformConnection } from "@/lib/domain/growth-agent-types";
import { getConnectorDefinition } from "@/lib/services/growth-agent-connectors";
import { createGrowthActions, getGrowthActions, getGrowthAgentSettings, getGrowthPlatformConnections, updateGrowthActionStatus } from "@/lib/services/growth-agent-service";

function actionTypeForFinding(finding: GrowthFinding): GrowthActionType {
  switch (finding.findingType) {
    case "traffic_drop":
      return "SEND_ALERT";
    case "traffic_source_drop":
      return "CREATE_RECOMMENDATION";
    case "conversion_drop":
      return "GENERATE_CREATIVE_BRIEF";
    case "inventory_risk":
      return "PAUSE_CAMPAIGN";
    default:
      return "CREATE_RECOMMENDATION";
  }
}

function requiredPlatforms(actionType: GrowthActionType): GrowthPlatformConnection["platform"][] {
  switch (actionType) {
    case "PUBLISH_SOCIAL_POST":
    case "DRAFT_SOCIAL_POST":
      return ["instagram"];
    case "CREATE_AD_DRAFT":
    case "LAUNCH_AD_CAMPAIGN":
    case "SCALE_CAMPAIGN":
    case "PAUSE_CAMPAIGN":
      return ["metaAds"];
    default:
      return [];
  }
}

function allowedBySettings(actionType: GrowthActionType, settings: Awaited<ReturnType<typeof getGrowthAgentSettings>>) {
  switch (actionType) {
    case "SEND_ALERT":
      return settings.allowedActions.sendAlert;
    case "CREATE_RECOMMENDATION":
      return settings.allowedActions.createRecommendation;
    case "GENERATE_CREATIVE_BRIEF":
      return settings.allowedActions.createCreativeBrief;
    case "DRAFT_SOCIAL_POST":
      return settings.allowedActions.draftOrganicPost;
    case "PUBLISH_SOCIAL_POST":
      return settings.allowedActions.publishOrganicPost;
    case "CREATE_AD_DRAFT":
      return settings.allowedActions.createAdCampaignDraft;
    case "LAUNCH_AD_CAMPAIGN":
      return settings.allowedActions.launchAdCampaign;
    case "SCALE_CAMPAIGN":
      return settings.allowedActions.scaleExistingCampaign;
    case "PAUSE_CAMPAIGN":
      return settings.allowedActions.pauseCampaign;
    default:
      return false;
  }
}

function approvalRequired(actionType: GrowthActionType, confidence: number, settings: Awaited<ReturnType<typeof getGrowthAgentSettings>>) {
  if (settings.agentMode === "recommendation_only") return false;
  if (settings.agentMode === "approval_required") return true;
  if (actionType === "LAUNCH_AD_CAMPAIGN" && settings.approvalRules.requireApprovalForCampaignLaunch) return true;
  if (actionType === "SCALE_CAMPAIGN" && settings.approvalRules.requireApprovalForScaling) return true;
  if (actionType === "PUBLISH_SOCIAL_POST" && settings.approvalRules.requireApprovalForPublishingPost) return true;
  return confidence < settings.guardrails.minConfidenceScore;
}

function hasPlatformConnections(actionType: GrowthActionType, connections: GrowthPlatformConnection[]) {
  const required = requiredPlatforms(actionType);
  return required.every((platform) => connections.some((connection) => connection.platform === platform && connection.status === "connected"));
}

function canAutoExecute(actionType: GrowthActionType, finding: GrowthFinding, settings: Awaited<ReturnType<typeof getGrowthAgentSettings>>, connections: GrowthPlatformConnection[]) {
  if (settings.agentMode !== "auto_execute") return false;
  if (!allowedBySettings(actionType, settings)) return false;
  if (finding.confidenceScore < settings.guardrails.minConfidenceScore) return false;
  if (settings.guardrails.blockIfTrackingConfidenceLow && finding.findingType === "tracking_confidence_low") return false;
  if (!hasPlatformConnections(actionType, connections)) return requiredPlatforms(actionType).length === 0;
  return true;
}

export async function buildGrowthActionsFromFindings(findings: GrowthFinding[], storeId?: string) {
  const [settings, connections, existingActions] = await Promise.all([
    getGrowthAgentSettings(storeId),
    getGrowthPlatformConnections(storeId),
    getGrowthActions(storeId)
  ]);
  const existingTitles = new Set(existingActions.map((action) => `${action.actionType}:${action.title}`));

  const actions = findings.flatMap((finding, index) => {
    const actionType = actionTypeForFinding(finding);
    if (!allowedBySettings(actionType, settings)) return [];

    const title = finding.findingType === "product_opportunity"
      ? `Review sourced product idea: ${finding.metricName}`
      : actionType === "SEND_ALERT"
        ? `Notify team: ${finding.summary}`
        : actionType === "PAUSE_CAMPAIGN"
          ? `Pause risky spend around low inventory: ${finding.metricName}`
          : actionType === "GENERATE_CREATIVE_BRIEF"
            ? `Generate a creative recovery brief for ${finding.metricName}`
            : `Create recommendation for ${finding.metricName}`;

    const dedupeKey = `${actionType}:${title}`;
    if (existingTitles.has(dedupeKey)) return [];

    const needsApproval = approvalRequired(actionType, finding.confidenceScore, settings);
    const hasRequiredConnections = hasPlatformConnections(actionType, connections);
    const blockedBecauseMissingConnector = requiredPlatforms(actionType).length > 0 && !hasRequiredConnections;
    const blockedBecauseLowConfidence = settings.guardrails.blockIfTrackingConfidenceLow && finding.confidenceScore < settings.guardrails.minConfidenceScore && actionType !== "SEND_ALERT";

    let status: GrowthAction["status"] = "recommended";
    let failureReason: string | null = null;
    let executedAt: string | null = null;

    if (blockedBecauseMissingConnector) {
      status = "blocked";
      failureReason = "Required connector is not connected.";
    } else if (blockedBecauseLowConfidence) {
      status = "blocked";
      failureReason = "Tracking confidence is below the merchant threshold.";
    } else if (canAutoExecute(actionType, finding, settings, connections)) {
      status = "executed";
      executedAt = new Date().toISOString();
    } else if (needsApproval) {
      status = "pending_approval";
    }

    return [{
      id: `growth-action-${Date.now()}-${index}`,
      actionType,
      status,
      title,
      reason: finding.summary,
      payload: {
        findingId: finding.id,
        metricName: finding.metricName,
        findingType: finding.findingType,
        dryRun: status !== "executed"
      },
      estimatedImpact: {
        expectedOutcome: finding.recommendedActions[0] ?? "Review issue",
        confidenceBand: finding.confidenceScore
      },
      riskLevel: actionType === "PAUSE_CAMPAIGN" ? "medium" : actionType === "SEND_ALERT" ? "low" : "medium",
      confidenceScore: finding.confidenceScore,
      approvalRequired: needsApproval,
      executedAt,
      failureReason,
      createdAt: new Date().toISOString()
    } satisfies GrowthAction];
  });

  await createGrowthActions(actions, storeId);
  return actions;
}

export async function approveGrowthAction(actionId: string, approvedBy = "merchant", storeId?: string) {
  await updateGrowthActionStatus({
    actionId,
    status: "executed",
    approvedBy,
    executedAt: new Date().toISOString()
  }, storeId);
  return { ok: true };
}

export async function rejectGrowthAction(actionId: string, approvedBy = "merchant", storeId?: string) {
  await updateGrowthActionStatus({
    actionId,
    status: "rejected",
    approvedBy,
    failureReason: "Rejected by merchant approval flow."
  }, storeId);
  return { ok: true };
}

export function summarizeExecutablePlatforms(connections: GrowthPlatformConnection[]) {
  return connections
    .filter((connection) => {
      const definition = getConnectorDefinition(connection.platform);
      return definition?.supportsExecution && connection.status === "connected";
    })
    .map((connection) => connection.platform);
}
