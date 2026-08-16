import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { CreativeProjectDetailView } from "@/components/creative/creative-project-detail";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { getProjectDetail } from "@/lib/services/creative-project-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

export const dynamic = "force-dynamic";

export default async function CreativeProjectPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [chrome, locale, storeId] = await Promise.all([
    getAppChromeData(),
    getAppLocale(),
    resolveActiveStoreId()
  ]);
  if (!storeId) return notFound();

  const project = await getProjectDetail(storeId, projectId);
  if (!project) return notFound();

  const heading =
    locale === "he"
      ? {
          eyebrow: "סטודיו קריאייטיב",
          title: project.name,
          description: "צפו בנכסים שנוצרו — עריכה בתוך המערכת תתווסף בקרוב."
        }
      : {
          eyebrow: "Creative Studio",
          title: project.name,
          description: "Review generated assets here. Inline editing arrives in M2."
        };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
        <CreativeProjectDetailView project={project} locale={locale} />
      </div>
    </AppShell>
  );
}
