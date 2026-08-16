import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatCard } from "@/components/shared/stat-card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthActions, getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthActionCenter } from "@/components/growth-agent/action-center";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { formatNumber } from "@/lib/utils";

export default async function GrowthAgentActionCenterPage() {
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, actions] = await Promise.all([getAppChromeData(store.id), getGrowthActions(store.id)]);
  const pending = actions.filter((action) => action.status === "pending_approval");
  const recommended = actions.filter((action) => action.status === "recommended");
  const executed = actions.filter((action) => action.status === "executed");
  const rejected = actions.filter((action) => action.status === "rejected");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Growth Agent"
          title="Action Center"
          description="Recommendations, pending approvals, executed actions, and rejected items all live in one operational queue."
        />
        <GrowthAgentNav />
      </section>

      <GrowthAgentManualControls storeId={store.id} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recommended" value={formatNumber(recommended.length)} />
        <StatCard label="Pending approval" value={formatNumber(pending.length)} />
        <StatCard label="Executed" value={formatNumber(executed.length)} />
        <StatCard label="Rejected" value={formatNumber(rejected.length)} />
      </section>

      <GrowthActionCenter actions={actions} storeId={store.id} />
    </AppShell>
  );
}
