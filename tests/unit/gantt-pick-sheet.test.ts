// A workbook with one tab per month must open on the CURRENT month, not on
// the first tab in the file (Incense's workbook starts in April 2025).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseGanttWorkbook } from "@/lib/services/gantt-parser-service";

function monthTab(year: number, month: number, task: string): unknown[][] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const header: unknown[] = ["//"];
  const dow: unknown[] = [null];
  for (let d = 1; d <= days; d++) {
    header.push(new Date(Date.UTC(year, month - 1, d)));
    dow.push("א");
  }
  const story: unknown[] = ["סיפור ראשי", task];
  return [header, dow, story];
}

function workbook(tabs: Array<[string, unknown[][]]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of tabs) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows as unknown[][]), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const buf = workbook([
  ["אפריל 25", monthTab(2025, 4, "מבצע אפריל")],
  ["אוגוסט 25", monthTab(2025, 8, "מבצע אוגוסט")],
  ["ספטמבר 26", monthTab(2026, 9, "ראש השנה 15%")],
  ["אוקטובר 26", monthTab(2026, 10, "סוכות")]
]);

test("today inside a tab → that tab", () => {
  const p = parseGanttWorkbook(buf, { now: new Date("2026-09-09T12:00:00Z") });
  assert.equal(p.parsedSheetName, "ספטמבר 26");
  assert.equal(p.rows[0]?.task, "ראש השנה 15%");
});

test("today between tabs → the nearest upcoming tab", () => {
  const p = parseGanttWorkbook(buf, { now: new Date("2026-03-01T12:00:00Z") });
  assert.equal(p.parsedSheetName, "ספטמבר 26");
});

test("today after every tab → the most recent tab", () => {
  const p = parseGanttWorkbook(buf, { now: new Date("2027-01-01T12:00:00Z") });
  assert.equal(p.parsedSheetName, "אוקטובר 26");
});

test("an explicit tab always wins", () => {
  const p = parseGanttWorkbook(buf, { sheetName: "אפריל 25", now: new Date("2026-09-09T12:00:00Z") });
  assert.equal(p.parsedSheetName, "אפריל 25");
});
