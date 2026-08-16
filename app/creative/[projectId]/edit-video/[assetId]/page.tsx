import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { VideoEditor } from "@/components/creative/video-editor";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { getDb } from "@/lib/server/db";
import { getReadableUrl } from "@/lib/services/creative-storage-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import type { TextOverlay } from "@/lib/domain/creative-types";

export const dynamic = "force-dynamic";

export default async function EditVideoPage({
  params
}: {
  params: Promise<{ projectId: string; assetId: string }>;
}) {
  const { projectId, assetId } = await params;
  const [chrome, locale, storeId] = await Promise.all([
    getAppChromeData(),
    getAppLocale(),
    resolveActiveStoreId()
  ]);
  if (!storeId) return notFound();

  const db = getDb();
  const asset = await db.creativeAsset.findFirst({
    where: { id: assetId, projectId, project: { storeId } },
    include: { project: { select: { id: true, name: true } } }
  });
  if (!asset || asset.assetType !== "VIDEO") return notFound();
  if (!asset.storageKey && !asset.rawStorageKey) return notFound();

  // Editor always operates on the raw (unedited) video so re-edits don't
  // burn overlays on top of overlays. The poster is the first source frame.
  const editableKey = asset.rawStorageKey ?? asset.storageKey!;
  const videoUrl = await getReadableUrl(editableKey);
  const posterUrl = asset.thumbStorageKey ? await getReadableUrl(asset.thumbStorageKey) : null;

  const heading =
    locale === "he"
      ? {
          eyebrow: "סטודיו קריאייטיב",
          title: `עריכת סרטון — ${asset.project?.name ?? ""}`,
          description: "חתכו את הסרטון והוסיפו טקסט. השינויים ייצרבו בסרטון בעת השמירה."
        }
      : {
          eyebrow: "Creative Studio",
          title: `Edit video — ${asset.project?.name ?? ""}`,
          description: "Trim the clip and add a headline. Your edits are burned in on Save."
        };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
        <VideoEditor
          projectId={projectId}
          assetId={assetId}
          videoUrl={videoUrl}
          posterUrl={posterUrl}
          initialOverlays={(asset.overlaysJson as TextOverlay[] | null) ?? []}
          initialDurationMs={asset.durationMs ?? null}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}
