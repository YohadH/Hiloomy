// The Plan domain — the business-intent layer (docs/DECISION-INBOX-PLAN.md §0b).
//
//   Plan = intent · Live data = reality · Today = decisions.
//
// A spreadsheet cell is an EXECUTION ACTION (a channel doing its part). A
// COMMERCIAL INITIATIVE is one business move — "Rosh Hashana promotion" —
// that several cells execute. Rows are grouped into initiatives by shared
// anchors (event/holiday name, launch name, coupon code, named products)
// over overlapping dates; the original rows and their text are kept.
//
// DECISION HOOKS are sentences in the plan that already say "management
// decides here" ("optional depending on sales pace", "review status and
// decide whether to continue"). Each hook has a window; when it arrives, the
// plan engine creates a Decision in the ledger and Today shows it. Plan only
// links to it — a decision lives in exactly one place.
//
// Nothing here is invented: intent, revenue targets, creative readiness and
// approvals do not exist in the sheet and are not represented.

import type { Localized } from "@/lib/domain/decision";

export type InitiativeStatus = "planned" | "ready" | "watch" | "needs_decision" | "blocked" | "live" | "review" | "completed";

// Attention first: what needs judgment, what cannot run, what runs, then the rest.
export const INITIATIVE_STATUS_ORDER: InitiativeStatus[] = ["needs_decision", "blocked", "review", "live", "ready", "watch", "planned", "completed"];

export const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, Localized> = {
  planned: { he: "מתוכנן", en: "Planned" },
  ready: { he: "מוכן", en: "Ready" },
  watch: { he: "במעקב", en: "Watch" },
  needs_decision: { he: "דורש החלטה", en: "Needs decision" },
  blocked: { he: "חסום", en: "Blocked" },
  live: { he: "באוויר", en: "Live" },
  review: { he: "לבדיקה", en: "Review" },
  completed: { he: "הסתיים", en: "Completed" }
};

export type DependencyState = "ok" | "missing" | "unverified";

export interface DependencyCheck {
  kind: "coupon" | "inventory" | "campaign" | "cost";
  label: Localized;
  state: DependencyState;
  detail: Localized;
}

export interface InitiativeProduct {
  productId: string;
  title: string;
  inventory: number | null;
  units14d: number;
  unitsPrior14d: number;
  coverDays: number | null;
  hasRealCost: boolean;
  liveCampaigns: number;
}

// One spreadsheet cell: a channel executing its part of the initiative.
export interface ExecutionAction {
  rowId: string;
  text: string; // first line(s), trimmed
  channel: string | null; // the sheet's category (paid, website, CRM…)
  role: string | null;
  actionType: string | null;
  start: string;
  end: string;
  // done = observable (operator clicked the action, coupon exists);
  // open = planned and not observable. Never "done" by assumption.
  state: "done" | "open";
  executedAt: string | null;
}

export type DecisionHookKind = "conditional" | "review";

export interface DecisionHook {
  id: string; // stable: hash(rowId + kind)
  rowId: string;
  kind: DecisionHookKind;
  // The sentence in the plan that implies the decision, verbatim.
  sourceText: string;
  question: Localized;
  // When the decision should be on Today: YYYY-MM-DD, inclusive.
  windowStart: string;
  windowEnd: string;
  requiredEvidence: string[];
}

export interface RelatedDecision {
  id: string; // Alert id (ledger)
  hookId: string;
  state: "open" | "resolved";
  choice: "pending" | "approved" | "alternative" | "ignored" | "auto_closed";
  optionKey: string | null;
  decidedAt: string | null;
  question: Localized;
}

export interface Initiative {
  id: string; // stable within a sheet: hash(anchor + start)
  sheetId: string;
  title: string;
  // Why rows were grouped: the shared anchor, and how sure we are.
  anchor: { kind: "event" | "launch" | "coupon" | "product" | "text"; label: string };
  groupingConfidence: "high" | "medium" | "low";
  category: string | null; // the main-story / first row's category
  start: string;
  end: string;
  days: number;
  offer: { discountPct: number | null; couponCode: string | null };
  products: InitiativeProduct[];
  channels: string[];
  executions: ExecutionAction[];
  dependencies: DependencyCheck[];
  checked: string[];
  status: InitiativeStatus;
  statusReason: Localized | null;
  profitConfidence: number | null;
  decisionHooks: DecisionHook[];
  relatedDecisions: RelatedDecision[];
  rowIds: string[];
}

export interface PlanDay {
  date: string;
  initiativeIds: string[];
  executionCount: number;
  byStatus: Record<InitiativeStatus, number>;
}

export interface PlanView {
  sheetId: string;
  title: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  today: string;
  initiatives: Initiative[];
  executionsTotal: number;
  days: PlanDay[];
  counts: Record<InitiativeStatus, number> & { total: number };
  upcoming: Initiative[];
  // Open decisions on Today that came from this plan, with their due date.
  decisionsPending: Array<{ initiativeId: string; initiativeTitle: string; decisionId: string; question: Localized; due: string }>;
  health: { tone: "good" | "attention" | "quiet"; line: Localized };
  generatedAt: string;
}

export function emptyStatusCounts(): Record<InitiativeStatus, number> {
  return { planned: 0, ready: 0, watch: 0, needs_decision: 0, blocked: 0, live: 0, review: 0, completed: 0 };
}
