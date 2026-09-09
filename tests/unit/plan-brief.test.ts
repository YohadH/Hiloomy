// Plan briefs are composed from Commercial Initiatives, not raw cells:
// one initiative appears once, a team brief holds only that team's work,
// a decision hook is a dependency, and a duplicated coupon is ONE note.

import { test } from "node:test";
import assert from "node:assert/strict";
import { composePlanBrief, actionHref } from "@/lib/services/plan-brief-service";
import type { ExecutionAction, Initiative, PlanView } from "@/lib/domain/plan";

const exec = (rowId: string, role: string | null, channel: string, start: string, text = `${channel} ${rowId}`, actionType: string | null = null, state: "done" | "open" = "open"): ExecutionAction => ({
  rowId,
  text,
  channel,
  role,
  actionType,
  key: `${text}|${channel}|${start}`,
  start,
  end: start,
  state,
  executedAt: null
});

const initiative = (over: Partial<Initiative>): Initiative => ({
  id: "i1",
  sheetId: "s1",
  kind: "move",
  excludedFromEngine: false,
  title: "ראש השנה",
  anchor: { kind: "event", label: "ראש השנה" },
  groupingConfidence: "high",
  category: null,
  start: "2026-09-01",
  end: "2026-09-13",
  days: 13,
  offer: { discountPct: 15, couponCode: "EXTRANAP" },
  products: [],
  channels: ["אתר", "ניוזלטר"],
  executions: [],
  dependencies: [{ kind: "coupon", label: { he: "קופון", en: "Coupon" }, state: "ok", detail: { he: "קיים", en: "exists" } }],
  checked: [],
  status: "live",
  statusReason: null,
  profitConfidence: null,
  decisionHooks: [],
  relatedDecisions: [],
  rowIds: [],
  ...over
});

const plan = (initiatives: Initiative[]): PlanView => ({
  sheetId: "s1",
  title: "take a nap sep",
  rangeStart: "2026-09-01",
  rangeEnd: "2026-09-30",
  today: "2026-09-09",
  initiatives,
  unattachedCount: initiatives.filter((i) => i.kind === "unattached").length,
  executionsTotal: initiatives.reduce((n, i) => n + i.executions.length, 0),
  days: [],
  counts: { planned: 0, ready: 0, watch: 0, needs_decision: 0, blocked: 0, live: 0, review: 0, completed: 0, total: 0 },
  upcoming: [],
  decisionsPending: [],
  health: { tone: "good", line: { he: "", en: "" } },
  generatedAt: "2026-09-09T00:00:00.000Z"
});

const opts = (kind: "commercial" | "role", role: "web" | "email" | "customer_service" | null = null) => ({
  kind,
  role,
  month: "2026-09",
  brandName: "Take a Nap",
  baseUrl: "https://www.hiloomy.com",
  rowText: new Map([["w1", "באנר ראש השנה בדף הבית\nעד 6.9"]]),
  now: new Date("2026-09-09T00:00:00.000Z")
});

test("commercial brief: one block per move, actions grouped by owner, unattached listed once at the end", () => {
  const rosh = initiative({ executions: [exec("w1", "web", "אתר", "2026-09-01"), exec("e1", "email", "ניוזלטר", "2026-09-02"), exec("m1", "marketing", "סיפור ראשי", "2026-09-01")] });
  const single = initiative({ id: "u1", kind: "unattached", title: "ניוזלטר 17.9", executions: [exec("e9", "email", "ניוזלטר", "2026-09-17")] });
  const b = composePlanBrief(plan([rosh, single]), opts("commercial"));
  assert.equal(b.initiatives.length, 1);
  assert.deepEqual(b.initiatives[0].owners, ["marketing", "web", "email"]);
  assert.deepEqual(b.initiatives[0].actionsByRole.map((g) => g.role), ["marketing", "web", "email"]);
  assert.equal(b.standalone.length, 1);
  assert.equal(b.header.initiatives, 1);
  assert.equal(b.header.actions, 4);
  // The cell's FULL text reaches the brief, not the first line.
  assert.equal(b.initiatives[0].actionsByRole[1].actions[0].text, "באנר ראש השנה בדף הבית\nעד 6.9");
});

test("role brief: only initiatives the team touches, only its actions, first due = earliest open action", () => {
  const rosh = initiative({ executions: [exec("w1", "web", "אתר", "2026-09-06"), exec("w2", "web", "אתר", "2026-09-03", "פופאפ", null, "done"), exec("e1", "email", "ניוזלטר", "2026-09-02")] });
  const sukkot = initiative({ id: "i2", title: "סוכות", start: "2026-09-20", end: "2026-09-30", executions: [exec("e2", "email", "ניוזלטר", "2026-09-21")] });
  const b = composePlanBrief(plan([rosh, sukkot]), opts("role", "web"));
  assert.equal(b.initiatives.length, 1);
  assert.equal(b.initiatives[0].actionsByRole.length, 1);
  assert.equal(b.initiatives[0].actionsByRole[0].actions.length, 2);
  assert.equal(b.initiatives[0].firstDue, "2026-09-06");
  assert.equal(b.header.actions, 2);
});

test("email brief keeps standalone sends (no move) — they are real work", () => {
  const single = initiative({ id: "u1", kind: "unattached", title: "ניוזלטר 17.9", executions: [exec("e9", "email", "ניוזלטר", "2026-09-17", "ניוזלטר 10:00 — Back in stock")] });
  const b = composePlanBrief(plan([single]), opts("role", "email"));
  assert.equal(b.initiatives.length, 0);
  assert.equal(b.standalone.length, 1);
  assert.equal(b.standalone[0].text, "ניוזלטר 10:00 — Back in stock");
});

test("a decision hook is a management-decision dependency, linked to Today when the ledger row exists", () => {
  const hook = { id: "h1", rowId: "m1", kind: "conditional" as const, sourceText: "15% לסוכות אופציונלי בהתאם לקצב מכירות חודשי", question: { he: "להפעיל 15% לסוכות?", en: "Activate 15% for Sukkot?" }, windowStart: "2026-09-15", windowEnd: "2026-09-30", requiredEvidence: [] };
  const upcoming = initiative({ id: "i2", title: "סוכות", start: "2026-09-20", end: "2026-09-30", status: "planned", executions: [exec("m1", "marketing", "סיפור ראשי", "2026-09-20")], decisionHooks: [hook] });
  let b = composePlanBrief(plan([upcoming]), opts("commercial"));
  assert.equal(b.initiatives[0].decision?.state, "upcoming");
  assert.equal(b.initiatives[0].decision?.due, "2026-09-15");
  assert.equal(b.header.decisionsPending, 1);

  const pending = initiative({ ...upcoming, status: "needs_decision", relatedDecisions: [{ id: "alert123456", hookId: "h1", state: "open", choice: "pending", optionKey: null, decidedAt: null, question: hook.question }] });
  b = composePlanBrief(plan([pending]), opts("commercial"));
  assert.equal(b.initiatives[0].decision?.state, "pending");
  assert.equal(b.initiatives[0].decision?.displayId, "D-23456");
  assert.equal(b.initiatives[0].decision?.todayUrl, "https://www.hiloomy.com/today?open=alert123456");

  const expired = initiative({ ...upcoming, relatedDecisions: [{ id: "alert123456", hookId: "h1", state: "resolved", choice: "expired", optionKey: null, decidedAt: "2026-10-01T05:00:00.000Z", question: hook.question }] });
  b = composePlanBrief(plan([expired]), opts("commercial"));
  assert.equal(b.initiatives[0].decision?.state, "expired");
  assert.equal(b.header.decisionsPending, 0);
});

test("a coupon shared by two moves is one note per move, not a warning per cell", () => {
  const a = initiative({ id: "a", title: "ראש השנה", executions: [exec("m1", "marketing", "סיפור ראשי", "2026-09-01"), exec("e1", "email", "ניוזלטר", "2026-09-02"), exec("s1", "email", "SMS", "2026-09-03")] });
  const b2 = initiative({ id: "b", title: "Give & Take", start: "2026-09-10", end: "2026-09-12", executions: [exec("m2", "marketing", "סיפור ראשי", "2026-09-10")] });
  const b = composePlanBrief(plan([a, b2]), opts("commercial"));
  assert.equal(b.initiatives[0].notes.length, 1);
  assert.match(b.initiatives[0].notes[0].he, /EXTRANAP/);
  assert.match(b.initiatives[0].notes[0].he, /Give & Take/);
  assert.equal(b.initiatives[1].notes.length, 1);
});

test("customer service sees offers and launches only, with no actions to own", () => {
  const offer = initiative({ executions: [exec("m1", "marketing", "סיפור ראשי", "2026-09-01")] });
  const content = initiative({ id: "c", title: "הפקת תוכן", anchor: { kind: "text", label: "הפקת תוכן" }, offer: { discountPct: null, couponCode: null }, executions: [exec("g1", "graphic", "תוכן", "2026-09-05")] });
  const b = composePlanBrief(plan([offer, content]), opts("role", "customer_service"));
  assert.equal(b.initiatives.length, 1);
  assert.equal(b.initiatives[0].actionsByRole.length, 0);
});

test("month filter: an October move is not in the September brief", () => {
  const oct = initiative({ id: "o", title: "אוקטובר", start: "2026-10-03", end: "2026-10-05", executions: [exec("m1", "marketing", "סיפור ראשי", "2026-10-03")] });
  const b = composePlanBrief(plan([oct]), opts("commercial"));
  assert.equal(b.initiatives.length, 0);
});

test("action links: absolute, carry the move as the brief; unknown types have none", () => {
  assert.match(actionHref("creative_banner", "ראש השנה · 15%\nבאנר", "https://www.hiloomy.com") ?? "", /^https:\/\/www\.hiloomy\.com\/creative\/new\?type=META_AD&prompt=/);
  assert.equal(actionHref("web_update", "x", "https://www.hiloomy.com"), null);
  assert.equal(actionHref(null, "x", "https://www.hiloomy.com"), null);
});
