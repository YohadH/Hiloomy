// Plan model: cells → Commercial Initiatives → executions + decision hooks.
// The same campaign across six channels is ONE initiative; a month-long
// merged cell is one execution spanning the month; sentences that say
// "decide here" become hooks with a window.

import { test } from "node:test";
import assert from "node:assert/strict";
import { __testing } from "@/lib/services/plan-service";

const { groupIntoClusters, extractAnchors, detectDecisionHooks, titleFor, confidenceFor } = __testing;
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

test("the same campaign across channels is one initiative with N executions", () => {
  const rows = [
    row("a", "מבצע ראש השנה 15% + 5% לחברי הקהילה", "2026-09-01", { end: "2026-09-13", category: "סיפור ראשי" }),
    row("b", "באנר ראש השנה בדף הבית", "2026-09-01", { end: "2026-09-13", category: "אתר" }),
    row("c", "ניוזלטר ראש השנה", "2026-09-02", { category: "ניוזלטר" }),
    row("d", "SMS ראש השנה — קוד EXTRANAP", "2026-09-03", { category: "SMS" }),
    row("e", "עגלות נטושות: מסר ראש השנה", "2026-09-04", { category: "עגלות נטושות" })
  ];
  const clusters = groupIntoClusters(rows);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].rows.length, 5);
  assert.equal(clusters[0].anchor.kind, "event");
  assert.equal(titleFor(clusters[0]), "ראש השנה");
  assert.equal(confidenceFor(clusters[0]), "high");
  assert.equal(clusters[0].start, "2026-09-01");
  assert.equal(clusters[0].end, "2026-09-13");
});

test("different events are different initiatives, even on the same days", () => {
  const rows = [row("a", "ראש השנה 15%", "2026-09-01"), row("b", "סוכות 15% אופציונלי", "2026-09-01")];
  assert.equal(groupIntoClusters(rows).length, 2);
});

test("the same event far apart in time is two initiatives", () => {
  const rows = [row("a", "Back in stock", "2026-09-10"), row("b", "Back in stock", "2026-09-25")];
  const clusters = groupIntoClusters(rows);
  assert.equal(clusters.length, 2);
});

test("a launch phrase is an anchor; rows without any anchor stay separate", () => {
  const rows = [
    row("a", "השקת סאטן קוטור — קמפיין", "2026-09-05", { category: "קידום ממומן" }),
    row("b", "השקת סאטן קוטור: באנר", "2026-09-05", { category: "אתר" }),
    row("c", "הפקת תוכן עבור אוקטובר", "2026-09-05", { category: "תוכן" })
  ];
  const clusters = groupIntoClusters(rows);
  assert.equal(clusters.length, 2);
  const launch = clusters.find((c) => c.anchor.kind === "launch")!;
  assert.equal(launch.rows.length, 2);
  assert.equal(titleFor(launch), "השקת סאטן קוטור");
  const other = clusters.find((c) => c.anchor.kind === "text")!;
  assert.equal(confidenceFor(other), "low");
});

test("a coupon code groups rows when no event is named", () => {
  const rows = [row("a", "קופון KIDS15 באתר", "2026-09-08", { category: "אתר" }), row("b", "SMS עם KIDS15", "2026-09-09", { category: "SMS" })];
  const clusters = groupIntoClusters(rows);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].anchor.kind, "coupon");
});

test("anchors: event beats coupon beats product", () => {
  const anchors = extractAnchors("ראש השנה — קוד EXTRANAP על Second Skin", ["Second Skin"]);
  assert.deepEqual(anchors.map((a) => a.kind).sort(), ["coupon", "event", "product"]);
});

test("decision hooks: conditional launch gets a 7-day window before start", () => {
  const hooks = detectDecisionHooks({ id: "r1", task: "הנחה לסוכות 15% אופציונלי בהתאם לקצב מכירות חודשי", start: "2026-09-25", end: "2026-09-30" }, "סוכות");
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].kind, "conditional");
  assert.equal(hooks[0].windowStart, "2026-09-18");
  assert.equal(hooks[0].windowEnd, "2026-09-30");
  assert.match(hooks[0].question.he, /סוכות/);
});

test("decision hooks: a scheduled review gets a window around its date", () => {
  const hooks = detectDecisionHooks({ id: "r2", task: "הערכת מצב קמפיין — משאירים ככה עד סוף ספט׳ או מעלים שוב 15% הנחה", start: "2026-09-22", end: "2026-09-22" }, "קמפיין");
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].kind, "review");
  assert.equal(hooks[0].windowStart, "2026-09-21");
  assert.equal(hooks[0].windowEnd, "2026-09-24");
});

test("decision hooks: 'check status and consider continuation' is a review; plain tasks are not hooks", () => {
  assert.equal(detectDecisionHooks({ id: "r3", task: "השקת סאטן קוטור - לבדוק סטטוס קמפיין (כמה מכירות) ולבחון המשך", start: "2026-09-13", end: "2026-09-13" }, "השקת סאטן קוטור").length, 1);
  assert.equal(detectDecisionHooks({ id: "r4", task: "ניוזלטר ראש השנה", start: "2026-09-02", end: "2026-09-02" }, "ראש השנה").length, 0);
});

test("hook ids are stable", () => {
  const a = detectDecisionHooks({ id: "r1", task: "אופציונלי", start: "2026-09-25", end: "2026-09-25" }, "x")[0].id;
  const b = detectDecisionHooks({ id: "r1", task: "אופציונלי", start: "2026-09-25", end: "2026-09-25" }, "y")[0].id;
  assert.equal(a, b);
});
