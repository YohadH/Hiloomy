// Retail-calendar source for CalendarEvents — the shopping moments whose
// dates are ARITHMETIC (no announcement needed), so the decision layer can
// see them months ahead (owner, 16 Sep 2026: "we have Black Friday coming
// and the system needs to know").
//
//   Black Friday    — the day after the fourth Thursday of November
//   Cyber Monday    — Black Friday + 3
//   Singles Day     — 11 November
//   Christmas       — 25 December (Israel: a gifting and export moment)
//   Valentine's Day — 14 February
//
// Deliberately NOT here: Shopping IL and any other date a body announces
// each year. Those are not computable; they must come from a brand-confirmed
// source (a custom calendar), never from a guess or from a plan label.
//
// `startDate` is the day the moment begins for trading purposes (the
// event day itself; there is no eve), `firstDay` = `endDate` = that day,
// except Black Friday which we treat as a single day too — the campaign
// window around it is the BRAND's intent, expressed in the plan.

import { CALENDAR_SOURCE_LABEL, HOLIDAY_NAME, addDays, type CalendarEvent, type CalendarEventSource, type RetailEventKey } from "@/lib/domain/calendar-events";

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
// 0 = Sunday … 4 = Thursday, computed on a UTC calendar day.
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

// The Nth given weekday of a month (1-based), as an ISO date.
export function nthWeekdayOfMonth(year: number, month: number, weekdayIndex: number, n: number): string {
  const first = weekday(year, month, 1);
  const offset = (weekdayIndex - first + 7) % 7;
  return iso(year, month, 1 + offset + (n - 1) * 7);
}

export function blackFriday(year: number): string {
  return addDays(nthWeekdayOfMonth(year, 11, 4, 4), 1); // 4th Thursday + 1
}

const DEFINITIONS: Array<{ key: RetailEventKey; date: (year: number) => string; days: number; rule: string }> = [
  { key: "black_friday", date: blackFriday, days: 1, rule: "day after the 4th Thursday of November" },
  { key: "cyber_monday", date: (y) => addDays(blackFriday(y), 3), days: 1, rule: "Black Friday + 3 days (Monday)" },
  { key: "singles_day", date: (y) => iso(y, 11, 11), days: 1, rule: "11 November" },
  { key: "christmas", date: (y) => iso(y, 12, 25), days: 1, rule: "25 December" },
  { key: "valentines_day", date: (y) => iso(y, 2, 14), days: 1, rule: "14 February" }
];

export const SUPPORTED_RETAIL_EVENTS: readonly RetailEventKey[] = DEFINITIONS.map((d) => d.key);

export function retailEvent(key: RetailEventKey, year: number): CalendarEvent {
  const def = DEFINITIONS.find((d) => d.key === key)!;
  const firstDay = def.date(year);
  return {
    id: `${key}_${year}`,
    key,
    name: HOLIDAY_NAME[key],
    category: "retail",
    startDate: firstDay,
    firstDay,
    endDate: addDays(firstDay, def.days - 1),
    source: "retail_calendar",
    sourceLabel: CALENDAR_SOURCE_LABEL.retail_calendar,
    hebrewDate: `${def.rule} (${year})`,
    precision: "date"
  };
}

export const retailCalendarSource: CalendarEventSource = {
  id: "retail_calendar",
  label: CALENDAR_SOURCE_LABEL.retail_calendar,
  eventsBetween(from, to) {
    const fromY = Number(from.slice(0, 4));
    const toY = Number(to.slice(0, 4));
    const out: CalendarEvent[] = [];
    for (let y = fromY; y <= toY; y++) {
      for (const def of DEFINITIONS) {
        const e = retailEvent(def.key, y);
        if (e.endDate >= from && e.startDate <= to) out.push(e);
      }
    }
    return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
};
