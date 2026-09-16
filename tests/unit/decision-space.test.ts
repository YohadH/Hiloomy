// Diagnosis → Decision Space → Recommendation, scenario by scenario.
// Channels provide evidence; Hiloomy makes business decisions. Unknown is a
// branch with a condition, never a stop. Nothing is special-cased.

import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose, type ChannelEvidence, type CreatorEvidence, type DiagnosisInput, type FeasibilityFacts, type PaidEvidence } from "@/lib/domain/business-diagnosis";
import { buildDecisionSpace, resolveRecommendation, type ActionType } from "@/lib/domain/decision-space";
import { buildEpisode } from "@/lib/domain/decision-episode";
import { evaluateInitiativeReality, resolveMappings, summarizeReality, type ConfirmedEntityLink, type InitiativeEvidence, type MappingCandidates } from "@/lib/domain/initiative-reality";
import { evaluateIntentFulfillment, type IntentFulfillment, type IntentOrder } from "@/lib/domain/intent-fulfillment";
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
  paidBaseline?: PaidEvidence["baseline"];
  // Intent Fulfillment as the service would pass it; paidUnknown = campaign not linked.
  fulfillment?: IntentFulfillment | null;
  paidUnknown?: boolean;
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
  // Funnel stages default to null (absent) so these scenarios keep testing
  // the dimension logic; funnel behaviour is covered in funnel-diagnosis.test.
  const paid: PaidEvidence = { spend: s.spend ?? 3095, purchases: s.purchases ?? 30, clicks: s.clicks === undefined ? null : s.clicks, attributedRevenue: s.attributed === undefined ? 9800 : s.attributed, impressions: null, linkClicks: null, lpv: null, atc: null, ic: null, benchmark: null, basis: s.paidUnknown ? null : "confirmed", baseline: s.paidBaseline ?? null };
  const input: DiagnosisInput = {
    reality,
    fulfillment: s.fulfillment ?? null,
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
  assert.equal(diagnosis.margin.state, "measured");
  assert.equal(diagnosis.marginRate, 0.48);
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
  assert.equal(diagnosis.offline.state, "measured"); // no channel baseline → no verdict on stores
  assert.equal(diagnosis.creators.state, "measured");
  assert.match(diagnosis.headline.en, /^Demand is strong, but Meta spends more than the revenue attributed to it\.$/);
  assert.match(diagnosis.paid.evidence.en, /spend exceeds the revenue attributed to it/);
  assert.notEqual(rec.answer, "stop");
  assert.ok(["SHIFT_BUDGET", "TEST_CREATIVE", "REDUCE_SPEND"].includes(rec.primary!.type));
  assert.match(rec.primary!.what.he, /קריאייטורים|קריאייטיב|לצמצם/);
});

test("F. strong traffic, weak conversion → offer / page / price diagnosis, not 'buy more traffic'", () => {
  const { diagnosis, rec, space } = run({ revenue: 6000, prior: 9000, units: 8, giftCover: 40, giftInventory: 300, clicks: 4000, purchases: 8, attributed: 2500, channels: null, paidBaseline: { spend: 3000, purchases: 45, clicks: 3000, attributedRevenue: 9000 } });
  assert.equal(diagnosis.conversion.state, "weak");
  assert.match(diagnosis.conversion.evidence.en, /8 purchases from 4000 campaign clicks \(0\.2%\), -87% vs 1\.5% in the 14 days before the initiative/);
  // Without the campaign's own baseline the same numbers are only "measured".
  assert.equal(run({ revenue: 6000, prior: 9000, units: 8, giftCover: 40, giftInventory: 300, clicks: 4000, purchases: 8, attributed: 2500, channels: null }).diagnosis.conversion.state, "measured");
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
  const { diagnosis } = run({ revenue: 30000, prior: 27000, giftCover: 40, giftInventory: 300, channels: { online: { revenue: 6000, units: 8 }, offline: { revenue: 24000, units: 30 }, manual: { revenue: 0, units: 0 }, unknown: { revenue: 0, units: 0 }, classifiedShare: 1, basis: "confirmed", baseline: { online: { revenue: 12000, units: 16 }, offline: { revenue: 15000, units: 20 }, manual: { revenue: 0, units: 0 }, unknown: { revenue: 0, units: 0 } } } });
  assert.equal(diagnosis.demand.state, "strong");
  assert.equal(diagnosis.offline.state, "strong");
  assert.match(diagnosis.offline.evidence.en, /stores \+60% vs the 14 days before the initiative/);
  // The same split with no baseline is a fact, not a verdict.
  const noBase = run({ revenue: 30000, prior: 27000, giftCover: 40, giftInventory: 300, channels: { online: { revenue: 6000, units: 8 }, offline: { revenue: 24000, units: 30 }, manual: { revenue: 0, units: 0 }, unknown: { revenue: 0, units: 0 }, classifiedShare: 1, basis: "confirmed" } }).diagnosis;
  assert.equal(noBase.offline.state, "measured");
  assert.match(noBase.offline.evidence.en, /^Stores ₪24,000 \(30 u\) · online ₪6,000 \(8 u\) · no prior period to compare by channel$/);
  assert.doesNotMatch(diagnosis.headline.en, /weak across every measured channel/);
});

test("J. gift out at the warehouse, stock in another store → transfer is checked BEFORE replenishment, substitution or demand suppression", () => {
  const { diagnosis, space, rec } = run({ giftInventory: 0, giftCover: 0, otherLocation: 21, altGift: true });
  assert.equal(diagnosis.constraint?.alreadyOut, true);
  assert.equal(diagnosis.inventory.state, "out_of_stock");
  assert.equal(diagnosis.replenishment.state, "transfer_possible");
  assert.match(diagnosis.headline.en, /gift stock for "Travel Pillow" is already out — 21 units exist at Store TLV/);
  const t = space.find((o) => o.type === "TRANSFER_INVENTORY")!;
  assert.equal(t.feasibility, "feasible");
  assert.match(t.what.he, /לבדוק העברת 21 יחידות של "Travel Pillow" מ-Store TLV ל-Warehouse/);
  assert.equal(rec.primary!.type, "TRANSFER_INVENTORY");
  assert.equal(rec.answer, "continue");
  assert.ok(rec.versus.length >= 2);
  assert.match(rec.why.at(-1)!.en, /^Chosen over ".+" and ".+": uses stock the brand already holds/);
  // Nothing says "runs out in 0 days" or "within 0 days".
  const text = [rec.what, ...rec.why, ...rec.wouldChange, ...rec.alternatives.map((a) => a.betterIf), ...space.map((o) => o.what), ...space.map((o) => o.condition ?? { he: "", en: "" })].map((x) => `${x.he} ${x.en}`).join(" ");
  assert.doesNotMatch(text, /תוך 0 ימים|within 0 days|בעוד ~0 ימים|in ~0 days/);
  // Low stock split across locations, none at zero, is NOT a transfer case.
  assert.equal(run({ giftInventory: 4, giftCover: 2, otherLocation: 40 }).diagnosis.replenishment.state, "unknown");
});

test("J2. main product already out, no other location, no verified alternative → no 'shift the campaign to itself'; demand is reduced, not stopped", () => {
  const { diagnosis, space, rec } = run({ noGift: true, inventory: -3, cover: 0, altProduct: false });
  assert.equal(diagnosis.constraint?.alreadyOut, true);
  assert.ok(!types(space).includes("SHIFT_PRODUCT_FOCUS")); // infeasible without a verified target
  assert.ok(space.every((o) => o.targetId !== "p_full"));
  assert.ok(["REDUCE_SPEND", "SHORTEN_INITIATIVE", "REPLENISH"].includes(rec.primary!.type));
  assert.match(rec.questions[0].question.he, /"Satin Couture Full Set" כבר אזל\. אפשר לחדש אותו בימים הקרובים\?/);
  assert.notEqual(rec.answer, "stop");
});

test("J3. source ≠ target: an alternative that is the constrained product itself (same id or same title) is never a target", () => {
  const { space } = run({ noGift: true, inventory: 30, cover: 6, altProduct: true });
  const shift = space.find((o) => o.type === "SHIFT_PRODUCT_FOCUS")!;
  assert.equal(shift.targetId, "p_duvet");
  assert.match(shift.what.he, /להעביר את הקמפיין ל"Satin Couture Duvet"/);
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
  assert.ok(rec.versus.every((v) => v.reason.he.length > 0));
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

// ─── Intent vs reality (16 Sep 2026) ──────────────────────────────────
// "Satin sales +43% → move the campaign to bamboo" skipped two steps: was
// the offer sold as planned, and is the campaign even the demand engine?

const satinOrders = (fullSets: number, componentsOnly: number): IntentOrder[] => [
  ...Array.from({ length: fullSets }, (_, i) => ({ orderId: `s${i}`, channel: "online" as const, isNewCustomer: false, lines: [{ productId: "p_full", title: "Satin Couture Full Set", units: 1, revenue: 900, initiativeProduct: true }] })),
  ...Array.from({ length: componentsOnly }, (_, i) => ({ orderId: `c${i}`, channel: "online" as const, isNewCustomer: false, lines: [{ productId: "p_sheet", title: "Satin Sheet", units: 1, revenue: 320, initiativeProduct: true }] }))
];
const intentPeriod = { live: true, dayIndex: 14, elapsedShare: 14 / 30 };
const heroIntent = { initiativeId: "satin", targetProductIds: ["p_full"], targetMode: "any" as const, targetLabel: "Full Satin Set", channel: null, audience: null, goal: null, note: null, setAt: "2026-09-01T00:00:00.000Z" };

test("Q. no intent → diagnosis says so (not_set), unknowns name it, wouldChange asks for it; nothing else changes", () => {
  const { diagnosis, rec } = run({ giftCover: 40, giftInventory: 300 });
  assert.equal(diagnosis.intent.state, "not_set");
  assert.ok(diagnosis.unknowns.some((u) => /intent/.test(u.en)));
  assert.ok(rec.wouldChange.some((w) => /Stating the intent/.test(w.en)));
  assert.ok(!types(buildDecisionSpace(diagnosis)).includes("FIX_OFFER"));
});

test("R. demand strong, but the offer does not sell as planned → FIX_OFFER outranks SCALE; the headline names it before any channel", () => {
  const f = evaluateIntentFulfillment(heroIntent, satinOrders(2, 20), intentPeriod, new Map([["p_full", "Satin Couture Full Set"]]));
  assert.equal(f.state, "diverging");
  const { diagnosis, rec, space } = run({ giftCover: 40, giftInventory: 300, fulfillment: f });
  assert.equal(diagnosis.intent.state, "diverging");
  assert.equal(diagnosis.scope, "business");
  assert.match(diagnosis.headline.en, /^Demand is strong, but the initiative is not unfolding as planned: We meant to sell "Full Satin Set"; only 9% of orders/);
  assert.equal(rec.answer, "change");
  assert.equal(rec.primary!.type, "FIX_OFFER");
  assert.match(rec.primary!.what.en, /before adding budget align the offer with what is actually bought: "Satin Sheet" leads purchases/);
  const scale = space.find((o) => o.type === "SCALE");
  if (scale) assert.ok(scale.score < rec.primary!.score);
  assert.ok(rec.why.some((w) => /only 9% of orders/.test(w.en)));
  assert.ok(rec.wouldChange.some((w) => /starts selling/.test(w.en)));
});

test("S. the offer sells as planned → fulfilled; FIX_OFFER is not offered", () => {
  const f = evaluateIntentFulfillment(heroIntent, satinOrders(18, 4), intentPeriod, new Map());
  assert.equal(f.state, "fulfilled");
  const { diagnosis, space } = run({ giftCover: 40, giftInventory: 300, fulfillment: f });
  assert.equal(diagnosis.intent.state, "fulfilled");
  assert.ok(!types(space).includes("FIX_OFFER"));
});

test("T. campaign not linked: a product shift never says 'move the campaign', and the shift is penalised as a guess", () => {
  const { diagnosis, space } = run({ noGift: true, inventory: 30, cover: 6, facts: { replenishmentPossible: false }, altProduct: true, paidUnknown: true });
  assert.equal(diagnosis.paid.state, "unknown");
  const shift = space.find((o) => o.type === "SHIFT_PRODUCT_FOCUS")!;
  assert.ok(shift, "shift option exists with a verified alternative");
  assert.doesNotMatch(shift.what.en, /move the campaign/);
  assert.match(shift.what.en, /the campaign is not linked, so whether it drives the demand is unknown/);
  assert.ok(shift.because.some((b) => /campaign change is a guess/.test(b.reason.en)));
  // With the campaign linked, the sentence may name it.
  const linked = run({ noGift: true, inventory: 30, cover: 6, facts: { replenishmentPossible: false }, altProduct: true });
  assert.match(linked.space.find((o) => o.type === "SHIFT_PRODUCT_FOCUS")!.what.en, /move the campaign to "Satin Couture Duvet"/);
});

test("U. intent diverging AND a stock constraint: the headline carries both, the offer fix is in the space next to the stock options", () => {
  const f = evaluateIntentFulfillment(heroIntent, satinOrders(1, 15), intentPeriod, new Map());
  const { diagnosis, space } = run({ noGift: true, inventory: 30, cover: 6, fulfillment: f });
  assert.match(diagnosis.headline.en, /not unfolding as planned/);
  assert.match(diagnosis.headline.en, /Also, stock of "Satin Couture Full Set" will not last the window/);
  assert.ok(types(space).includes("FIX_OFFER"));
  assert.ok(diagnosis.constraint);
});

test("V. the episode records intent state and the fulfillment shares", () => {
  const f = evaluateIntentFulfillment(heroIntent, satinOrders(2, 20), intentPeriod, new Map());
  const { diagnosis, space, rec, summary } = run({ giftCover: 40, giftInventory: 300, fulfillment: f });
  const ep = buildEpisode(summary, diagnosis, space, rec, { initiativeId: "satin", title: "x", kind: "launch", start: "2026-09-01", end: "2026-09-30", offer: { discountPct: null, couponCode: null }, hookQuestion: null }, NOW);
  assert.equal(ep.diagnosis.intent, "diverging");
  assert.ok(ep.diagnosis.fulfillment && ep.diagnosis.fulfillment.orderShare !== null && ep.diagnosis.fulfillment.orderShare < 0.1);
});

test("W. campaign linked but Meta reports no purchase value: still no 'move the campaign', and the reason names the missing value, not a missing link", () => {
  const { diagnosis, space } = run({ noGift: true, inventory: 30, cover: 6, facts: { replenishmentPossible: false }, altProduct: true, attributed: null });
  assert.equal(diagnosis.paid.state, "unknown");
  assert.equal(diagnosis.paid.basis, "confirmed");
  const shift = space.find((o) => o.type === "SHIFT_PRODUCT_FOCUS")!;
  assert.doesNotMatch(shift.what.en, /move the campaign/);
  assert.match(shift.what.en, /linked but Meta reports no purchase value/);
});
