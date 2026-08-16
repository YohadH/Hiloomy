import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentSettings, getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";

export default async function GrowthAgentRulesPage() {
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, settings] = await Promise.all([getAppChromeData(store.id), getGrowthAgentSettings(store.id)]);

  const thresholdRows = Object.entries(settings.thresholds).map(([metric, value]) => ({ metric, value: `${value}%` }));
  const allowedRows = Object.entries(settings.allowedActions).map(([action, enabled]) => ({ action, enabled: enabled ? "Enabled" : "Disabled" }));
  const approvalRows = Object.entries(settings.approvalRules).map(([rule, value]) => ({ rule, value: String(value) }));

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Growth Agent"
          title="Rules & Automations"
          description="A clear operational view of thresholds, allowed action types, and approval requirements before any recommendation or execution is made."
        />
        <GrowthAgentNav />
      </section>

      <GrowthAgentManualControls storeId={store.id} />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Operating mode</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Mode: {settings.agentMode.replaceAll("_", " ")}</p>
            <p>Check frequency: every {settings.checkFrequencyMinutes} minutes</p>
            <p>Auto execution is blocked unless an action is both enabled and inside guardrails.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Guardrails</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Max daily budget: {settings.guardrails.maxDailyAdBudget} {chrome.store.currency}</p>
            <p>Max single action budget: {settings.guardrails.maxSingleActionBudget} {chrome.store.currency}</p>
            <p>Minimum confidence: {Math.round(settings.guardrails.minConfidenceScore * 100)}%</p>
            <p>Cooldown: {settings.guardrails.cooldownMinutesBetweenActions} minutes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Inventory safety</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Require inventory available: {settings.guardrails.requireInventoryAvailable ? "Yes" : "No"}</p>
            <p>Minimum inventory threshold: {settings.guardrails.minimumInventoryThreshold}</p>
            <p>Block if tracking confidence is low: {settings.guardrails.blockIfTrackingConfidenceLow ? "Yes" : "No"}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DataTable title="Thresholds" columns={[{ key: "metric", label: "Metric" }, { key: "value", label: "Threshold" }]} rows={thresholdRows} />
        <DataTable title="Allowed actions" columns={[{ key: "action", label: "Action" }, { key: "enabled", label: "Status" }]} rows={allowedRows} />
        <DataTable title="Approval rules" columns={[{ key: "rule", label: "Rule" }, { key: "value", label: "Value" }]} rows={approvalRows} />
      </section>
    </AppShell>
  );
}
