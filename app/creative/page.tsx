import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { CreativeProjectsList } from "@/components/creative/creative-projects-list";
import { CreativeTabs } from "@/components/creative/creative-tabs";
import { TopCreativeBenchmarks } from "@/components/creative/top-creative-benchmarks";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { listProjectsForStore } from "@/lib/services/creative-project-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

export const dynamic = "force-dynamic";

export default async function CreativePage() {
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  const storeId = await resolveActiveStoreId();
  const projects = storeId ? await listProjectsForStore(storeId) : [];

  // Top-performing creatives: ready projects sorted by most recently updated.
  // Shown as benchmarks/inspiration before the new-project generation UI.
  const topCreatives = projects
    .filter((p) => p.status === "ready" && p.coverThumbUrl)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  const heading =
    locale === "he"
      ? {
          eyebrow: "סטודיו קריאייטיב",
          title: "יצירה, עריכה וניהול של נכסי תוכן",
          description:
            "העלו תמונת מוצר ותנו לAI להפיק פאקשוטים, פוסטים לאינסטגרם, מודעות לMeta ותוכן UGC. בשלב הזה המערכת מייצרת תמונה אחת לכל פרויקט — עיבוד באצווה וסרטונים יתווספו בקרוב."
        }
      : {
          eyebrow: "Creative Studio",
          title: "Create, edit and manage AI content assets",
          description:
            "Upload a product image and let AI produce packshots, Instagram posts, Meta ads and UGC content. M1 generates a single image per project — batching and video are coming in the next milestones."
        };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
        <CreativeTabs locale={locale} />
        {/* Show top-performing creatives as benchmarks before the generation UI */}
        {topCreatives.length > 0 && (
          <TopCreativeBenchmarks topCreatives={topCreatives} locale={locale} />
        )}
        <CreativeProjectsList initialProjects={projects} locale={locale} />
      </div>
    </AppShell>
  );
}
