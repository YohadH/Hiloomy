import { AmazonSupplierOrderManager } from "@/components/growth-agent/amazon-supplier-order-manager";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAmazonSupplierOrdersWorkspace } from "@/lib/services/amazon-supplier-order-service";
import { getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { getAppLocale } from "@/lib/i18n";

export default async function GrowthAgentSupplierOrdersPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const { store } = await getGrowthAgentStoreContext();
  const [chrome, workspace] = await Promise.all([
    getAppChromeData(store.id),
    getAmazonSupplierOrdersWorkspace(store.id)
  ]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("סוכן הצמיחה", "Growth Agent")}
          title={lang("טיוטות ספק ב-Amazon", "Amazon Supplier Drafts")}
          description={lang(
            "מפו מוצרים שנמצאו למזהה ASIN של Amazon או לכתובת ספק, ואז הפכו הזמנות Shopify אמיתיות לטיוטות הזמנת ספק שאפשר לבדוק לפני שמישהו מבצע את ההזמנה ידנית.",
            "Map sourced products to an Amazon ASIN or supplier URL, then turn real Shopify orders into reviewable supplier drafts before anyone places the order manually."
          )}
        />
        <GrowthAgentNav locale={locale} />
      </section>

      <GrowthAgentManualControls storeId={store.id} locale={locale} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang("איך התהליך עובד", "How this flow works")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{lang("1. שמרו מיפוי ספק למוצר שנמצא, באמצעות מזהה ASIN של Amazon או כתובת ספק אחרת.", "1. Save a supplier mapping for a sourced product using an Amazon ASIN or another supplier URL.")}</p>
          <p>{lang("2. בחרו שורת מוצר בהזמנת Shopify אמיתית וצרו טיוטת הזמנת ספק.", "2. Pick a real Shopify order line item and create a supplier draft.")}</p>
          <p>{lang("3. בדקו את קישור הספק, ההערות והכמות, ואז אשרו את הטיוטה ידנית לפני שאתם מבצעים את ההזמנה בעצמכם.", "3. Review the supplier link, notes, and quantity, then manually approve the draft before placing the order yourself.")}</p>
        </CardContent>
      </Card>

      <AmazonSupplierOrderManager workspace={workspace} locale={locale} />
    </AppShell>
  );
}
