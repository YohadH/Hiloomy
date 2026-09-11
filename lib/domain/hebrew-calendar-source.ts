// Hebrew-calendar source for CalendarEvents — deterministic, auditable,
// no LLM, no per-year strings. Dates come from the fixed Hebrew-calendar
// arithmetic in `lib/domain/hebrew-calendar.ts` (Reingold–Dershowitz),
// converting fixed Hebrew dates (e.g. 1 Tishrei) to Gregorian days. The
// unit tests cross-check the arithmetic against Node's ICU Hebrew calendar
// and against Hebcal's published dates. (`@hebcal/core`, already used by
// the marketing planner, is ESM-only and cannot load in the CommonJS unit
// test runner on Node 20 — so the calendar is computed here instead.)
//
// Israel observance: one-day Shavuot, seven-day Passover, Shemini Atzeret
// and Simchat Torah on the same day. Precision is date-level; `startDate`
// is the eve because the holiday begins at sunset on that date. Sunset and
// location are not modelled (future enhancement).

import { HEBREW_MONTH, gregorianFromHebrew, hebrewFromRd, hebrewMonthName, isHebrewLeapYear, rdFromHebrew } from "@/lib/domain/hebrew-calendar";
import { CALENDAR_SOURCE_LABEL, HOLIDAY_NAME, addDays, type CalendarEvent, type CalendarEventSource, type HolidayKey } from "@/lib/domain/calendar-events";

// Fixed Hebrew dates. Purim falls in Adar II in a leap year.
const DEFINITIONS: Array<{ key: HolidayKey; month: (hebrewYear: number) => number; day: number; days: number }> = [
  { key: "rosh_hashanah", month: () => HEBREW_MONTH.TISHREI, day: 1, days: 2 },
  { key: "yom_kippur", month: () => HEBREW_MONTH.TISHREI, day: 10, days: 1 },
  { key: "sukkot", month: () => HEBREW_MONTH.TISHREI, day: 15, days: 7 },
  { key: "shemini_atzeret", month: () => HEBREW_MONTH.TISHREI, day: 22, days: 1 },
  { key: "hanukkah", month: () => HEBREW_MONTH.KISLEV, day: 25, days: 8 },
  { key: "purim", month: (y) => (isHebrewLeapYear(y) ? HEBREW_MONTH.ADAR_II : HEBREW_MONTH.ADAR_I), day: 14, days: 1 },
  { key: "passover", month: () => HEBREW_MONTH.NISAN, day: 15, days: 7 },
  { key: "shavuot", month: () => HEBREW_MONTH.SIVAN, day: 6, days: 1 }
];

export const SUPPORTED_HOLIDAYS: readonly HolidayKey[] = DEFINITIONS.map((d) => d.key);

export function holidayEvent(key: HolidayKey, hebrewYear: number): CalendarEvent {
  const def = DEFINITIONS.find((d) => d.key === key)!;
  const month = def.month(hebrewYear);
  const firstDay = gregorianFromHebrew(hebrewYear, month, def.day);
  const lastRd = rdFromHebrew(hebrewYear, month, def.day) + def.days - 1;
  const last = hebrewFromRd(lastRd);
  const endDate = addDays(firstDay, def.days - 1);
  const firstName = hebrewMonthName(hebrewYear, month);
  const lastName = hebrewMonthName(last.year, last.month);
  const hebrewDate =
    def.days === 1
      ? `${def.day} ${firstName} ${hebrewYear}`
      : firstName === lastName
        ? `${def.day}–${last.day} ${firstName} ${hebrewYear}`
        : `${def.day} ${firstName} – ${last.day} ${lastName} ${hebrewYear}`;
  return {
    id: `${key}_${firstDay.slice(0, 4)}`,
    key,
    name: HOLIDAY_NAME[key],
    category: "holiday",
    startDate: addDays(firstDay, -1), // the eve
    firstDay,
    endDate,
    source: "hebrew_calendar",
    sourceLabel: CALENDAR_SOURCE_LABEL.hebrew_calendar,
    hebrewDate,
    precision: "date"
  };
}

export const hebrewCalendarSource: CalendarEventSource = {
  id: "hebrew_calendar",
  label: CALENDAR_SOURCE_LABEL.hebrew_calendar,
  eventsBetween(from, to) {
    // A Gregorian year G overlaps Hebrew years G+3760 (Jan–Sep) and G+3761 (Sep–Dec).
    const fromHy = Number(from.slice(0, 4)) + 3760;
    const toHy = Number(to.slice(0, 4)) + 3761;
    const out: CalendarEvent[] = [];
    for (let hy = fromHy; hy <= toHy; hy++) {
      for (const def of DEFINITIONS) {
        const e = holidayEvent(def.key, hy);
        if (e.endDate >= from && e.startDate <= to) out.push(e);
      }
    }
    return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
};
