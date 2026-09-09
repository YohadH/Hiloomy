// Decision Candidate Audit — the layer that makes Today's prioritisation
// auditable (owner spec, 10 Sep 2026).
//
//   DOMAIN ENGINES → CANDIDATES → GLOBAL RANKING → SUPPRESSION → TODAY
//
// Every domain gets to put forward its strongest candidate on every run,
// including the one its own engine would not have alerted on. All
// candidates are scored on the same seven dimensions, ranked by an explicit
// formula whose weights are versioned, and every candidate that Today did
// not show carries a reason. This is SHADOW instrumentation: nothing here
// changes what Today shows. The manager keeps seeing the same decisions;
// the audit records whether the global ranking would have agreed.
//
// Nothing here is a model call. Four dimensions are computed from the
// numbers the engines already hold; three (management judgment, novelty,
// cross-domain strength) are V0 priors per decision kind, declared in one
// versioned table below and labelled as priors wherever they are shown.

import type { Localized } from "@/lib/domain/decision";

export type CandidateDomain = "inventory" | "paid_media" | "discount_profit" | "product_performance" | "affiliate" | "plan" | "market" | "returns";

export const CANDIDATE_DOMAINS: CandidateDomain[] = ["inventory", "paid_media", "discount_profit", "product_performance", "affiliate", "plan", "market", "returns"];

export const CANDIDATE_DOMAIN_LABEL: Record<CandidateDomain, Localized> = {
  inventory: { he: "מלאי", en: "Inventory" },
  paid_media: { he: "מדיה ממומנת", en: "Paid media" },
  discount_profit: { he: "הנחה × רווח", en: "Discount × Profit" },
  product_performance: { he: "ביצועי מוצר", en: "Product performance" },
  affiliate: { he: "שותפים × היסטוריית לקוח", en: "Affiliate × Customer history" },
  plan: { he: "תוכנית × מציאות", en: "Plan × Reality" },
  market: { he: "מתחרים / שוק", en: "Competitor / Market" },
  returns: { he: "החזרות", en: "Returns" }
};

// Decision kinds (Alert.type) → domain. `none` is the row a domain writes
// when it had nothing to put forward on a run.
export const DOMAIN_OF_KIND: Record<string, CandidateDomain> = {
  stockout_imminent: "inventory",
  roas_collapse: "paid_media",
  decision_standalone_loss: "discount_profit",
  decision_discount_tradeoff: "discount_profit",
  product_gone_silent: "product_performance",
  commission_leakage: "affiliate",
  plan_decision: "plan",
  competitor_promo: "market"
};

// Why a candidate did not reach Today. The audit never pretends a card lost
// the global ranking when a presentation rule hid it.
export type SuppressionReason =
  | "ENGINE_THRESHOLD" // the domain engine's own gate (₪, units, days, %)
  | "BELOW_MATERIALITY"
  | "LOW_CONFIDENCE"
  | "NO_MANAGEMENT_JUDGMENT"
  | "LOWER_GLOBAL_PRIORITY" // Today's card limit (ranked by Today's order)
  | "DUPLICATE"
  | "ALREADY_OPEN"
  | "ALREADY_DECIDED"
  | "NOT_IN_DECISION_WINDOW"
  | "INSUFFICIENT_EVIDENCE"
  | "OPERATIONAL_ONLY"
  | "WATCH_ONLY" // WATCH status → watchlist, not a card
  | "DOMAIN_DISPLAY_CAP" // presentation cap per kind
  | "NOT_ELIGIBLE" // the data the engine needs is not connected / present
  | "NO_ENGINE" // the domain has no decision engine yet
  | "NO_CANDIDATE"; // engine ran, found nothing at all

export interface CandidateScores {
  materiality: number; // 0–100, from ₪ exposure relative to the store
  urgency: number; // 0–100, from the decision window
  confidence: number; // 0–100, from evidence quality
  actionability: number; // 0–100
  managementJudgment: number; // 0–100 (V0 prior per kind, adjusted)
  novelty: number; // 0–100 (V0 prior per kind)
  crossDomain: number; // 0–100, from domains joined + campaign materiality
}

export type ScoreDimension = keyof CandidateScores;

export const SCORE_DIMENSIONS: ScoreDimension[] = ["materiality", "urgency", "confidence", "actionability", "managementJudgment", "novelty", "crossDomain"];

export const SCORE_DIMENSION_LABEL: Record<ScoreDimension, Localized> = {
  materiality: { he: "מהותיות", en: "Materiality" },
  urgency: { he: "דחיפות", en: "Urgency" },
  confidence: { he: "ביטחון", en: "Confidence" },
  actionability: { he: "ישימות", en: "Actionability" },
  managementJudgment: { he: "שיקול דעת ניהולי", en: "Management judgment" },
  novelty: { he: "חידוש", en: "Novelty" },
  crossDomain: { he: "חיבור בין תחומים", en: "Cross-domain" }
};

// Dimensions whose value is a declared prior, not a measurement.
export const PRIOR_DIMENSIONS: ScoreDimension[] = ["managementJudgment", "novelty", "crossDomain"];

export interface RankingWeights {
  version: string;
  weights: Record<ScoreDimension, number>; // sum to 1
}

// Starting heuristic, NOT business truth. Stored with every run.
export const RANKING_WEIGHTS_V1: RankingWeights = {
  version: "decision-ranking-v1",
  weights: { materiality: 0.25, urgency: 0.15, confidence: 0.1, actionability: 0.15, managementJudgment: 0.15, novelty: 0.1, crossDomain: 0.1 }
};

// V0 priors per decision kind. These are opinions written on 10 Sep 2026
// and are the part of the model the two-week feedback must confirm or
// overturn. The report shows rankings with AND without them.
export const KIND_PRIORS_VERSION = "kind-priors-v0";

export interface KindPrior {
  actionability: number;
  managementJudgment: number;
  novelty: number;
  // Urgency when the engine gives no window signal.
  urgencyDefault: number;
  // Materiality when no ₪ figure exists — so a missing number does not
  // kill the domain (spec §6).
  materialityDefault: number;
}

export const KIND_PRIORS: Record<string, KindPrior> = {
  // Replenish or not: operationally clear; a management trade-off only
  // when paid media is driving the demand (adjusted at scoring time).
  stockout_imminent: { actionability: 80, managementJudgment: 45, novelty: 20, urgencyDefault: 60, materialityDefault: 40 },
  // Paying commission on customers you already own: policy decision.
  commission_leakage: { actionability: 85, managementJudgment: 80, novelty: 85, urgencyDefault: 30, materialityDefault: 45 },
  decision_standalone_loss: { actionability: 80, managementJudgment: 75, novelty: 80, urgencyDefault: 40, materialityDefault: 45 },
  decision_discount_tradeoff: { actionability: 85, managementJudgment: 85, novelty: 65, urgencyDefault: 50, materialityDefault: 45 },
  roas_collapse: { actionability: 75, managementJudgment: 60, novelty: 45, urgencyDefault: 55, materialityDefault: 40 },
  product_gone_silent: { actionability: 55, managementJudgment: 50, novelty: 55, urgencyDefault: 35, materialityDefault: 35 },
  plan_decision: { actionability: 90, managementJudgment: 90, novelty: 50, urgencyDefault: 60, materialityDefault: 45 },
  competitor_promo: { actionability: 45, managementJudgment: 55, novelty: 60, urgencyDefault: 65, materialityDefault: 35 }
};

export interface DecisionCandidateInput {
  domain: CandidateDomain;
  kind: string; // Alert.type or engine slug; "none" for an empty domain row
  title: Localized;
  managementQuestion: Localized | null;
  trigger: Localized | null;
  evidenceSummary: string[]; // observable facts only, formatted
  connectedDomains: string[];
  financialExposure: number | null; // ₪
  financialExposureType: string | null; // "revenue_14d" | "commission_30d" | "spend_7d" | …
  financialConfidence: "known" | "calculated" | "estimated" | "unavailable";
  proposedStatus: string | null; // act / test / watch / do_not_act / change_plan
  proposedRecommendation: Localized | null;
  missingEvidence: string[];
  entity: { type: string; id: string | null; label: string } | null;
  // Scoring inputs the engines already hold.
  inputs: {
    daysCover?: number | null;
    windowOpensInDays?: number | null; // plan hooks: negative = open now
    promoLive?: boolean;
    confidence?: "high" | "medium" | "low" | null;
    domainsJoined?: number; // distinct evidence domains with data
    campaignMatters?: boolean; // paid media is contributor/driver
    revenue14dStore?: number | null; // store's 14d net sales, for relative materiality
    engineGate?: string | null; // "commission < ₪4,000 (₪3,810)" — the gate the engine applied
  };
  relatedDecisionId: string | null;
  // What Today did with it.
  surfaced: boolean;
  todayRank: number | null;
  suppressionReason: SuppressionReason | null;
  eligible: boolean;
}

export interface ScoredCandidate extends DecisionCandidateInput {
  scores: CandidateScores;
  globalScore: number; // 0–100 with all seven dimensions
  observableScore: number; // 0–100 with the four measured dimensions only
  rank: number | null; // by globalScore, across the run; null for "none"
  observableRank: number | null;
  crossDomain: boolean;
}

export interface CandidateRunSummary {
  id: string;
  storeId: string;
  runAt: string;
  trigger: "today" | "cron" | "audit";
  rankingVersion: string;
  priorsVersion: string;
  weights: Record<ScoreDimension, number>;
  candidates: number;
  surfaced: number;
  // Would the global ranking have shown a different #1 / top-3 than Today?
  topDiffers: boolean;
  top3Overlap: number; // 0..3
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// ₪ exposure as a share of the store's 14-day net sales:
//   0.5% → 20 · 2% → 50 · 5% → 75 · ≥10% → 95. Unknown ₪ → the kind's
//   default, so a domain that cannot quote a number is not killed by it.
export function materialityFrom(exposure: number | null, revenue14d: number | null, fallback: number): number {
  if (exposure === null || !Number.isFinite(exposure) || exposure <= 0) return fallback;
  if (!revenue14d || revenue14d <= 0) return clamp(Math.min(90, 30 + Math.log10(Math.max(1, exposure)) * 12));
  const share = exposure / revenue14d;
  if (share >= 0.1) return 95;
  if (share >= 0.05) return clamp(75 + ((share - 0.05) / 0.05) * 20);
  if (share >= 0.02) return clamp(50 + ((share - 0.02) / 0.03) * 25);
  if (share >= 0.005) return clamp(20 + ((share - 0.005) / 0.015) * 30);
  return clamp(5 + (share / 0.005) * 15);
}

export function urgencyFrom(kind: string, inputs: DecisionCandidateInput["inputs"]): number {
  const prior = KIND_PRIORS[kind]?.urgencyDefault ?? 40;
  if (inputs.daysCover !== null && inputs.daysCover !== undefined) {
    const d = inputs.daysCover;
    if (d <= 1) return 95;
    if (d <= 3) return 88;
    if (d <= 7) return 75;
    if (d <= 14) return 55;
    if (d <= 30) return 35;
    return 20;
  }
  if (inputs.windowOpensInDays !== null && inputs.windowOpensInDays !== undefined) {
    const w = inputs.windowOpensInDays;
    if (w <= 0) return 85; // decision window is open now
    if (w <= 3) return 70;
    if (w <= 7) return 55;
    if (w <= 14) return 40;
    return 25;
  }
  if (inputs.promoLive) return Math.max(prior, 70);
  return prior;
}

export function confidenceFrom(inputs: DecisionCandidateInput["inputs"], financialConfidence: DecisionCandidateInput["financialConfidence"]): number {
  const base = inputs.confidence === "high" ? 85 : inputs.confidence === "medium" ? 60 : inputs.confidence === "low" ? 35 : 55;
  const adj = financialConfidence === "known" ? 5 : financialConfidence === "estimated" ? -10 : financialConfidence === "unavailable" ? -15 : 0;
  return clamp(base + adj);
}

export function crossDomainFrom(inputs: DecisionCandidateInput["inputs"]): number {
  const n = inputs.domainsJoined ?? 1;
  // Joining systems is not the point; the join changing the answer is.
  let s = n >= 3 ? 65 : n === 2 ? 45 : 10;
  if (inputs.campaignMatters) s += 25;
  return clamp(s);
}

export function scoreCandidate(c: DecisionCandidateInput, weights: RankingWeights = RANKING_WEIGHTS_V1): { scores: CandidateScores; globalScore: number; observableScore: number } {
  const prior = KIND_PRIORS[c.kind] ?? { actionability: 50, managementJudgment: 50, novelty: 50, urgencyDefault: 40, materialityDefault: 40 };
  let managementJudgment = prior.managementJudgment;
  // A stock decision becomes a management trade-off when paid media is
  // buying the demand: replenish vs. pause acquisition.
  if (c.kind === "stockout_imminent" && c.inputs.campaignMatters) managementJudgment = clamp(managementJudgment + 25);
  const scores: CandidateScores = {
    materiality: materialityFrom(c.financialExposure, c.inputs.revenue14dStore ?? null, prior.materialityDefault),
    urgency: urgencyFrom(c.kind, c.inputs),
    confidence: confidenceFrom(c.inputs, c.financialConfidence),
    actionability: prior.actionability,
    managementJudgment,
    novelty: prior.novelty,
    crossDomain: crossDomainFrom(c.inputs)
  };
  const w = weights.weights;
  const globalScore = SCORE_DIMENSIONS.reduce((acc, k) => acc + scores[k] * w[k], 0);
  const observableKeys: ScoreDimension[] = ["materiality", "urgency", "confidence", "actionability"];
  const observableWeight = observableKeys.reduce((acc, k) => acc + w[k], 0);
  const observableScore = observableKeys.reduce((acc, k) => acc + scores[k] * w[k], 0) / observableWeight;
  return { scores, globalScore: Math.round(globalScore * 10) / 10, observableScore: Math.round(observableScore * 10) / 10 };
}

// Rank a run's candidates. `exclude` supports the ablation view ("what
// would Hiloomy have considered important without Inventory?") without
// touching stored rows. Rows of kind "none" never rank.
export function rankCandidates<T extends { kind: string; domain: CandidateDomain; globalScore: number; observableScore: number }>(
  candidates: T[],
  exclude: CandidateDomain[] = []
): Array<T & { rank: number | null; observableRank: number | null }> {
  const rankable = candidates.filter((c) => c.kind !== "none" && !exclude.includes(c.domain));
  const byGlobal = [...rankable].sort((a, b) => b.globalScore - a.globalScore);
  const byObservable = [...rankable].sort((a, b) => b.observableScore - a.observableScore);
  return candidates.map((c) => ({
    ...c,
    rank: rankable.includes(c) ? byGlobal.indexOf(c) + 1 : null,
    observableRank: rankable.includes(c) ? byObservable.indexOf(c) + 1 : null
  }));
}

// "Why this outranked the others" — a structured explanation from scores,
// never from prose. Names the two strongest dimensions of the winner and,
// for each runner-up, the dimension where it lost the most ground.
export function explainRank(
  winner: ScoredCandidate,
  others: ScoredCandidate[],
  locale: "he" | "en",
  weights: RankingWeights = RANKING_WEIGHTS_V1
): { strengths: string[]; outranked: Array<{ title: string; domain: CandidateDomain; because: string; gap: number }> } {
  const w = weights.weights;
  const contrib = (c: ScoredCandidate) => SCORE_DIMENSIONS.map((k) => ({ k, v: c.scores[k] * w[k] }));
  const strengths = contrib(winner)
    .sort((a, b) => b.v - a.v)
    .slice(0, 2)
    .map(({ k }) => `${SCORE_DIMENSION_LABEL[k][locale]} ${winner.scores[k]}${PRIOR_DIMENSIONS.includes(k) ? (locale === "he" ? " (הנחת V0)" : " (V0 prior)") : ""}`);
  const outranked = others
    .filter((o) => o.kind !== "none")
    .map((o) => {
      const diffs = SCORE_DIMENSIONS.map((k) => ({ k, d: (winner.scores[k] - o.scores[k]) * w[k] })).sort((a, b) => b.d - a.d);
      const top = diffs[0];
      return {
        title: o.title[locale],
        domain: o.domain,
        gap: Math.round((winner.globalScore - o.globalScore) * 10) / 10,
        because:
          locale === "he"
            ? `${SCORE_DIMENSION_LABEL[top.k].he} נמוך יותר (${o.scores[top.k]} לעומת ${winner.scores[top.k]})`
            : `lower ${SCORE_DIMENSION_LABEL[top.k].en.toLowerCase()} (${o.scores[top.k]} vs ${winner.scores[top.k]})`
      };
    });
  return { strengths, outranked };
}
