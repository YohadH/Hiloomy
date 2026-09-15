// Funnel diagnosis — the deterministic "where does it break" engine and its
// integration with the decision space (owner acceptance cases A–F,
// 2026-09-15). Case D uses the REAL Satin Couture production numbers
// (TAKEANAP, Sep 1–14 2026) traced before the redesign.

import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnoseFunnel, type FunnelBenchmark, type FunnelInput } from "@/lib/domain/funnel-diagnosis";
import { diagnose, type DiagnosisInput, type PaidEvidence } from "@/lib/domain/business-diagnosis";
import { buildDecisionSpace, resolveRecommendation } from "@/lib/domain/decision-space";
import { evaluateInitiativeReality, resolveMappings, type ConfirmedEntityLink, type InitiativeEvidence, type MappingCandidates } from "@/lib/domain/initiative-reality";
import type { Initiative } from "@/lib/domain/plan";

const NOW = new Date("2026-09-15T09:00:00.000Z");

// The store baseline as traced from production (trailing 90d, all campaigns).
const BENCHMARK: FunnelBenchmark = {
  window: { he: "90 הימים האחרונים", en: "trailing 90 days" },
  spend: 32923,
  purchases: 267,
  cpa: 123.31,
  ctr: 0.013,
  clickToLpv: 0.797,
  lpvToAtc: 0.166,
  atcToIc: 0.307,
  icToPurchase: 0.358
};

const base = (over: Partial<FunnelInput>): FunnelInput => ({
  spend: 2000,
  daysElapsed: 15,
  impressions: 60_000,
  clicks: 900,
  linkClicks: 800,
  lpv: 640,
  atc: 110,
  ic: 34,
  metaPurchases: 0,
  metaAttributedRevenue: null,
  shopifyUnits: 0,
  shopifyRevenue: 0,
  linkedProducts: [],
  benchmark: BENCHMARK,
  ...over
});

test("CASE A — high impressions, materially low CTR, zero purchases → creative/audience break", () => {
  const d = diagnoseFunnel(base({ impressions: 100_000, clicks: 300, linkClicks: 260, lpv: 200, atc: 20, ic: 6 }));
  assert.equal(d.purchaseDemand, "no_observed_purchase_demand");
  assert.equal(d.verdict, "break_acquisition");
  assert.equal(d.breakStage, "clicks");
  assert.match(d.headline.en, /No measured purchase demand/);
});

test("CASE B — healthy CTR and traffic, LPV→ATC materially below baseline → PDP/offer break", () => {
  const d = diagnoseFunnel(base({ atc: 15, ic: 4 }));
  assert.equal(d.verdict, "break_pdp_offer");
  assert.equal(d.breakStage, "atc");
  assert.match(d.detail.he, /מול/); // the rate is stated against the baseline
});

test("CASE C — carts and checkout activity, zero purchases → late-funnel break", () => {
  const d = diagnoseFunnel(base({ atc: 120, ic: 40 }));
  assert.equal(d.verdict, "break_late_funnel");
  assert.equal(d.breakStage, "meta_purchases");
});

test("CASE D — the real Satin Couture numbers: Meta converts, linked products never sold → attribution mismatch, never 'no demand'", () => {
  const d = diagnoseFunnel(
    base({
      spend: 3216.38,
      impressions: 57_423,
      clicks: 1_414,
      linkClicks: 1_240,
      lpv: 958,
      atc: 203,
      ic: 64,
      metaPurchases: 23,
      metaAttributedRevenue: 20_903,
      shopifyUnits: 0,
      linkedProducts: [
        { id: "a", title: "סט מצעים מלא סאטן Barato", status: "DRAFT", allTimeUnits: 0 },
        { id: "b", title: "סט מצעים מלא סאטן Oxford", status: "ACTIVE", allTimeUnits: 0 },
        { id: "c", title: "סט מצעים מלא סאטן Piping", status: "ACTIVE", allTimeUnits: 0 },
        { id: "d", title: "סט מצעים מלא סאטן Tailored", status: "ACTIVE", allTimeUnits: 0 }
      ]
    })
  );
  assert.equal(d.verdict, "attribution_mismatch");
  assert.equal(d.purchaseDemand, "observed_purchase_demand");
  assert.doesNotMatch(d.headline.en, /no demand/i);
  // Most likely cause first: the mapping is too narrow (all-time zero sellers).
  assert.match(d.mismatchReasons[0].en, /too narrow/);
  // The DRAFT product is named — it cannot be bought at all.
  assert.equal(d.mismatchReasons.some((r) => /DRAFT/.test(r.en)), true);
});

test("CASE E — little spend and traffic: insufficient exposure, honest 'not enough data' preserved", () => {
  const d = diagnoseFunnel(base({ spend: 150, impressions: 3_000, clicks: 40, linkClicks: 35, lpv: 30, atc: 3, ic: 1 }));
  assert.equal(d.purchaseDemand, "insufficient_exposure");
  assert.equal(d.verdict, "inconclusive");
  assert.match(d.headline.he, /חשיפה מספקת/);
});

test("CASE F — spend with dead pixel stages → measurement issue suspected, not 'no demand'", () => {
  const noImpressions = diagnoseFunnel(base({ impressions: 0, clicks: 0, linkClicks: 0, lpv: 0, atc: 0, ic: 0 }));
  assert.equal(noImpressions.verdict, "measurement_suspected");
  const deadPixel = diagnoseFunnel(base({ linkClicks: 500, lpv: 0, atc: 0, ic: 0 }));
  assert.equal(deadPixel.verdict, "measurement_suspected");
  assert.doesNotMatch(deadPixel.headline.en, /demand failure$/);
});

test("exposure: benchmark sample guard falls back to the V0 heuristic and says so", () => {
  const small: FunnelBenchmark = { ...BENCHMARK, purchases: 5, cpa: 100 };
  const d = diagnoseFunnel(base({ spend: 500, clicks: 100, linkClicks: 90, lpv: 70, atc: 2, ic: 0, benchmark: small }));
  assert.equal(d.exposure.benchmarkValid, false);
  assert.equal(d.exposure.sufficient, true); // 500 ≥ 300 and 100 clicks ≥ 80
  assert.match(d.exposure.basisNote.he, /היוריסטיקה/);
});

test("mid-funnel missing entirely → 'did not sell; break point unknown', no invented stages", () => {
  const d = diagnoseFunnel(base({ lpv: null, atc: null, ic: null, clicks: 200, linkClicks: 180, impressions: 20_000 }));
  assert.equal(d.verdict, "break_unlocated");
  assert.match(d.detail.he, /אין נתוני ביניים/);
  assert.equal(d.stages.filter((s) => s.value !== null && s.key !== "shopify_purchases").length, 3); // impressions, clicks, meta purchases — only what exists
});

// ─── Integration: diagnosis → decision space → recommendation ─────────

const initiative = (): Initiative =>
  ({
    id: "satin",
    title: "השקת סאטן קוטור",
    anchor: { kind: "launch", label: "סאטן קוטור" },
    start: "2026-09-01",
    end: "2026-09-30",
    offer: { discountPct: null, couponCode: null },
    products: [],
    relatedDecisions: [],
    text: "השקת סאטן קוטור — לבדוק סטטוס קמפיין ולבחון המשך"
  }) as unknown as Initiative;

const catalogue: MappingCandidates = {
  products: [{ id: "p1", title: "סט מצעים מלא סאטן Oxford" }],
  knownDiscountCodes: [],
  metaCampaigns: [{ id: "c1", name: "קמפיין סאטן אוגוסט 2026", linkedProductIds: [] }]
};
const confirmed: ConfirmedEntityLink[] = [
  { initiativeId: "satin", kind: "product", id: "p1", label: "סט מצעים מלא סאטן Oxford" },
  { initiativeId: "satin", kind: "meta_campaign", id: "c1", label: "קמפיין סאטן אוגוסט 2026" }
];
const freshness = { shopify: NOW.toISOString(), meta: NOW.toISOString(), inventory: NOW.toISOString(), plan: NOW.toISOString() };

function briefFor(paidOver: Partial<PaidEvidence>, opts: { metaPurchases?: number; allTimeUnits?: number } = {}) {
  const m = resolveMappings(initiative(), catalogue, confirmed);
  const evidence: InitiativeEvidence = {
    products: [{ id: "p1", title: "סט מצעים מלא סאטן Oxford", role: "product", basis: "confirmed", rule: "operator", revenue: 0, units: 0, priorRevenue: null, priorUnits: null, dailyUnits: Array.from({ length: 15 }, () => 0), inventory: 80, coverDays: null, hasRealCost: false, marginRate: null }],
    discount: null,
    campaigns: [{ id: "c1", name: "קמפיין סאטן אוגוסט 2026", basis: "confirmed", rule: "operator", spend: 3216, purchases: opts.metaPurchases ?? 0, attributedRevenue: null }],
    store: null,
    freshness
  };
  const reality = evaluateInitiativeReality(initiative(), m, evidence, NOW);
  const paid: PaidEvidence = {
    spend: 3216.38,
    purchases: opts.metaPurchases ?? 0,
    clicks: 1_414,
    attributedRevenue: opts.metaPurchases ? 20_903 : null,
    impressions: 57_423,
    linkClicks: 1_240,
    lpv: 958,
    atc: 203,
    ic: 64,
    benchmark: BENCHMARK,
    basis: "confirmed",
    baseline: null
  };
  const input: DiagnosisInput = {
    reality,
    channels: null,
    creators: null,
    paid: { ...paid, ...paidOver },
    locations: [],
    facts: { replenishmentWithinDays: null, replenishmentPossible: null, giftOptional: null, alternativeGiftProductId: null },
    alternatives: { gift: [], product: [] },
    linkedProducts: [{ id: "p1", title: "סט מצעים מלא סאטן Oxford", status: "ACTIVE", allTimeUnits: opts.allTimeUnits ?? 0 }]
  };
  const d = diagnose(input);
  const space = buildDecisionSpace(d);
  const rec = resolveRecommendation(d, space, { basis: reality.evidenceBasis, stale: reality.stale });
  return { d, space, rec };
}

test("ACCEPTANCE (Satin, mismatch): the recommendation is FIX_MAPPING — never 'not enough evidence', never 'cancel'", () => {
  const { d, rec } = briefFor({}, { metaPurchases: 23 });
  assert.equal(d.funnel?.verdict, "attribution_mismatch");
  assert.equal(d.scope, "measurement");
  assert.notEqual(rec.answer, "insufficient");
  assert.equal(rec.primary?.type, "FIX_MAPPING");
  assert.equal(rec.paidCampaign?.verdict, "fix_mapping");
  assert.match(rec.initiativeLine!.he, /לא לבטל/);
  // Profit confidence is low (no costs) but performance confidence is high —
  // missing COGS never silences the performance verdict.
  assert.equal(rec.performanceConfidence, "high");
  assert.equal(rec.profitConfidence, "low");
});

test("ACCEPTANCE (zero Meta purchases after material exposure): PAUSE the campaign, do not cancel the launch, not 'insufficient'", () => {
  const { d, rec } = briefFor({}, { metaPurchases: 0 });
  assert.equal(d.funnel?.purchaseDemand, "no_observed_purchase_demand");
  assert.notEqual(rec.answer, "insufficient");
  assert.equal(rec.primary?.type, "PAUSE_CAMPAIGN");
  assert.equal(rec.paidCampaign?.verdict, "pause");
  assert.match(rec.initiativeLine!.he, /לא לבטל את היוזמה/);
  assert.match(d.headline.he, /לא הופיע ביקוש רכישה נמדד/);
});

test("ACCEPTANCE (Case E end-to-end): under the exposure bar the answer stays 'insufficient' and names the bar", () => {
  const { rec } = briefFor({ spend: 150, clicks: 40, linkClicks: 35, lpv: 30, atc: 3, ic: 1, impressions: 3_000 });
  assert.equal(rec.answer, "insufficient");
  assert.match(rec.what.he, /חשיפה מספקת/);
});
