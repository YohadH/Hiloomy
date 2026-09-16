// Intent Fulfillment: how much of what happened matches what the initiative
// meant to achieve. Set → components, new → existing, online → stores, goal
// pace. A missing intent is "not_set"; too few orders is "insufficient";
// nothing here reads brand-wide data.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateIntentFulfillment, normalizeIntent, type InitiativeIntent, type IntentOrder } from "@/lib/domain/intent-fulfillment";

const period = { live: true, dayIndex: 14, elapsedShare: 14 / 30 };
const titles = new Map([
  ["sheet", "סדין סאטן 600 - לבן"],
  ["duvet", "ציפה וציפיות סאטן TAILORED"],
  ["pillow", "ציפית לכרית סאטן TAILORED"],
  ["bamboo", "סדין במבוק מוקה"]
]);
const mapped = new Set(["sheet", "duvet", "pillow"]);

let seq = 0;
const order = (items: Array<[string, number, number]>, opts: { channel?: IntentOrder["channel"]; isNew?: boolean | null } = {}): IntentOrder => ({
  orderId: `o${++seq}`,
  channel: opts.channel ?? "online",
  isNewCustomer: opts.isNew === undefined ? false : opts.isNew,
  lines: items.map(([productId, units, revenue]) => ({ productId, title: titles.get(productId) ?? productId, units, revenue, initiativeProduct: mapped.has(productId) }))
});

const setIntent = (over: Partial<InitiativeIntent> = {}): InitiativeIntent => ({
  initiativeId: "satin",
  targetProductIds: ["sheet", "duvet", "pillow"],
  targetMode: "together",
  targetLabel: "סט סאטן מלא",
  channel: null,
  audience: null,
  goal: null,
  note: null,
  setAt: "2026-09-01T00:00:00.000Z",
  ...over
});

test("no intent → not_set, nothing concluded", () => {
  const f = evaluateIntentFulfillment(null, [order([["sheet", 1, 300]])], period, titles);
  assert.equal(f.defined, false);
  assert.equal(f.state, "not_set");
  assert.equal(f.purchase, null);
});

test("we meant to sell the set; customers buy the components → diverging, components named", () => {
  const orders = [
    ...Array.from({ length: 9 }, () => order([["sheet", 1, 320]])),
    ...Array.from({ length: 4 }, () => order([["duvet", 1, 450]])),
    order([["sheet", 1, 320], ["duvet", 1, 450], ["pillow", 2, 160]]) // one full set
  ];
  const f = evaluateIntentFulfillment(setIntent(), orders, period, titles);
  assert.equal(f.state, "diverging");
  assert.ok(f.purchase);
  assert.equal(f.purchase!.totalOrders, 14);
  assert.equal(f.purchase!.intendedOrders, 1);
  assert.equal(f.purchase!.componentsOnlyOrders, 13);
  assert.ok(f.purchase!.orderShare! < 0.1);
  assert.match(f.findings[0].en, /buy the components separately/);
  assert.match(f.headline.en, /not unfolding as planned/);
  // The mix lists every line, the sheet first by revenue.
  assert.equal(f.purchase!.mix[0].productId, "sheet");
  assert.equal(f.purchase!.mix[0].orders, 10);
});

test("a set component that never sold is named — stock/page/price before demand", () => {
  const orders = Array.from({ length: 8 }, () => order([["sheet", 1, 320], ["duvet", 1, 450]]));
  const f = evaluateIntentFulfillment(setIntent(), orders, period, titles);
  assert.equal(f.state, "diverging");
  assert.deepEqual(f.purchase!.targetsNeverSold, ["ציפית לכרית סאטן TAILORED"]);
  assert.ok(f.findings.some((x) => /never sold/.test(x.en)));
});

test("hero product intent ('any'): the hero sells → fulfilled", () => {
  const orders = [...Array.from({ length: 7 }, () => order([["sheet", 1, 320]])), order([["duvet", 1, 450]]), order([["pillow", 1, 80]])];
  const f = evaluateIntentFulfillment(setIntent({ targetProductIds: ["sheet"], targetMode: "any", targetLabel: null }), orders, period, titles);
  assert.equal(f.state, "fulfilled");
  assert.equal(f.purchase!.intendedLabel, "סדין סאטן 600 - לבן"); // label falls back to the product title
  assert.ok(f.purchase!.orderShare! > 0.7);
});

test("hero product intent: something else sells → diverging names what actually sells", () => {
  const orders = [...Array.from({ length: 8 }, () => order([["duvet", 1, 450]])), order([["sheet", 1, 320]])];
  const f = evaluateIntentFulfillment(setIntent({ targetProductIds: ["sheet"], targetMode: "any", targetLabel: null }), orders, period, titles);
  assert.equal(f.state, "diverging");
  assert.match(f.findings[0].en, /what actually sells: "ציפה וציפיות סאטן TAILORED" \(8 orders\)/);
});

test("too few orders → insufficient, no verdict on the mix", () => {
  const f = evaluateIntentFulfillment(setIntent(), [order([["sheet", 1, 320]]), order([["duvet", 1, 450]])], period, titles);
  assert.equal(f.state, "insufficient");
  assert.equal(f.purchase!.orderShare, null);
  assert.equal(f.findings.length, 0);
});

test("we meant online; the growth is in stores → channel diverges", () => {
  const orders = [...Array.from({ length: 12 }, () => order([["sheet", 1, 320]], { channel: "offline" })), ...Array.from({ length: 3 }, () => order([["sheet", 1, 320]], { channel: "online" }))];
  const f = evaluateIntentFulfillment(setIntent({ targetProductIds: [], channel: "online" }), orders, period, titles);
  assert.equal(f.purchase, null);
  assert.equal(f.channel!.state, "diverges");
  assert.equal(Math.round(f.channel!.offlineShare! * 100), 80);
  assert.equal(f.state, "diverging");
  assert.match(f.findings[0].en, /We meant online; only 20% of initiative sales came from there/);
});

test("channel verdict needs a classified majority; otherwise unknown", () => {
  const orders = Array.from({ length: 10 }, (_, i) => order([["sheet", 1, 320]], { channel: i < 6 ? "unknown" : "online" }));
  const f = evaluateIntentFulfillment(setIntent({ targetProductIds: [], channel: "online" }), orders, period, titles);
  assert.equal(f.channel!.state, "unknown");
  assert.notEqual(f.state, "diverging");
});

test("we meant new customers; buyers are existing → audience diverges", () => {
  const orders = Array.from({ length: 10 }, (_, i) => order([["sheet", 1, 320]], { isNew: i < 2 }));
  const f = evaluateIntentFulfillment(setIntent({ targetProductIds: [], audience: "new" }), orders, period, titles);
  assert.equal(f.audience!.state, "diverges");
  assert.equal(Math.round(f.audience!.newShare! * 100), 20);
  assert.match(f.findings[0].en, /80% of the initiative's buyers are existing customers/);
});

test("goal pace: linear against the elapsed window, ±10%", () => {
  const orders = Array.from({ length: 10 }, () => order([["sheet", 1, 1000]]));
  // 10,000 so far, 47% of the window gone → expected 14,000 of a 30,000 goal → behind
  const behind = evaluateIntentFulfillment(setIntent({ targetProductIds: [], goal: { kind: "revenue", value: 30000 } }), orders, period, titles);
  assert.equal(behind.goal!.pace, "behind");
  assert.equal(behind.state, "partial");
  // 10,000 of a 20,000 goal → expected 9,333 → on track
  const onTrack = evaluateIntentFulfillment(setIntent({ targetProductIds: [], goal: { kind: "revenue", value: 20000 } }), orders, period, titles);
  assert.equal(onTrack.goal!.pace, "on_track");
  assert.equal(onTrack.state, "fulfilled");
  // orders goal counts initiative orders
  const byOrders = evaluateIntentFulfillment(setIntent({ targetProductIds: [], goal: { kind: "orders", value: 15 } }), orders, period, titles);
  assert.equal(byOrders.goal!.actual, 10);
  assert.equal(byOrders.goal!.pace, "ahead");
});

test("the set sells as planned → fulfilled with the share in the headline", () => {
  const orders = Array.from({ length: 10 }, (_, i) => (i < 8 ? order([["sheet", 1, 320], ["duvet", 1, 450], ["pillow", 2, 160]]) : order([["sheet", 1, 320]])));
  const f = evaluateIntentFulfillment(setIntent(), orders, period, titles);
  assert.equal(f.state, "fulfilled");
  assert.match(f.headline.en, /80% of orders match the offer/);
});

test("other products in the same order appear in the mix, flagged, and do not count as initiative revenue", () => {
  const orders = Array.from({ length: 6 }, () => order([["sheet", 1, 320], ["bamboo", 1, 400]]));
  const f = evaluateIntentFulfillment(setIntent({ targetProductIds: ["sheet"], targetMode: "any" }), orders, period, titles);
  const bamboo = f.purchase!.mix.find((m) => m.productId === "bamboo")!;
  assert.equal(bamboo.initiativeProduct, false);
  assert.equal(f.purchase!.totalRevenue, 6 * 320);
});

test("normalizeIntent: validates the stored shape; 'together' needs >1 target; empty intent → null", () => {
  assert.equal(normalizeIntent(null), null);
  assert.equal(normalizeIntent({ initiativeId: "x" }), null);
  const one = normalizeIntent({ initiativeId: "x", targetProductIds: ["a"], targetMode: "together" })!;
  assert.equal(one.targetMode, "any");
  const two = normalizeIntent({ initiativeId: "x", targetProductIds: ["a", "b", "a"], targetMode: "together", channel: "stores", audience: "new", goal: { kind: "revenue", value: "5000" } })!;
  assert.deepEqual(two.targetProductIds, ["a", "b"]);
  assert.equal(two.targetMode, "together");
  assert.equal(two.channel, null); // "stores" is not a valid value
  assert.equal(two.audience, "new");
  assert.deepEqual(two.goal, { kind: "revenue", value: 5000 });
  assert.equal(normalizeIntent({ initiativeId: "x", goal: { kind: "revenue", value: 0 } }), null);
});

test("the same product under two catalogue ids is ONE target: a set needs one of them, and 'never sold' is judged per title", () => {
  const dupTitles = new Map([...titles, ["sheet2", "סדין סאטן 600 - לבן"]]);
  const orders = Array.from({ length: 8 }, () => order([["sheet", 1, 320], ["duvet", 1, 450]]));
  // together: sheet (either id) + duvet
  const f = evaluateIntentFulfillment(setIntent({ targetProductIds: ["sheet", "sheet2", "duvet"], targetLabel: null }), orders, period, dupTitles);
  assert.equal(f.state, "fulfilled");
  assert.equal(f.purchase!.intendedOrders, 8);
  assert.deepEqual(f.purchase!.targetsNeverSold, []);
  assert.equal(f.purchase!.intendedLabel, "סדין סאטן 600 - לבן + ציפה וציפיות סאטן TAILORED");
});
