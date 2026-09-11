// Commercial calendar — composes the three layers for a store:
//   calendar events (system fact) ← linked initiatives (brand intent, from
//   the plan) ← open decisions (what must be decided).
// Sources are registered here so another calendar (retail days, national
// holidays, custom company events) can be added without touching the page.
// Confirmed links live in the plan overrides (`calendarLinks`), keyed by
// initiative id, exactly like the other operator corrections.

import { buildCommercialContext, isoDay, addDays, type CalendarEvent, type CalendarEventSource, type CommercialContextEvent } from "@/lib/domain/calendar-events";
import { hebrewCalendarSource } from "@/lib/domain/hebrew-calendar-source";
import type { PlanView } from "@/lib/domain/plan";
import { readPlanOverrides } from "@/lib/services/plan-service";

export const CALENDAR_SOURCES: readonly CalendarEventSource[] = [hebrewCalendarSource];

// How far ahead the context looks for calendar events. Campaigns run up to
// a holiday for weeks, so the event is shown before the plan's 14-day
// initiative horizon.
export const EVENT_HORIZON_DAYS = 30;
// Longest supported event is 9 days incl. the eve (Hanukkah); look back far
// enough to keep an active event on the page.
const LOOKBACK_DAYS = 10;

export function calendarEventsAround(now: Date, sources: readonly CalendarEventSource[] = CALENDAR_SOURCES): CalendarEvent[] {
  const today = isoDay(now);
  return sources.flatMap((s) => s.eventsBetween(addDays(today, -LOOKBACK_DAYS), addDays(today, EVENT_HORIZON_DAYS))).filter((e) => e.endDate >= today);
}

export interface CommercialCalendarContext {
  sources: Array<{ id: string; label: { he: string; en: string } }>;
  events: CommercialContextEvent[];
  linkedInitiativeIds: Set<string>;
}

// Pure: plan + confirmed links + clock → context. Unit-tested.
export function composeCommercialContext(plan: PlanView | null, confirmedLinks: ReadonlyMap<string, string>, now: Date, sources: readonly CalendarEventSource[] = CALENDAR_SOURCES): CommercialCalendarContext {
  const events = calendarEventsAround(now, sources);
  const built = buildCommercialContext(plan?.initiatives ?? [], events, confirmedLinks, now);
  return { sources: sources.map((s) => ({ id: s.id, label: s.label })), ...built };
}

export async function loadConfirmedLinks(sheetId: string): Promise<Map<string, string>> {
  const o = await readPlanOverrides(sheetId);
  return new Map(o.calendarLinks.map((l) => [l.initiativeId, l.eventId] as const));
}
