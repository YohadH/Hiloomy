// Decision Episode — the structured record one initiative decision leaves
// behind, so a brand's decision history can be learned from LATER:
//
//   commercial intent → reality snapshot → diagnosis → options → feasibility
//   → unknowns → recommended option → manager option → judgment → outcome
//
// Stored on the plan decision's payload (`episode`). The manager's choice,
// judgment and outcome already live on the same ledger row; the episode
// adds what was known, what was possible, and why one option was chosen.
// No learnings are generated from it yet — that needs measured outcomes.

import type { Localized } from "@/lib/domain/decision";
import type { BusinessDiagnosis } from "@/lib/domain/business-diagnosis";
import type { DecisionOption, Recommendation } from "@/lib/domain/decision-space";
import type { InitiativeRealitySummary } from "@/lib/domain/initiative-reality";

export interface DiagnosisSnapshot {
  demand: string;
  conversion: string;
  paid: string;
  creators: string;
  offline: string;
  inventory: string;
  replenishment: string;
  margin: string;
  offer: string;
  time: string;
  intent?: string;
  // Intent vs reality at decision time — so a later pass can ask "did the
  // offer sell as planned after the change?".
  fulfillment?: { orderShare: number | null; revenueShare: number | null; channel: string | null; audience: string | null; goalPace: string | null } | null;
  scope: BusinessDiagnosis["scope"];
  headline: Localized;
  constraint: { productId: string; title: string; role: "product" | "gift"; coverDays: number | null; daysRemaining: number } | null;
}

export interface OptionSnapshot {
  type: DecisionOption["type"];
  answer: DecisionOption["answer"];
  feasibility: DecisionOption["feasibility"];
  score: number;
  because: Array<{ delta: number; reason: Localized }>;
  condition: Localized | null;
}

export interface DecisionEpisode {
  version: "episode-v1";
  at: string;
  intent: { initiativeId: string; title: string; kind: string; start: string; end: string; offer: { discountPct: number | null; couponCode: string | null }; hookQuestion: Localized | null };
  reality: { status: InitiativeRealitySummary["status"]; evidenceBasis: InitiativeRealitySummary["evidenceBasis"]; metrics: Array<{ key: string; value: string | null; quality: string; basis: string | null }>; findings: string[]; freshness: InitiativeRealitySummary["freshness"] };
  diagnosis: DiagnosisSnapshot;
  options: OptionSnapshot[];
  unknowns: Localized[];
  questions: Recommendation["questions"];
  recommended: { type: DecisionOption["type"] | null; answer: Recommendation["answer"]; confidence: Recommendation["confidence"] };
}

export function buildEpisode(reality: InitiativeRealitySummary, diagnosis: BusinessDiagnosis, space: DecisionOption[], rec: Recommendation, intent: DecisionEpisode["intent"], at: Date): DecisionEpisode {
  return {
    version: "episode-v1",
    at: at.toISOString(),
    intent,
    reality: {
      status: reality.status,
      evidenceBasis: reality.evidenceBasis,
      metrics: reality.metrics.map((m) => ({ key: m.key, value: m.value, quality: m.quality, basis: m.basis })),
      findings: reality.findings.map((f) => f.kind),
      freshness: reality.freshness
    },
    diagnosis: {
      demand: diagnosis.demand.state,
      conversion: diagnosis.conversion.state,
      paid: diagnosis.paid.state,
      creators: diagnosis.creators.state,
      offline: diagnosis.offline.state,
      inventory: diagnosis.inventory.state,
      replenishment: diagnosis.replenishment.state,
      margin: diagnosis.margin.state,
      offer: diagnosis.offer.state,
      time: diagnosis.time.state,
      intent: diagnosis.intent?.state ?? "not_set",
      fulfillment: diagnosis.fulfillment?.defined
        ? { orderShare: diagnosis.fulfillment.purchase?.orderShare ?? null, revenueShare: diagnosis.fulfillment.purchase?.revenueShare ?? null, channel: diagnosis.fulfillment.channel?.state ?? null, audience: diagnosis.fulfillment.audience?.state ?? null, goalPace: diagnosis.fulfillment.goal?.pace ?? null }
        : null,
      scope: diagnosis.scope,
      headline: diagnosis.headline,
      constraint: diagnosis.constraint ? { productId: diagnosis.constraint.productId, title: diagnosis.constraint.title, role: diagnosis.constraint.role, coverDays: diagnosis.constraint.coverDays, daysRemaining: diagnosis.constraint.daysRemaining } : null
    },
    options: space.map((o) => ({ type: o.type, answer: o.answer, feasibility: o.feasibility, score: o.score, because: o.because, condition: o.condition })),
    unknowns: diagnosis.unknowns,
    questions: rec.questions,
    recommended: { type: rec.primary?.type ?? null, answer: rec.answer, confidence: rec.confidence }
  };
}

// The campaign block of the receipt: the confirmed campaign, or the
// resolver's likely pick with its confidence and alternatives.
export interface BriefCampaign {
  confirmed: Array<{ id: string; name: string }>;
  likely: { id: string; name: string; score: number; reasons: Localized[] } | null;
  alternatives: Array<{ id: string; name: string; score: number; reasons: Localized[] }>;
  considered: number;
  total: number;
}

// The compact brief a decision carries for the receipt and the card.
export interface DecisionBrief {
  diagnosis: BusinessDiagnosis;
  space: DecisionOption[];
  recommendation: Recommendation;
  episode: DecisionEpisode;
  campaign?: BriefCampaign | null;
}
