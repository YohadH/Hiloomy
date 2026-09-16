// Entity Resolution — the vocabulary and the policies for connecting business
// entities BEFORE asking the manager anything (owner, 16 Sep 2026).
//
//   OLD: missing mapping → ask the manager
//   NEW: missing mapping → search connected evidence → score candidates →
//        use high-confidence candidates provisionally → keep reasoning →
//        ask only when ambiguity materially blocks the decision
//
// Everything inferred is a Relationship with a status, a confidence, the
// evidence it rests on and a reason in words. Confidence is numeric inside;
// the customer UI shows a band (high / medium / low). Absence is
// information too: "not detected" and "not yet live" are states, distinct
// from "unknown" (no data source), and a rejected candidate carries the
// reason it was rejected ("its name indicates Rosh Hashanah").
//
// Pure; tested in tests/unit/entity-resolution.test.ts.

import type { Localized } from "@/lib/domain/decision";

const L = (he: string, en: string): Localized => ({ he, en });

export type EntityType = "initiative" | "meta_campaign" | "meta_adset" | "meta_ad" | "landing_page" | "utm" | "product" | "variant" | "collection" | "coupon" | "order" | "customer" | "creator" | "inventory_location" | "calendar_event";

export interface EntityRef {
  type: EntityType;
  id: string;
  label: string;
}

export type RelationshipStatus = "CONFIRMED" | "PROVISIONAL" | "SUGGESTED" | "REJECTED";

export type EvidenceKind =
  | "NAME_MATCH"
  | "EVENT_MATCH" // the campaign names the initiative's own calendar event
  | "EVENT_CONFLICT" // the campaign names a DIFFERENT calendar event → rejection
  | "DATE_OVERLAP"
  | "LANDING_MATCH"
  | "UTM_MATCH"
  | "PRODUCT_MATCH"
  | "ORDER_MATCH"
  | "COUPON_MATCH"
  | "CREATIVE_MATCH"
  | "SPEND_SHARE"
  | "TRAFFIC_SPIKE"
  | "HISTORICAL_MATCH"
  | "MANAGER"
  | "NO_ACTIVITY";

export interface RelationshipEvidence {
  kind: EvidenceKind;
  weight: number; // signed contribution to the score
  detail: Localized;
}

export interface Relationship {
  source: EntityRef;
  target: EntityRef;
  confidence: number; // 0..1
  status: RelationshipStatus;
  evidence: RelationshipEvidence[];
  reason: Localized;
  createdAt: string;
  lastValidatedAt: string;
}

// ── Confidence bands and the policies ─────────────────────────────────
export type ConfidenceBand = "high" | "medium" | "low";
export const HIGH_CONFIDENCE = 0.7; // usable automatically (provisional)
export const MEDIUM_CONFIDENCE = 0.45; // plausible — a question if another is close
export const ASK_MARGIN = 0.1; // two plausible candidates closer than this → ask
// A medium candidate that stands alone (no rival ≥ MEDIUM) is unambiguous —
// several independent signals agree and nothing competes. Usable
// provisionally; the manager can still correct it.
export const CLEAR_MEDIUM = 0.6;

export const bandOf = (score: number): ConfidenceBand => (score >= HIGH_CONFIDENCE ? "high" : score >= MEDIUM_CONFIDENCE ? "medium" : "low");

export const BAND_LABEL: Record<ConfidenceBand, Localized> = {
  high: L("ביטחון גבוה", "high confidence"),
  medium: L("ביטחון בינוני", "medium confidence"),
  low: L("ביטחון נמוך", "low confidence")
};

export const STATUS_LABEL: Record<RelationshipStatus, Localized> = {
  CONFIRMED: L("מאושר", "confirmed"),
  PROVISIONAL: L("בשימוש אוטומטי · ניתן לתקן", "used automatically · can be corrected"),
  SUGGESTED: L("הצעה", "suggested"),
  REJECTED: L("נדחה", "rejected")
};

// The question policy. Manager questions are expensive: ask ONLY when two
// plausible candidates remain close enough that picking the wrong one would
// change the decision. 0.94 vs 0.31 → use the first. 0.83 vs 0.79 → ask.
export type Verdict<T> = { kind: "accept"; pick: T; runnerUp: T | null } | { kind: "ask"; between: T[] } | { kind: "none"; best: T | null };

export function decide<T extends { score: number }>(ranked: T[]): Verdict<T> {
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  const top = sorted[0] ?? null;
  const second = sorted[1] ?? null;
  if (!top || top.score < MEDIUM_CONFIDENCE) return { kind: "none", best: top };
  const close = !!second && second.score >= MEDIUM_CONFIDENCE && top.score - second.score < ASK_MARGIN;
  if (close) return { kind: "ask", between: sorted.filter((c) => c.score >= MEDIUM_CONFIDENCE).slice(0, 3) };
  if (top.score >= HIGH_CONFIDENCE) return { kind: "accept", pick: top, runnerUp: second };
  if (top.score >= CLEAR_MEDIUM && (!second || second.score < MEDIUM_CONFIDENCE)) return { kind: "accept", pick: top, runnerUp: second };
  // Plausible but not high and nothing close: use it as a suggestion; no question.
  return { kind: "none", best: top };
}

// ── Launch detection: unknown ≠ not detected ≠ not yet live ───────────
export type ActivityState = "detected" | "not_detected" | "not_yet_live" | "unknown";

export interface ActivityCheck {
  kind: "campaign" | "coupon" | "landing" | "products";
  state: ActivityState;
  // Execution signals (campaign, coupon, landing) make up "launch activity";
  // products are what the initiative SELLS — not detected there is a mapping
  // gap, never "the launch has not happened".
  execution?: boolean;
  line: Localized; // what Hiloomy checked and found
  count?: number; // candidates considered
  rejected?: number; // candidates excluded with a reason
}

export interface LaunchAssessment {
  daysToStart: number; // negative once live
  phase: "far" | "approaching" | "imminent" | "live" | "ended";
  checks: ActivityCheck[];
  // One sentence for the manager, e.g. "No Sukkot campaign detected yet.
  // Expected — the initiative starts in 6 days — but the window is approaching."
  insight: Localized | null;
  severity: "info" | "attention" | "risk";
}

// Lead times a launch normally shows activity by (V0, named): a campaign is
// usually set up a few days before; a coupon exists before the first day.
export const CAMPAIGN_LEAD_DAYS = 3;
export const APPROACHING_DAYS = 10;

export function assessLaunch(input: {
  start: string;
  end: string;
  today: string;
  eventName: Localized | null; // the initiative's calendar event, if any
  title: string;
  checks: ActivityCheck[];
}): LaunchAssessment {
  const DAY = 86_400_000;
  const days = Math.round((Date.parse(`${input.start}T00:00:00Z`) - Date.parse(`${input.today}T00:00:00Z`)) / DAY);
  const ended = input.end < input.today;
  const phase: LaunchAssessment["phase"] = ended ? "ended" : days <= 0 ? "live" : days <= CAMPAIGN_LEAD_DAYS ? "imminent" : days <= APPROACHING_DAYS ? "approaching" : "far";
  const name = input.eventName ?? L(input.title, input.title);
  const checks = input.checks.map((c) => {
    // Before the launch, "not detected" is reclassified by timing: far out it
    // is expected; close in it is worth attention; live it is a finding.
    if (c.state !== "not_detected") return c;
    if (phase === "far" || phase === "approaching") return { ...c, state: "not_yet_live" as ActivityState };
    return c;
  });
  const exec = checks.filter((c) => c.execution !== false && c.kind !== "products");
  const notDetected = exec.filter((c) => c.state === "not_detected");
  const notYet = exec.filter((c) => c.state === "not_yet_live");
  const unknown = exec.filter((c) => c.state === "unknown");
  let insight: Localized | null = null;
  let severity: LaunchAssessment["severity"] = "info";
  const kinds = (cs: ActivityCheck[], loc: "he" | "en") => cs.map((c) => ({ campaign: L("קמפיין", "campaign"), coupon: L("קופון", "coupon"), landing: L("פעילות בדף הנחיתה", "landing-page activity"), products: L("מוצרים", "products") })[c.kind][loc]).join(", ");
  const detected = exec.filter((c) => c.state === "detected");
  if (detected.length && notDetected.length && (phase === "live" || phase === "imminent")) {
    // Part of the execution exists: the launch is happening; name what is
    // still missing without calling it "no launch activity".
    severity = "info";
    insight = L(`פעילות השקה זוהתה (${kinds(detected, "he")}); עדיין לא זוהה: ${kinds(notDetected, "he")}.`, `Launch activity detected (${kinds(detected, "en")}); not detected yet: ${kinds(notDetected, "en")}.`);
  } else if (phase === "live" && notDetected.length) {
    severity = "risk";
    insight = L(`היוזמה באוויר כבר ${-days + 1} ימים ולא זוהתה פעילות תפעולית של השקה (${kinds(notDetected, "he")}).`, `The initiative has been live for ${-days + 1} day${-days + 1 === 1 ? "" : "s"} and no operational launch activity has been detected (${kinds(notDetected, "en")}).`);
  } else if (phase === "imminent" && notDetected.length) {
    severity = "attention";
    insight = L(`${name.he} מתחיל בעוד ${days} ימים ועדיין לא זוהתה פעילות השקה (${kinds(notDetected, "he")}) — חלון ההשקה כאן.`, `${name.en} starts in ${days} day${days === 1 ? "" : "s"} and no launch activity has been detected yet (${kinds(notDetected, "en")}) — the launch window is here.`);
  } else if ((phase === "approaching" || phase === "far") && notYet.length) {
    severity = phase === "approaching" ? "attention" : "info";
    insight = L(
      `עדיין לא זוהתה פעילות ${name.he} (${kinds(notYet, "he")}). זה צפוי — היוזמה מתחילה בעוד ${days} ימים${phase === "approaching" ? " — אבל חלון ההשקה מתקרב" : ""}.`,
      `No ${name.en} activity detected yet (${kinds(notYet, "en")}). Expected — the initiative starts in ${days} days${phase === "approaching" ? " — but the launch window is approaching" : ""}.`
    );
  } else if (unknown.length && !exec.some((c) => c.state === "detected")) {
    insight = L(`אין מקור נתונים מחובר לבדיקת ${kinds(unknown, "he")} — לא ידוע, לא "לא נמצא".`, `No connected data source to check ${kinds(unknown, "en")} — unknown, not "not found".`);
  }
  return { daysToStart: days, phase, checks, insight, severity };
}

// ── Relationship builder ───────────────────────────────────────────────
export function relationship(source: EntityRef, target: EntityRef, evidence: RelationshipEvidence[], status: RelationshipStatus, reason: Localized, at: string, createdAt?: string): Relationship {
  const raw = evidence.reduce((n, e) => n + e.weight, 0);
  return { source, target, confidence: Math.max(0, Math.min(1, raw)), status, evidence, reason, createdAt: createdAt ?? at, lastValidatedAt: at };
}
