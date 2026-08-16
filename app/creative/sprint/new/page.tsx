// Server wrapper for the new-sprint launcher. The form itself is a
// client component because it has live cost-preview math.
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { NewSprintForm } from "@/components/creative-sprint/new-sprint-form";

export const dynamic = "force-dynamic";

export default async function NewSprintPage() {
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6">
        <PageHead
          eyebrow="Creative Sprint"
          title={locale === "he" ? "ספרינט חדש" : "New sprint"}
          description={
            locale === "he"
              ? "הגדירו את הספרינט: כמה מודעות, איזה מוצר, איזה תקציב לכל אחת, ואיך מנגנון הסינון יפסול את המודעות החלשות."
              : "Configure the sprint: how many ads, which product, daily budget per ad, and how the cascade should kill the losers."
          }
        />
        <NewSprintForm
          locale={locale}
          storeName={chrome.store.name}
          storeCurrency={chrome.store.currency}
        />
      </div>
    </AppShell>
  );
}
