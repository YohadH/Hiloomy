// Funnel Diagnosis — WHERE a paid initiative breaks, deterministically.
//
// The rules this module encodes (owner, 2026-09-15, the Satin Couture case):
//   • Zero purchases is not automatically negative — but zero purchases AFTER
//     MATERIAL EXPOSURE is negative evidence. Three demand states:
//       insufficient_exposure        — not enough traffic/spend to learn yet
//       no_observed_purchase_demand  — material exposure, zero purchases
//       observed_purchase_demand     — purchases exist
//   • Materiality is measured against the store's own historical CPA when the
//     sample is large enough (spend = N × CPA ⇒ N expected purchases; N ≥ 3
//     with zero observed is a real signal, P(0) ≈ e⁻³ ≈ 5%). Below the sample
//     guard we fall back to V0 thresholds and SAY they are heuristics.
//   • A stage is judged against the store baseline rate, not an absolute
//     count: "LPV→ATC 1.8% vs store 7.4%" beats "42 ATC".
//   • Meta purchases > 0 with zero Shopify sales on the linked products is an
//     ATTRIBUTION / MAPPING MISMATCH — a measurement finding, never
//     "no demand" and never an automatic "tracking broken".
//   • Spend with unexpectedly empty pixel stages is a MEASUREMENT issue —
//     business failure and measurement failure are different diagnoses.
//   • Stages the data does not carry are NOT invented: without mid-funnel
//     data the honest verdict is "did not sell; break point unknown".
//
// Pure; tested in tests/unit/funnel-diagnosis.test.ts.

import type { Localized } from "@/lib/domain/decision";

const L = (he: string, en: string): Localized => ({ he, en });
const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
const pct = (r: number, digits = 1) => `${(r * 100).toFixed(digits)}%`;

// ── Thresholds ─────────────────────────────────────────────────────────
// Benchmark sample guard: a CPA built on fewer purchases is noise.
export const BENCHMARK_MIN_PURCHASES = 30;
// Expected purchases (spend / CPA) at which zero observed becomes negative
// evidence: 3 expected → P(zero) ≈ e⁻³ ≈ 5%.
export const EXPOSURE_CPA_MULTIPLE = 3;
// V0 heuristics when no valid benchmark exists — mirror the thresholds the
// campaign-funnel alert already uses, and are LABELLED as heuristics.
export const V0_SPEND_FLOOR = 300;
export const V0_CLICKS_FLOOR = 80;
export const V0_IMPRESSIONS_FLOOR = 10_000;
// A stage rate below this share of the store baseline is materially below it.
export const MATERIALLY_BELOW = 0.5;
// Minimum events entering a stage before its rate is judged at all.
const STAGE_MIN_EVENTS = 30;

// ── Inputs ─────────────────────────────────────────────────────────────
export interface FunnelBenchmark {
  window: Localized; // e.g. "90 הימים האחרונים, כל הקמפיינים"
  spend: number;
  purchases: number; // the sample the guard checks
  cpa: number | null;
  ctr: number | null; // clicks / impressions
  clickToLpv: number | null; // lpv / link clicks
  lpvToAtc: number | null;
  atcToIc: number | null;
  icToPurchase: number | null;
}

export interface LinkedProductHealth {
  id: string;
  title: string;
  status: string | null; // Shopify product status; DRAFT cannot be bought
  allTimeUnits: number; // units ever sold — 0 means the mapping points at a non-seller
}

export interface FunnelInput {
  spend: number;
  daysElapsed: number;
  impressions: number | null;
  clicks: number | null;
  linkClicks: number | null;
  lpv: number | null; // landing page views — Meta pixel
  atc: number | null; // add to cart — Meta pixel
  ic: number | null; // initiate checkout — Meta pixel
  metaPurchases: number;
  metaAttributedRevenue: number | null;
  // Shopify truth for the LINKED products over the same window.
  shopifyUnits: number | null;
  shopifyRevenue: number | null;
  linkedProducts: LinkedProductHealth[];
  benchmark: FunnelBenchmark | null;
}

// ── Output ─────────────────────────────────────────────────────────────
export type PurchaseDemandState = "insufficient_exposure" | "no_observed_purchase_demand" | "observed_purchase_demand";
export type FunnelVerdict =
  | "healthy"
  | "break_acquisition" // impressions → clicks: creative / audience
  | "break_landing" // clicks → LPV: link / load
  | "break_pdp_offer" // LPV → ATC: page / product / offer
  | "break_intent" // ATC → IC: price / offer at the cart
  | "break_late_funnel" // IC → purchase: checkout / shipping / payment
  | "break_unlocated" // did not sell; the data cannot place the break
  | "attribution_mismatch" // Meta purchases > 0, linked Shopify sales = 0
  | "measurement_suspected" // spend without believable pixel stages
  | "inconclusive"; // no spend / nothing to judge

export type FunnelStageKey = "impressions" | "clicks" | "lpv" | "atc" | "ic" | "meta_purchases" | "shopify_purchases";
export type FunnelStageSource = "meta_reported" | "meta_pixel" | "shopify";

export interface FunnelStage {
  key: FunnelStageKey;
  label: Localized;
  value: number | null; // null = the data does not carry this stage
  source: FunnelStageSource;
  // Conversion FROM the previous available stage (null on the first stage or
  // when either side is missing/too small to judge).
  rate: number | null;
  benchmarkRate: number | null;
  materiallyBelow: boolean;
}

export interface ExposureAssessment {
  sufficient: boolean;
  // spend / benchmark CPA — how many purchases this spend "bought" at the
  // store's own historical cost per purchase.
  expectedPurchases: number | null;
  cpaMultiple: number | null;
  benchmarkValid: boolean; // sample guard passed
  // The sentence that says WHICH bar was used — benchmark or V0 heuristic.
  basisNote: Localized;
}

export interface FunnelDiagnosis {
  purchaseDemand: PurchaseDemandState;
  verdict: FunnelVerdict;
  breakStage: FunnelStageKey | null;
  stages: FunnelStage[];
  exposure: ExposureAssessment;
  headline: Localized; // the one-line conclusion for the hero
  detail: Localized; // the supporting sentence with the numbers
  // attribution_mismatch only: the possible causes, most likely first.
  mismatchReasons: Localized[];
  metaPurchases: number;
  shopifyUnits: number | null;
}

const STAGE_LABEL: Record<FunnelStageKey, Localized> = {
  impressions: L("חשיפות", "Impressions"),
  clicks: L("קליקים", "Clicks"),
  lpv: L("צפיות דף נחיתה", "Landing views"),
  atc: L("הוספות לעגלה", "Add to cart"),
  ic: L("צ'קאאוט", "Checkout"),
  meta_purchases: L("רכישות (מטא)", "Purchases (Meta)"),
  shopify_purchases: L("רכישות שופיפיי", "Shopify purchases")
};

function buildStages(f: FunnelInput): FunnelStage[] {
  const bm = f.benchmark;
  const defs: Array<{ key: FunnelStageKey; value: number | null; source: FunnelStageSource; benchmarkRate: number | null }> = [
    { key: "impressions", value: f.impressions, source: "meta_reported", benchmarkRate: null },
    { key: "clicks", value: f.clicks, source: "meta_reported", benchmarkRate: bm?.ctr ?? null },
    { key: "lpv", value: f.lpv, source: "meta_pixel", benchmarkRate: bm?.clickToLpv ?? null },
    { key: "atc", value: f.atc, source: "meta_pixel", benchmarkRate: bm?.lpvToAtc ?? null },
    { key: "ic", value: f.ic, source: "meta_pixel", benchmarkRate: bm?.atcToIc ?? null },
    { key: "meta_purchases", value: f.metaPurchases, source: "meta_pixel", benchmarkRate: bm?.icToPurchase ?? null },
    { key: "shopify_purchases", value: f.shopifyUnits, source: "shopify", benchmarkRate: null }
  ];
  const stages: FunnelStage[] = [];
  let prev: number | null = null;
  for (const d of defs) {
    // Rate against the previous AVAILABLE Meta stage; Shopify truth is a
    // parallel measurement, never a funnel step computed off the pixel.
    const rate = d.key !== "impressions" && d.key !== "shopify_purchases" && d.value !== null && prev !== null && prev >= STAGE_MIN_EVENTS ? d.value / prev : null;
    const materiallyBelow = rate !== null && d.benchmarkRate !== null && d.benchmarkRate > 0 ? rate < d.benchmarkRate * MATERIALLY_BELOW : false;
    stages.push({ key: d.key, label: STAGE_LABEL[d.key], value: d.value, source: d.source, rate, benchmarkRate: d.benchmarkRate, materiallyBelow });
    if (d.key !== "shopify_purchases" && d.value !== null) prev = d.value;
  }
  return stages;
}

function assessExposure(f: FunnelInput): ExposureAssessment {
  const bm = f.benchmark;
  const benchmarkValid = !!bm && bm.purchases >= BENCHMARK_MIN_PURCHASES && (bm.cpa ?? 0) > 0;
  if (benchmarkValid) {
    const expected = f.spend / bm!.cpa!;
    return {
      sufficient: expected >= EXPOSURE_CPA_MULTIPLE,
      expectedPurchases: Math.round(expected * 10) / 10,
      cpaMultiple: Math.round(expected * 10) / 10,
      benchmarkValid: true,
      basisNote: L(
        `CPA היסטורי ${ils(bm!.cpa!)} (${bm!.window.he}, מדגם ${bm!.purchases} רכישות) — ההוצאה שווה ${(f.spend / bm!.cpa!).toFixed(1)} רכישות צפויות`,
        `Historical CPA ${ils(bm!.cpa!)} (${bm!.window.en}, sample ${bm!.purchases} purchases) — the spend equals ${(f.spend / bm!.cpa!).toFixed(1)} expected purchases`
      )
    };
  }
  const sufficient = f.spend >= V0_SPEND_FLOOR && ((f.clicks ?? 0) >= V0_CLICKS_FLOOR || (f.impressions ?? 0) >= V0_IMPRESSIONS_FLOOR);
  return {
    sufficient,
    expectedPurchases: null,
    cpaMultiple: null,
    benchmarkValid: false,
    basisNote: L(
      `אין CPA היסטורי מהימן (מדגם קטן מ-${BENCHMARK_MIN_PURCHASES} רכישות) — רף מהותיות V0: הוצאה ≥ ${ils(V0_SPEND_FLOOR)} ו-${V0_CLICKS_FLOOR} קליקים, היוריסטיקה מוצהרת`,
      `No reliable historical CPA (sample under ${BENCHMARK_MIN_PURCHASES} purchases) — V0 materiality: spend ≥ ${ils(V0_SPEND_FLOOR)} and ${V0_CLICKS_FLOOR} clicks, a stated heuristic`
    )
  };
}

const BREAK_BY_STAGE: Partial<Record<FunnelStageKey, { verdict: FunnelVerdict; line: Localized }>> = {
  clicks: { verdict: "break_acquisition", line: L("המודעות לא מייצרות מספיק עניין — קריאייטיב או קהל", "Ads are not generating enough interest — creative or audience") },
  lpv: { verdict: "break_landing", line: L("יש קליקים אבל התנועה לא מגיעה לדף — לינק, מהירות טעינה או יעד שבור", "Clicks exist but traffic is not reaching the page — link, load speed or a broken destination") },
  atc: { verdict: "break_pdp_offer", line: L("התנועה מגיעה למוצר, אבל דף המוצר או ההצעה לא ממירים עניין לעגלה", "Traffic reaches the product, but the product page or the offer is not converting interest to cart") },
  ic: { verdict: "break_intent", line: L("יש כוונת קנייה (עגלות), אבל היא לא ממשיכה לצ'קאאוט — מחיר, משלוח או ההצעה בעגלה", "Purchase intent exists (carts), but it does not continue to checkout — price, shipping or the offer at the cart") },
  meta_purchases: { verdict: "break_late_funnel", line: L("לקוחות מגיעים לצ'קאאוט אבל לא משלימים רכישה — שלב מאוחר: תשלום, משלוח או אמון", "Customers reach checkout but do not complete the purchase — late funnel: payment, shipping or trust") }
};

export function diagnoseFunnel(f: FunnelInput): FunnelDiagnosis {
  const stages = buildStages(f);
  const exposure = assessExposure(f);
  const shopifyUnits = f.shopifyUnits;
  const base = {
    stages,
    exposure,
    mismatchReasons: [] as Localized[],
    metaPurchases: f.metaPurchases,
    shopifyUnits
  };

  // ── Nothing spent: nothing to judge ──────────────────────────────────
  if (f.spend <= 0) {
    return {
      ...base,
      purchaseDemand: "insufficient_exposure",
      verdict: "inconclusive",
      breakStage: null,
      headline: L("הקמפיין לא הוציא תקציב — אין עדיין מה לשפוט.", "The campaign has spent nothing — there is nothing to judge yet."),
      detail: L("ברגע שתהיה הוצאה, המשפך יימדד מול הבייסליין של החנות.", "Once spend exists, the funnel is measured against the store baseline.")
    };
  }

  // ── CASE F: measurement failure, not business failure ────────────────
  // Spend without impressions, or believable traffic whose pixel stages are
  // ALL measured at zero, is a measurement suspicion — never "no demand".
  // Stages the data does not carry at all (null) are ABSENT, not dead: they
  // lead to "break point unknown", not to a tracking accusation.
  const pixelDead = (f.linkClicks ?? 0) >= V0_CLICKS_FLOOR && f.lpv === 0 && f.atc === 0 && f.ic === 0 && f.metaPurchases === 0;
  if (f.spend >= V0_SPEND_FLOOR && (f.impressions === 0 || pixelDead)) {
    return {
      ...base,
      purchaseDemand: "insufficient_exposure",
      verdict: "measurement_suspected",
      breakStage: null,
      headline: L("חשד לבעיית מדידה — לא כשל ביקוש.", "Measurement issue suspected — not a demand failure."),
      detail:
        (f.impressions ?? 0) === 0
          ? L(`${ils(f.spend)} הוצאה ללא חשיפות מדווחות — לאמת את חיבור הנתונים לפני כל מסקנה עסקית.`, `${ils(f.spend)} spend with zero reported impressions — verify the data connection before any business conclusion.`)
          : L(`${f.linkClicks} קליקים אבל אפס אירועי פיקסל (דף, עגלה, צ'קאאוט) — לאמת את הפיקסל לפני כל מסקנה עסקית.`, `${f.linkClicks} clicks but zero pixel events (page, cart, checkout) — verify the pixel before any business conclusion.`)
    };
  }

  // ── CASE D: Meta converts, the linked products never sell ────────────
  if (f.metaPurchases > 0 && (shopifyUnits ?? 0) === 0 && shopifyUnits !== null) {
    const neverSold = f.linkedProducts.length > 0 && f.linkedProducts.every((p) => p.allTimeUnits === 0);
    const unpublished = f.linkedProducts.filter((p) => (p.status ?? "").toUpperCase() === "DRAFT");
    const mismatchReasons: Localized[] = [];
    if (neverSold)
      mismatchReasons.push(
        L(`המיפוי צר מדי: ${f.linkedProducts.length} המוצרים המקושרים לא מכרו אף יחידה מעולם — הקמפיין כנראה מוכר מוצרים אחרים מאותה משפחה`, `The mapping is too narrow: the ${f.linkedProducts.length} linked products have never sold a unit — the campaign likely sells other products in the family`)
      );
    if (unpublished.length) mismatchReasons.push(L(`"${unpublished[0].title}" בסטטוס DRAFT — לא ניתן לקנייה בכלל`, `"${unpublished[0].title}" is in DRAFT status — it cannot be bought at all`));
    mismatchReasons.push(L("ייחוס מטא כולל רכישות של מוצרים שאינם ממופים ליוזמה", "Meta's attribution includes purchases of products not mapped to the initiative"));
    mismatchReasons.push(L("חלונות ייחוס/תאריכים שונים בין מטא לשופיפיי", "Different attribution/date windows between Meta and Shopify"));
    mismatchReasons.push(L("בעיית טראקינג", "A tracking issue"));
    return {
      ...base,
      mismatchReasons,
      purchaseDemand: "observed_purchase_demand",
      verdict: "attribution_mismatch",
      breakStage: null,
      headline: L("אי-התאמת ייחוס/מיפוי — הקמפיין ממיר, אבל לא נמדד על המוצרים המקושרים.", "Attribution / mapping mismatch — the campaign converts, but not on the linked products."),
      detail: L(
        `מטא מדווח ${f.metaPurchases} רכישות${f.metaAttributedRevenue ? ` (${ils(f.metaAttributedRevenue)})` : ""}, אבל ${f.linkedProducts.length || "ה"}מוצרים המקושרים מכרו 0 בשופיפיי. ${mismatchReasons[0].he}.`,
        `Meta reports ${f.metaPurchases} purchases${f.metaAttributedRevenue ? ` (${ils(f.metaAttributedRevenue)})` : ""}, but the ${f.linkedProducts.length || ""} linked products sold 0 on Shopify. ${mismatchReasons[0].en}.`
      )
    };
  }

  // ── Purchases exist and are measured ─────────────────────────────────
  if (f.metaPurchases > 0 || (shopifyUnits ?? 0) > 0) {
    const soft = stages.find((s) => s.materiallyBelow);
    return {
      ...base,
      purchaseDemand: "observed_purchase_demand",
      verdict: "healthy",
      breakStage: soft?.key ?? null,
      headline: soft
        ? L(`יש ביקוש רכישה נמדד; השלב החלש ביותר: ${soft.label.he} (${pct(soft.rate!)} מול ${pct(soft.benchmarkRate!)} בחנות).`, `Purchase demand is measured; weakest stage: ${soft.label.en} (${pct(soft.rate!)} vs the store's ${pct(soft.benchmarkRate!)}).`)
        : L("יש ביקוש רכישה נמדד והמשפך תקין מול הבייסליין של החנות.", "Purchase demand is measured and the funnel is healthy against the store baseline."),
      detail: L(`${f.metaPurchases} רכישות לפי מטא${shopifyUnits !== null ? ` · ${shopifyUnits} יחידות בשופיפיי על המוצרים המקושרים` : ""}.`, `${f.metaPurchases} purchases by Meta${shopifyUnits !== null ? ` · ${shopifyUnits} Shopify units on the linked products` : ""}.`)
    };
  }

  // ── Zero purchases: exposure decides whether that is evidence ────────
  if (!exposure.sufficient) {
    // CASE E: too little exposure — preserve the honest "not enough data".
    return {
      ...base,
      purchaseDemand: "insufficient_exposure",
      verdict: "inconclusive",
      breakStage: null,
      headline: L("עדיין לא הייתה חשיפה מספקת כדי לשפוט.", "There has not yet been enough exposure to judge."),
      detail: L(`${ils(f.spend)} הוצאה ב-${f.daysElapsed} ימים — מתחת לרף. ${exposure.basisNote.he}.`, `${ils(f.spend)} spend in ${f.daysElapsed} days — under the bar. ${exposure.basisNote.en}.`)
    };
  }

  // Material exposure, zero purchases → negative evidence. Locate the break.
  const broken = stages.find((s) => s.materiallyBelow) ?? null;
  // Without a benchmark: the first pixel stage that is zero while its
  // predecessor carries real volume.
  const zeroBreak =
    broken ??
    stages.find((s, i) => {
      if (s.key === "impressions" || s.key === "shopify_purchases" || s.value !== 0) return false;
      const prev = stages[i - 1];
      return prev?.value !== null && (prev?.value ?? 0) >= STAGE_MIN_EVENTS;
    }) ??
    null;
  const exposureLine = exposure.benchmarkValid
    ? L(`ההוצאה שווה ${exposure.cpaMultiple} רכישות צפויות לפי ה-CPA ההיסטורי — ואפס בפועל`, `The spend equals ${exposure.cpaMultiple} expected purchases at the historical CPA — and zero happened`)
    : L(`ההוצאה עברה את רף המהותיות (${exposure.basisNote.he})`, `Spend passed the materiality bar (${exposure.basisNote.en})`);
  // Mid-funnel data missing entirely → say we cannot place the break.
  const midFunnelMissing = f.lpv === null && f.atc === null && f.ic === null;
  if (midFunnelMissing || !zeroBreak) {
    return {
      ...base,
      purchaseDemand: "no_observed_purchase_demand",
      verdict: "break_unlocated",
      breakStage: null,
      headline: L("לא הופיע ביקוש רכישה נמדד במהלך היוזמה.", "No measured purchase demand has appeared during the initiative."),
      detail: midFunnelMissing
        ? L(`${ils(f.spend)} הוצאה, 0 רכישות. ${exposureLine.he}. אין נתוני ביניים (דף/עגלה/צ'קאאוט) לאתר איפה המשפך נשבר.`, `${ils(f.spend)} spend, 0 purchases. ${exposureLine.en}. No mid-funnel data (page/cart/checkout) to place where it breaks.`)
        : L(`${ils(f.spend)} הוצאה, 0 רכישות. ${exposureLine.he}. אף שלב לא חורג מהותית מהבייסליין — הנפח פשוט קטן מדי בכל שלב.`, `${ils(f.spend)} spend, 0 purchases. ${exposureLine.en}. No stage is materially below baseline — volume is simply too small at every stage.`)
    };
  }
  const map = BREAK_BY_STAGE[zeroBreak.key] ?? { verdict: "break_unlocated" as FunnelVerdict, line: L("נקודת השבירה לא אותרה", "The break point was not located") };
  const rateLine =
    zeroBreak.rate !== null && zeroBreak.benchmarkRate !== null
      ? L(`${zeroBreak.label.he}: ${pct(zeroBreak.rate)} מול ${pct(zeroBreak.benchmarkRate)} בייסליין החנות`, `${zeroBreak.label.en}: ${pct(zeroBreak.rate)} vs the store baseline ${pct(zeroBreak.benchmarkRate)}`)
      : L(`${zeroBreak.label.he}: 0 אירועים`, `${zeroBreak.label.en}: 0 events`);
  return {
    ...base,
    purchaseDemand: "no_observed_purchase_demand",
    verdict: map.verdict,
    breakStage: zeroBreak.key,
    headline: L(`לא הופיע ביקוש רכישה נמדד — ${map.line.he}.`, `No measured purchase demand has appeared — ${map.line.en}.`),
    detail: L(`${ils(f.spend)} הוצאה, 0 רכישות. ${exposureLine.he}. ${rateLine.he}.`, `${ils(f.spend)} spend, 0 purchases. ${exposureLine.en}. ${rateLine.en}.`)
  };
}
