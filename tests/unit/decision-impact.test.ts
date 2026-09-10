// Decision Impact measures Hiloomy, not the store: denominators are real,
// unanswered decisions are never counted as negative, expired/auto-closed
// rows never enter timing or outcomes, and nothing financial is invented.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDecisionImpact, formatDuration, parseImpactDays } from "@/lib/services/decision-impact-service";
import type { Decision, HumanChoice, JudgmentTag } from "@/lib/domain/decision";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();

function decision(
  id: string,
  kind: string,
  over: {
    surfacedHoursAgo?: number | null;
    choice?: HumanChoice;
    decidedHoursAgo?: number;
    optionKey?: string;
    tags?: JudgmentTag[];
    changed?: boolean | null;
    outcome?: "win" | "neutral" | "miss" | "no_data";
    status?: Decision["status"];
    domains?: Decision["domains"];
  } = {}
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
    domains: over.domains ?? ["inventory", "shopify"],
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

test("no decisions → zeros, no rates, no stories", () => {
  const r = computeDecisionImpact([], { now: NOW, days: 30, domain: null });
  assert.equal(r.surfaced, 0);
  assert.equal(r.judgments.total, 0);
  assert.equal(r.timing.medianMs, null);
  assert.equal(r.outcomes.winRate, null);
  assert.equal(r.stories.length, 0);
  assert.equal(r.memory.comparableEpisodes, null);
});

test("only surfaced decisions count; watch-only signals never surfaced do not", () => {
  const r = computeDecisionImpact([decision("a", "stockout_imminent"), decision("b", "stockout_imminent", { surfacedHoursAgo: null })], { now: NOW, days: 30, domain: null });
  assert.equal(r.surfaced, 1);
  assert.equal(r.memory.recorded, 2);
});

test("judgment rates use judged decisions only; unanswered are not negative", () => {
  const rows = [
    decision("u1", "stockout_imminent", { tags: ["useful"], changed: true }),
    decision("u2", "commission_leakage", { tags: ["useful", "obvious"], changed: false }),
    decision("w1", "roas_collapse", { tags: ["wrong"], changed: null }),
    decision("n1", "stockout_imminent") // no judgment
  ];
  const r = computeDecisionImpact(rows, { now: NOW, days: 30, domain: null });
  assert.equal(r.surfaced, 4);
  assert.equal(r.judgments.total, 3);
  assert.equal(r.judgments.useful, 2);
  assert.equal(r.judgments.obvious, 1);
  assert.equal(r.judgments.wrong, 1);
  assert.equal(r.judgments.highValue, 1); // useful and not obvious
  assert.equal(r.judgments.changedAnswered, 2);
  assert.equal(r.judgments.changed, 1);
  assert.equal(r.judgments.confirmed, 1);
});

test("time to decision: surfaced → human answer only; expired, auto-closed and pending are excluded; reversed timestamps are counted as anomalies", () => {
  const rows = [
    decision("a", "stockout_imminent", { surfacedHoursAgo: 48, choice: "approved", decidedHoursAgo: 46 }), // 2h
    decision("b", "stockout_imminent", { surfacedHoursAgo: 48, choice: "alternative", decidedHoursAgo: 24 }), // 24h
    decision("c", "stockout_imminent", { surfacedHoursAgo: 48, choice: "ignored", decidedHoursAgo: 47.5 }), // 30m
    decision("d", "plan_decision", { surfacedHoursAgo: 48, choice: "expired", decidedHoursAgo: 1 }),
    decision("e", "plan_decision", { surfacedHoursAgo: 48, choice: "auto_closed", decidedHoursAgo: 1 }),
    decision("f", "stockout_imminent", { surfacedHoursAgo: 48 }), // pending
    decision("g", "stockout_imminent", { surfacedHoursAgo: 10, choice: "approved", decidedHoursAgo: 20 }) // decided before surfaced
  ];
  const r = computeDecisionImpact(rows, { now: NOW, days: 30, domain: null });
  assert.equal(r.timing.sample, 3);
  assert.equal(r.timing.medianMs, 2 * 3_600_000);
  assert.equal(r.timing.fastestMs, 30 * 60_000);
  assert.equal(r.timing.slowestMs, 24 * 3_600_000);
  assert.equal(r.timing.pending, 1);
  assert.equal(r.timing.anomalies, 1);
  assert.deepEqual(r.timing.buckets, { under1h: 1, h1to4: 1, h4to24: 0, d1to3: 1, over3d: 0 });
  assert.ok(r.notes.some((n) => /decided before they were surfaced/.test(n.en)));
});

test("outcomes: eligible = answered by a human; no_data is neither win nor miss", () => {
  const rows = [
    decision("a", "stockout_imminent", { choice: "approved", decidedHoursAgo: 40, outcome: "win" }),
    decision("b", "stockout_imminent", { choice: "approved", decidedHoursAgo: 40, outcome: "miss" }),
    decision("c", "stockout_imminent", { choice: "ignored", decidedHoursAgo: 40, outcome: "no_data" }),
    decision("d", "stockout_imminent", { choice: "approved", decidedHoursAgo: 40 }), // not measured yet
    decision("e", "stockout_imminent", { choice: "expired", outcome: "win" }) // not eligible
  ];
  const r = computeDecisionImpact(rows, { now: NOW, days: 30, domain: null });
  assert.equal(r.outcomes.eligible, 4);
  assert.equal(r.outcomes.measured, 3);
  assert.equal(r.outcomes.win, 1);
  assert.equal(r.outcomes.miss, 1);
  assert.equal(r.outcomes.noData, 1);
  assert.equal(r.outcomes.winRate, 50);
});

test("plan impact: continued vs changed comes from the chosen option key, never inferred", () => {
  const rows = [
    decision("p1", "plan_decision", { choice: "approved", decidedHoursAgo: 1, optionKey: "activate", status: "test", tags: ["useful"], changed: false }),
    decision("p2", "plan_decision", { choice: "alternative", decidedHoursAgo: 1, optionKey: "hold", status: "change_plan", tags: ["useful"], changed: true }),
    decision("p3", "plan_decision", { choice: "approved", decidedHoursAgo: 1, status: "change_plan" }), // legacy row, no key
    decision("p4", "plan_decision") // pending
  ];
  const r = computeDecisionImpact(rows, { now: NOW, days: 30, domain: null });
  assert.equal(r.plan.surfaced, 4);
  assert.equal(r.plan.acted, 3);
  assert.equal(r.plan.continuedAsPlanned, 1);
  assert.equal(r.plan.changedPlan, 1);
  assert.equal(r.plan.optionUnknown, 1);
  assert.equal(r.plan.changePlanStatus, 2);
  assert.equal(r.plan.changed, 1);
});

test("period and domain filters apply to surfacedAt; domains table only lists domains with surfaced decisions", () => {
  const rows = [
    decision("old", "stockout_imminent", { surfacedHoursAgo: 24 * 40, tags: ["useful"] }),
    decision("new", "commission_leakage", { surfacedHoursAgo: 24, tags: ["obvious"] })
  ];
  const r30 = computeDecisionImpact(rows, { now: NOW, days: 30, domain: null });
  assert.equal(r30.surfaced, 1);
  assert.deepEqual(r30.domains.map((d) => d.key), ["affiliate"]);
  const rAll = computeDecisionImpact(rows, { now: NOW, days: null, domain: null });
  assert.equal(rAll.surfaced, 2);
  const rInv = computeDecisionImpact(rows, { now: NOW, days: null, domain: "inventory" });
  assert.equal(rInv.surfaced, 1);
  assert.equal(rInv.judgments.useful, 1);
});

test("stories prefer judged, measured, high-value, cross-domain decisions and link to the receipt", () => {
  const rows = [
    decision("plain", "stockout_imminent"),
    decision("best", "commission_leakage", { choice: "approved", decidedHoursAgo: 1, tags: ["useful"], changed: true, outcome: "win", domains: ["affiliate", "shopify"] }),
    decision("judged", "roas_collapse", { tags: ["obvious"] })
  ];
  const r = computeDecisionImpact(rows, { now: NOW, days: 30, domain: null });
  assert.equal(r.stories[0].id, "best");
  assert.equal(r.stories[0].href, "/today/best");
  assert.equal(r.stories.length, 3);
});

test("helpers: period parsing and duration formatting", () => {
  assert.equal(parseImpactDays("7"), 7);
  assert.equal(parseImpactDays("all"), null);
  assert.equal(parseImpactDays("x"), 30);
  assert.equal(formatDuration(45 * 60_000, "en"), "45m");
  assert.equal(formatDuration(3 * 3_600_000 + 42 * 60_000, "en"), "3h 42m");
  assert.equal(formatDuration(3 * 86_400_000 + 5 * 3_600_000, "en"), "3d 5h");
});
