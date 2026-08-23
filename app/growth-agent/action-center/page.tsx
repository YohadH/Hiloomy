import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatCard } from "@/components/shared/stat-card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthActions, getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthActionCenter } from "@/components/growth-agent/action-center";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { formatNumber } from "@/lib/utils";
import { getAppLocale } from "@/lib/i18n";

export default async function GrowthAgentActionCenterPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

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
          eyebrow={lang("סוכן הצמיחה", "Growth Agent")}
          title={lang("מרכז פעולות", "Action Center")}
          description={lang(
            "המלצות, פעולות שממתינות לאישור, פעולות שבוצעו ופריטים שנדחו – הכל בתור תפעולי אחד.",
            "Recommendations, pending approvals, executed actions, and rejected items all live in one operational queue."
          )}
        />
        <GrowthAgentNav locale={locale} />
      </section>

      <GrowthAgentManualControls storeId={store.id} locale={locale} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={lang("מומלץ", "Recommended")} value={formatNumber(recommended.length)} />
        <StatCard label={lang("ממתין לאישור", "Pending approval")} value={formatNumber(pending.length)} />
        <StatCard label={lang("בוצע", "Executed")} value={formatNumber(executed.length)} />
        <StatCard label={lang("נדחה", "Rejected")} value={formatNumber(rejected.length)} />
      </section>

      <GrowthActionCenter actions={actions} storeId={store.id} locale={locale} />
    </AppShell>
  );
}
