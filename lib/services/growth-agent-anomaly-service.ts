import type { GrowthFinding, GrowthMonitoringCard, GrowthTrafficChannel } from "@/lib/domain/growth-agent-types";
import { getGrowthAgentSettings, getGrowthMetricSnapshots } from "@/lib/services/growth-agent-service";

function percentDelta(current: number, baseline: number) {
  if (!baseline) return 0;
  return ((current - baseline) / baseline) * 100;
}

function severityFromDrop(drop: number, threshold: number): "info" | "warning" | "critical" {
  const magnitude = Math.abs(drop);
  if (magnitude >= threshold * 1.5) return "critical";
  if (magnitude >= threshold) return "warning";
  return "info";
}

function metricStatusFromDelta(delta: number, threshold: number): "normal" | "warning" | "critical" {
  const magnitude = Math.abs(delta);
  if (magnitude >= threshold * 1.5) return "critical";
  if (magnitude >= threshold) return "warning";
  return "normal";
}

function readLatestSnapshotMetrics(snapshots: Awaited<ReturnType<typeof getGrowthMetricSnapshots>>) {
  const latest = snapshots[0];
  if (!latest) return null;
  const metrics = latest.metrics as any;
  return {
    latest,
    current: metrics.current ?? {},
    yesterday: metrics.yesterday ?? {},
    last7Days: metrics.last7Days ?? {},
    sameWeekdayLastWeek: metrics.sameWeekdayLastWeek ?? {},
    trafficByChannel: (metrics.current?.trafficByChannel ?? []) as GrowthTrafficChannel[],
    topProducts: metrics.current?.topProducts ?? [],
    inventoryHighlights: metrics.current?.inventoryHighlights ?? []
  };
}

export async function runGrowthAgentAnomalyDetection(storeId?: string) {
  const [settings, snapshots] = await Promise.all([
    getGrowthAgentSettings(storeId),
    getGrowthMetricSnapshots(storeId)
  ]);

  const snapshotData = readLatestSnapshotMetrics(snapshots);
  if (!snapshotData) {
    return {
      monitoringCards: [] as GrowthMonitoringCard[],
      findings: [] as GrowthFinding[],
      trafficChannels: [] as GrowthTrafficChannel[],
      confidence: 0
    };
  }

  const { current, yesterday, last7Days, sameWeekdayLastWeek, trafficByChannel, inventoryHighlights } = snapshotData;
  const currentSessions = Number(current.sessions ?? 0);
  const currentOrders = Number(current.orders ?? 0);
  const currentConversionRate = Number(current.conversionRate ?? 0) * 100;
  const currentAov = Number(current.averageOrderValue ?? 0);
  const currentRevenue = Number(current.revenue ?? 0);
  const currentReturning = Number(current.returningCustomers ?? 0);
  const trackingConfidence = Number(current.trackingConfidence ?? 0.62);

  const sessionsDeltaYesterday = percentDelta(currentSessions, Number(yesterday.sessions ?? currentSessions));
  const sessionsDelta7d = percentDelta(currentSessions, Number(last7Days.sessions ?? currentSessions));
  const ordersDeltaYesterday = percentDelta(currentOrders, Number(yesterday.orders ?? currentOrders));
  const ordersDelta7d = percentDelta(currentOrders, Number(last7Days.orders ?? currentOrders));
  const conversionDeltaYesterday = percentDelta(currentConversionRate, Number(yesterday.conversionRate ?? currentConversionRate) * 100);
  const conversionDelta7d = percentDelta(currentConversionRate, Number(last7Days.conversionRate ?? currentConversionRate) * 100);
  const aovDeltaYesterday = percentDelta(currentAov, Number(yesterday.averageOrderValue ?? currentAov));
  const aovDelta7d = percentDelta(currentAov, Number(last7Days.averageOrderValue ?? currentAov));
  const revenueDeltaYesterday = percentDelta(currentRevenue, Number(yesterday.revenue ?? currentRevenue));
  const revenueDelta7d = percentDelta(currentRevenue, Number(last7Days.revenue ?? currentRevenue));
  const returningDeltaYesterday = percentDelta(currentReturning, Number(yesterday.returningCustomers ?? currentReturning));
  const returningDelta7d = percentDelta(currentReturning, Number(last7Days.returningCustomers ?? currentReturning));

  const monitoringCards: GrowthMonitoringCard[] = [
    {
      key: "sessions",
      label: "Sessions",
      unit: "number",
      data: { current: currentSessions, previousDayDelta: sessionsDeltaYesterday, last7DaysDelta: sessionsDelta7d, status: metricStatusFromDelta(sessionsDelta7d, settings.thresholds.sessionsDropPercent), confidence: trackingConfidence }
    },
    {
      key: "orders",
      label: "Orders",
      unit: "number",
      data: { current: currentOrders, previousDayDelta: ordersDeltaYesterday, last7DaysDelta: ordersDelta7d, status: metricStatusFromDelta(ordersDelta7d, settings.thresholds.ordersDropPercent), confidence: 0.9 }
    },
    {
      key: "conversionRate",
      label: "Conversion Rate",
      unit: "percent",
      data: { current: currentConversionRate, previousDayDelta: conversionDeltaYesterday, last7DaysDelta: conversionDelta7d, status: metricStatusFromDelta(conversionDelta7d, settings.thresholds.conversionRateDropPercent), confidence: trackingConfidence }
    },
    {
      key: "aov",
      label: "AOV",
      unit: "currency",
      data: { current: currentAov, previousDayDelta: aovDeltaYesterday, last7DaysDelta: aovDelta7d, status: metricStatusFromDelta(aovDelta7d, settings.thresholds.aovDropPercent), confidence: 0.88 }
    },
    {
      key: "revenue",
      label: "Revenue",
      unit: "currency",
      data: { current: currentRevenue, previousDayDelta: revenueDeltaYesterday, last7DaysDelta: revenueDelta7d, status: metricStatusFromDelta(revenueDelta7d, settings.thresholds.ordersDropPercent), confidence: 0.91 }
    },
    {
      key: "returningCustomers",
      label: "Returning Customers",
      unit: "percent",
      data: { current: currentReturning, previousDayDelta: returningDeltaYesterday, last7DaysDelta: returningDelta7d, status: metricStatusFromDelta(returningDelta7d, settings.thresholds.returningCustomerDropPercent), confidence: 0.83 }
    }
  ];

  const findings: GrowthFinding[] = [];

  if (sessionsDelta7d <= -settings.thresholds.sessionsDropPercent) {
    findings.push({
      id: `finding-sessions-${snapshotData.latest.id}`,
      findingType: "traffic_drop",
      severity: severityFromDrop(sessionsDelta7d, settings.thresholds.sessionsDropPercent),
      metricName: "sessions",
      summary: `Sessions down ${Math.abs(sessionsDelta7d).toFixed(1)}% versus the 7-day baseline.`,
      possibleCauses: [
        "Traffic source delivery is softer than normal",
        "Tracking coverage may have changed across channels"
      ],
      recommendedActions: [
        "Check acquisition channel health before changing site conversion elements",
        "Verify analytics and pixel coverage"
      ],
      confidenceScore: Math.max(trackingConfidence, 0.7),
      timestamp: snapshotData.latest.bucketedAt,
      sourceData: { delta7d: sessionsDelta7d, deltaYesterday: sessionsDeltaYesterday, sameWeekdayLastWeek }
    });
  }

  if (ordersDelta7d <= -settings.thresholds.ordersDropPercent) {
    findings.push({
      id: `finding-orders-${snapshotData.latest.id}`,
      findingType: "orders_drop",
      severity: severityFromDrop(ordersDelta7d, settings.thresholds.ordersDropPercent),
      metricName: "orders",
      summary: `Orders down ${Math.abs(ordersDelta7d).toFixed(1)}% versus the 7-day baseline.`,
      possibleCauses: currentConversionRate >= Number(last7Days.conversionRate ?? 0) * 100
        ? ["Traffic decline is the larger factor", "Product demand is stable but reach is down"]
        : ["Store conversion may be weaker", "Merchandising or checkout friction increased"],
      recommendedActions: currentConversionRate >= Number(last7Days.conversionRate ?? 0) * 100
        ? ["Audit paid and organic traffic sources first", "Avoid budget increases until tracking is confirmed"]
        : ["Review checkout behavior, PDP changes, and in-stock availability"],
      confidenceScore: 0.84,
      timestamp: snapshotData.latest.bucketedAt,
      sourceData: { delta7d: ordersDelta7d, conversionDelta7d }
    });
  }

  if (conversionDelta7d <= -settings.thresholds.conversionRateDropPercent && sessionsDelta7d > -settings.thresholds.sessionsDropPercent / 2) {
    findings.push({
      id: `finding-conversion-${snapshotData.latest.id}`,
      findingType: "conversion_drop",
      severity: severityFromDrop(conversionDelta7d, settings.thresholds.conversionRateDropPercent),
      metricName: "conversion_rate",
      summary: `Conversion rate dropped ${Math.abs(conversionDelta7d).toFixed(1)}% while sessions were relatively stable.`,
      possibleCauses: ["Product page, offer, or checkout friction likely increased", "Inventory or merchandising issues may be impacting purchase intent"],
      recommendedActions: ["Review checkout funnel and hero SKU inventory", "Pause any scale-up action until conversion normalizes"],
      confidenceScore: 0.86,
      timestamp: snapshotData.latest.bucketedAt,
      sourceData: { conversionDelta7d, sessionsDelta7d }
    });
  }

  const weakChannel = trafficByChannel
    .filter((channel) => channel.delta <= -settings.thresholds.trafficSourceDropPercent)
    .sort((left, right) => left.delta - right.delta)[0];
  if (weakChannel) {
    findings.push({
      id: `finding-channel-${snapshotData.latest.id}`,
      findingType: "traffic_source_drop",
      severity: severityFromDrop(weakChannel.delta, settings.thresholds.trafficSourceDropPercent),
      metricName: weakChannel.channel,
      summary: `${weakChannel.channel} traffic is down ${Math.abs(weakChannel.delta).toFixed(1)}%.`,
      possibleCauses: ["Campaign delivery weakened", "Source-specific tracking or content cadence changed"],
      recommendedActions: ["Inspect this channel before changing other levers", "Only draft paid recovery actions if confidence remains high"],
      confidenceScore: weakChannel.confidence,
      timestamp: snapshotData.latest.bucketedAt,
      sourceData: { channel: weakChannel.channel, delta: weakChannel.delta }
    });
  }

  if ((inventoryHighlights as any[]).length > 0) {
    findings.push({
      id: `finding-inventory-${snapshotData.latest.id}`,
      findingType: "inventory_risk",
      severity: "warning",
      metricName: "inventory",
      summary: `Top product inventory is under the guardrail threshold for ${(inventoryHighlights as any[])[0]?.title ?? "a leading SKU"}.`,
      possibleCauses: ["Strong demand depleted inventory", "Restock timing may lag demand recovery"],
      recommendedActions: ["Block paid scale actions for low-inventory products", "Review replenishment timing before traffic expansion"],
      confidenceScore: 0.91,
      timestamp: snapshotData.latest.bucketedAt,
      sourceData: { inventoryHighlights }
    });
  }

  if (trackingConfidence < settings.guardrails.minConfidenceScore) {
    findings.push({
      id: `finding-confidence-${snapshotData.latest.id}`,
      findingType: "tracking_confidence_low",
      severity: settings.guardrails.blockIfTrackingConfidenceLow ? "critical" : "warning",
      metricName: "tracking_confidence",
      summary: `Tracking confidence is ${Math.round(trackingConfidence * 100)}%, below the configured action threshold.`,
      possibleCauses: ["Traffic source coverage is incomplete", "Cross-source attribution is only partially connected"],
      recommendedActions: ["Do not auto-execute paid actions", "Connect an analytics source or validate UTM/pixel coverage"],
      confidenceScore: trackingConfidence,
      timestamp: snapshotData.latest.bucketedAt,
      sourceData: { trackingConfidence }
    });
  }

  if (!findings.length) {
    findings.push({
      id: `finding-healthy-${snapshotData.latest.id}`,
      findingType: "healthy_state",
      severity: "info",
      metricName: "monitoring",
      summary: "No material growth issues crossed the configured thresholds in the latest scan.",
      possibleCauses: ["Store performance is within the current baseline window"],
      recommendedActions: ["Keep monitoring active and review the next scheduled scan"],
      confidenceScore: 0.78,
      timestamp: snapshotData.latest.bucketedAt,
      sourceData: { trackingConfidence }
    });
  }

  return {
    monitoringCards,
    findings,
    trafficChannels: trafficByChannel,
    confidence: trackingConfidence
  };
}
