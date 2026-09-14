// Diagnosis → Decision Space → Recommendation, scenario by scenario.
// Channels provide evidence; Hiloomy makes business decisions. Unknown is a
// branch with a condition, never a stop. Nothing is special-cased.

import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose, type ChannelEvidence, type CreatorEvidence, type DiagnosisInput, type FeasibilityFacts, type PaidEvidence } from "@/lib/domain/business-diagnosis";
import { buildDecisionSpace, resolveRecommendation, type ActionType } from "@/lib/domain/decision-space";
import { buildEpisode } from "@/lib/domain/decision-episode";
import { evaluateInitiativeReality, resolveMappings, summarizeReality, type ConfirmedEntityLink, type InitiativeEvidence, type MappingCandidates } from "@/lib/domain/initiative-reality";
import type { Initiative } from "@/lib/domain/plan";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const fresh = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const freshness = { shopify: fresh(0.3), meta: fresh(0.3), inventory: fresh(0.3), plan: fresh(2) };
const flat = (n: number, perDay: number) => Array.from({ length: n }, () => perDay);

const initiative = (): Initiative =>
  ({
    id: "satin",
    title: "Satin Couture launch",
    anchor: { kind: "launch", label: "Satin Couture" },
    start: "2026-09-01",
    end: "2026-09-30",
    offer: { discountPct: null, couponCode: "SATIN20" },
    products: [],
    relatedDecisions: [],
    text: "Satin Couture launch — check campaign status, sales, how many Travel Pillows went out as a gift, and decide whether to continue the coupon."
  }) as unknown as Initiative;
const catalogue: MappingCandidates = { products: [{ id: "p_full", title: "Satin Couture Full Set" }, { id: "p_pillow", title: "Travel Pillow" }], knownDiscountCodes: ["SATIN20"], metaCampaigns: [{ id: "c1", name: "Satin Sept", linkedProductIds: [] }], discountUsage: [] };
const confirmed: ConfirmedEntityLink[] = [
  { initiativeId: "satin", kind: "product", id: "p_full", label: "Satin Couture Full Set" },
  { initiativeId: "satin", kind: "gift_product", id: "p_pillow", label: "Travel Pillow" },
  { initiativeId: "satin", kind: "discount", id: "SATIN20", label: "SATIN20" },
  { initiativeId: "satin", kind: "meta_campaign", id: "c1", label: "Satin Sept" }
];

interface Scenario {
  revenue?: number;
  prior?: number;
  units?: number;
  inventory?: number;
  cover?: number;
  giftInventory?: number;
  giftCover?: number;
  margin?: number | null;
  realCost?: boolean;
  spend?: number;
  attributed?: number | null;
  clicks?: number | null;
  purchases?: number;
  couponOrders?: number;
  channels?: ChannelEvidence | null;
  creators?: CreatorEvidence | null;
  facts?: Partial<FeasibilityFacts>;
  otherLocation?: number;
  altGift?: boolean;
  altProduct?: boolean;
  noGift?: boolean;
}

function run(s: Scenario = {}) {
  const links = s.noGift ? confirmed.filter((c) => c.kind !== "gift_product") : confirmed;
  const m = resolveMappings(initiative(), catalogue, links);
  const revenue = s.revenue ?? 32480;
  const ev: InitiativeEvidence = {
    products: [
      { id: "p_full", title: "Satin Couture Full Set", role: "product", basis: "confirmed", rule: "operator", revenue, units: s.units ?? 41, priorRevenue: s.prior ?? 27500, priorUnits: 35, dailyUnits: flat(14, (s.units ?? 41) / 14), inventory: s.inventory ?? 120, coverDays: s.cover ?? 41, hasRealCost: s.realCost ?? true, marginRate: s.margin === undefined ? 0.48 : s.margin },
      ...(s.noGift ? [] : [{ id: "p_pillow", title: "Travel Pillow", role: "gift" as const, basis: "confirmed" as const, rule: "operator" as const, revenue: 0, units: 26, priorRevenue: 0, priorUnits: 0, dailyUnits: flat(14, 26 / 14), inventory: s.giftInventory ?? 15, coverDays: s.giftCover ?? 8, hasRealCost: true, marginRate: null }])
    ],
    discount: { code: "SATIN20", basis: "confirmed", rule: "discount_code_used", orders: s.couponOrders ?? 20, amount: 1800 },
    campaigns: [{ id: "c1", name: "Satin Sept", basis: "confirmed", rule: "operator", spend: s.spend ?? 3095, purchases: s.purchases ?? 30, attributedRevenue: s.attributed === undefined ? 9800 : s.attributed }],
    store: null,
    freshness
  };
  const reality = evaluateInitiativeReality(initiative(), m, ev, NOW);
  const paid: PaidEvidence = { spend: s.spend ?? 3095, purchases: s.purchases ?? 30, clicks: s.clicks === undefined ? null : s.clicks, attributedRevenue: s.attributed === undefined ? 9800 : s.attributed, basis: "confirmed" };
  const input: DiagnosisInput = {
    reality,
    channels: s.channels === undefined ? { online: { revenue: revenue * 0.56, units: 24 }, offline: { revenue: revenue * 0.44, units: 17 }, manual: { revenue: 0, units: 0 }, unknown: { revenue: 0, units: 0 }, classifiedShare: 1, basis: "confirmed" } : s.channels,
    creators: s.creators === undefined ? null : s.creators,
    paid,
    locations: s.otherLocation ? [{ productId: s.noGift ? "p_full" : "p_pillow", title: s.noGift ? "Satin Couture Full Set" : "Travel Pillow", role: s.noGift ? "product" : "gift", locations: [{ name: "Warehouse", available: (s.noGift ? s.inventory : s.giftInventory) ?? 15 }, { name: "Store TLV", available: s.otherLocation }] }] : [],
    facts: { replenishmentWithinDays: null, replenishmentPossible: null, giftOptional: null, alternativeGiftProductId: null, ...(s.facts ?? {}) },
    alternatives: { gift: s.altGift ? [{ id: "p_neck", title: "Neck Travel Pillow", inventory: 300, coverDays: 60, sameFamily: true }] : [], product: s.altProduct ? [{ id: "p_duvet", title: "Satin Couture Duvet", inventory: 200, coverDays: 50, sameFamily: true }] : [] }
  };
  const diagnosis = diagnose(input);
  const space = buildDecisionSpace(diagnosis);
  const rec = resolveRecommendation(diagnosis, space, { basis: reality.evidenceBasis, stale: reality.stale });
  return { reality, diagnosis, space, rec, summary: summarizeReality(reality, initiative().offer) };
}
const types = (space: ReturnType<typeof run>["space"]): ActionType[] => space.map((o) => o.type);

test("A. strong demand, healthy inventory, healthy margin → continue (possibly scale); discount is not deepened by default", () => {
  const { diagnosis, space, rec } = run({ giftCover: 40, giftInventory: 300 });
  assert.equal(diagnosis.demand.state, "strong");
  assert.equal(diagnosis.inventory.state, "healthy");
  assert.equal(diagnosis.margin.state, "healthy");
  assert.equal(diagnosis.scope, "none");
  assert.equal(rec.answer, "continue");
  assert.ok(rec.primary && (rec.primary.type === "CONTINUE_MONITOR" || rec.primary.type === "CONTINUE" || rec.primary.type === "SCALE"));
  assert.ok(!types(space).includes("DEEPEN_DISCOUNT"));
  assert.match(rec.why[0].en, /Sales of the 1 linked products in the first 14 days \(all channels\): ₪32,480, \+18% vs the 14 days before the initiative/);
});

test("B. strong demand, low gift stock, replenishment confirmed in time → continue + replenish", () => {
  const { diagnosis, rec } = run({ facts: { replenishmentWithinDays: 5 } });
  assert.equal(diagnosis.replenishment.state, "possible_in_time");
  assert.equal(rec.answer, "continue");
  assert.equal(rec.primary!.type, "REPLENISH");
  assert.match(rec.what.he, /^להמשיך: לחדש את המלאי של "Travel Pillow"/);
});

test("C. strong demand, low gift stock, no replenishment, alternative gift exists → continue initiative + replace gift", () => {
  const { diagnosis, rec, space } = run({ facts: { replenishmentPossible: false }, altGift: true });
  assert.equal(diagnosis.replenishment.state, "impossible_in_time");
  assert.equal(rec.answer, "change");
  assert.equal(rec.primary!.type, "REPLACE_GIFT");
  assert.match(rec.what.he, /להחליף את המתנה "Travel Pillow" ב-"Neck Travel Pillow" כשהמלאי הנוכחי נגמר \(בעוד ~8 ימים\)/);
  assert.ok(!types(space).includes("REPLENISH")); // infeasible options are dropped
  assert.ok(rec.alternatives.some((a) => a.option.type === "STOP" && /not preferred while demand holds/.test(a.betterIf.en)));
});

test("D. strong demand, low MAIN product stock, no replenishment, no alternative → shift/limit/shorten before stopping", () => {
  const { diagnosis, rec, space } = run({ noGift: true, inventory: 30, cover: 6, facts: { replenishmentPossible: false } });
  assert.equal(diagnosis.constraint?.role, "product");
  assert.equal(rec.answer, "change");
  assert.ok(["SHIFT_PRODUCT_FOCUS", "REDUCE_SPEND", "SHORTEN_INITIATIVE"].includes(rec.primary!.type));
  const stop = space.find((o) => o.type === "STOP")!;
  assert.ok(stop.score < rec.primary!.score);
});

test("E. weak Meta, strong Shopify, strong offline, strong creators → initiative healthy; channel-level adjustment", () => {
  const { diagnosis, rec } = run({ giftCover: 40, giftInventory: 300, spend: 6000, attributed: 4000, creators: { orders: 12, revenue: 6000, commission: 600, creators: 3, basis: "confirmed" } });
  assert.equal(diagnosis.paid.state, "weak");
  assert.equal(diagnosis.demand.state, "strong");
  assert.equal(diagnosis.scope, "channel");
  assert.match(diagnosis.headline.en, /Demand is strong in stores too and through creators, but Meta is currently the weakest acquisition layer/);
  assert.notEqual(rec.answer, "stop");
  assert.ok(["SHIFT_BUDGET", "TEST_CREATIVE", "REDUCE_SPEND"].includes(rec.primary!.type));
  assert.match(rec.primary!.what.he, /קריאייטורים|קריאייטיב|לצמצם/);
});

test("F. strong traffic, weak conversion → offer / page / price diagnosis, not 'buy more traffic'", () => {
  const { diagnosis, rec, space } = run({ revenue: 6000, prior: 9000, units: 8, giftCover: 40, giftInventory: 300, clicks: 4000, purchases: 8, attributed: 2500, channels: null });
  assert.equal(diagnosis.conversion.state, "weak");
  assert.match(diagnosis.headline.en, /Interest exists \(traffic\), but conversion is weak/);
  assert.equal(rec.primary!.type, "FIX_CONVERSION");
  assert.ok(!types(space).includes("SCALE"));
});

test("G. high sales, poor margin → do not scale; reduce discount / fix economics", () => {
  const { diagnosis, rec, space } = run({ margin: -0.15, giftCover: 40, giftInventory: 300 });
  assert.equal(diagnosis.margin.state, "unprofitable");
  assert.match(diagnosis.headline.en, /sells, but at a loss/);
  assert.equal(rec.primary!.type, "REDUCE_DISCOUNT");
  assert.ok(!types(space).includes("SCALE"));
});

test("H. high inventory, weak demand → offer / bundle / creative options, stop is not first", () => {
  const { diagnosis, rec } = run({ revenue: 6000, prior: 12000, units: 8, inventory: 900, cover: 400, giftCover: 400, giftInventory: 900 });
  assert.equal(diagnosis.demand.state, "weak");
  assert.ok(["DEEPEN_DISCOUNT", "ADD_BUNDLE", "TEST_CREATIVE"].includes(rec.primary!.type));
  assert.notEqual(rec.answer, "stop");
});

test("I. online weak, offline strong → total demand is not called weak; channel mix is the question", () => {
  const { diagnosis } = run({ revenue: 30000, prior: 27000, giftCover: 40, giftInventory: 300, channels: { online: { revenue: 6000, units: 8 }, offline: { revenue: 24000, units: 30 }, manual: { revenue: 0, units: 0 }, unknown: { revenue: 0, units: 0 }, classifiedShare: 1, basis: "confirmed" } });
  assert.equal(diagnosis.demand.state, "strong");
  assert.equal(diagnosis.offline.state, "strong");
  assert.doesNotMatch(diagnosis.headline.en, /weak across every measured channel/);
});

test("J. gift out at the warehouse, stock in another store → transfer becomes an option before replenishment", () => {
  const { diagnosis, space } = run({ giftInventory: 4, giftCover: 2, otherLocation: 40 });
  assert.equal(diagnosis.replenishment.state, "transfer_possible");
  const t = space.find((o) => o.type === "TRANSFER_INVENTORY")!;
  assert.ok(t);
  assert.equal(t.feasibility, "feasible");
  assert.match(t.what.he, /להעביר 40 יחידות של "Travel Pillow"/);
});

test("K. replenishment unknown → conditional branches and one question that flips the answer", () => {
  const { diagnosis, rec } = run({ altGift: true });
  assert.equal(diagnosis.replenishment.state, "unknown");
  assert.equal(rec.questions[0]?.key, "replenishment");
  assert.match(rec.questions[0].question.he, /אפשר לחדש את "Travel Pillow" בתוך 8 ימים\?/);
  const cont = rec.alternatives.find((a) => a.option.type === "CONTINUE") ?? (rec.primary?.type === "CONTINUE" ? { option: rec.primary, betterIf: rec.primary.condition! } : null);
  assert.ok(cont && /new stock of "Travel Pillow" arrives within 8 days/.test(cont.betterIf.en));
  assert.ok(rec.wouldChange.some((w) => /arrives before current stock runs out/.test(w.en)));
  assert.equal(rec.confidence, "medium");
});

test("L. needs_context → no business recommendation from the resolver path (the builder blocks earlier)", () => {
  const m = resolveMappings(initiative(), catalogue, []);
  const reality = evaluateInitiativeReality(initiative(), m, { products: [], discount: null, campaigns: [], store: null, freshness }, NOW);
  assert.equal(reality.status, "needs_context");
  const d = diagnose({ reality, channels: null, creators: null, paid: null, locations: [], facts: { replenishmentWithinDays: null, replenishmentPossible: null, giftOptional: null, alternativeGiftProductId: null }, alternatives: { gift: [], product: [] } });
  const rec = resolveRecommendation(d, buildDecisionSpace(d), { basis: "none", stale: false });
  assert.equal(rec.answer, "insufficient");
  assert.equal(rec.primary, null);
});

test("M. no issue detected → continue and monitor; no forced change", () => {
  const { reality, rec } = run({ giftCover: 40, giftInventory: 300 });
  assert.equal(reality.status, "no_issue_detected");
  assert.equal(rec.answer, "continue");
  assert.ok(rec.primary!.type === "CONTINUE_MONITOR" || rec.primary!.type === "CONTINUE" || rec.primary!.type === "SCALE");
});

test("N. several relevant actions → ONE recommendation with alternatives (one situation, one candidate), each alternative with its condition", () => {
  const { rec, reality } = run({ altGift: true, spend: 6000, attributed: 4000 });
  assert.ok(rec.primary);
  assert.ok(rec.alternatives.length >= 2);
  assert.ok(rec.alternatives.every((a) => a.betterIf.en.length > 0));
  assert.ok(reality.candidateFinding); // exactly one candidate finding for the situation
});

test("O. review hook answer maps from the primary option: continue / change / stop or insufficient", () => {
  assert.equal(run({ giftCover: 40, giftInventory: 300 }).rec.answer, "continue");
  assert.equal(run({ altGift: true, facts: { replenishmentPossible: false } }).rec.answer, "change");
  assert.equal(run({ margin: -0.3, revenue: 5000, prior: 9000, units: 6, giftCover: 40, giftInventory: 300 }).rec.answer === "stop" || run({ margin: -0.3, revenue: 5000, prior: 9000, units: 6, giftCover: 40, giftInventory: 300 }).rec.answer === "change", true);
});

test("P. store-wide numbers never enter the diagnosis as initiative evidence", () => {
  const { diagnosis, rec } = run({ giftCover: 40, giftInventory: 300 });
  const all = [diagnosis.demand, diagnosis.paid, diagnosis.offline, diagnosis.margin].map((x) => x.evidence.en).join(" ");
  assert.doesNotMatch(all, /Whole-store|whole store/i);
  assert.ok(rec.why.every((w) => !/Whole-store/.test(w.en)));
});

test("episode: the record keeps intent, reality, diagnosis, options with scores, unknowns and the recommended option", () => {
  const { summary, diagnosis, space, rec } = run({ altGift: true });
  const ep = buildEpisode(summary, diagnosis, space, rec, { initiativeId: "satin", title: "Satin Couture launch", kind: "launch", start: "2026-09-01", end: "2026-09-30", offer: { discountPct: null, couponCode: "SATIN20" }, hookQuestion: null }, NOW);
  assert.equal(ep.version, "episode-v1");
  assert.equal(ep.diagnosis.replenishment, "unknown");
  assert.ok(ep.options.every((o) => o.because.length > 0));
  assert.equal(ep.recommended.type, rec.primary!.type);
  assert.ok(ep.unknowns.length >= 1);
});
