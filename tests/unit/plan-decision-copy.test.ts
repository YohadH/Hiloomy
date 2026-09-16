// Plan-decision copy: a review hook answers its own question or says the
// evidence is not enough; decision first, scoped evidence second; blocked
// evaluations are not recommendations; conditional hooks keep discount language.

import { test } from "node:test";
import assert from "node:assert/strict";
import { composeReviewRecommendation, reviewWhyNow, scopedPaceSentence, scopedSalesSentence } from "@/lib/domain/plan-decision-copy";
import { evaluateInitiativeReality, resolveMappings, summarizeReality, type ConfirmedEntityLink, type InitiativeEvidence, type InitiativeMappings, type InitiativeRealitySummary, type MappingCandidates } from "@/lib/domain/initiative-reality";
import type { Initiative } from "@/lib/domain/plan";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const fresh = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const freshness = { shopify: fresh(0.2), meta: fresh(0.5), inventory: fresh(0.2), plan: fresh(1) };
const flat = (n: number, perDay: number) => Array.from({ length: n }, () => perDay);

const satin = (over: Partial<Initiative> = {}): Initiative =>
  ({
    id: "satin",
    title: "Satin Couture launch",
    anchor: { kind: "launch", label: "Satin Couture" },
    start: "2026-09-01",
    end: "2026-09-30",
    offer: { discountPct: null, couponCode: null },
    products: [],
    relatedDecisions: [],
    text: "Satin Couture launch — check campaign status, how many sales, how many Travel Pillows went out with the full set as a gift, and decide whether to continue the coupon.",
    ...over
  }) as unknown as Initiative;

const catalogue: MappingCandidates = {
  products: [
    { id: "p_full", title: "Satin Couture Full Set — Stone" },
    { id: "p_pillow", title: "Travel Pillow" }
  ],
  knownDiscountCodes: ["SATIN20"],
  metaCampaigns: [{ id: "c_satin", name: "Satin August 2026", linkedProductIds: [] }],
  discountUsage: [{ code: "SATIN20", orders: 42, firstUsed: "2026-09-02", lastUsed: "2026-09-13" }]
};
const allConfirmed: ConfirmedEntityLink[] = [
  { initiativeId: "satin", kind: "meta_campaign", id: "c_satin", label: "Satin August 2026" },
  { initiativeId: "satin", kind: "product", id: "p_full", label: "Satin Couture Full Set — Stone" },
  { initiativeId: "satin", kind: "gift_product", id: "p_pillow", label: "Travel Pillow" },
  { initiativeId: "satin", kind: "discount", id: "SATIN20", label: "SATIN20" }
];

const evidenceFor = (m: InitiativeMappings, over: { giftCover?: number; giftInventory?: number; margin?: number | null; units?: number; priorRevenue?: number; spend?: number; attributed?: number; couponOrders?: number } = {}): InitiativeEvidence => {
  const link = (kind: string, id: string) => m.links.find((l) => l.kind === kind && l.id === id && l.state !== "suggested");
  const p = link("product", "p_full");
  const g = link("gift_product", "p_pillow");
  const c = m.links.filter((l) => l.kind === "meta_campaign" && l.state !== "suggested");
  const d = link("discount", "SATIN20");
  return {
    products: [
      ...(p ? [{ id: "p_full", title: "Satin Couture Full Set — Stone", role: "product" as const, basis: p.state as "confirmed" | "provisional", rule: p.provenance.rule, revenue: 32480, units: over.units ?? 41, priorRevenue: over.priorRevenue ?? 27500, priorUnits: 35, dailyUnits: flat(14, (over.units ?? 41) / 14), inventory: 120, coverDays: 41, hasRealCost: true, marginRate: over.margin === undefined ? 0.48 : over.margin }] : []),
      ...(g ? [{ id: "p_pillow", title: "Travel Pillow", role: "gift" as const, basis: g.state as "confirmed" | "provisional", rule: g.provenance.rule, revenue: 0, units: 26, priorRevenue: 0, priorUnits: 0, dailyUnits: flat(14, 26 / 14), inventory: over.giftInventory ?? 15, coverDays: over.giftCover ?? 8, hasRealCost: true, marginRate: null }] : [])
    ],
    discount: d ? { code: "SATIN20", basis: d.state as "confirmed" | "provisional", rule: d.provenance.rule, orders: over.couponOrders ?? 42, amount: 3900 } : null,
    campaigns: c.map((l) => ({ id: l.id, name: l.label, basis: l.state as "confirmed" | "provisional", rule: l.provenance.rule, spend: over.spend ?? 3095, purchases: 12, attributedRevenue: over.attributed ?? 9800 })),
    store: { sales7: 118000, velocityChangePct: 0.15, marginRate: 0.41 },
    freshness
  };
};
const summary = (confirmed: ConfirmedEntityLink[], over: Parameters<typeof evidenceFor>[1] = {}): InitiativeRealitySummary => {
  const m = resolveMappings(satin(), catalogue, confirmed);
  return summarizeReality(evaluateInitiativeReality(satin(), m, evidenceFor(m, over), NOW), satin().offer);
};

test("1. review hook + strong evidence, no issue → 'continue as planned', decision first, scoped evidence second", () => {
  const r = summary(allConfirmed, { giftCover: 40, giftInventory: 200 });
  const rec = composeReviewRecommendation(r, 0.15);
  assert.equal(rec.verdict, "continue");
  assert.equal(rec.recommendedOption, "keep");
  assert.equal(rec.decision.he, "להמשיך כמתוכנן.");
  assert.match(rec.evidence.he, /^מכירות 1 המוצרים המקושרים ב-14 הימים הראשונים: ₪32,480, \+18% מול 14 הימים שלפני היוזמה/);
  assert.match(rec.evidence.he, /מלאי המתנה מספיק ל-40 ימים מתוך 16 שנותרו \(26 ניתנו\)/);
  assert.match(rec.evidence.he, /הוצאת Meta מתחילת היוזמה ₪3,095, ROAS 3\.2 לפי ייחוס Meta/);
  assert.match(rec.evidence.he, /42 הזמנות עם הקופון SATIN20 מאז 2026-09-01/);
  assert.match(rec.evidence.he, /מרווח תרומה על מכירות היוזמה 48% \(מחושב מעלויות אמיתיות\)/);
});

test("2. review hook + conflicting evidence (sales +18% but gift cover 8 of 16 days) → 'change', never 'continue because sales are up'", () => {
  const r = summary(allConfirmed);
  const rec = composeReviewRecommendation(r, 0.15);
  assert.equal(rec.verdict, "change");
  assert.equal(rec.recommendedOption, "change");
  assert.match(rec.decision.he, /^לשנות את ההצעה: להחליף את המתנה או לסיים את ההטבה/);
  assert.match(rec.evidence.he, /\+18% מול 14 הימים שלפני היוזמה/);
  assert.match(rec.evidence.he, /למתנה "Travel Pillow" נשארו 8 ימי כיסוי בלבד מול 16 ימים שנותרו לקמפיין/);
  assert.doesNotMatch(rec.decision.he, /להמשיך/);
});

test("2b. insufficient evidence → no forced option: inventory unknown, or no sales since start, or no reality at all", () => {
  // Products mapped, campaign known, but no inventory figures at all.
  const m = resolveMappings(satin(), catalogue, allConfirmed);
  const ev = evidenceFor(m, { giftCover: 40 });
  ev.products = ev.products.map((p) => ({ ...p, inventory: null, coverDays: null }));
  const r = summarizeReality(evaluateInitiativeReality(satin(), m, ev, NOW), satin().offer);
  const rec = composeReviewRecommendation(r, 0.15);
  assert.equal(rec.verdict, "insufficient");
  assert.equal(rec.recommendedOption, null);
  assert.match(rec.decision.he, /עדיין אין מספיק ראיות כדי לבחור בין להמשיך, לשנות או לעצור/);
  assert.match(rec.evidence.he, /המלאי של המוצרים המקושרים לא ידוע/);
  // No sales since start → not enough to choose, said explicitly.
  const r2 = summary(allConfirmed, { units: 0, giftCover: 40, giftInventory: 200 });
  const rec2 = composeReviewRecommendation(r2, 0.15);
  assert.equal(rec2.verdict, "insufficient");
  assert.match(rec2.decision.he, /אין מכירות מדודות מאז תחילת היוזמה/);
  // No reality → insufficient, and the store pace is named as broader context only.
  const rec3 = composeReviewRecommendation(null, 0.15);
  assert.equal(rec3.verdict, "insufficient");
  assert.match(rec3.evidence.he, /מכירות כל החנות \(הקשר רחב, לא היוזמה\): \+15%/);
});

test("3. needs_context → blocked, no recommendation: what is missing and the resolve action", () => {
  const r = summary([{ initiativeId: "satin", kind: "meta_campaign", id: "c_satin", label: "Satin August 2026" }]);
  assert.equal(r.status, "needs_context");
  const rec = composeReviewRecommendation(r, 0.15);
  assert.equal(rec.verdict, "blocked");
  assert.equal(rec.recommendedOption, null);
  assert.equal(rec.decision.he, "אי אפשר עדיין להעריך אם להמשיך, לשנות או לעצור.");
  assert.match(rec.evidence.en, /^Hiloomy checked|activity detected|live for/); // what was checked, never "missing: …"
  assert.deepEqual(rec.blocked!.missing, ["product", "gift_product", "discount"]);
  assert.equal(rec.blocked!.required, 0); // nothing ties → no question to answer
  assert.equal(rec.blocked!.cta.en, "See what Hiloomy checked");
  assert.doesNotMatch(rec.decision.he, /מפה|למפות/); // never "map the products" under "recommends"
  assert.doesNotMatch(rec.blocked!.cta.en, /Complete \d+ connection/);
});

test("4. conditional hook keeps discount language but its pace clause carries the scope", () => {
  const r = summary(allConfirmed, { giftCover: 40, giftInventory: 200 });
  const pace = scopedPaceSentence(r, 0.15)!;
  assert.match(pace.he, /^מכירות 1 המוצרים המקושרים ב-14 הימים הראשונים: ₪32,480, \+18% מול 14 הימים שלפני היוזמה$/);
  const fallback = scopedPaceSentence(null, 0.15)!;
  assert.match(fallback.he, /מכירות כל החנות \(הקשר רחב, לא היוזמה\): \+15% ב-7 הימים האחרונים מול 7 הקודמים/);
});

test("5. every evidence sentence carries its scope; provisional mappings are named; stop needs negative margin AND falling sales", () => {
  // Provisional products (exact title, unconfirmed) are named in the sentence.
  const m = resolveMappings(satin({ products: [{ productId: "p_full", title: "Satin Couture Full Set — Stone", inventory: 120, units14d: 41, unitsPrior14d: 0, coverDays: 41, hasRealCost: true, liveCampaigns: 0 }], text: "Satin Couture Full Set — Stone launch — check campaign status and sales" } as Partial<Initiative>), catalogue, [{ initiativeId: "satin", kind: "meta_campaign", id: "c_satin", label: "Satin August 2026" }]);
  const r = summarizeReality(evaluateInitiativeReality(satin(), m, evidenceFor(m), NOW), satin().offer);
  const s = scopedSalesSentence(r)!;
  assert.match(s.he, /מבוסס על 1 התאמות אוטומטיות שטרם אושרו/);
  assert.match(s.en, /in the first 14 days: ₪32,480, \+18% vs the 14 days before the initiative/);
  // Stop: negative margin with real costs and sales below the prior period.
  const stop = summary(allConfirmed, { margin: -0.2, priorRevenue: 40000, giftCover: 40, giftInventory: 200 });
  const rec = composeReviewRecommendation(stop, 0.15);
  assert.equal(rec.verdict, "stop");
  assert.match(rec.evidence.he, /-19% מול 14 הימים שלפני היוזמה/);
  assert.match(rec.evidence.he, /מרווח תרומה על מכירות היוזמה -20%/);
  // whyNow reads as current context.
  const why = reviewWhyNow(stop, "2026-09-01", "review");
  assert.match(why.he, /^בדיקה שהתוכנית קבעה ל-2026-09-01 · יום 14 מתוך 30 · מכירות 1 המוצרים המקושרים/);
  const blocked = reviewWhyNow(summary([]), "2026-09-01", "review");
  assert.match(blocked.he, /נבדק — טרם זוהו: /);
});
