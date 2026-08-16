-- Incremental Supabase patch — adds the Gantt feature (upload + parse +
-- per-day drill-down + BI insights + per-role PDF brief).
--
-- Run this ONCE in the Supabase SQL Editor. Safe to re-run; everything is
-- IF NOT EXISTS guarded.

-- ─── GanttSheet ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GanttSheet" (
  "id"                  TEXT PRIMARY KEY,
  "storeId"             TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "originalName"        TEXT NOT NULL,
  "contentType"         TEXT NOT NULL,
  "bytesLength"         INTEGER NOT NULL,
  "storageKey"          TEXT,
  "rangeStart"          TIMESTAMP(3),
  "rangeEnd"            TIMESTAMP(3),
  "rowCount"            INTEGER NOT NULL DEFAULT 0,
  "rolesJson"           JSONB NOT NULL DEFAULT '[]'::jsonb,
  "categoriesJson"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "insightsJson"        JSONB,
  "insightsGeneratedAt" TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GanttSheet_storeId_fkey" FOREIGN KEY ("storeId")
    REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "GanttSheet_storeId_createdAt_idx"
  ON "GanttSheet"("storeId", "createdAt" DESC);

-- Columns added after initial migration. Idempotent so re-running is safe.
ALTER TABLE "GanttSheet"
  ADD COLUMN IF NOT EXISTS "sheetNamesJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "parsedSheetName" TEXT,
  ADD COLUMN IF NOT EXISTS "briefJson" JSONB,
  ADD COLUMN IF NOT EXISTS "briefGeneratedAt" TIMESTAMP(3);

-- ─── GanttRow ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GanttRow" (
  "id"                TEXT PRIMARY KEY,
  "sheetId"           TEXT NOT NULL,
  "storeId"           TEXT NOT NULL,
  "rowIndex"          INTEGER NOT NULL,
  "task"              TEXT NOT NULL,
  "role"              TEXT,
  "category"          TEXT,
  "startDate"         TIMESTAMP(3),
  "endDate"           TIMESTAMP(3),
  "status"            TEXT,
  "actionType"        TEXT,
  "actionPayloadJson" JSONB,
  "executionJson"     JSONB,
  "rawJson"           JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GanttRow_sheetId_fkey" FOREIGN KEY ("sheetId")
    REFERENCES "GanttSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GanttRow_storeId_fkey" FOREIGN KEY ("storeId")
    REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GanttRow_sheetId_rowIndex_key"
  ON "GanttRow"("sheetId", "rowIndex");
CREATE INDEX IF NOT EXISTS "GanttRow_sheetId_role_idx"
  ON "GanttRow"("sheetId", "role");
CREATE INDEX IF NOT EXISTS "GanttRow_sheetId_category_idx"
  ON "GanttRow"("sheetId", "category");
CREATE INDEX IF NOT EXISTS "GanttRow_sheetId_startDate_idx"
  ON "GanttRow"("sheetId", "startDate");
CREATE INDEX IF NOT EXISTS "GanttRow_storeId_startDate_idx"
  ON "GanttRow"("storeId", "startDate");
