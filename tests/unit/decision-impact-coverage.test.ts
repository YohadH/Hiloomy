// Decision Impact, coverage layer: what Hiloomy CHECKED per domain (distinct
// from what it surfaced), attention compression, and the business context
// built only from the plan's named events — never from a fabricated calendar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBusinessContext, buildCoverage, computeDecisionImpact } from "@/lib/services/decision-impact-service";
import type { AuditCoverageSnapshot } from "@/lib/services/decision-candidate-audit-service";
import type { DataHealth } from "@/lib/services/decision-inbox-service";
import type { PlanView } from "@/lib/domain/plan";
import type { Decision, HumanChoice, JudgmentTag } from "@/lib/domain/decision";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();

function decision(
  id: string,
  kind: string,
  over: { surfacedHoursAgo?: number | null; choice?: HumanChoice; decidedHoursAgo?: number; optionKey?: string; tags?: JudgmentTag[]; changed?: boolean | null; outcome?: "win" | "neutral" | "miss" | "no_data"; status?: Decision["status"] } = {}
): Decision {
  const surfacedAt = over.surfacedHoursAgo === null ? null : iso(over.surfacedHoursAgo ?? 48);
  return {
    id,
    kind,
    status: over.status ?? "act",
    critical: false,
    title: { he: id, en: id },
    question: { he: `שאלה ${id}`, en: `Question ${id}` },
    whyNow: { he: "", en: "why" },
    trigger: { he: "", en: "" },
    evidence: [],
    exposure: [],
    connected: { inputs: [], statement: { he: "", en: "" }, conclusion: { he: "", en: "" } },
    domains: ["inventory", "shopify"],
    materiality: null,
    options: [],
    recommendation: { he: "", en: "rec" },
    reason: null,
    confidence: "high",
    confidenceReason: { he: "", en: "" },
    missingEvidence: [],
    wouldChange: [],
    unknown: null,
    primaryAction: "review",
    rank: 0,
    createdAt: iso(72),
    detectedAt: iso(72),
    ledger: { state: "open", firstDetectedAt: iso(72), lastEvaluatedAt: iso(1), surfacedAt, snapshots: [] },
    human: { choice: over.choice ?? "pending", optionKey: over.optionKey, decidedAt: over.decidedHoursAgo !== undefined ? iso(over.decidedHoursAgo) : undefined },
    judgment: over.tags ? { tags: over.tags, changedDecision: over.changed ?? null, at: iso(1), by: "t" } : null,
    outcome: over.outcome ? { verdict: over.outcome, summary: { he: "", en: "" }, measuredAt: iso(0) } : null,
    entity: null
  } as Decision;
}

const audit = (over: Partial<AuditCoverageSnapshot> = {}): AuditCoverageSnapshot => ({
  runAt: iso(2),
  rawSignals: 29,
  managementCandidates: 6,
  candidatesOnToday: 3,
  signalsOnToday: 11,
  coverage: { inventory: { checked: 247, unit: "products" }, paid_media: { checked: 18, unit: "campaigns" }, plan: { checked: 4, unit: "initiatives" }, market: { checked: 5, unit: "competitors" }, discount_profit: { checked: 82, unit: "products with a real cost" } },
  domains: {
    inventory: { eligible: true, signals: 24, candidates: 3, candidatesOnToday: 2, signalsOnToday: 0, noneReason: null, noneTitle: null },
    paid_media: { eligible: true, signals: 1, candidates: 1, candidatesOnToday: 1, signalsOnToday: 0, noneReason: null, noneTitle: null },
    plan: { eligible: true, signals: 1, candidates: 1, candidatesOnToday: 0, signalsOnToday: 0, noneReason: null, noneTitle: null },
    market: { eligible: true, signals: 1, candidates: 1, candidatesOnToday: 1, signalsOnToday: 0, noneReason: null, noneTitle: null },
    discount_profit: { eligible: true, signals: 1, candidates: 0, candidatesOnToday: 0, signalsOnToday: 0, noneReason: null, noneTitle: null },
    affiliate: { eligible: false, signals: 0, candidates: 0, candidatesOnToday: 0, signalsOnToday: 0, noneReason: "NOT_ELIGIBLE", noneTitle: { he: "אין תוכנית שותפים", en: "No affiliate program with attributions" } },
    returns: { eligible: false, signals: 0, candidates: 0, candidatesOnToday: 0, signalsOnToday: 0, noneReason: "NO_ENGINE", noneTitle: { he: "אין מנוע", en: "No engine" } }
  },
  ...over
});

const health = (rows: Array<[string, "healthy" | "partial" | "missing", string]>): DataHealth =>
  ({ rows: rows.map(([key, state, en]) => ({ key, label: { he: key, en: key }, state, detail: { he: en, en }, fixHref: null })), score: null, confidence: null, costCoveragePct: 0 }) as unknown as DataHealth;

test("coverage: checked with zero surfaced is a positive state, not-eligible carries its reason, partial comes from Data Health", () => {
  const rows = buildCoverage(audit(), health([["cogs", "partial", "42% cost coverage"], ["meta", "healthy", "Connected"]]), { inventory: 10, plan: 1 });
  const by = (d: string) => rows.find((r) => r.domain === d)!;
  assert.equal(by("paid_media").eligibility, "checked");
  assert.equal(by("paid_media").checkedCount, 18);
  assert.equal(by("paid_media").candidates, 1);
  assert.equal(by("paid_media").surfaced, 0);
  assert.equal(by("inventory").surfaced, 10);
  assert.equal(by("affiliate").eligibility, "not_eligible");
  assert.match(by("affiliate").reason!.en, /No affiliate program/);
  assert.equal(by("discount_profit").eligibility, "partial");
  assert.match(by("discount_profit").reason!.en, /42%/);
  assert.equal(by("returns").eligibility, "not_eligible");
});

test("coverage without an audit pass falls back to Data Health and says counts are not measured", () => {
  const rows = buildCoverage(null, health([["meta", "missing", "Meta not connected"], ["inventory", "healthy", "Synced"]]), {});
  const by = (d: string) => rows.find((r) => r.domain === d)!;
  assert.equal(by("paid_media").eligibility, "not_eligible");
  assert.match(by("paid_media").reason!.en, /not connected/);
  assert.equal(by("inventory").eligibility, "not_measured");
  assert.equal(by("inventory").checkedCount, null);
});

test("business context: windows come only from the plan's named events; the most urgent decision is the one inside the soonest window", () => {
  const plan = {
    sheetId: "s",
    title: "sep",
    rangeStart: "2026-09-01",
    rangeEnd: "2026-09-30",
    today: "2026-09-10",
    initiatives: [
      { id: "i1", kind: "move", anchor: { kind: "event", label: "ראש השנה" }, start: "2026-09-10", end: "2026-09-13", relatedDecisions: [{ id: "d1", hookId: "h", state: "open", choice: "pending", optionKey: null, decidedAt: null, question: { he: "", en: "" } }] },
      { id: "i2", kind: "move", anchor: { kind: "event", label: "ראש השנה" }, start: "2026-09-02", end: "2026-09-13", relatedDecisions: [] },
      { id: "i3", kind: "move", anchor: { kind: "event", label: "סוכות" }, start: "2026-09-20", end: "2026-09-30", relatedDecisions: [] },
      { id: "i4", kind: "move", anchor: { kind: "text", label: "content" }, start: "2026-09-10", end: "2026-09-12", relatedDecisions: [] },
      { id: "i5", kind: "unattached", anchor: { kind: "event", label: "חנוכה" }, start: "2026-09-11", end: "2026-09-11", relatedDecisions: [] }
    ]
  } as unknown as PlanView;
  const planDecision = decision("d1", "plan_decision", { surfacedHoursAgo: 5 });
  planDecision.entity = { type: "plan_initiative", id: "i1", label: "ראש השנה" };
  const ctx = buildBusinessContext(plan, [planDecision, decision("s1", "stockout_imminent")], audit(), buildCoverage(audit(), null, {}), NOW);
  assert.equal(ctx.calendarSource, "plan");
  // Rosh Hashana (active) and Sukkot (starts within 14 days); the text anchor and the unattached row are not windows.
  assert.deepEqual(ctx.windows.map((w) => w.title), ["ראש השנה", "סוכות"]);
  const rosh = ctx.windows[0];
  assert.equal(rosh.initiativeCount, 2);
  assert.equal(rosh.startingToday, 1);
  assert.equal(rosh.openDecisions, 1);
  assert.equal(rosh.state, "active");
  assert.equal(ctx.windows[1].state, "upcoming");
  assert.equal(ctx.summary.activeInitiatives, 3);
  assert.equal(ctx.summary.campaignsChecked, 18);
  assert.equal(ctx.summary.inventoryRisks, 1);
  assert.equal(ctx.mostUrgent?.id, "d1");
});

test("business context without a plan has no windows and no fabricated events", () => {
  const ctx = buildBusinessContext(null, [], null, buildCoverage(null, null, {}), NOW);
  assert.equal(ctx.calendarSource, null);
  assert.equal(ctx.windows.length, 0);
  assert.equal(ctx.summary.activeInitiatives, null);
  assert.equal(ctx.mostUrgent, null);
});

test("compression: all three funnel numbers come from ONE audit pass; the period's surfaced count is a separate scope", () => {
  const r = computeDecisionImpact([decision("a", "stockout_imminent", { surfacedHoursAgo: 3 }), decision("b", "stockout_imminent", { surfacedHoursAgo: 4 })], { now: NOW, days: 7, domain: null, learnings: [], audit: audit() });
  assert.equal(r.compression.rawSignals, 29);
  assert.equal(r.compression.candidates, 6);
  assert.equal(r.compression.candidatesOnToday, 3);
  assert.equal(r.compression.signalsOnToday, 11);
  assert.equal(r.compression.surfacedInPeriod, 2);
  assert.ok(r.compression.candidatesOnToday! <= r.compression.candidates!);
  assert.ok(r.compression.candidates! <= r.compression.rawSignals!);
  // Without an audit pass the funnel is absent, never faked as zeros.
  const none = computeDecisionImpact([], { now: NOW, days: 7, domain: null, learnings: [], audit: null });
  assert.equal(none.compression.rawSignals, null);
  assert.equal(none.compression.candidatesOnToday, null);
  assert.equal(none.compression.surfacedInPeriod, 0);
});

test("coverage summary counts checked domains vs domains that surfaced; per-domain candidatesOnToday carries through", () => {
  const rows = Array.from({ length: 6 }, (_, i) => decision(`s${i}`, "stockout_imminent", { surfacedHoursAgo: 2 }));
  const r = computeDecisionImpact(rows, { now: NOW, days: 7, domain: null, learnings: [], audit: audit(), health: health([["cogs", "partial", "42%"]]) });
  // inventory, paid_media, plan, market checked; discount_profit partial → 5 evaluated; only inventory surfaced
  assert.equal(r.coverageSummary.checkedDomains, 5);
  assert.equal(r.coverageSummary.domainsWithSurfaced, 1);
  const plan = r.coverage.find((c) => c.domain === "plan")!;
  assert.equal(plan.candidates, 1);
  assert.equal(plan.candidatesOnToday, 0); // "1 candidate was evaluated but did not pass the threshold" is true here
  assert.equal(plan.surfaced, 0);
  assert.equal(plan.lastCheckedAt, audit().runAt);
});

test("inventory dominance is flagged only at ≥5 surfaced and ≥70% share, and points at the audit rather than judging", () => {
  const inv = (n: number) => Array.from({ length: n }, (_, i) => decision(`i${i}`, "stockout_imminent", { surfacedHoursAgo: 2 }));
  const other = (n: number) => Array.from({ length: n }, (_, i) => decision(`p${i}`, "plan_decision", { surfacedHoursAgo: 2 }));
  assert.equal(computeDecisionImpact([...inv(4)], { now: NOW, days: 7, domain: null, learnings: [] }).dominance, null);
  assert.equal(computeDecisionImpact([...inv(5), ...other(3)], { now: NOW, days: 7, domain: null, learnings: [] }).dominance, null); // 62%
  const d = computeDecisionImpact([...inv(7), ...other(2)], { now: NOW, days: 7, domain: null, learnings: [] }).dominance;
  assert.equal(d?.domain, "inventory");
  assert.equal(d?.surfaced, 7);
  assert.equal(d?.total, 9);
});

test("freshness: real timestamps flow to the coverage row; a domain without a sync has null, never a fabricated time", () => {
  const rows = buildCoverage(audit(), null, {}, { inventory: { at: iso(3), label: { he: "סנכרון מלאי", en: "Inventory sync" } } });
  const by = (d: string) => rows.find((r) => r.domain === d)!;
  assert.equal(by("inventory").sourceSyncedAt, iso(3));
  assert.equal(by("inventory").sourceSyncLabel?.en, "Inventory sync");
  assert.equal(by("paid_media").sourceSyncedAt, null);
});

test("Meta not connected is always stated on the paid-media row, with the incomplete-decisions warning", () => {
  const withAudit = buildCoverage(audit({ domains: { ...audit().domains, paid_media: { eligible: false, signals: 0, candidates: 0, candidatesOnToday: 0, signalsOnToday: 0, noneReason: "NOT_ELIGIBLE", noneTitle: { he: "x", en: "x" } } } }), null, {});
  assert.match(withAudit.find((r) => r.domain === "paid_media")!.reason!.en, /Meta not connected — paid-media decisions may be incomplete/);
  const withoutAudit = buildCoverage(null, health([["meta", "missing", "Meta not connected"]]), {});
  assert.match(withoutAudit.find((r) => r.domain === "paid_media")!.reason!.en, /Meta not connected — paid-media decisions may be incomplete/);
});

test("business context windows carry starts/ends, related decisions, thin-stock products and the open question; the summary line is deterministic", () => {
  const product = (id: string, coverDays: number | null) => ({ productId: id, title: id, inventory: 10, units14d: 5, unitsPrior14d: 5, coverDays, hasRealCost: true, liveCampaigns: 0 });
  const plan = {
    sheetId: "s",
    title: "sep",
    rangeStart: "2026-09-01",
    rangeEnd: "2026-09-30",
    today: "2026-09-10",
    initiatives: [
      {
        id: "i1",
        kind: "move",
        anchor: { kind: "event", label: "ראש השנה" },
        start: "2026-09-10",
        end: "2026-09-13",
        products: [product("p1", 6), product("p2", 30), product("p3", null)],
        relatedDecisions: [
          { id: "d0", hookId: "h0", state: "resolved", choice: "approved", optionKey: "keep", decidedAt: iso(30), question: { he: "ישן", en: "old" } },
          { id: "d1", hookId: "h", state: "open", choice: "pending", optionKey: null, decidedAt: null, question: { he: "להעמיק?", en: "Go deeper?" } }
        ]
      },
      { id: "i2", kind: "move", anchor: { kind: "event", label: "ראש השנה" }, start: "2026-09-02", end: "2026-09-13", products: [product("p1", 6), product("p4", 2)], relatedDecisions: [] },
      { id: "i3", kind: "move", anchor: { kind: "event", label: "סוכות" }, start: "2026-09-20", end: "2026-09-30", products: [], relatedDecisions: [] }
    ]
  } as unknown as PlanView;
  const ctx = buildBusinessContext(plan, [decision("d1", "plan_decision", { surfacedHoursAgo: 5 })], audit(), buildCoverage(audit(), null, {}), NOW);
  const rosh = ctx.windows[0];
  assert.equal(rosh.state, "active");
  assert.equal(rosh.daysLeft, 3);
  assert.equal(rosh.relatedDecisions, 2);
  assert.equal(rosh.openDecisions, 1);
  assert.equal(rosh.thinStockProducts, 2); // p1 (once, deduped) + p4; null cover is not "thin"
  assert.equal(rosh.openQuestion?.en, "Go deeper?");
  assert.equal(rosh.openDecisionHref, "/today/d1");
  const sukkot = ctx.windows[1];
  assert.equal(sukkot.daysUntil, 10);
  assert.equal(sukkot.openQuestion, null);
  assert.equal(sukkot.thinStockProducts, 0);
  assert.equal(ctx.summaryLine.en, "ראש השנה is under way, 2 initiatives are active, Meta is live (18 campaigns), 0 inventory risks are open, 1 plan decision requires attention.");
  const bare = buildBusinessContext(null, [], null, buildCoverage(null, null, {}), NOW);
  assert.equal(bare.summaryLine.en, "0 inventory risks are open.");
});
