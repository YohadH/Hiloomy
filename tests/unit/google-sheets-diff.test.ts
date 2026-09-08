// The Gantt sync must report exactly what moved in a linked Google Sheet and
// nothing else: same task text with a new date is a change, a task that
// disappeared is a removal, and duplicated task rows (matrix layout expands
// a multi-day task into one row per day) are matched by occurrence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRows, parseSpreadsheetRef } from "@/lib/services/google-sheets-service";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const row = (task: string, start: string, opts: { role?: string | null; category?: string | null; end?: string | null; status?: string | null } = {}) => ({
  task,
  role: opts.role ?? "Marketing",
  category: opts.category ?? "Social",
  startDate: d(start),
  endDate: opts.end === null ? null : d(opts.end ?? start),
  status: opts.status ?? null
});

test("unchanged plan → empty diff", () => {
  const a = [row("Launch post", "2026-09-10"), row("Newsletter", "2026-09-12")];
  const diff = diffRows(a, a.map((r) => ({ ...r })));
  assert.deepEqual(diff, { added: [], removed: [], changed: [] });
});

test("moved date is a change, not remove+add", () => {
  const diff = diffRows([row("Launch post", "2026-09-10")], [row("Launch post", "2026-09-14")]);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.deepEqual(diff.changed, [
    { task: "Launch post", field: "start", from: "2026-09-10", to: "2026-09-14" },
    { task: "Launch post", field: "end", from: "2026-09-10", to: "2026-09-14" }
  ]);
});

test("new and deleted tasks are reported with their dates", () => {
  const diff = diffRows([row("Old promo", "2026-09-01")], [row("New promo", "2026-09-20", { role: "Ads" })]);
  assert.deepEqual(diff.added, [{ task: "New promo", role: "Ads", date: "2026-09-20" }]);
  assert.deepEqual(diff.removed, [{ task: "Old promo", role: "Marketing", date: "2026-09-01" }]);
});

test("status change is reported", () => {
  const diff = diffRows([row("Brief", "2026-09-03", { status: "todo" })], [row("Brief", "2026-09-03", { status: "done" })]);
  assert.deepEqual(diff.changed, [{ task: "Brief", field: "status", from: "todo", to: "done" }]);
});

test("duplicate task rows are matched by occurrence", () => {
  const prev = [row("Sale", "2026-09-01"), row("Sale", "2026-09-02")];
  const next = [row("Sale", "2026-09-01"), row("Sale", "2026-09-02"), row("Sale", "2026-09-03")];
  const diff = diffRows(prev, next);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].date, "2026-09-03");
  assert.equal(diff.changed.length, 0);
});

test("matching ignores case and whitespace in task/role/category", () => {
  const diff = diffRows([row("Launch  Post", "2026-09-10", { role: "marketing" })], [row("launch post", "2026-09-10", { role: "Marketing" })]);
  assert.deepEqual(diff, { added: [], removed: [], changed: [] });
});

test("spreadsheet refs: full URL with gid, bare id, junk", () => {
  assert.deepEqual(parseSpreadsheetRef("https://docs.google.com/spreadsheets/d/1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42"), {
    spreadsheetId: "1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789",
    gid: 42
  });
  assert.equal(parseSpreadsheetRef("1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789").gid, null);
  assert.throws(() => parseSpreadsheetRef("not a link"));
});
