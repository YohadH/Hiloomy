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
            "בחרו סוג נכס, העלו את תמונת המוצר ותנו לAI לעשות את העבודה. הגרסה הזו מייצרת תמונה אחת באיכות גבוהה — טעימה ראשונה מהמערכת."
        }
      : {
          eyebrow: "Creative Studio",
          title: "New project",
          description:
            "Pick an asset type, upload your product photo, and let AI do the heavy lifting. This milestone generates one high-quality image so you can see the system end-to-end."
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
