// The composer must: keep every domain in the run (probe or NONE row), tag
// every non-surfaced candidate with the reason Today applied (never a
// ranking loss when a cap hid it), rank globally, and report disagreement
// between Today's order and the global order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { composeRun, classifyInventoryBias, type LedgerCandidateSource, type ProbeData } from "@/lib/services/decision-candidate-audit-service";
import type { Decision } from "@/lib/domain/decision";

const decision = (id: string, kind: string, over: Partial<Decision> = {}): Decision =>
  ({
    id,
    kind,
    status: "act",
    critical: false,
    title: { he: id, en: id },
    question: { he: "?", en: "?" },
    whyNow: { he: "", en: "" },
    trigger: { he: "", en: "" },
    evidence: [],
    exposure: [],
    connected: { inputs: [], statement: { he: "", en: "" }, conclusion: { he: "", en: "" } },
    domains: ["inventory", "shopify"],
    materiality: null,
    options: [],
    recommendation: { he: "", en: "" },
    reason: null,
    confidence: "high",
    confidenceReason: { he: "", en: "" },
    missingEvidence: [],
    wouldChange: [],
    unknown: null,
    primaryAction: "review",
    rank: 20_000,
    createdAt: "2026-09-10T05:00:00.000Z",
    detectedAt: "2026-09-10T05:00:00.000Z",
    ledger: { state: "open", firstDetectedAt: "", lastEvaluatedAt: "", surfacedAt: null, snapshots: [] },
    human: { choice: "pending", optionKey: null, decidedAt: null, decidedBy: null },
    judgment: null,
    outcome: null,
    entity: null,
    ...over
  }) as Decision;

const src = (d: Decision, payload: Record<string, unknown> = {}, pending = true, duplicate = false): LedgerCandidateSource => ({ decision: d, payload, pending, duplicate });

const probes = (over: Partial<ProbeData> = {}): ProbeData => ({
  productEcon: [
    { productId: "p1", title: "RECETTE 702", units14: 40, net14: 30_000, realCost: true, inventory: 200, liveCampaigns: 0 },
    { productId: "p2", title: "Mist", units14: 10, net14: 4_000, realCost: true, inventory: 400, liveCampaigns: 0 }
  ],
  leakage: {
    windowStart: "",
    windowEnd: "",
    newCustomer: { conversions: 10, commission: 1_000, sales: 20_000 },
    returningCustomer: { conversions: 4, commission: 380, sales: 5_000 },
    unclassified: { conversions: 0, commission: 0 },
    leakageRate: 0.1,
    topLeakyAffiliates: []
  },
  leakageAllProtected: false,
  meta: null,
  plan: null,
  silentAlerts: [],
  discount: { worstLoss: null, thinnest: null, anyRealCost: true },
  competitors: null,
  ...over
});

const NOW = new Date("2026-09-10T05:00:00.000Z");

test("three inventory decisions: two cards, the third is DOMAIN_DISPLAY_CAP, never a ranking loss", () => {
  const a = decision("s1", "stockout_imminent", { rank: 40_000 });
  const b = decision("s2", "stockout_imminent", { rank: 30_000 });
  const c = decision("s3", "stockout_imminent", { rank: 20_000 });
  const run = composeRun({
    storeId: "st",
    now: NOW,
    ledger: [src(a, { daysToStockout: 2 }), src(b, { daysToStockout: 5 }), src(c, { daysToStockout: 9 })],
    cardIds: ["s1", "s2"],
    todayOrder: ["s1", "s2", "s3"],
    probes: probes()
  });
  const byId = (id: string) => run.candidates.find((x) => x.relatedDecisionId === id)!;
  assert.equal(byId("s1").surfaced, true);
  assert.equal(byId("s3").surfaced, false);
  assert.equal(byId("s3").suppressionReason, "DOMAIN_DISPLAY_CAP");
  assert.equal(byId("s3").todayRank, 3);
  // Every domain is present exactly once when it has no ledger row.
  for (const d of ["affiliate", "discount_profit", "paid_media", "product_performance", "plan", "market", "returns"]) {
    assert.equal(run.candidates.filter((x) => x.domain === d).length, 1, d);
  }
});

test("a domain the engine rejected still puts forward its strongest signal with the gate it applied", () => {
  const run = composeRun({ storeId: "st", now: NOW, ledger: [], cardIds: [], todayOrder: [], probes: probes() });
  const aff = run.candidates.find((x) => x.domain === "affiliate")!;
  assert.equal(aff.kind, "commission_leakage");
  assert.equal(aff.suppressionReason, "ENGINE_THRESHOLD");
  assert.match(aff.inputs.engineGate ?? "", /leakage 10% < 15%/);
  assert.equal(aff.financialExposure, 380);
  const inv = run.candidates.find((x) => x.domain === "inventory")!;
  assert.equal(inv.kind, "stockout_imminent");
  assert.match(inv.inputs.engineGate ?? "", /cover \d+d > 30d/);
  assert.ok(inv.rank !== null);
});

test("ineligible domains say so; returns has no engine", () => {
  const run = composeRun({ storeId: "st", now: NOW, ledger: [], cardIds: [], todayOrder: [], probes: probes({ meta: null, plan: null, leakage: null, competitors: null }) });
  const by = (d: string) => run.candidates.find((x) => x.domain === d)!;
  assert.equal(by("paid_media").suppressionReason, "NOT_ELIGIBLE");
  assert.equal(by("paid_media").eligible, false);
  assert.equal(by("affiliate").suppressionReason, "NOT_ELIGIBLE");
  assert.equal(by("returns").suppressionReason, "NO_ENGINE");
  assert.equal(by("returns").rank, null);
  assert.equal(by("market").suppressionReason, "NOT_ELIGIBLE");
});

test("decided and duplicate ledger rows are tagged, not counted as Today's choice", () => {
  const a = decision("a1", "commission_leakage", { rank: 4_000, domains: ["affiliate", "shopify"], human: { choice: "approved", optionKey: "x", decidedAt: "", decidedBy: "" } as Decision["human"] });
  const b = decision("a2", "commission_leakage", { rank: 4_000, domains: ["affiliate", "shopify"] });
  const run = composeRun({ storeId: "st", now: NOW, ledger: [src(a, {}, false), src(b, {}, true, true)], cardIds: [], todayOrder: [], probes: probes() });
  const byId = (id: string) => run.candidates.find((x) => x.relatedDecisionId === id)!;
  assert.equal(byId("a1").suppressionReason, "ALREADY_DECIDED");
  assert.equal(byId("a2").suppressionReason, "DUPLICATE");
  // The affiliate domain is covered by ledger rows → no probe row added.
  assert.equal(run.candidates.filter((x) => x.domain === "affiliate").length, 2);
});

test("summary records whether the global #1 differs from Today's #1", () => {
  // Today shows a comfortable-cover stock decision first; the global model prefers the leakage decision.
  const stock = decision("s1", "stockout_imminent", { rank: 6_000, confidence: "high" });
  const leak = decision("l1", "commission_leakage", { rank: 4_000, domains: ["affiliate", "shopify"], confidence: "medium", status: "test" });
  const run = composeRun({ storeId: "st", now: NOW, ledger: [src(stock, { daysToStockout: 25 }), src(leak)], cardIds: ["s1", "l1"], todayOrder: ["s1", "l1"], probes: probes() });
  const top = run.candidates.filter((c) => c.rank === 1)[0];
  assert.equal(top.relatedDecisionId, "l1");
  assert.equal(run.summary.topDiffers, true);
  assert.equal(run.summary.top3Overlap, 2);
});

test("bias classification needs feedback before it will call ranking bias", () => {
  const base = { candidateShare: 45, top3Share: 70, surfacedShare: 60, obviousRate: 60, usefulRate: 30, otherDomainsEligibleButNone: 2, otherDomainsEligibleRuns: 20, judgedInventory: 2, judgedOther: 1 };
  assert.equal(classifyInventoryBias(base).classification, "INCONCLUSIVE");
  assert.equal(classifyInventoryBias({ ...base, judgedInventory: 8, judgedOther: 6 }).classification, "RANKING_BIAS");
  assert.equal(classifyInventoryBias({ ...base, judgedInventory: 8, judgedOther: 6, obviousRate: 20, usefulRate: 70 }).classification, "REAL_BUSINESS_CONDITION");
  assert.equal(classifyInventoryBias({ ...base, top3Share: 30 }).classification, "NO_EVIDENCE_OF_BIAS");
  assert.equal(classifyInventoryBias({ ...base, candidateShare: 70, otherDomainsEligibleButNone: 15 }).classification, "GENERATION_BIAS");
});
