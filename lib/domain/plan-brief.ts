// Plan briefs — the two exports of the Plan (docs/DECISION-INBOX-PLAN.md §0b).
//
//   Monthly Commercial Brief  → management: every commercial initiative once,
//                                with offer, period, channels, owners, status,
//                                decision dependency, blockers, plan changes.
//   Role Action Brief         → one team: the initiatives that touch it, what
//                                the team owns in each, when, dependencies,
//                                links. Nothing that is not the team's.
//
// Both are generated from Commercial Initiatives (lib/domain/plan.ts), never
// from raw Gantt cells, so the PDF, the Plan page and Today say the same
// thing. Deterministic — no model call, nothing invented: audience, budgets
// and approvals do not exist in the sheet and are not printed.

import type { Localized } from "@/lib/domain/decision";
import type { DependencyCheck, InitiativeStatus } from "@/lib/domain/plan";

export type PlanBriefKind = "commercial" | "role";

// Roles the parser assigns to rows, plus the customer-service view (every
// offer and launch a customer may ask about — it owns no execution).
export type BriefRole = "marketing" | "web" | "email" | "affiliates" | "graphic" | "social" | "customer_service";

export const BRIEF_ROLE_ORDER: BriefRole[] = ["marketing", "web", "email", "affiliates", "graphic", "social", "customer_service"];

export const BRIEF_ROLE_LABEL: Record<BriefRole, Localized> = {
  marketing: { he: "שיווק / מבצעים", en: "Marketing" },
  web: { he: "צוות אתר", en: "Web team" },
  email: { he: "אימייל / SMS", en: "Email / SMS" },
  affiliates: { he: "אפיליאייטים / משפיעניות", en: "Affiliates" },
  graphic: { he: "גרפיקה / קריאייטיב", en: "Creative" },
  social: { he: "סושיאל", en: "Social" },
  customer_service: { he: "שירות לקוחות", en: "Customer service" }
};

export function parseBriefRole(value: string | null | undefined): BriefRole | null {
  const v = (value ?? "").trim().toLowerCase();
  return (BRIEF_ROLE_ORDER as string[]).includes(v) ? (v as BriefRole) : null;
}

export interface BriefAction {
  rowId: string;
  // The cell's full text (the copy, the time, the code) — trimmed, not cut.
  text: string;
  channel: string | null;
  role: BriefRole | null;
  actionType: string | null;
  actionLabel: Localized | null;
  start: string;
  end: string;
  state: "done" | "open";
  // Absolute link into Hiloomy (creative studio, coupon tool…) when one exists.
  href: string | null;
}

export type BriefDecisionState = "none" | "upcoming" | "pending" | "resolved" | "expired";

export interface BriefDecision {
  state: BriefDecisionState;
  // Ledger id + display id (D-xxxxx) when a decision exists.
  id: string | null;
  displayId: string | null;
  question: Localized;
  // The sentence in the plan that created the dependency, verbatim.
  sourceText: string;
  // YYYY-MM-DD the decision is (or was) due on Today.
  due: string;
  todayUrl: string | null;
}

export interface BriefInitiative {
  id: string;
  kind: "move" | "unattached";
  title: string;
  start: string;
  end: string;
  status: InitiativeStatus;
  offer: { discountPct: number | null; couponCode: string | null };
  channels: string[];
  owners: BriefRole[];
  products: string[];
  dependencies: DependencyCheck[];
  decision: BriefDecision | null;
  // One consolidated list per initiative (a duplicated coupon code is ONE
  // note here, not a warning on every cell that mentions it).
  notes: Localized[];
  // Commercial brief: every team's actions, grouped. Role brief: only the
  // requested team's group.
  actionsByRole: Array<{ role: BriefRole | null; actions: BriefAction[] }>;
  // Role brief: the first date the team's open work is due.
  firstDue: string | null;
}

export interface PlanChange {
  syncedAt: string;
  added: number;
  removed: number;
  changed: number;
  lines: string[];
}

export interface PlanBrief {
  kind: PlanBriefKind;
  role: BriefRole | null;
  sheetId: string;
  sheetTitle: string;
  brandName: string;
  month: string; // YYYY-MM
  header: {
    initiatives: number;
    actions: number;
    blocked: number;
    decisionsPending: number;
    live: number;
    ready: number;
  };
  initiatives: BriefInitiative[];
  // Single channel actions with no move (role brief: this team's; commercial
  // brief: all of them, listed compactly at the end).
  standalone: BriefAction[];
  changes: PlanChange[];
  generatedAt: string;
}
