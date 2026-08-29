import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { NewProjectWizard } from "@/components/creative/new-project-wizard";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { getProviderAvailability } from "@/lib/services/creative-provider-availability";
import { isCreativeVideoEnabled, maxVideoBatchSize } from "@/lib/services/creative-video-config";

export const dynamic = "force-dynamic";

export default async function NewCreativeProjectPage() {
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  const providerAvailability = getProviderAvailability();
  const videoSettings = {
    enabled: isCreativeVideoEnabled(),
    maxBatch: maxVideoBatchSize()
  };

  const heading =
    locale === "he"
      ? {
          eyebrow: "סטודיו קריאייטיב",
          title: "פרויקט חדש",
          description:
            "בחרו סוג נכס, העלו את תמונת המוצר ובחרו כמות — הAI מפיק פאקשוטים, פוסטים, מודעות ותוכן UGC באיכות גבוהה."
        }
      : {
          eyebrow: "Creative Studio",
          title: "New project",
          description:
            "Pick an asset type, upload your product photo, and choose how many — the AI produces high-quality packshots, posts, ads, and UGC content."
        };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
        <NewProjectWizard
          locale={locale}
          providerAvailability={providerAvailability}
          videoSettings={videoSettings}
        />
      </div>
    </AppShell>
  );
}
