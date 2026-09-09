// The Plan domain (docs/DECISION-INBOX-PLAN.md §0, 9 Sep 2026):
//
//   Plan = intent · Data = reality · Today = decisions.
//
// A Gantt row is a task; a group of rows with the same text/role/category
// over a contiguous date range is one Commercial Initiative. Phase 1 (this
// file) evaluates initiatives with what is OBSERVABLE from synced data only:
// dates, a coupon code mentioned in the text, products named in the text
// (inventory, recent sales, live campaigns, cost on file). Nothing is
// inferred and nothing is invented: intent, revenue targets, creative
// readiness or approvals do not exist in the sheet and are not shown.
//
// NEEDS DECISION and REVIEW verdicts belong to the Plan × data engine
// (phase 2). They must arrive as Decisions in the ledger and be shown here
// as "decision pending in Today" — never as a second decision workflow.

import type { Localized } from "@/lib/domain/decision";

export type InitiativeStatus = "planned" | "ready" | "blocked" | "live" | "completed";

export const INITIATIVE_STATUS_ORDER: InitiativeStatus[] = ["blocked", "live", "ready", "planned", "completed"];

export const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, Localized> = {
  planned: { he: "מתוכנן", en: "Planned" },
  ready: { he: "מוכן", en: "Ready" },
  blocked: { he: "חסום", en: "Blocked" },
  live: { he: "באוויר", en: "Live" },
  completed: { he: "הסתיים", en: "Completed" }
};

export type DependencyState = "ok" | "missing" | "unverified";

export interface DependencyCheck {
  kind: "coupon" | "inventory" | "products" | "campaign" | "cost";
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

export interface Initiative {
  id: string; // stable within a sheet: hash of key + start
  sheetId: string;
  title: string;
  category: string | null;
  role: string | null;
  actionType: string | null;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  days: number;
  rowIds: string[];
  // Observable "planned move" facts pulled from the text.
  discountPct: number | null;
  couponCode: string | null;
  products: InitiativeProduct[];
  dependencies: DependencyCheck[];
  // Which systems were consulted for this initiative.
  checked: string[];
  status: InitiativeStatus;
  statusReason: Localized | null;
  // Fraction of named products with a real cost on file; null when no product matched.
  profitConfidence: number | null;
  // Any executed row (the operator clicked an action).
  executedAt: string | null;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  initiativeIds: string[];
  byStatus: Record<InitiativeStatus, number>;
}

export interface PlanView {
  sheetId: string;
  title: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  today: string;
  initiatives: Initiative[];
  days: PlanDay[];
  counts: Record<InitiativeStatus, number> & { total: number };
  upcoming: Initiative[]; // next 14 days, most relevant first
  health: { tone: "good" | "attention" | "quiet"; line: Localized };
  generatedAt: string;
}
