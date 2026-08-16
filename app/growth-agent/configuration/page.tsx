import { GrowthAgentConfigurationManager } from "@/components/growth-agent/configuration-manager";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentSettings, getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";

export default async function GrowthAgentConfigurationPage() {
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, settings] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthAgentSettings(store.id)
  ]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Growth Agent"
          title="Configuration"
          description="Merchant-controlled thresholds, notifications, automation permissions, budgets, confidence gates, approval rules, and product crawler sources."
        />
        <GrowthAgentNav />
      </section>

      <GrowthAgentConfigurationManager initialSettings={settings} storeId={store.id} />
    </AppShell>
  );
}
