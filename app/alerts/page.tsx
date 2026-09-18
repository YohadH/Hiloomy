import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { AlertCard } from "@/components/dashboard-v2/alert-card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAlerts } from "@/lib/services/alert-service";
import { groupAlertsByCategory, type AlertCategoryGroup } from "@/lib/domain/alert-categories";
import type { Severity } from "@/lib/domain/types";
import { getAppLocale, getDictionary } from "@/lib/i18n";
import { heCount, heCountPhrase } from "@/lib/i18n/he-plural";
import { cn } from "@/lib/utils";

const WORST_DOT: Record<Severity, string> = {
  critical: "bg-red-600",
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-sky-500"
};

export default async function AlertsPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const dictionary = getDictionary(locale);
  const tips = dictionary.alertsPage.tips;
  const [alerts, chrome] = await Promise.all([getAlerts(), getAppChromeData()]);

  // Grouped by what the alert is about (inventory, campaigns, competitors…).
  // Severity still decides which category comes first and the order inside it.
  const groups = groupAlertsByCategory(alerts);

  // Urgent tier = critical + high, together. The stored entity-level alerts
  // carry a "critical" severity the legacy page filters used to drop.
  const urgent = alerts.filter((a) => a.severity === "critical" || a.severity === "high");
  const medium = alerts.filter((a) => a.severity === "medium");
  const urgentCategories = groups.filter((g) => g.worst === "critical" || g.worst === "high");

  const tone = urgent.length > 0 ? "down" : medium.length > 0 ? "neutral" : "up";
  const categoryNames = urgentCategories.map((g) => g.category.label[locale]).join(", ");
  const headline =
    urgent.length > 0
      ? isHe
        ? `${heCountPhrase(urgent.length, { one: "התראה אחת", many: "התראות" }, { one: "בעדיפות גבוהה דורשת", many: "בעדיפות גבוהה דורשות" })} תשומת לב היום${categoryNames ? ` — ${categoryNames}` : ""}.`
        : `${urgent.length} high-priority alert${urgent.length === 1 ? "" : "s"} need your attention today${categoryNames ? ` — ${categoryNames}` : ""}.`
      : medium.length > 0
        ? isHe
          ? `${heCountPhrase(medium.length, { one: "התראה אחת", many: "התראות" }, { one: "בעדיפות בינונית לסקירה", many: "בעדיפות בינונית לסקירה" })} השבוע.`
          : `${medium.length} medium-priority alert${medium.length === 1 ? "" : "s"} to review this week.`
        : isHe
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
          eyebrow={isHe ? "דופק ההתראות" : "Alerts pulse"}
          headline={headline}
          body={tips.severity}
          tone={tone}
          toneLabel={
            tone === "up"
              ? isHe
                ? "הכל תקין"
                : "All clear"
              : tone === "down"
                ? isHe
                  ? "נדרשת פעולה"
                  : "Action needed"
                : isHe
                  ? "לעקוב מקרוב"
                  : "Watch closely"
          }
        />

        {groups.length > 1 ? <CategoryStrip groups={groups} locale={locale} /> : null}

        {alerts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {isHe
                ? "אין התראות בחלון הזמן הזה. כאן יופיעו חריגות ברגע שיזוהו."
                : "No alerts in this window. We'll surface anomalies here as they trigger."}
            </CardContent>
          </Card>
        ) : null}

        {groups.map((group) => (
          <section key={group.category.id} id={`alerts-${group.category.id}`} className="space-y-3 scroll-mt-24">
            <SectionHead
              eyebrow={eyebrowFor(group, locale)}
              title={group.category.label[locale]}
              hint={group.category.hint[locale]}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {group.alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  severityLabel={dictionary.alertsPage.severity[alert.severity]}
                  locale={locale}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

// "3 alerts · 1 critical, 2 medium" — count first, then the severity mix.
function eyebrowFor(group: AlertCategoryGroup, locale: "he" | "en"): string {
  const isHe = locale === "he";
  const total = group.alerts.length;
  // Hebrew agrees in number: "קריטית אחת" at n=1, "2 קריטיות" otherwise.
  const labels: Record<Severity, { he: { one: string; many: string }; en: string }> = {
    critical: { he: { one: "קריטית אחת", many: "קריטיות" }, en: "critical" },
    high: { he: { one: "גבוהה אחת", many: "גבוהות" }, en: "high" },
    medium: { he: { one: "בינונית אחת", many: "בינוניות" }, en: "medium" },
    low: { he: { one: "נמוכה אחת", many: "נמוכות" }, en: "low" }
  };
  const mix = (["critical", "high", "medium", "low"] as Severity[])
    .filter((s) => group.counts[s] > 0)
    .map((s) => (isHe ? heCount(group.counts[s], labels[s].he) : `${group.counts[s]} ${labels[s].en}`))
    .join(", ");
  const count = isHe ? heCountPhrase(total, { one: "התראה אחת", many: "התראות" }) : `${total} alert${total === 1 ? "" : "s"}`;
  return total > 1 && Object.values(group.counts).filter((n) => n > 0).length > 1 ? `${count} · ${mix}` : count;
}

// Jump strip: one chip per non-empty category with its count and a dot in the
// colour of its worst severity, so the manager sees the shape of the inbox
// before scrolling.
function CategoryStrip({ groups, locale }: { groups: AlertCategoryGroup[]; locale: "he" | "en" }) {
  return (
    <nav aria-label={locale === "he" ? "קטגוריות התראות" : "Alert categories"} className="flex flex-wrap gap-2">
      {groups.map((group) => (
        <a
          key={group.category.id}
          href={`#alerts-${group.category.id}`}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium",
            "hover:border-foreground/30 hover:bg-muted/40"
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", WORST_DOT[group.worst])} aria-hidden />
          <span>{group.category.label[locale]}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{group.alerts.length}</span>
        </a>
      ))}
    </nav>
  );
}
