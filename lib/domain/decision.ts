// Decision Objects — the unit Hiloomy's home screen is built from.
//
// A Decision is not an alert and not a KPI. It is a management question with
// the evidence that raised it, the options that were considered, a
// recommendation, an honest confidence, the evidence that is missing, and the
// conditions that would change the answer. Every fact carries its source and
// its quality so the UI never shows fake precision.

export type Localized = { he: string; en: string };

export type DecisionStatus = "act" | "watch" | "do_not_act" | "test" | "change_plan";

export type Confidence = "high" | "medium" | "low";

// Known      — read directly from a system of record (Shopify, Meta …)
// Calculated — derived from known facts with a stated formula
// Estimated  — derived with an assumption (default cost ratio, model)
// Unavailable— the fact does not exist in Hiloomy today
export type EvidenceQuality = "known" | "calculated" | "estimated" | "unavailable";

export type EvidenceSource =
  | "shopify"
  | "inventory"
  | "profit"
  | "meta"
  | "affiliate"
  | "market"
  | "plan";

export interface EvidenceFact {
  label: Localized;
  // Formatted display value (a number/currency string, or a localized word
  // such as "stable"). null = unavailable (render as such).
  value: string | Localized | null;
  source: EvidenceSource;
  // e.g. "Shopify Orders", "Meta Ads" — the specific system behind the fact.
  sourceDetail: Localized;
  quality: EvidenceQuality;
  // Optional secondary line under the value (e.g. "4.2 days cover").
  note?: Localized;
}

// Commercial exposure in up to three dimensions — revenue, profit, and the
// operational one (inventory cover, spend) — instead of one inflated number.
// Profit is `null` + "COGS missing" when the product has no real cost.
export interface ExposureDim {
  label: Localized;
  value: string | null;
  quality: EvidenceQuality;
  note?: Localized;
}

export interface DecisionOption {
  key: string;
  label: Localized;
  recommended: boolean;
}

// auto_closed — the engine resolved the row itself because the condition
// passed (stock arrived, promo ended) before anyone decided.
export type HumanChoice = "pending" | "approved" | "alternative" | "ignored" | "auto_closed";

export interface HumanDecision {
  choice: HumanChoice;
  optionKey?: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface DecisionOutcome {
  verdict: "win" | "neutral" | "miss" | "no_data";
  summary: Localized;
  measuredAt: string;
}

// How much a paid campaign actually matters to the situation. Decides
// whether Meta is context, a contributor, or the thing the decision is about.
export type Materiality = "evidence" | "material" | "driver";

export interface MaterialityAssessment {
  level: Materiality;
  detail: Localized;
  // Inputs, so the receipt can show why (all 0–1 shares; null = unknown).
  spendShare: number | null;
  attributedShare: number | null;
}

// Lifecycle of one decision episode in the ledger. The same situation seen
// again tomorrow does NOT create a new decision — it advances this one.
export type DecisionState = "open" | "watching" | "escalated" | "resolved";

export interface EvidenceSnapshot {
  at: string;
  status: DecisionStatus;
  // A handful of key numbers, engine-specific (inventory, days, spend …).
  metrics: Record<string, number | string | null>;
}

export interface DecisionLedgerState {
  state: DecisionState;
  // When the signal was first seen (engine period start when known, else
  // the row's creation) — NOT when the cron happened to run.
  firstDetectedAt: string;
  lastEvaluatedAt: string;
  // First time it was shown as a card on Today. null = never surfaced.
  surfacedAt: string | null;
  snapshots: EvidenceSnapshot[];
}

// The manager's judgment of the decision itself — the wedge measurement.
export type JudgmentTag = "useful" | "obvious" | "wrong" | "missing_context";

export interface Judgment {
  tags: JudgmentTag[];
  // Did this change what you did / where you looked? null = not answered.
  changedDecision: boolean | null;
  at: string;
  by: string;
}

export interface Decision {
  // Ledger id (Alert.id). Display id is derived: see displayDecisionId().
  id: string;
  kind: string;
  status: DecisionStatus;
  // Engine severity was critical — lets a third card of the same domain
  // through the presentation cap.
  critical: boolean;
  title: Localized;
  question: Localized;
  // One short line for the inbox card: the two facts that make this matter
  // now ("₪41.6K sales / 14d · Meta campaign still active"). Everything
  // else waits for the receipt.
  whyNow: Localized;
  trigger: Localized;
  evidence: EvidenceFact[];
  exposure: ExposureDim[];
  // "What Hiloomy connected", business-readable:
  //   statement  — "Low inventory + strong sales velocity + active acquisition"
  //   conclusion — "Stockout may interrupt profitable demand"
  //   inputs     — the systems that were joined (shown as chips)
  connected: { inputs: Localized[]; statement: Localized; conclusion: Localized };
  // Distinct evidence domains that actually had data. ≥ 2 = cross-domain.
  domains: EvidenceSource[];
  materiality: MaterialityAssessment | null;
  options: DecisionOption[];
  recommendation: Localized;
  reason: Localized | null;
  confidence: Confidence;
  confidenceReason: Localized;
  missingEvidence: Localized[];
  wouldChange: Localized[];
  // "What Hiloomy doesn't know" — an explicit limit, shown when it matters.
  unknown: Localized | null;
  primaryAction: "review" | "see_evidence";
  // Ranking key — ₪ exposure when known, else 0.
  rank: number;
  createdAt: string;
  detectedAt: string;
  ledger: DecisionLedgerState;
  human: HumanDecision;
  judgment: Judgment | null;
  outcome: DecisionOutcome | null;
  entity: { type: string; id: string | null; label: string } | null;
}

export interface WatchItem {
  id: string;
  title: Localized;
  detail: Localized;
  source: EvidenceSource;
  since: string;
  // Link to a decision when the watch item IS a WATCH-status decision.
  decisionId: string | null;
}

export interface InboxStats {
  decisions: number;
  byStatus: Record<DecisionStatus, number>;
  watching: number;
  reviewed: number;
  suppressed: number;
  // 0–100, from setup health. null when the score could not be computed.
  confidencePct: number | null;
}

export interface DecisionInbox {
  decisions: Decision[];
  watchlist: WatchItem[];
  stats: InboxStats;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  kind: string;
  status: DecisionStatus;
  state: DecisionState;
  title: Localized;
  recommendation: Localized;
  createdAt: string;
  detectedAt: string;
  human: HumanDecision;
  judgment: Judgment | null;
  outcome: DecisionOutcome | null;
  crossDomain: boolean;
}

export const DECISION_STATUS_LABEL: Record<DecisionStatus, Localized> = {
  act: { he: "לפעול", en: "ACT" },
  watch: { he: "במעקב", en: "WATCH" },
  do_not_act: { he: "לא לפעול", en: "DO NOT ACT" },
  test: { he: "לבדוק", en: "TEST" },
  change_plan: { he: "לשנות תוכנית", en: "CHANGE PLAN" }
};

export const DECISION_STATE_LABEL: Record<DecisionState, Localized> = {
  open: { he: "פתוח", en: "Open" },
  watching: { he: "במעקב", en: "Watching" },
  escalated: { he: "הוסלם", en: "Escalated" },
  resolved: { he: "נסגר", en: "Resolved" }
};

export const CONFIDENCE_LABEL: Record<Confidence, Localized> = {
  high: { he: "גבוהה", en: "HIGH" },
  medium: { he: "בינונית", en: "MEDIUM" },
  low: { he: "נמוכה", en: "LOW" }
};

export const QUALITY_LABEL: Record<EvidenceQuality, Localized> = {
  known: { he: "ידוע", en: "Known" },
  calculated: { he: "מחושב", en: "Calculated" },
  estimated: { he: "מוערך", en: "Estimated" },
  unavailable: { he: "לא זמין", en: "Unavailable" }
};

export const SOURCE_LABEL: Record<EvidenceSource, Localized> = {
  shopify: { he: "Shopify", en: "Shopify" },
  inventory: { he: "מלאי", en: "Inventory" },
  profit: { he: "רווח", en: "Profit" },
  meta: { he: "Meta", en: "Meta" },
  affiliate: { he: "שותפים", en: "Affiliate" },
  market: { he: "שוק", en: "Market" },
  plan: { he: "תוכנית", en: "Plan" }
};

export const MATERIALITY_LABEL: Record<Materiality, Localized> = {
  evidence: { he: "ראיה בלבד", en: "Evidence only" },
  material: { he: "תורם מהותי", en: "Material contributor" },
  driver: { he: "מניע ההחלטה", en: "Decision driver" }
};

export const JUDGMENT_LABEL: Record<JudgmentTag, Localized> = {
  useful: { he: "שימושי", en: "Useful" },
  obvious: { he: "מובן מאליו", en: "Obvious" },
  wrong: { he: "שגוי", en: "Wrong" },
  missing_context: { he: "חסר הקשר", en: "Missing context" }
};

// Short, stable, human-readable receipt id derived from the ledger cuid.
export function displayDecisionId(id: string): string {
  return `D-${id.slice(-5).toUpperCase()}`;
}
