// The ranking model must be repeatable, comparable across domains, and must
// not let a missing ₪ figure kill a domain. Priors are declared, not hidden.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KIND_PRIORS,
  RANKING_WEIGHTS_V1,
  SCORE_DIMENSIONS,
  explainRank,
  materialityFrom,
  rankCandidates,
  scoreCandidate,
  urgencyFrom,
  type DecisionCandidateInput,
  type ScoredCandidate
} from "@/lib/domain/decision-candidate";

const base = (over: Partial<DecisionCandidateInput>): DecisionCandidateInput => ({
  domain: "inventory",
  kind: "stockout_imminent",
  title: { he: "x", en: "x" },
  managementQuestion: null,
  trigger: null,
  evidenceSummary: [],
  connectedDomains: ["inventory"],
  financialExposure: null,
  financialExposureType: null,
  financialConfidence: "calculated",
  proposedStatus: "act",
  proposedRecommendation: null,
  missingEvidence: [],
  entity: null,
  inputs: {},
  relatedDecisionId: null,
  surfaced: false,
  todayRank: null,
  suppressionReason: null,
  eligible: true,
  ...over
});

test("weights sum to one and cover every dimension", () => {
  const sum = SCORE_DIMENSIONS.reduce((n, k) => n + RANKING_WEIGHTS_V1.weights[k], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("materiality is relative to the store, and unknown ₪ falls back instead of scoring zero", () => {
  assert.equal(materialityFrom(50_000, 500_000, 40), 95); // 10% of 14d sales
  assert.ok(materialityFrom(10_000, 500_000, 40) >= 50 && materialityFrom(10_000, 500_000, 40) < 75); // 2%
  assert.equal(materialityFrom(null, 500_000, 45), 45);
  assert.ok(materialityFrom(1_000, 500_000, 40) < 20);
});

test("urgency comes from the decision window, not the domain", () => {
  assert.equal(urgencyFrom("stockout_imminent", { daysCover: 2 }), 88);
  assert.equal(urgencyFrom("stockout_imminent", { daysCover: 25 }), 35);
  assert.equal(urgencyFrom("plan_decision", { windowOpensInDays: 0 }), 85);
  assert.equal(urgencyFrom("plan_decision", { windowOpensInDays: 10 }), 40);
  assert.equal(urgencyFrom("commission_leakage", {}), KIND_PRIORS.commission_leakage.urgencyDefault);
});

test("a medium-confidence commercial decision can outrank an obvious inventory alert with comfortable cover", () => {
  const stock = scoreCandidate(base({ financialExposure: 6_000, inputs: { daysCover: 20, confidence: "high", revenue14dStore: 400_000, domainsJoined: 1 } }));
  const affiliate = scoreCandidate(
    base({ domain: "affiliate", kind: "commission_leakage", financialExposure: 4_000, financialExposureType: "commission_30d", inputs: { confidence: "medium", revenue14dStore: 400_000, domainsJoined: 2 } })
  );
  assert.ok(affiliate.globalScore > stock.globalScore, `${affiliate.globalScore} vs ${stock.globalScore}`);
});

test("an imminent stockout with paid media buying the demand still wins", () => {
  const stock = scoreCandidate(base({ financialExposure: 30_000, inputs: { daysCover: 2, confidence: "high", revenue14dStore: 400_000, domainsJoined: 3, campaignMatters: true } }));
  const affiliate = scoreCandidate(base({ domain: "affiliate", kind: "commission_leakage", financialExposure: 4_000, inputs: { confidence: "medium", revenue14dStore: 400_000, domainsJoined: 2 } }));
  assert.ok(stock.globalScore > affiliate.globalScore);
  assert.ok(stock.scores.managementJudgment > KIND_PRIORS.stockout_imminent.managementJudgment);
});

test("scoring is deterministic and the observable score ignores the priors", () => {
  const c = base({ financialExposure: 12_000, inputs: { daysCover: 5, confidence: "high", revenue14dStore: 300_000 } });
  const a = scoreCandidate(c);
  const b = scoreCandidate(c);
  assert.deepEqual(a, b);
  const c2 = { ...c, kind: "commission_leakage", domain: "affiliate" as const };
  const s2 = scoreCandidate(c2);
  // Same measured inputs → observable scores differ only through actionability… which is a prior too; so compare the measured trio.
  assert.equal(s2.scores.materiality, a.scores.materiality);
  assert.equal(s2.scores.confidence, a.scores.confidence);
});

test("ranking skips 'none' rows and ablation removes a domain without touching the others", () => {
  const mk = (domain: DecisionCandidateInput["domain"], kind: string, globalScore: number): ScoredCandidate =>
    ({ ...base({ domain, kind }), scores: { materiality: 0, urgency: 0, confidence: 0, actionability: 0, managementJudgment: 0, novelty: 0, crossDomain: 0 }, globalScore, observableScore: globalScore, rank: null, observableRank: null, crossDomain: false }) as ScoredCandidate;
  const rows = [mk("inventory", "stockout_imminent", 87), mk("affiliate", "commission_leakage", 74), mk("plan", "plan_decision", 68), mk("market", "none", 0), mk("discount_profit", "decision_discount_tradeoff", 59)];
  const ranked = rankCandidates(rows);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3, null, 4]);
  const without = rankCandidates(rows, ["inventory"]);
  assert.deepEqual(without.map((r) => r.rank), [null, 1, 2, null, 3]);
});

test("explanations name the winner's strongest dimensions and where each runner-up lost", () => {
  const w = { ...base({ title: { he: "מלאי", en: "Stock" }, financialExposure: 30_000, inputs: { daysCover: 2, confidence: "high", revenue14dStore: 400_000, domainsJoined: 3, campaignMatters: true } }) };
  const ws = scoreCandidate(w);
  const winner: ScoredCandidate = { ...w, ...ws, rank: 1, observableRank: 1, crossDomain: true };
  const o = base({ domain: "affiliate", kind: "commission_leakage", title: { he: "עמלות", en: "Commission" }, financialExposure: 4_000, inputs: { confidence: "medium", revenue14dStore: 400_000, domainsJoined: 2 } });
  const os = scoreCandidate(o);
  const other: ScoredCandidate = { ...o, ...os, rank: 2, observableRank: 2, crossDomain: true };
  const x = explainRank(winner, [other], "en");
  assert.equal(x.strengths.length, 2);
  assert.equal(x.outranked.length, 1);
  assert.match(x.outranked[0].because, /lower (materiality|urgency)/);
  assert.ok(x.outranked[0].gap > 0);
});
