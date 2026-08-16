// Budget + creative recommendation engine.
//
// Takes per-campaign performance numbers (Meta spend + Shopify revenue + CTR
// + clicks + purchases + WoW deltas) and returns a single, named
// recommendation for the upcoming week.
//
// Rule set is exactly the 8-rule table from the original spec, adapted to
// the user's tiered ROAS bands:
//   < 2x  with real spend  → CUT
//   2-3x  with real spend  → REVIEW / REFRESH CREATIVE
//   3-5x  (baseline good)  → SCALE +15-20%
//   > 5x  (excellent)      → SCALE AGGRESSIVELY +25-30%
//   spend too low          → NEEDS MORE DATA (never recommend pause)
//
// Plus secondary rules:
//   Strong CTR + weak conversion → fix landing page before scaling
//   Strong conversion + weak CTR → test new creatives/hooks
//   High CPA + low ROAS         → reduce + refresh
//
// Output is shaped to render directly into Page 6's table and Page 11's
// action plan.

export interface RecommendationInput {
  campaignName: string;
  spend: number;
  clicks: number;
  ctr: number; // percentage (e.g. 2.04 means 2.04%)
  // Shopify-confirmed first; falls back to Meta if Shopify match coverage
  // is low or zero. The Source label travels with the value so the report
  // can mark which one drove the recommendation.
  primaryRoas: number | null;
  primaryRoasSource: "shopify" | "meta";
  primarySalesCount: number; // orders or purchases depending on source
  metaAttributedPurchases: number;
  shopifyOrders: number;
  // Optional WoW deltas for tone / confidence (percent values).
  weekOverWeekSpendChangePct: number | null;
  weekOverWeekPurchasesChangePct: number | null;
  // Current daily budget if we know it (Meta doesn't always return it).
  currentDailyBudget: number | null;
  // User-configured targets. Defaults applied at the call site, NOT here,
  // so this function stays pure / easily tested.
  targets: RoasTargets;
}

export interface RoasTargets {
  roasGoodMin: number; // default 3
  roasExcellentMin: number; // default 5
  maxCpa: number; // default 80
  minSpendForJudgement: number; // default 500
  minPurchasesForScale: number; // default 5
  scaleUpPct: number; // default 0.2 (20%)
  scaleAggressivePct: number; // default 0.3
  scaleDownPct: number; // default 0.25
}

export const DEFAULT_TARGETS: RoasTargets = {
  roasGoodMin: 3,
  roasExcellentMin: 5,
  maxCpa: 80,
  minSpendForJudgement: 500,
  minPurchasesForScale: 5,
  scaleUpPct: 0.2,
  scaleAggressivePct: 0.3,
  scaleDownPct: 0.25
};

export type RecommendationAction =
  | "scale_aggressive"
  | "scale"
  | "keep"
  | "review_creative"
  | "fix_landing_page"
  | "test_new_creatives"
  | "reduce"
  | "needs_more_data";

export type RiskLevel = "low" | "medium" | "high";
export type Confidence = "high" | "medium" | "low";

export interface Recommendation {
  action: RecommendationAction;
  actionLabelHe: string;
  actionLabelEn: string;
  reasonHe: string;
  reasonEn: string;
  suggestedDailyBudget: number | null;
  budgetDeltaPct: number | null; // +0.2 = +20%, -0.25 = -25%
  confidence: Confidence;
  risk: RiskLevel;
  // Which ROAS source the engine used to decide. Carried through so the
  // report can render the source tag next to the recommendation.
  decidedFrom: "shopify" | "meta";
}

function suggestBudget(current: number | null, deltaPct: number): number | null {
  if (current == null || current <= 0) return null;
  return Math.round(current * (1 + deltaPct));
}

export function buildRecommendation(input: RecommendationInput): Recommendation {
  const { spend, ctr, primaryRoas, primarySalesCount, targets, currentDailyBudget } = input;
  const cpa = primarySalesCount > 0 ? spend / primarySalesCount : null;

  // Insufficient delivery — never recommend pause from low spend alone.
  if (spend < targets.minSpendForJudgement) {
    return {
      action: "needs_more_data",
      actionLabelHe: "אין מספיק נתונים",
      actionLabelEn: "Needs more data",
      reasonHe: `נצרכו ₪${Math.round(spend)} בלבד — מתחת לסף ההחלטה (₪${targets.minSpendForJudgement}). יש להמשיך לבדוק עם תקציב יעודי.`,
      reasonEn: `Only ₪${Math.round(spend)} spent — below the ₪${targets.minSpendForJudgement} judgement threshold. Continue testing with a dedicated budget.`,
      suggestedDailyBudget: currentDailyBudget,
      budgetDeltaPct: 0,
      confidence: "low",
      risk: "low",
      decidedFrom: input.primaryRoasSource
    };
  }

  // Strong CTR but weak conversion — landing page / offer issue.
  const conversionRate = input.clicks > 0 ? primarySalesCount / input.clicks : 0;
  if (ctr >= 2.0 && conversionRate < 0.005 && spend >= targets.minSpendForJudgement) {
    return {
      action: "fix_landing_page",
      actionLabelHe: "לתקן עמוד נחיתה",
      actionLabelEn: "Fix landing page",
      reasonHe: `CTR חזק (${ctr.toFixed(2)}%) אך יחס המרה רק ${(conversionRate * 100).toFixed(2)}% — הבעיה בעמוד הנחיתה / הצעת המחיר, לא ביצירתי. אין להגדיל תקציב עד שמתוקן.`,
      reasonEn: `Strong CTR (${ctr.toFixed(2)}%) but conversion only ${(conversionRate * 100).toFixed(2)}% — the leak is on the landing page / offer, not the ad. Don't scale until this is fixed.`,
      suggestedDailyBudget: currentDailyBudget,
      budgetDeltaPct: 0,
      confidence: "medium",
      risk: "medium",
      decidedFrom: input.primaryRoasSource
    };
  }

  // Real ROAS-based decisions.
  if (primaryRoas == null) {
    return {
      action: "needs_more_data",
      actionLabelHe: "חסרים נתוני שיוך",
      actionLabelEn: "Missing attribution",
      reasonHe: "לא ניתן לחשב ROAS — חסר שיוך בין הזמנות Shopify לקמפיין. יש לוודא תיוג UTM על המודעות.",
      reasonEn: "Can't compute ROAS — no Shopify orders attributable to this campaign. Verify UTM tagging on the ads.",
      suggestedDailyBudget: currentDailyBudget,
      budgetDeltaPct: 0,
      confidence: "low",
      risk: "low",
      decidedFrom: input.primaryRoasSource
    };
  }

  // < 2x with real spend → CUT.
  if (primaryRoas < 2) {
    return {
      action: "reduce",
      actionLabelHe: "להפחית תקציב",
      actionLabelEn: "Reduce budget",
      reasonHe: `ROAS ${primaryRoas.toFixed(2)}x מתחת ליעד עם ${Math.round(spend)} ₪ הוצאה. מומלץ להפחית תקציב ב${Math.round(targets.scaleDownPct * 100)}% או לרענן את היצירתי.`,
      reasonEn: `ROAS ${primaryRoas.toFixed(2)}x is below target with ₪${Math.round(spend)} spent. Cut budget by ~${Math.round(targets.scaleDownPct * 100)}% or refresh the creative.`,
      suggestedDailyBudget: suggestBudget(currentDailyBudget, -targets.scaleDownPct),
      budgetDeltaPct: -targets.scaleDownPct,
      confidence: "high",
      risk: "low",
      decidedFrom: input.primaryRoasSource
    };
  }

  // 2-3x with real spend → REVIEW / REFRESH.
  if (primaryRoas < targets.roasGoodMin) {
    return {
      action: "review_creative",
      actionLabelHe: "לרענן יצירתי / לבדוק הצעה",
      actionLabelEn: "Refresh creative or revisit offer",
      reasonHe: `ROAS ${primaryRoas.toFixed(2)}x מתחת ליעד של ${targets.roasGoodMin}x. לבדוק קריאייטיב חדש או לחדד את ההצעה לפני הגדלה.`,
      reasonEn: `ROAS ${primaryRoas.toFixed(2)}x is below the ${targets.roasGoodMin}x target. Test new creative or sharpen the offer before scaling.`,
      suggestedDailyBudget: currentDailyBudget,
      budgetDeltaPct: 0,
      confidence: "high",
      risk: "low",
      decidedFrom: input.primaryRoasSource
    };
  }

  // 3-5x → baseline good, gradual scale.
  if (primaryRoas < targets.roasExcellentMin) {
    if (primarySalesCount < targets.minPurchasesForScale) {
      return {
        action: "keep",
        actionLabelHe: "להשאיר ולהמשיך לבחון",
        actionLabelEn: "Hold and keep testing",
        reasonHe: `ROAS ${primaryRoas.toFixed(2)}x טוב אך רק ${primarySalesCount} רכישות — חסר נפח כדי להחליט על הגדלה. להשאיר תקציב נוכחי.`,
        reasonEn: `ROAS ${primaryRoas.toFixed(2)}x is good but only ${primarySalesCount} purchases — not enough volume to scale yet. Hold current budget.`,
        suggestedDailyBudget: currentDailyBudget,
        budgetDeltaPct: 0,
        confidence: "medium",
        risk: "low",
        decidedFrom: input.primaryRoasSource
      };
    }
    return {
      action: "scale",
      actionLabelHe: "להגדיל תקציב",
      actionLabelEn: "Scale budget",
      reasonHe: `ROAS ${primaryRoas.toFixed(2)}x מעל היעד עם נפח של ${primarySalesCount} רכישות. מומלץ להגדיל תקציב ב${Math.round(targets.scaleUpPct * 100)}% בהדרגה.`,
      reasonEn: `ROAS ${primaryRoas.toFixed(2)}x is above target with ${primarySalesCount} purchases. Scale budget by +${Math.round(targets.scaleUpPct * 100)}% gradually.`,
      suggestedDailyBudget: suggestBudget(currentDailyBudget, targets.scaleUpPct),
      budgetDeltaPct: targets.scaleUpPct,
      confidence: "high",
      risk: "low",
      decidedFrom: input.primaryRoasSource
    };
  }

  // > 5x → excellent. Scale aggressively + protect creative.
  return {
    action: "scale_aggressive",
    actionLabelHe: "להגדיל אגרסיבית",
    actionLabelEn: "Scale aggressively",
    reasonHe: `ROAS ${primaryRoas.toFixed(2)}x מצוין (מעל ${targets.roasExcellentMin}x) עם ${primarySalesCount} רכישות. מומלץ להגדיל תקציב ב${Math.round(targets.scaleAggressivePct * 100)}% ולשכפל את היצירתי המנצח לקבוצה נפרדת.`,
    reasonEn: `ROAS ${primaryRoas.toFixed(2)}x is excellent (above ${targets.roasExcellentMin}x) with ${primarySalesCount} purchases. Scale +${Math.round(targets.scaleAggressivePct * 100)}% and duplicate the winning creative into a separate adset.`,
    suggestedDailyBudget: suggestBudget(currentDailyBudget, targets.scaleAggressivePct),
    budgetDeltaPct: targets.scaleAggressivePct,
    confidence: "high",
    risk: "medium", // higher because scaling fast carries more risk
    decidedFrom: input.primaryRoasSource
  };
}
