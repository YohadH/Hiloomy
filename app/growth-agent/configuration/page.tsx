import { GrowthAgentConfigurationManager } from "@/components/growth-agent/configuration-manager";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentSettings, getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { getAppLocale } from "@/lib/i18n";

export default async function GrowthAgentConfigurationPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const { store } = await getGrowthAgentStoreContext();
  const [chrome, settings] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthAgentSettings(store.id)
  ]);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("סוכן הצמיחה", "Growth Agent")}
          title={lang("הגדרות", "Configuration")}
          description={lang(
            "ספי התראה בשליטת בעל החנות, התראות, הרשאות אוטומציה, תקציבים, ספי ביטחון, חוקי אישור ומקורות לקראולר המוצרים.",
            "Merchant-controlled thresholds, notifications, automation permissions, budgets, confidence gates, approval rules, and product crawler sources."
          )}
        />
        <GrowthAgentNav locale={locale} />
      </section>

      <GrowthAgentConfigurationManager initialSettings={settings} storeId={store.id} locale={locale} />
    </AppShell>
  );
}
