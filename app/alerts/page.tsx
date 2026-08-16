import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { AlertCard } from "@/components/dashboard-v2/alert-card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAlerts } from "@/lib/services/alert-service";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function AlertsPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const tips = dictionary.alertsPage.tips;
  const [alerts, chrome] = await Promise.all([getAlerts(), getAppChromeData()]);

  const high = alerts.filter((a) => a.severity === "high");
  const medium = alerts.filter((a) => a.severity === "medium");
  const low = alerts.filter((a) => a.severity === "low");

  const tone = high.length > 0 ? "down" : medium.length > 0 ? "neutral" : "up";
  const headline =
    high.length > 0
      ? locale === "he"
        ? `${high.length} התראות בעדיפות גבוהה דורשות תשומת לב היום.`
        : `${high.length} high-priority alert${high.length === 1 ? "" : "s"} need your attention today.`
      : medium.length > 0
        ? locale === "he"
          ? `${medium.length} התראות בעדיפות בינונית לסקירה השבוע.`
          : `${medium.length} medium-priority alert${medium.length === 1 ? "" : "s"} to review this week.`
        : locale === "he"
          ? "הכל תקין — אין התראות דחופות כרגע."
          : "All clear — no urgent alerts right now.";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={dictionary.alertsPage.eyebrow}
          title={dictionary.alertsPage.title}
          description={dictionary.alertsPage.description}
        />

        <NarrativeBanner
          eyebrow={locale === "he" ? "דופק ההתראות" : "Alerts pulse"}
          headline={headline}
          body={tips.severity}
          tone={tone}
          toneLabel={
            tone === "up"
              ? locale === "he"
                ? "הכל תקין"
                : "All clear"
              : tone === "down"
                ? locale === "he"
                  ? "נדרשת פעולה"
                  : "Action needed"
                : locale === "he"
                  ? "לעקוב מקרוב"
                  : "Watch closely"
          }
        />

        {alerts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {locale === "he"
                ? "אין התראות בחלון הזמן הזה. כאן יופיעו חריגות ברגע שיזוהו."
                : "No alerts in this window. We'll surface anomalies here as they trigger."}
            </CardContent>
          </Card>
        ) : null}

        {high.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "עדיפות — גבוהה" : "Priority — high"}
              title={locale === "he" ? "ההתראות הדחופות להיום" : "Today's must-do alerts"}
              hint={
                locale === "he"
                  ? "משהו מהותי השתנה. קראו את הפעולה המומלצת ובצעו אותה עוד היום אם אפשר."
                  : "Something material moved. Read the suggested action and execute today if possible."
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {high.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  severityLabel={dictionary.alertsPage.severity[alert.severity]}
                />
              ))}
            </div>
          </section>
        ) : null}

        {medium.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "עדיפות — בינונית" : "Priority — medium"}
              title={locale === "he" ? "תור הסקירה של השבוע" : "This week's review queue"}
              hint={
                locale === "he"
                  ? "שווה לבדוק בתכנון השבועי. לא דורש טיפול מיידי."
                  : "Worth investigating during weekly planning. Won't blow up overnight."
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {medium.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  severityLabel={dictionary.alertsPage.severity[alert.severity]}
                />
              ))}
            </div>
          </section>
        ) : null}

        {low.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "עדיפות — נמוכה" : "Priority — low"}
              title={locale === "he" ? "לידיעה בלבד" : "FYI — informational"}
              hint={
                locale === "he"
                  ? "רקע כללי. קראו כשיש זמן, או דלגו בשבוע עמוס."
                  : "Background context. Read when you have time, or skip during a busy week."
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {low.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  severityLabel={dictionary.alertsPage.severity[alert.severity]}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
