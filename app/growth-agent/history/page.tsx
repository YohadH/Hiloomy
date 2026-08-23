import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentStoreContext, getGrowthAttributionSessions, getGrowthFindings, getGrowthMetricSnapshots, getGrowthWebhookEvents } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthFindingsList } from "@/components/growth-agent/findings-list";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { getAppLocale } from "@/lib/i18n";

export default async function GrowthAgentHistoryPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const dateLocale = isHe ? "he-IL" : "en-US";

  const { store } = await getGrowthAgentStoreContext();
  const [chrome, findings, snapshots, webhooks, sessions] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthFindings(store.id),
    getGrowthMetricSnapshots(store.id),
    getGrowthWebhookEvents(store.id),
    getGrowthAttributionSessions(store.id)
  ]);

  const emptyMessage = lang("אין נתונים להצגה עדיין.", "No data available yet.");

  const snapshotRows = snapshots.map((snapshot: any) => ({
    id: snapshot.id,
    source: snapshot.source,
    bucketedAt: new Date(snapshot.bucketedAt).toLocaleString(dateLocale),
    confidence: snapshot.confidenceScore ? `${Math.round(snapshot.confidenceScore * 100)}%` : "-"
  }));

  const webhookRows = webhooks.map((event: any) => ({
    id: event.id,
    platform: event.platform,
    topic: event.topic,
    status: event.status,
    processedAt: event.processedAt ? new Date(event.processedAt).toLocaleString(dateLocale) : "-",
    createdAt: new Date(event.createdAt).toLocaleString(dateLocale)
  }));

  const sessionRows = sessions.map((session: any) => ({
    id: session.id,
    affiliate: session.affiliateName,
    ref: session.affiliateCode ?? "-",
    clickId: session.clickId,
    sourcePlatform: session.sourcePlatform ?? "-",
    coupon: session.couponCode ?? "-",
    convertedAt: session.convertedAt ? new Date(session.convertedAt).toLocaleString(dateLocale) : "-"
  }));

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("סוכן הצמיחה", "Growth Agent")}
          title={lang("התראות / היסטוריה", "Alerts / History")}
          description={lang(
            "ממצאים אחרונים, היסטוריית עיבוד Webhooks, סשנים של ייחוס מכירות ויומן תמונות המצב של המדדים שמשמש את מנוע הניטור.",
            "Recent findings, webhook processing history, attribution sessions, and the underlying metric snapshot log used by the monitoring engine."
          )}
        />
        <GrowthAgentNav locale={locale} />
      </section>

      <GrowthAgentManualControls storeId={store.id} locale={locale} />
      <GrowthFindingsList findings={findings} title={lang("היסטוריית ממצאים", "Findings history")} locale={locale} />
      <section className="grid gap-4 xl:grid-cols-2">
        <DataTable
          title={lang("היסטוריית Webhooks", "Webhook history")}
          emptyMessage={emptyMessage}
          columns={[
            { key: "platform", label: lang("פלטפורמה", "Platform") },
            { key: "topic", label: lang("נושא", "Topic") },
            { key: "status", label: lang("סטטוס", "Status") },
            { key: "processedAt", label: lang("עובד", "Processed") },
            { key: "createdAt", label: lang("התקבל", "Received") }
          ]}
          rows={webhookRows}
        />
        <DataTable
          title={lang("סשנים של ייחוס מכירות", "Attribution sessions")}
          emptyMessage={emptyMessage}
          columns={[
            { key: "affiliate", label: lang("שותף", "Affiliate") },
            { key: "ref", label: "ref", render: (row) => <span dir="ltr">{row.ref}</span> },
            { key: "clickId", label: lang("מזהה קליק", "Click ID"), render: (row) => <span dir="ltr">{row.clickId}</span> },
            { key: "sourcePlatform", label: lang("מקור", "Source") },
            { key: "coupon", label: lang("קופון", "Coupon"), render: (row) => <span dir="ltr">{row.coupon}</span> },
            { key: "convertedAt", label: lang("הומר", "Converted") }
          ]}
          rows={sessionRows}
        />
      </section>
      <DataTable
        title={lang("תמונות מצב של מדדים", "Metric snapshots")}
        emptyMessage={emptyMessage}
        columns={[
          { key: "source", label: lang("מקור", "Source") },
          { key: "bucketedAt", label: lang("חלון זמן", "Bucket") },
          { key: "confidence", label: lang("רמת ביטחון", "Confidence") }
        ]}
        rows={snapshotRows}
      />
    </AppShell>
  );
}
