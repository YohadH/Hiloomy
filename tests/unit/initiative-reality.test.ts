// Initiative Reality: brand-wide data never answers an initiative-specific
// question; three tiers of mapping trust are data, not labels; a finding is
// a CANDIDATE for the shared pipeline, never a decision; without a target
// the honest status is "no issue detected", never "on track".

import { test } from "node:test";
import assert from "node:assert/strict";
import { consumptionProfile, evaluateInitiativeReality, findingSignals, mentionedAsGift, resolveMappings, type InitiativeEvidence, type InitiativeMappings, type MappingCandidates } from "@/lib/domain/initiative-reality";
import { composeRun, type ProbeData } from "@/lib/services/decision-candidate-audit-service";
import { KIND_PRIORS } from "@/lib/domain/decision-candidate";
import type { Initiative } from "@/lib/domain/plan";

const NOW = new Date("2026-09-14T12:00:00.000Z"); // day 14 of a Sep 1–30 initiative
const fresh = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const initiative = (over: Partial<Initiative> = {}): Initiative =>
  ({
    id: "satin",
    title: "השקת Satin Couture",
    anchor: { kind: "launch", label: "Satin Couture" },
    start: "2026-09-01",
    end: "2026-09-30",
    offer: { discountPct: null, couponCode: "SATIN15" },
    products: [
      { productId: "p_satin", title: "Satin Couture", inventory: 120, units14d: 41, unitsPrior14d: 0, coverDays: 40, hasRealCost: true, liveCampaigns: 0 },
      { productId: "p_pillow", title: "Travel Pillow", inventory: 12, units14d: 26, unitsPrior14d: 0, coverDays: 6, hasRealCost: true, liveCampaigns: 0 }
    ],
    relatedDecisions: [],
    text: "השקת Satin Couture — לבדוק סטטוס קמפיין, כמה מכירות, כמה Travel Pillow ניתנו במתנה עם סט מלא, ולהחליט אם להמשיך את הקופון SATIN15",
    ...over
  }) as unknown as Initiative;

const candidates = (over: Partial<MappingCandidates> = {}): MappingCandidates => ({
  products: [
    { id: "p_satin", title: "Satin Couture" },
    { id: "p_pillow", title: "Travel Pillow" }
  ],
  knownDiscountCodes: ["SATIN15"],
  metaCampaigns: [
    { id: "c1", name: "Satin Launch September", linkedProductIds: [] },
    { id: "c2", name: "Always-on Retargeting", linkedProductIds: [] }
  ],
  ...over
});

const freshness = { shopify: fresh(0.1), meta: fresh(0.4), inventory: fresh(0.1), plan: fresh(2) };
const flat = (n: number, perDay: number) => Array.from({ length: n }, () => perDay);

// Evidence for whatever the mappings made USABLE (confirmed / provisional); suggested links get nothing.
const evidence = (m: InitiativeMappings, over: Partial<InitiativeEvidence> = {}): InitiativeEvidence => {
  const link = (kind: string, id: string) => m.links.find((l) => l.kind === kind && l.id === id && l.state !== "suggested");
  const satin = link("product", "p_satin");
  const pillow = link("gift_product", "p_pillow");
  const camps = m.links.filter((l) => l.kind === "meta_campaign" && l.state !== "suggested");
  const disc = link("discount", "SATIN15");
  return {
    products: [
      ...(satin ? [{ id: "p_satin", title: "Satin Couture", role: "product" as const, basis: satin.state as "confirmed" | "provisional", rule: satin.provenance.rule, revenue: 32480, units: 41, priorRevenue: 27500, priorUnits: 35, dailyUnits: flat(14, 41 / 14), inventory: 120, coverDays: 41, hasRealCost: true, marginRate: 0.48 }] : []),
      ...(pillow ? [{ id: "p_pillow", title: "Travel Pillow", role: "gift" as const, basis: pillow.state as "confirmed" | "provisional", rule: pillow.provenance.rule, revenue: 0, units: 26, priorRevenue: 0, priorUnits: 0, dailyUnits: flat(14, 26 / 14), inventory: 12, coverDays: 6, hasRealCost: true, marginRate: null }] : [])
    ],
    discount: disc ? { code: "SATIN15", basis: disc.state as "confirmed" | "provisional", rule: disc.provenance.rule, orders: 19, amount: 2100 } : null,
    campaigns: camps.map((l) => ({ id: l.id, name: l.label, basis: l.state as "confirmed" | "provisional", rule: l.provenance.rule, spend: 7240, purchases: 38, attributedRevenue: 31900 })),
    store: { sales7: 118000, velocityChangePct: 0.15, marginRate: 0.41 },
    freshness,
    ...over
  };
};

const confirmAll = [
  { initiativeId: "satin", kind: "product" as const, id: "p_satin", label: "Satin Couture", via: "exact_product_title" },
  { initiativeId: "satin", kind: "gift_product" as const, id: "p_pillow", label: "Travel Pillow", via: "exact_product_title" },
  { initiativeId: "satin", kind: "discount" as const, id: "SATIN15", label: "SATIN15" },
  { initiativeId: "satin", kind: "meta_campaign" as const, id: "c1", label: "Satin Launch September", via: "campaign_name_token" }
];

test("mapping tiers: exact product name → PROVISIONAL (gift phrase → gift); campaign via product link → PROVISIONAL; campaign name token → SUGGESTED only; used coupon → CONFIRMED", () => {
  const m = resolveMappings(initiative(), candidates(), []);
  const by = (kind: string) => m.links.filter((l) => l.kind === kind);
  assert.deepEqual(by("product").map((l) => [l.id, l.state, l.confidence, l.provenance.rule, l.provenance.matchedOn]), [["p_satin", "provisional", "high", "exact_product_title", "Satin Couture"]]);
  assert.deepEqual(by("gift_product").map((l) => [l.id, l.state, l.provenance.rule]), [["p_pillow", "provisional", "exact_product_title"]]);
  assert.deepEqual(by("discount").map((l) => [l.id, l.state, l.provenance.rule]), [["SATIN15", "confirmed", "discount_code_used"]]);
  assert.deepEqual(by("meta_campaign").map((l) => [l.id, l.state, l.confidence, l.provenance.rule]), [["c1", "suggested", "medium", "campaign_name_token"]]);
  assert.equal(m.byKind.meta_campaign.state, "suggested");
  assert.equal(m.byKind.product.state, "provisional");
  assert.equal(mentionedAsGift("Travel Pillow ניתנו במתנה עם סט מלא", "Travel Pillow"), true);
  assert.equal(mentionedAsGift("Satin Couture launch — full set", "Satin Couture"), false);
  const m2 = resolveMappings(initiative(), candidates({ metaCampaigns: [{ id: "c9", name: "Whatever", linkedProductIds: ["p_satin"] }] }), []);
  assert.deepEqual(m2.links.filter((l) => l.kind === "meta_campaign").map((l) => [l.id, l.state, l.provenance.rule, l.provenance.matchedOn]), [["c9", "provisional", "campaign_product_link", "p_satin"]]);
  const m3 = resolveMappings(initiative(), candidates({ knownDiscountCodes: [] }), []);
  assert.equal(m3.byKind.discount.state, "unresolved");
});

test("confirming a provisional link keeps its origin: rule becomes operator, the automatic rule stays in provenance", () => {
  const m = resolveMappings(initiative(), candidates(), confirmAll);
  const satin = m.links.find((l) => l.id === "p_satin")!;
  assert.equal(satin.state, "confirmed");
  assert.deepEqual(satin.provenance, { rule: "operator", matchedOn: "Satin Couture", auto: "exact_product_title" });
  const camp = m.links.find((l) => l.id === "c1")!;
  assert.equal(camp.state, "confirmed");
  assert.equal(camp.provenance.auto, "campaign_name_token");
});

test("provisional evidence is USED: metrics are computed, capped at estimated, carry the note and full provenance; confidence ≤ medium; status can be needs_attention", () => {
  // The campaign is critical here ("קמפיין" in the plan) — resolve it provisionally through a product link, so this test measures provisional trust, not a missing entity.
  const cands = candidates({ metaCampaigns: [{ id: "c9", name: "Satin Sets", linkedProductIds: ["p_satin"] }] });
  const m = resolveMappings(initiative(), cands, []); // nothing confirmed but the coupon
  const r = evaluateInitiativeReality(initiative(), m, evidence(m), NOW);
  const val = (k: string) => r.metrics.find((x) => x.key === k)!;
  assert.equal(val("revenue").value, "₪32,480");
  assert.equal(val("revenue").quality, "estimated");
  assert.equal(val("revenue").basis, "provisional");
  assert.match(val("revenue").note!.he, /מבוסס על התאמה אוטומטית · טרם אושר/);
  assert.deepEqual(val("revenue").provenance, [{ kind: "product", id: "p_satin", label: "Satin Couture", basis: "provisional", rule: "exact_product_title" }]);
  assert.equal(val("units").value, "41");
  assert.equal(val("gift_inventory:p_pillow").value, "6");
  assert.equal(val("gift_inventory:p_pillow").quality, "estimated");
  // The coupon is confirmed → its number stays "known".
  assert.equal(val("coupon_orders").quality, "known");
  assert.equal(val("coupon_orders").basis, "confirmed");
  // The product-linked campaign is provisional → Meta numbers exist, as estimates.
  assert.equal(val("meta_spend").value, "₪7,240");
  assert.equal(val("meta_spend").quality, "estimated");
  assert.equal(r.evidenceBasis, "confirmed"); // coupon
  assert.equal(r.status, "needs_attention"); // gift cover 6 < 16 days remaining, on provisional evidence
  assert.equal(r.confidence, "medium");
  assert.match(r.confidenceReason.en, /auto-matched and not yet confirmed/);
  assert.ok(r.candidateFinding);
  assert.equal(r.candidateFinding!.candidateKind, "initiative_gift_stock_risk");
  assert.equal(r.candidateFinding!.finding.basis, "provisional");
  // Provisional-only, and the plan's coupon is unresolved (critical) → evidence is still usable, but a measured risk on it still wins over setup; confidence is low because the coupon is critical.
  const m2 = resolveMappings(initiative(), { ...cands, knownDiscountCodes: [] }, []);
  const r2 = evaluateInitiativeReality(initiative(), m2, evidence(m2), NOW);
  assert.equal(r2.evidenceBasis, "provisional");
  assert.equal(r2.metrics.find((x) => x.key === "revenue")!.value, "₪32,480");
  assert.equal(r2.status, "needs_attention");
  assert.equal(r2.confidence, "low");
});

test("status semantics: no target → NO_ISSUE_DETECTED, never ON_TRACK; the goal note says no target was defined", () => {
  const m = resolveMappings(initiative(), candidates(), confirmAll);
  const ev = evidence(m);
  ev.products = ev.products.map((p) => ({ ...p, coverDays: 40, inventory: 300 }));
  const r = evaluateInitiativeReality(initiative(), m, ev, NOW);
  assert.equal(r.status, "no_issue_detected");
  assert.equal(r.goal.defined, false);
  assert.match(r.statusReason.en, /No target exists to say whether it is on track/);
  assert.equal(r.candidateFinding, null);
  assert.ok(r.findings.every((f) => f.severity === "info"));
  assert.equal(r.confidence, "high");
});

test("missing product mapping: store-wide sales are NOT used as initiative sales", () => {
  const init = initiative({ products: [] });
  const m = resolveMappings(init, candidates(), []);
  const r = evaluateInitiativeReality(init, m, evidence(m), NOW);
  const rev = r.metrics.find((x) => x.key === "revenue")!;
  assert.equal(rev.value, null);
  assert.equal(rev.quality, "unavailable");
  assert.equal(r.metrics.find((x) => x.key === "units"), undefined);
  const store = r.metrics.find((x) => x.key === "store_sales7")!;
  assert.equal(store.scope, "store");
  assert.match(store.note!.en, /\+15% vs the prior 7 days/);
  assert.ok(r.metrics.filter((x) => x.scope === "initiative").every((x) => !/Whole-store|\+15%/.test(`${x.label.en} ${x.note?.en ?? ""}`)));
});

test("missing Meta mapping: no ROAS is claimed; weak suggestions are never used; a missing critical entity is needs_context, not insufficient data", () => {
  const init = initiative({ products: [], offer: { discountPct: null, couponCode: null } });
  const m = resolveMappings(init, candidates(), []);
  const r = evaluateInitiativeReality(init, m, evidence(m), NOW);
  assert.equal(r.metrics.find((x) => x.key === "meta_roas"), undefined);
  assert.equal(r.status, "needs_context");
  assert.equal(r.evidenceBasis, "none");
  assert.equal(r.confidence, "low");
  assert.match(r.confidenceReason.en, /cannot be evaluated because .* are not connected/);
});

test("a finding becomes a CANDIDATE signal with computable evidence and explicit unknowns — never a decision", () => {
  const m = resolveMappings(initiative(), candidates(), confirmAll);
  const r = evaluateInitiativeReality(initiative(), m, evidence(m), NOW);
  const f = r.candidateFinding!;
  assert.equal(f.kind, "gift_inventory_short");
  assert.equal(f.finding.consumption?.stability, "stable");
  assert.ok(f.finding.evidence.some((e) => /given 26 units · 1\.9\/day over 14 days/.test(e)));
  assert.ok(f.finding.evidence.some((e) => /estimated 6 days remaining vs 16 initiative days/.test(e)));
  assert.deepEqual(f.finding.missing.map((x) => x.en), ["When the gift can be restocked", "Whether the gift is mandatory or optional for the offer", "Whether an alternative gift exists"]);
  const [sig] = findingSignals(r, initiative());
  assert.equal(sig.candidateKind, "initiative_gift_stock_risk");
  assert.equal(sig.daysCover, 6);
  assert.equal(sig.initiativeRevenue, 32480);
  assert.equal(sig.basis, "confirmed");
  assert.equal(sig.hasOpenDecision, false);
  // consumption profile rules
  assert.equal(consumptionProfile([1, 1, 1, 1, 1, 1, 1, 1]).stability, "stable");
  assert.equal(consumptionProfile([1, 1, 1, 1, 3, 3, 3, 3]).stability, "rising");
  assert.equal(consumptionProfile([1, 1, 1]).stability, "unknown");
});

test("pipeline: the candidate competes in composeRun with the plan_decision prior (no tuning), urgency from days of cover; ALREADY_OPEN when the initiative has an open decision", () => {
  assert.deepEqual(KIND_PRIORS.initiative_gift_stock_risk, KIND_PRIORS.plan_decision);
  const m = resolveMappings(initiative(), candidates(), confirmAll);
  const r = evaluateInitiativeReality(initiative(), m, evidence(m), NOW);
  const probes: ProbeData = { productEcon: [], leakage: null, leakageAllProtected: false, meta: null, plan: null, silentAlerts: [], discount: null, competitors: null, initiativeFindings: findingSignals(r, initiative()) };
  const run = composeRun({ storeId: "st", now: NOW, ledger: [], cardIds: [], todayOrder: [], probes });
  const sig = run.signals.find((s) => s.kind === "initiative_gift_stock_risk")!;
  assert.ok(sig);
  assert.equal(sig.domain, "plan");
  assert.equal(sig.eligible, true);
  assert.equal(sig.scores.urgency, 75); // 6 days of cover → the existing daysCover rule
  assert.equal(sig.financialExposureType, "initiative_revenue_window");
  const cand = run.candidates.find((c) => c.kind === "initiative_gift_stock_risk")!;
  assert.ok(cand);
  assert.equal(cand.rank, 1); // alone in the run → passes the threshold
  assert.equal(cand.surfaced, true);
  assert.equal(cand.suppressionReason, null);
  assert.ok(cand.missingEvidence.includes("When the gift can be restocked"));
  // With an open decision on the initiative the signal is ALREADY_OPEN and forms no candidate.
  const open = findingSignals(r, initiative({ relatedDecisions: [{ id: "d1", hookId: "h", state: "open", choice: "pending", optionKey: null, decidedAt: null, question: { he: "", en: "" } }] } as Partial<Initiative>));
  const run2 = composeRun({ storeId: "st", now: NOW, ledger: [], cardIds: [], todayOrder: [], probes: { ...probes, initiativeFindings: open } });
  assert.equal(run2.signals.find((s) => s.kind === "initiative_gift_stock_risk")!.suppressionReason, "ALREADY_OPEN");
  assert.equal(run2.candidates.find((c) => c.kind === "initiative_gift_stock_risk"), undefined);
});

test("stale data degrades confidence and is flagged; very stale data makes it low", () => {
  const m = resolveMappings(initiative(), candidates(), confirmAll);
  const ev = evidence(m);
  ev.products = ev.products.map((p) => ({ ...p, coverDays: 40, inventory: 300 }));
  const day = evaluateInitiativeReality(initiative(), m, { ...ev, freshness: { ...freshness, shopify: fresh(30) } }, NOW);
  assert.equal(day.stale, true);
  assert.equal(day.confidence, "medium");
  const old = evaluateInitiativeReality(initiative(), m, { ...ev, freshness: { ...freshness, meta: fresh(60) } }, NOW);
  assert.equal(old.confidence, "low");
});

test("gaps on confirmed mappings: coupon unused, campaign without spend, no sales since start are attention findings — needs_attention, no candidate", () => {
  const m = resolveMappings(initiative(), candidates(), confirmAll);
  const ev = evidence(m);
  ev.products = ev.products.map((p) => (p.role === "product" ? { ...p, revenue: 0, units: 0, coverDays: null } : { ...p, coverDays: 40, inventory: 300 }));
  ev.discount = { code: "SATIN15", basis: "confirmed", rule: "discount_code_used", orders: 0, amount: 0 };
  ev.campaigns = ev.campaigns.map((c) => ({ ...c, spend: 0, purchases: 0, attributedRevenue: 0 }));
  const r = evaluateInitiativeReality(initiative(), m, ev, NOW);
  const kinds = r.findings.map((f) => f.kind);
  assert.ok(kinds.includes("no_sales_since_start"));
  assert.ok(kinds.includes("coupon_unused"));
  assert.ok(kinds.includes("campaign_no_spend"));
  assert.equal(r.status, "needs_attention");
  assert.equal(r.candidateFinding, null);
});
