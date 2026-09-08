-- Gantt sheets linked to Google Sheets + per-sync change log. See google-sheets-service.ts.
ALTER TABLE "GanttSheet"
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'upload',
  ADD COLUMN "sourceSpreadsheetId" TEXT,
  ADD COLUMN "sourceSheetName" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "sourceLastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "sourceContentHash" TEXT,
  ADD COLUMN "sourceSyncError" TEXT;

CREATE TABLE "GanttSheetSync" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "detailsJson" JSONB,
    CONSTRAINT "GanttSheetSync_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GanttSheetSync_sheetId_syncedAt_idx" ON "GanttSheetSync"("sheetId", "syncedAt" DESC);
CREATE INDEX "GanttSheetSync_storeId_syncedAt_idx" ON "GanttSheetSync"("storeId", "syncedAt" DESC);
ALTER TABLE "GanttSheetSync" ADD CONSTRAINT "GanttSheetSync_sheetId_fkey"
    FOREIGN KEY ("sheetId") REFERENCES "GanttSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
