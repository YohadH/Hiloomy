import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { GanttStudio } from "@/components/gantt/gantt-studio";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";
import { getAppLocale } from "@/lib/i18n";
import { isGoogleSheetsConnected } from "@/lib/services/google-sheets-service";

export const metadata = {
  title: "Marketing Planner"
};

export const dynamic = "force-dynamic";

// Marketing Planner IS the Gantt studio. The old brief-studio flow (LLM
// planner over `ganttPlacement` text strings) was replaced by the real
// interactive upload-parse-execute Gantt at the user's request. Old
// brief-studio component remains in `components/marketing-planner/` for
// future rescue; simply not routed to.

export default async function MarketingPlannerPage({ searchParams }: { searchParams: Promise<{ sheets_connected?: string; sheets_error?: string }> }) {
  const params = await searchParams;
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const chrome = await getAppChromeData();
  const storeId = await resolveActiveStoreId();
  const db = getDb();

  const sheets = storeId
    ? await db.ganttSheet.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          originalName: true,
          rangeStart: true,
          rangeEnd: true,
          rowCount: true,
          rolesJson: true,
          categoriesJson: true,
          sheetNamesJson: true,
          parsedSheetName: true,
          insightsGeneratedAt: true,
          createdAt: true,
          sourceType: true,
          sourceSheetName: true,
          sourceUrl: true,
          sourceLastSyncedAt: true,
          sourceSyncError: true
        }
      })
    : [];
  const googleSheetsConnected = storeId ? await isGoogleSheetsConnected(storeId).catch(() => false) : false;
  const sheetsNotice = params.sheets_error
    ? ({ kind: "error", message: params.sheets_error } as const)
    : params.sheets_connected === "true"
      ? ({ kind: "connected" } as const)
      : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialSheets = sheets.map((s: any) => ({
    id: s.id,
    title: s.title,
    originalName: s.originalName,
    rangeStart: s.rangeStart?.toISOString() ?? null,
    rangeEnd: s.rangeEnd?.toISOString() ?? null,
    rowCount: s.rowCount,
    rolesJson: Array.isArray(s.rolesJson) ? (s.rolesJson as string[]) : [],
    categoriesJson: Array.isArray(s.categoriesJson) ? (s.categoriesJson as string[]) : [],
    sheetNamesJson: Array.isArray(s.sheetNamesJson) ? (s.sheetNamesJson as string[]) : [],
    parsedSheetName: s.parsedSheetName ?? null,
    insightsGeneratedAt: s.insightsGeneratedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    sourceType: s.sourceType ?? "upload",
    sourceSheetName: s.sourceSheetName ?? null,
    sourceUrl: s.sourceUrl ?? null,
    sourceLastSyncedAt: s.sourceLastSyncedAt?.toISOString() ?? null,
    sourceSyncError: s.sourceSyncError ?? null
  }));

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6" dir={isHe ? "rtl" : "ltr"}>
        <SectionHeading
          eyebrow={isHe ? "תוכנית" : "Plan"}
          title={isHe ? "מה אנחנו מתכננים — והאם זה עדיין הגיוני" : "What we plan — and whether it still holds"}
          description={
            isHe
              ? "הגאנט הוא הכוונה המסחרית. הילומי בודקת כל מהלך מול המכירות, המלאי, הקמפיינים והרווח; כשהנחה בתוכנית מפסיקה להתקיים, ההחלטה נפתחת בעמוד היום."
              : "The Gantt is the commercial intent. Hiloomy checks every move against sales, inventory, campaigns and profit; when an assumption in the plan stops holding, the decision opens on Today."
          }
        />
        <GanttStudio initialSheets={initialSheets} locale={isHe ? "he" : "en"} storeId={storeId ?? ""} googleSheetsConnected={googleSheetsConnected} sheetsNotice={sheetsNotice} />
      </div>
    </AppShell>
  );
}
