// Commercial Time Context — the windows a business decides inside of
// (a holiday, a launch, a promotion, a campaign deadline).
//
// Rule: an event can raise urgency or change how a situation is read; it
// can never justify a recommendation on its own. "Rosh Hashanah is coming →
// run a promotion" is not a Hiloomy sentence. "Rosh Hashanah is coming, the
// plan starts a 20% promotion tomorrow, sales are already above plan and
// stock is short → this needs a decision now" is.
//
// SOURCE OF TRUTH TODAY: the brand's own marketing plan. Only initiatives
// whose anchor is a named event or a launch become windows. There is NO
// general holiday calendar in Hiloomy and none is fabricated here; a future
// source (a curated Israeli retail calendar, Shopify events, a manual list)
// plugs in as another CommercialCalendarSource and must be auditable.

import type { Localized } from "@/lib/domain/decision";
import type { Initiative, PlanView } from "@/lib/domain/plan";

export interface CommercialWindow {
  id: string;
  title: string;
  kind: "event" | "launch";
  start: string; // YYYY-MM-DD
  end: string;
  source: "plan"; // the only source that exists today
  // Initiatives in the plan that belong to this window.
  initiativeIds: string[];
  initiativeCount: number;
  startingToday: number;
  // Open decisions on Today that came from these initiatives.
  openDecisionIds: string[];
}

export interface CommercialCalendarSource {
  name: string;
  windows(now: Date): CommercialWindow[];
}

const DAY_MS = 86_400_000;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const daysBetween = (fromIso: string, toIso: string) => Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / DAY_MS);

// Windows from the plan: named events and launches, active now or starting
// within `horizonDays`, grouped by the anchor label so five channels of one
// holiday are one window.
export function planCalendarSource(plan: PlanView | null, horizonDays = 14): CommercialCalendarSource {
  return {
    name: "plan",
    windows(now: Date): CommercialWindow[] {
      if (!plan) return [];
      const today = dayOf(now);
      const horizon = dayOf(new Date(now.getTime() + horizonDays * DAY_MS));
      const groups = new Map<string, Initiative[]>();
      for (const i of plan.initiatives) {
        if (i.kind !== "move") continue;
        if (i.anchor.kind !== "event" && i.anchor.kind !== "launch") continue;
        if (i.end < today || i.start > horizon) continue;
        groups.set(i.anchor.label, [...(groups.get(i.anchor.label) ?? []), i]);
      }
      return [...groups.entries()]
        .map(([label, items]) => {
          const start = items.map((i) => i.start).sort()[0];
          const end = items.map((i) => i.end).sort().slice(-1)[0];
          return {
            id: `plan:${label}:${start}`,
            title: label,
            kind: items[0].anchor.kind as "event" | "launch",
            start,
            end,
            source: "plan" as const,
            initiativeIds: items.map((i) => i.id),
            initiativeCount: items.length,
            startingToday: items.filter((i) => i.start === today).length,
            openDecisionIds: items.flatMap((i) => i.relatedDecisions.filter((r) => r.state === "open").map((r) => r.id))
          };
        })
        .sort((a, b) => a.start.localeCompare(b.start));
    }
  };
}

export type WindowState = "active" | "starts_today" | "starts_soon" | "upcoming";

export function windowState(w: CommercialWindow, now: Date): { state: WindowState; daysUntil: number; daysLeft: number } {
  const today = dayOf(now);
  const daysUntil = daysBetween(today, w.start);
  const daysLeft = daysBetween(today, w.end);
  if (daysUntil <= 0 && daysLeft >= 0) return { state: daysUntil === 0 ? "starts_today" : "active", daysUntil, daysLeft };
  if (daysUntil <= 3) return { state: "starts_soon", daysUntil, daysLeft };
  return { state: "upcoming", daysUntil, daysLeft };
}

// Contextual urgency label for the Impact page ONLY — the decision engine's
// own status is not changed by this (documented gap: no engine integration).
export function windowUrgencyLabel(state: WindowState, daysUntil: number): Localized {
  switch (state) {
    case "active":
      return { he: "חלון מסחרי פעיל", en: "Commercial window active" };
    case "starts_today":
      return { he: "מתחיל היום — לפעול עכשיו", en: "Starts today — act now" };
    case "starts_soon":
      return { he: `מתחיל בעוד ${daysUntil} ימים — חלון ההחלטה נסגר`, en: `Starts in ${daysUntil} days — decision window closing` };
    default:
      return { he: `בעוד ${daysUntil} ימים — לבדיקה`, en: `In ${daysUntil} days — review` };
  }
}
