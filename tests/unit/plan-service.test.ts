// Plan view, phase 1: Gantt rows → initiatives. A month-long merged cell
// (one row per day, same text) must become ONE initiative, not thirty; a gap
// splits it; product matching is by catalogue title mentioned in the text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { __testing } from "@/lib/services/plan-service";

const { groupRows, matchProducts } = __testing;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const row = (id: string, task: string, start: string, opts: { end?: string; role?: string; category?: string } = {}) => ({
  id,
  task,
  role: opts.role ?? "marketing",
  category: opts.category ?? "קידום ממומן",
  actionType: null,
  startDate: d(start),
  endDate: d(opts.end ?? start),
  executionJson: null
});

test("one row per day with the same text collapses into one initiative", () => {
  const rows = ["01", "02", "03", "04"].map((dd, i) => row(`r${i}`, "מבצע ראש השנה 15%", `2026-09-${dd}`));
  const out = groupRows(rows, "s1");
  assert.equal(out.length, 1);
  assert.equal(out[0].start, "2026-09-01");
  assert.equal(out[0].end, "2026-09-04");
  assert.equal(out[0].days, 4);
  assert.deepEqual(out[0].rowIds, ["r0", "r1", "r2", "r3"]);
});

test("a gap of more than a day starts a second initiative", () => {
  const rows = [row("a", "Story", "2026-09-01"), row("b", "Story", "2026-09-02"), row("c", "Story", "2026-09-10")];
  const out = groupRows(rows, "s1");
  assert.equal(out.length, 2);
  assert.equal(out[0].end, "2026-09-02");
  assert.equal(out[1].start, "2026-09-10");
});

test("different role or category means a different initiative", () => {
  const rows = [row("a", "Launch", "2026-09-01", { role: "ads" }), row("b", "Launch", "2026-09-01", { role: "crm" })];
  assert.equal(groupRows(rows, "s1").length, 2);
});

test("initiative ids are stable for the same key and start", () => {
  const a = groupRows([row("x", "Launch", "2026-09-01")], "s1")[0].id;
  const b = groupRows([row("y", "Launch", "2026-09-01")], "s1")[0].id;
  assert.equal(a, b);
});

test("products are matched by catalogue title in the text, longest title wins", () => {
  const catalogue = [
    { id: "p1", title: "Second Skin", status: "ACTIVE", hasRealCost: true, inventory: 10 },
    { id: "p2", title: "Second Skin Set", status: "ACTIVE", hasRealCost: false, inventory: 3 },
    { id: "p3", title: "Musk Santal 09", status: "ACTIVE", hasRealCost: true, inventory: 0 }
  ];
  const hits = matchProducts("קידום SECOND SKIN SET + Musk Santal 09 בהנחה", catalogue);
  assert.deepEqual(hits.map((h) => h.id).sort(), ["p2", "p3"]);
});

test("very short titles never match", () => {
  const catalogue = [{ id: "p1", title: "Set", status: "ACTIVE", hasRealCost: true, inventory: 1 }];
  assert.equal(matchProducts("Holiday set promotion", catalogue).length, 0);
});
