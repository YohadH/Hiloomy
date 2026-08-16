import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentStoreContext, getGrowthAttributionSessions, getGrowthFindings, getGrowthMetricSnapshots, getGrowthWebhookEvents } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthFindingsList } from "@/components/growth-agent/findings-list";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";

export default async function GrowthAgentHistoryPage() {
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, findings, snapshots, webhooks, sessions] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthFindings(store.id),
    getGrowthMetricSnapshots(store.id),
    getGrowthWebhookEvents(store.id),
    getGrowthAttributionSessions(store.id)
  ]);

  const snapshotRows = snapshots.map((snapshot: any) => ({
    id: snapshot.id,
    source: snapshot.source,
    bucketedAt: new Date(snapshot.bucketedAt).toLocaleString("en-US"),
    confidence: snapshot.confidenceScore ? `${Math.round(snapshot.confidenceScore * 100)}%` : "-"
  }));

  const webhookRows = webhooks.map((event: any) => ({
    id: event.id,
    platform: event.platform,
    topic: event.topic,
    status: event.status,
    processedAt: event.processedAt ? new Date(event.processedAt).toLocaleString("en-US") : "-",
    createdAt: new Date(event.createdAt).toLocaleString("en-US")
  }));

  const sessionRows = sessions.map((session: any) => ({
    id: session.id,
    affiliate: session.affiliateName,
    ref: session.affiliateCode ?? "-",
    clickId: session.clickId,
    sourcePlatform: session.sourcePlatform ?? "-",
    coupon: session.couponCode ?? "-",
    convertedAt: session.convertedAt ? new Date(session.convertedAt).toLocaleString("en-US") : "-"
  }));

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Growth Agent"
          title="Alerts / History"
          description="Recent findings, webhook processing history, attribution sessions, and the underlying metric snapshot log used by the monitoring engine."
        />
        <GrowthAgentNav />
      </section>

      <GrowthAgentManualControls storeId={store.id} />
      <GrowthFindingsList findings={findings} title="Findings history" />
      <section className="grid gap-4 xl:grid-cols-2">
        <DataTable title="Webhook history" columns={[{ key: "platform", label: "Platform" }, { key: "topic", label: "Topic" }, { key: "status", label: "Status" }, { key: "processedAt", label: "Processed" }, { key: "createdAt", label: "Received" }]} rows={webhookRows} />
        <DataTable title="Attribution sessions" columns={[{ key: "affiliate", label: "Affiliate" }, { key: "ref", label: "ref" }, { key: "clickId", label: "Click ID" }, { key: "sourcePlatform", label: "Source" }, { key: "coupon", label: "Coupon" }, { key: "convertedAt", label: "Converted" }]} rows={sessionRows} />
      </section>
      <DataTable title="Metric snapshots" columns={[{ key: "source", label: "Source" }, { key: "bucketedAt", label: "Bucket" }, { key: "confidence", label: "Confidence" }]} rows={snapshotRows} />
    </AppShell>
  );
}
