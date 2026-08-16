import { AppShell } from "@/components/layout/app-shell";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthConnectionsPanel } from "@/components/growth-agent/connections-panel";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentStoreContext, getGrowthPlatformConnections } from "@/lib/services/growth-agent-service";

export default async function GrowthAgentConnectionsPage() {
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, connections] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthPlatformConnections(store.id)
  ]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Growth Agent"
          title="Connections"
          description="Connector health for Shopify, traffic sources, social and ad platforms, and the product crawler used for sourcing ideas."
        />
        <GrowthAgentNav />
      </section>

      <GrowthAgentManualControls storeId={store.id} />
      <GrowthConnectionsPanel connections={connections} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection design notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Shopify uses the existing server-side token flow already in the app.</p>
          <p>Product Crawler works from public supplier, catalog, or product URLs that you configure in Growth Agent settings.</p>
          <p>Amazon Supplier Drafts stores manual ASIN or supplier URL mappings so you can review dropship-style order drafts before placing the supplier order yourself.</p>
          <p>Meta Ads, TikTok Ads, Facebook, and GA are scaffolded with stored platform records so OAuth, token refresh, and webhook sync can be added cleanly later.</p>
          <p>Instagram can reuse creator-commerce signals when that connector is already active.</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
