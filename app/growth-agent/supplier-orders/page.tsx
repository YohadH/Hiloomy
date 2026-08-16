import { AmazonSupplierOrderManager } from "@/components/growth-agent/amazon-supplier-order-manager";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAmazonSupplierOrdersWorkspace } from "@/lib/services/amazon-supplier-order-service";
import { getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";

export default async function GrowthAgentSupplierOrdersPage() {
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, workspace] = await Promise.all([
    getAppChromeData(store.id),
    getAmazonSupplierOrdersWorkspace(store.id)
  ]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Growth Agent"
          title="Amazon Supplier Drafts"
          description="Map sourced products to an Amazon ASIN or supplier URL, then turn real Shopify orders into reviewable supplier drafts before anyone places the order manually."
        />
        <GrowthAgentNav />
      </section>

      <GrowthAgentManualControls storeId={store.id} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How this flow works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Save a supplier mapping for a sourced product using an Amazon ASIN or another supplier URL.</p>
          <p>2. Pick a real Shopify order line item and create a supplier draft.</p>
          <p>3. Review the supplier link, notes, and quantity, then manually approve the draft before placing the order yourself.</p>
        </CardContent>
      </Card>

      <AmazonSupplierOrderManager workspace={workspace} />
    </AppShell>
  );
}
