import { AppShell } from "@/components/layout/app-shell";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthConnectionsPanel } from "@/components/growth-agent/connections-panel";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentStoreContext, getGrowthPlatformConnections } from "@/lib/services/growth-agent-service";
import { getAppLocale } from "@/lib/i18n";

export default async function GrowthAgentConnectionsPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const { store } = await getGrowthAgentStoreContext();
  const [chrome, connections] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthPlatformConnections(store.id)
  ]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("סוכן הצמיחה", "Growth Agent")}
          title={lang("חיבורים", "Connections")}
          description={lang(
            "תקינות המחברים לShopify, למקורות התנועה, לרשתות החברתיות ולפלטפורמות הפרסום, וכן לקראולר המוצרים ששימש לאיתור רעיונות.",
            "Connector health for Shopify, traffic sources, social and ad platforms, and the product crawler used for sourcing ideas."
          )}
        />
        <GrowthAgentNav locale={locale} />
      </section>

      <GrowthAgentManualControls storeId={store.id} locale={locale} />
      <GrowthConnectionsPanel connections={connections} locale={locale} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang("הערות תכנון לחיבורים", "Connection design notes")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{lang("Shopify משתמש בזרימת הטוקן הקיימת בצד השרת של האפליקציה.", "Shopify uses the existing server-side token flow already in the app.")}</p>
          <p>{lang("קראולר המוצרים עובד מכתובות ציבוריות של ספקים, קטלוגים או מוצרים שאתם מגדירים בהגדרות סוכן הצמיחה.", "Product Crawler works from public supplier, catalog, or product URLs that you configure in Growth Agent settings.")}</p>
          <p>{lang("טיוטות ספק של Amazon שומרות מיפויים ידניים של ASIN או כתובת ספק, כך שתוכלו לבדוק טיוטות הזמנה בסגנון דרופשיפינג לפני שאתם מבצעים את ההזמנה אצל הספק בעצמכם.", "Amazon Supplier Drafts stores manual ASIN or supplier URL mappings so you can review dropship-style order drafts before placing the supplier order yourself.")}</p>
          <p>{lang("Meta Ads, TikTok Ads, Facebook וGA בנויים כבר עם רשומות פלטפורמה שמורות, כך שאפשר יהיה להוסיף בהמשך OAuth, רענון טוקנים וסנכרון Webhooks בצורה נקייה.", "Meta Ads, TikTok Ads, Facebook, and GA are scaffolded with stored platform records so OAuth, token refresh, and webhook sync can be added cleanly later.")}</p>
          <p>{lang("Instagram יכול לעשות שימוש חוזר באותות של יוצרים ומכירות כשהמחבר הזה כבר פעיל.", "Instagram can reuse creator-commerce signals when that connector is already active.")}</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
