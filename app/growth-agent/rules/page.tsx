import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentSettings, getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { getAppLocale } from "@/lib/i18n";
import { getGrowthAgentModeLabel, getGrowthSettingKeyLabel } from "@/lib/i18n/growth-agent-labels";

export default async function GrowthAgentRulesPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const { store } = await getGrowthAgentStoreContext();
  const [chrome, settings] = await Promise.all([getAppChromeData(store.id), getGrowthAgentSettings(store.id)]);

  const emptyMessage = lang("אין נתונים להצגה עדיין.", "No data available yet.");

  // The config keys (`aovDropPercent`, `sendAlert`, …) stay the data; only the
  // rendered name is mapped to a human label, with the raw key kept underneath.
  const thresholdRows = Object.entries(settings.thresholds).map(([metric, value]) => ({
    metric,
    metricLabel: getGrowthSettingKeyLabel(metric, locale),
    value: `${value}%`
  }));
  const allowedRows = Object.entries(settings.allowedActions).map(([action, enabled]) => ({
    action,
    actionLabel: getGrowthSettingKeyLabel(action, locale),
    enabled: enabled ? lang("מופעל", "Enabled") : lang("כבוי", "Disabled")
  }));
  const approvalRows = Object.entries(settings.approvalRules).map(([rule, value]) => ({
    rule,
    ruleLabel: getGrowthSettingKeyLabel(rule, locale),
    value: typeof value === "boolean"
      ? (value ? lang("כן", "Yes") : lang("לא", "No"))
      : String(value)
  }));

  const renderKeyCell = (label: string, rawKey: string) => (
    <div>
      <span className="font-medium text-foreground">{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground" dir="ltr">{rawKey}</span>
    </div>
  );

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("סוכן הצמיחה", "Growth Agent")}
          title={lang("חוקים ואוטומציות", "Rules & Automations")}
          description={lang(
            "תצוגה תפעולית ברורה של ספי ההתראה, סוגי הפעולות המותרים ודרישות האישור לפני שכל המלצה או ביצוע יוצאים לדרך.",
            "A clear operational view of thresholds, allowed action types, and approval requirements before any recommendation or execution is made."
          )}
        />
        <GrowthAgentNav locale={locale} />
      </section>

      <GrowthAgentManualControls storeId={store.id} locale={locale} />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">{lang("מצב הפעלה", "Operating mode")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{lang("מצב:", "Mode:")} {getGrowthAgentModeLabel(settings.agentMode, locale)}</p>
            <p>{lang("תדירות בדיקה: כל", "Check frequency: every")} {settings.checkFrequencyMinutes} {lang("דקות", "minutes")}</p>
            <p>{lang("ביצוע אוטומטי חסום אלא אם הפעולה מופעלת וגם נמצאת בתוך מעקות הבטיחות.", "Auto execution is blocked unless an action is both enabled and inside guardrails.")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{lang("מעקות בטיחות", "Guardrails")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{lang("תקציב יומי מקסימלי:", "Max daily budget:")} {settings.guardrails.maxDailyAdBudget} {chrome.store.currency}</p>
            <p>{lang("תקציב מקסימלי לפעולה בודדת:", "Max single action budget:")} {settings.guardrails.maxSingleActionBudget} {chrome.store.currency}</p>
            <p>{lang("רמת ביטחון מינימלית:", "Minimum confidence:")} {Math.round(settings.guardrails.minConfidenceScore * 100)}%</p>
            <p>{lang("זמן המתנה:", "Cooldown:")} {settings.guardrails.cooldownMinutesBetweenActions} {lang("דקות", "minutes")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{lang("בטיחות מלאי", "Inventory safety")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{lang("דרישת מלאי זמין:", "Require inventory available:")} {settings.guardrails.requireInventoryAvailable ? lang("כן", "Yes") : lang("לא", "No")}</p>
            <p>{lang("סף מלאי מינימלי:", "Minimum inventory threshold:")} {settings.guardrails.minimumInventoryThreshold}</p>
            <p>{lang("חסימה כשרמת הביטחון במדידה נמוכה:", "Block if tracking confidence is low:")} {settings.guardrails.blockIfTrackingConfidenceLow ? lang("כן", "Yes") : lang("לא", "No")}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DataTable
          title={lang("ספי התראה", "Thresholds")}
          emptyMessage={emptyMessage}
          columns={[
            {
              key: "metric",
              label: lang("מדד", "Metric"),
              render: (row) => renderKeyCell(row.metricLabel, row.metric)
            },
            { key: "value", label: lang("סף", "Threshold") }
          ]}
          rows={thresholdRows}
        />
        <DataTable
          title={lang("פעולות מותרות", "Allowed actions")}
          emptyMessage={emptyMessage}
          columns={[
            {
              key: "action",
              label: lang("פעולה", "Action"),
              render: (row) => renderKeyCell(row.actionLabel, row.action)
            },
            { key: "enabled", label: lang("סטטוס", "Status") }
          ]}
          rows={allowedRows}
        />
        <DataTable
          title={lang("חוקי אישור", "Approval rules")}
          emptyMessage={emptyMessage}
          columns={[
            {
              key: "rule",
              label: lang("חוק", "Rule"),
              render: (row) => renderKeyCell(row.ruleLabel, row.rule)
            },
            { key: "value", label: lang("ערך", "Value") }
          ]}
          rows={approvalRows}
        />
      </section>
    </AppShell>
  );
}
