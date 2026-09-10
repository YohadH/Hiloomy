// The composer must: keep every domain in the run (probe or NONE row), tag
// every non-surfaced signal with the reason Today applied (never a ranking
// loss when a cap hid it), rank signals globally (unclustered), then group
// signals into management candidates by the action they imply, rank THOSE
// (clustered), and report both disagreements.

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
    human: { choice: "pending" },
    judgment: null,
    outcome: null,
    entity: { type: "product", id: `p-${id}`, label: id },
    ...over
  }) as Decision;

const stock = (id: string, revenue14: number, daysCover: number, campaignMatters = false): LedgerCandidateSource => ({
  decision: decision(id, "stockout_imminent", { rank: revenue14, materiality: campaignMatters ? { level: "material", detail: { he: "", en: "" }, spendShare: 0.3, attributedShare: 0.4 } : null, domains: campaignMatters ? ["inventory", "shopify", "meta"] : ["inventory", "shopify"] }),
  payload: { daysToStockout: daysCover, trailingRevenue: revenue14 },
  pending: true,
  duplicate: false
});

const src = (d: Decision, payload: Record<string, unknown> = {}, pending = true, duplicate = false): LedgerCandidateSource => ({ decision: d, payload, pending, duplicate });

const probes = (over: Partial<ProbeData> = {}): ProbeData => ({
  productEcon: [
    { productId: "p1", title: "RECETTE 702", units14: 40, net14: 30_000, cogs14: 12_000, realCost: true, inventory: 200, liveCampaigns: 0 },
    { productId: "p2", title: "Mist", units14: 10, net14: 4_000, cogs14: 2_000, realCost: true, inventory: 400, liveCampaigns: 0 }
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

test("signals: three inventory decisions → two cards, the third is DOMAIN_DISPLAY_CAP, never a ranking loss", () => {
  const run = composeRun({
    storeId: "st",
    now: NOW,
    ledger: [stock("s1", 40_000, 2), stock("s2", 30_000, 5), stock("s3", 20_000, 9)],
    cardIds: ["s1", "s2"],
    todayOrder: ["s1", "s2", "s3"],
    probes: probes()
  });
  const byId = (id: string) => run.signals.find((x) => x.relatedDecisionId === id)!;
  assert.equal(byId("s1").surfaced, true);
  assert.equal(byId("s3").surfaced, false);
  assert.equal(byId("s3").suppressionReason, "DOMAIN_DISPLAY_CAP");
  assert.equal(byId("s3").todayRank, 3);
  for (const d of ["affiliate", "discount_profit", "paid_media", "product_performance", "plan", "market", "returns"]) {
    assert.equal(run.signals.filter((x) => x.domain === d).length, 1, d);
  }
});

test("clustering: same replenishment judgment → one candidate with the strongest SKU as lead; raw signals kept and tagged", () => {
  // 2, 5 and 9 days: two are "replenish now" (≤7), one is "plan replenishment" (≤14).
  const run = composeRun({ storeId: "st", now: NOW, ledger: [stock("s1", 40_000, 2), stock("s2", 30_000, 5), stock("s3", 20_000, 9)], cardIds: ["s1", "s2"], todayOrder: ["s1", "s2", "s3"], probes: probes() });
  const inv = run.candidates.filter((c) => c.domain === "inventory");
  assert.equal(inv.length, 2);
  const now = inv.find((c) => c.actionFamily === "REPLENISH_NOW")!;
  assert.equal(now.memberCount, 2);
  assert.equal(now.kind, "inventory_replenishment_review");
  assert.match(now.title.en, /2 critical products need replenishment prioritization/);
  const lead = run.signals.find((s) => s.id === now.leadSignalId)!;
  assert.equal(lead.relatedDecisionId, "s1");
  assert.equal(lead.auditStatus, "LEAD");
  assert.equal(run.signals.find((s) => s.relatedDecisionId === "s2")!.auditStatus, "CLUSTERED_INTO_CANDIDATE");
  assert.equal(run.signals.find((s) => s.relatedDecisionId === "s2")!.clusterId, now.id);
  assert.deepEqual(now.cluster.memberDecisionIds.sort(), ["s1", "s2"]);
  assert.ok(now.cluster.reasons.en.some((r) => /same management action/.test(r)));
  // Raw signals still carry their own unclustered rank.
  assert.ok(run.signals.filter((s) => s.rank !== null).length >= 3);
  assert.equal(run.summary.rawSignals, run.signals.filter((s) => s.kind !== "none").length);
  assert.equal(run.summary.managementCandidates, run.candidates.length);
});

test("do not cluster: a constrained SKU with material paid demand is a different trade-off and stays separate", () => {
  const run = composeRun({ storeId: "st", now: NOW, ledger: [stock("a", 20_000, 3), stock("b", 25_000, 4, true)], cardIds: ["a", "b"], todayOrder: ["a", "b"], probes: probes() });
  const inv = run.candidates.filter((c) => c.domain === "inventory");
  assert.equal(inv.length, 2);
  const reroute = inv.find((c) => c.actionFamily === "REROUTE_ACQUISITION")!;
  assert.equal(reroute.kind, "inventory_acquisition_tradeoff");
  assert.equal(reroute.memberCount, 1);
  assert.match(reroute.managementQuestion!.en, /Reduce paid acquisition/);
  assert.equal(inv.find((c) => c.actionFamily === "REPLENISH_NOW")!.memberCount, 1);
});

test("bounded aggregation: twenty small SKUs do not outscore one important decision; a tiny SKU does not set the urgency", () => {
  const tiny = Array.from({ length: 20 }, (_, i) => stock(`t${i}`, 300, 1.2 + i * 0.1));
  const big = stock("big", 60_000, 6);
  const run = composeRun({ storeId: "st", now: NOW, ledger: [...tiny, big], cardIds: [], todayOrder: [], probes: probes() });
  const cluster = run.candidates.find((c) => c.actionFamily === "REPLENISH_NOW")!;
  assert.equal(cluster.memberCount, 21);
  // Lead is the commercially important SKU, not the one with the fewest days.
  assert.equal(run.signals.find((s) => s.id === cluster.leadSignalId)!.relatedDecisionId, "big");
  // Effective exposure saturates well below the raw sum.
  assert.ok(cluster.cluster.aggregate.effectiveExposure! < cluster.cluster.aggregate.combinedRevenue14!);
  assert.ok(cluster.scores.materiality <= 95);
  // Combined revenue is described, never as "at risk".
  assert.ok(cluster.evidenceSummary.some((l) => /associated with affected SKUs/.test(l)));
  assert.ok(!cluster.evidenceSummary.some((l) => /at risk/i.test(l)));
});

test("decided and duplicate signals stay signals and join no candidate", () => {
  const a = decision("a1", "commission_leakage", { rank: 4_000, domains: ["affiliate", "shopify"], human: { choice: "approved", optionKey: "x", decidedAt: "", decidedBy: "" } });
  const b = decision("a2", "commission_leakage", { rank: 4_000, domains: ["affiliate", "shopify"] });
  const run = composeRun({ storeId: "st", now: NOW, ledger: [src(a, {}, false), src(b, {}, true, true)], cardIds: [], todayOrder: [], probes: probes() });
  const byId = (id: string) => run.signals.find((x) => x.relatedDecisionId === id)!;
  assert.equal(byId("a1").suppressionReason, "ALREADY_DECIDED");
  assert.equal(byId("a1").auditStatus, "NOT_CLUSTERED");
  assert.equal(byId("a2").suppressionReason, "DUPLICATE");
  assert.equal(run.candidates.filter((c) => c.domain === "affiliate").length, 0);
});

test("non-inventory signals become standalone candidates; ineligible domains and returns produce no candidate", () => {
  const run = composeRun({ storeId: "st", now: NOW, ledger: [], cardIds: [], todayOrder: [], probes: probes({ meta: null, plan: null, competitors: null }) });
  const aff = run.candidates.find((c) => c.domain === "affiliate")!;
  assert.equal(aff.memberCount, 1);
  assert.equal(aff.kind, "commission_leakage");
  assert.equal(run.signals.find((s) => s.domain === "affiliate")!.auditStatus, "STANDALONE");
  assert.equal(run.candidates.some((c) => c.domain === "paid_media"), false);
  assert.equal(run.candidates.some((c) => c.domain === "returns"), false);
  assert.equal(run.signals.find((s) => s.domain === "returns")!.suppressionReason, "NO_ENGINE");
});

test("shadow surfacing has no domain cap and both disagreements are recorded", () => {
  // Today shows a comfortable-cover stock decision first; the shadow model prefers the leakage decision.
  const s1 = stock("s1", 6_000, 25);
  const leak = decision("l1", "commission_leakage", { rank: 4_000, domains: ["affiliate", "shopify"], confidence: "medium", status: "test" });
  const run = composeRun({ storeId: "st", now: NOW, ledger: [s1, src(leak)], cardIds: ["s1", "l1"], todayOrder: ["s1", "l1"], probes: probes() });
  const top = run.candidates.find((c) => c.rank === 1)!;
  assert.deepEqual(top.cluster.memberDecisionIds, ["l1"]);
  assert.equal(run.summary.topDiffers, true);
  assert.equal(run.summary.clusteredTopDiffers, true);
  assert.equal(run.summary.clusteredTop3Overlap, 2);
  assert.equal(typeof run.summary.clusteringChangedTop, "boolean");
  assert.equal(run.summary.clusteringVersion, "inventory-cluster-v1");
  assert.ok(run.candidates.filter((c) => c.surfaced).length <= 5);
});

test("bias classification separates signal volume from candidate generation from ranking, and needs feedback for ranking calls", () => {
  const base = { signalShare: 70, candidateShare: 30, top3Share: 30, surfacedShare: 50, obviousRate: null, usefulRate: null, otherDomainsEligibleButNone: 2, otherDomainsEligibleRuns: 20, judgedInventory: 0, judgedOther: 0 };
  assert.equal(classifyInventoryBias(base).classification, "SIGNAL_VOLUME_IMBALANCE");
  assert.equal(classifyInventoryBias({ ...base, signalShare: 30, candidateShare: 30 }).classification, "NO_EVIDENCE_OF_BIAS");
  assert.equal(classifyInventoryBias({ ...base, candidateShare: 70, otherDomainsEligibleButNone: 15 }).findings.includes("CANDIDATE_GENERATION_BIAS"), true);
  const dominant = { ...base, signalShare: 40, candidateShare: 45, top3Share: 70 };
  assert.equal(classifyInventoryBias(dominant).classification, "INCONCLUSIVE");
  assert.equal(classifyInventoryBias({ ...dominant, judgedInventory: 8, judgedOther: 6, obviousRate: 60, usefulRate: 30 }).classification, "RANKING_BIAS");
  assert.equal(classifyInventoryBias({ ...dominant, judgedInventory: 8, judgedOther: 6, obviousRate: 20, usefulRate: 70 }).classification, "REAL_BUSINESS_CONDITION");
  const mixed = classifyInventoryBias({ ...base, top3Share: 70, judgedInventory: 8, judgedOther: 6, obviousRate: 60, usefulRate: 30 });
  assert.equal(mixed.classification, "MIXED");
  assert.deepEqual(mixed.findings.sort(), ["RANKING_BIAS", "SIGNAL_VOLUME_IMBALANCE"]);
});
