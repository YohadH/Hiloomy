import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { GanttStudio } from "@/components/gantt/gantt-studio";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";

export const metadata = {
  title: "Marketing Planner"
};

export const dynamic = "force-dynamic";

// Marketing Planner IS the Gantt studio. The old brief-studio flow (LLM
// planner over `ganttPlacement` text strings) was replaced by the real
// interactive upload-parse-execute Gantt at the user's request. Old
// brief-studio component remains in `components/marketing-planner/` for
// future rescue; simply not routed to.

export default async function MarketingPlannerPage() {
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
          createdAt: true
        }
      })
    : [];

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
    createdAt: s.createdAt.toISOString()
  }));

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 text-end" dir="rtl">
        <SectionHeading
          eyebrow="Marketing Planner"
          title="גאנט שיווקי אינטראקטיבי"
          description="העלאת גאנט חודשי, ניתוח אוטומטי על ידי סוכן BI, בריף PDF לכל תפקיד, ולחיצה על יום בלוח כדי לראות את המשימות ולפתוח אותן בכלי המתאים (קופון, סטודיו קריאייטיב ועוד)."
        />
        <GanttStudio initialSheets={initialSheets} />
      </div>
    </AppShell>
  );
}
