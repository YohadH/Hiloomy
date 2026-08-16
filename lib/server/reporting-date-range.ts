import { cookies } from "next/headers";
import { withOptionalDb } from "@/lib/server/db";

export const REPORTING_DATE_RANGE_COOKIE = "reporting-date-range";

const DEFAULT_TIME_ZONE = "UTC";

/**
 * Day boundaries must be computed in the *store's* timezone so windows line up
 * with Shopify's own reports (Shopify reports in store time). Orders are stored
 * with UTC `createdAt`, so e.g. "May 1" in Asia/Jerusalem is 2026-04-30T21:00Z
 * .. 2026-05-01T20:59:59Z — not the server-local midnight we used before.
 */
export async function getStoreTimeZone(): Promise<string> {
  return withOptionalDb(async (db) => {
    const store = await db.store.findFirst({
      where: { connected: true, connection: { isNot: null } },
      orderBy: { updatedAt: "desc" },
      select: { timezone: true }
    });
    return store?.timezone || DEFAULT_TIME_ZONE;
  }, DEFAULT_TIME_ZONE);
}

type CalendarDate = { year: number; month: number; day: number };

function intlParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  // Intl can emit hour "24" at midnight; normalize to 0.
  if (map.hour === 24) map.hour = 0;
  return map;
}

/** ms to add to a UTC instant to get wall-clock time in `timeZone`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = intlParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** The UTC instant for start/end-of-day of a calendar date in `timeZone`. */
function zonedBoundaryUtc(cal: CalendarDate, mode: "start" | "end", timeZone: string): Date {
  const [hh, mm, ss, ms] = mode === "start" ? [0, 0, 0, 0] : [23, 59, 59, 999];
  const guess = Date.UTC(cal.year, cal.month - 1, cal.day, hh, mm, ss, ms);
  // Resolve twice so DST transition days settle on the correct offset.
  let result = guess - tzOffsetMs(new Date(guess), timeZone);
  result = guess - tzOffsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** Today's calendar date as seen in `timeZone`. */
function zonedToday(timeZone: string, now = new Date()): CalendarDate {
  const p = intlParts(now, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

function calNoon(cal: CalendarDate) {
  return new Date(Date.UTC(cal.year, cal.month - 1, cal.day, 12, 0, 0, 0));
}

function calFrom(date: Date): CalendarDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function addCalendarDays(cal: CalendarDate, days: number): CalendarDate {
  const d = calNoon(cal);
  d.setUTCDate(d.getUTCDate() + days);
  return calFrom(d);
}

function calWeekday(cal: CalendarDate) {
  return calNoon(cal).getUTCDay(); // 0 = Sunday
}

/**
 * Start/end-of-day UTC instants for a YYYY-MM-DD string in `timeZone`.
 * Use for interpreting user-supplied date params (?from=&to=) so the
 * whole final day is included — parsing "2026-07-04" as a bare UTC
 * midnight silently dropped 21 hours of Israeli orders from `to`.
 */
export function dayBoundsUtc(
  dateInput: string,
  timeZone: string
): { start: Date; end: Date } | null {
  const start = parseInputDate(dateInput, "start", timeZone);
  const end = parseInputDate(dateInput, "end", timeZone);
  if (!start || !end) return null;
  return { start, end };
}

/**
 * The last N COMPLETE days in `timeZone` — ends yesterday 23:59:59.999,
 * never today. Reports that default to "last 7 days ending now" include
 * a partial final day where Meta hasn't synced and Shopify has hours of
 * orders missing; every manual comparison then looks "off by one day".
 */
export function lastCompleteDaysRange(
  days: number,
  timeZone: string,
  now = new Date()
): { start: Date; end: Date } {
  const today = zonedToday(timeZone, now);
  const yesterday = addCalendarDays(today, -1);
  const startCal = addCalendarDays(today, -days);
  return {
    start: zonedBoundaryUtc(startCal, "start", timeZone),
    end: zonedBoundaryUtc(yesterday, "end", timeZone)
  };
}

/**
 * Format a UTC instant as the YYYY-MM-DD calendar date it falls on in
 * `timeZone`. Use this instead of `date.toISOString().slice(0, 10)` for
 * any user-facing period label or URL param that a TZ-aware consumer
 * will re-parse: for a store-TZ window start (July 1 00:00 Israel =
 * June 30 21:00Z), toISOString gives "06-30" — the wrong calendar day.
 */
export function formatDateInTimeZone(value: Date, timeZone: string): string {
  return toInputDate(value, timeZone);
}

/**
 * The most recently COMPLETED Sunday→Saturday week in `timeZone`
 * (Israeli week convention). On a Saturday, returns the week that ended
 * the PREVIOUS Saturday — the current week isn't complete until
 * midnight, and a partial final day is exactly the window bug that made
 * report numbers disagree with hand-checked Ads Manager totals.
 */
export function lastCompletedWeekRange(
  timeZone: string,
  now = new Date()
): { start: Date; end: Date } {
  const today = zonedToday(timeZone, now);
  const weekday = calWeekday(today); // 0 = Sunday … 6 = Saturday
  const daysSinceCompletedSaturday = weekday === 6 ? 7 : weekday + 1;
  const lastSaturday = addCalendarDays(today, -daysSinceCompletedSaturday);
  const sunday = addCalendarDays(lastSaturday, -6);
  return {
    start: zonedBoundaryUtc(sunday, "start", timeZone),
    end: zonedBoundaryUtc(lastSaturday, "end", timeZone)
  };
}

/** The full calendar month before the current one in `timeZone`. */
export function previousMonthRange(
  timeZone: string,
  now = new Date()
): { start: Date; end: Date } {
  const today = zonedToday(timeZone, now);
  const lastOfPrevMonth = addCalendarDays({ year: today.year, month: today.month, day: 1 }, -1);
  const firstOfPrevMonth = { year: lastOfPrevMonth.year, month: lastOfPrevMonth.month, day: 1 };
  return {
    start: zonedBoundaryUtc(firstOfPrevMonth, "start", timeZone),
    end: zonedBoundaryUtc(lastOfPrevMonth, "end", timeZone)
  };
}

export type RangePreset =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "last_90"
  | "wtd"
  | "mtd"
  | "qtd"
  | "ytd"
  | "last_year"
  | "custom";

export type ComparisonMode = "none" | "prev_period" | "prev_year" | "prev_year_dow" | "custom";

export interface ReportingPickerState {
  preset: RangePreset;
  start: string;
  end: string;
  comparison: {
    mode: ComparisonMode;
    start?: string;
    end?: string;
  };
}

export interface ReportingDateRangeSelection {
  start: Date;
  end: Date;
  startInput: string;
  endInput: string;
  label: string;
  preset: RangePreset;
  comparison: {
    mode: ComparisonMode;
    enabled: boolean;
    start: Date;
    end: Date;
    startInput: string;
    endInput: string;
    label: string;
  };
}

function toInputDate(value: Date, timeZone: string) {
  const p = intlParts(value, timeZone);
  return `${p.year.toString().padStart(4, "0")}-${p.month.toString().padStart(2, "0")}-${p.day
    .toString()
    .padStart(2, "0")}`;
}

function parseInputDate(value: string, mode: "start" | "end", timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const cal: CalendarDate = { year, month, day };
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  if (Number.isNaN(probe.getTime())) return null;
  return zonedBoundaryUtc(cal, mode, timeZone);
}

export function resolvePreset(
  preset: RangePreset,
  timeZone: string = DEFAULT_TIME_ZONE,
  now = new Date()
): { start: Date; end: Date } {
  const today = zonedToday(timeZone, now);
  const startOf = (cal: CalendarDate) => zonedBoundaryUtc(cal, "start", timeZone);
  const endOf = (cal: CalendarDate) => zonedBoundaryUtc(cal, "end", timeZone);

  switch (preset) {
    case "today":
      return { start: startOf(today), end: endOf(today) };
    case "yesterday": {
      const y = addCalendarDays(today, -1);
      return { start: startOf(y), end: endOf(y) };
    }
    case "last_7":
      return { start: startOf(addCalendarDays(today, -6)), end: endOf(today) };
    case "last_30":
      return { start: startOf(addCalendarDays(today, -29)), end: endOf(today) };
    case "last_90":
      return { start: startOf(addCalendarDays(today, -89)), end: endOf(today) };
    case "wtd":
      return { start: startOf(addCalendarDays(today, -calWeekday(today))), end: endOf(today) };
    case "mtd":
      return { start: startOf({ year: today.year, month: today.month, day: 1 }), end: endOf(today) };
    case "qtd": {
      const quarterStartMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
      return {
        start: startOf({ year: today.year, month: quarterStartMonth, day: 1 }),
        end: endOf(today)
      };
    }
    case "ytd":
      return { start: startOf({ year: today.year, month: 1, day: 1 }), end: endOf(today) };
    case "last_year":
      return {
        start: startOf({ year: today.year - 1, month: 1, day: 1 }),
        end: endOf({ year: today.year - 1, month: 12, day: 31 })
      };
    case "custom":
    default:
      // Fallback when a custom range is missing/invalid.
      return {
        start: startOf(addCalendarDays(today, -29)),
        end: endOf(today)
      };
  }
}

export function presetLabel(preset: RangePreset, locale: "en" | "he" = "en") {
  if (locale === "he") {
    const map: Record<RangePreset, string> = {
      today: "היום",
      yesterday: "אתמול",
      last_7: "7 הימים האחרונים",
      last_30: "30 הימים האחרונים",
      last_90: "90 הימים האחרונים",
      wtd: "השבוע עד היום",
      mtd: "החודש עד היום",
      qtd: "הרבעון עד היום",
      ytd: "השנה עד היום",
      last_year: "השנה הקודמת",
      custom: "טווח מותאם"
    };
    return map[preset];
  }
  const map: Record<RangePreset, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last_7: "Last 7 days",
    last_30: "Last 30 days",
    last_90: "Last 90 days",
    wtd: "Week to date",
    mtd: "Month to date",
    qtd: "Quarter to date",
    ytd: "Year to date",
    last_year: "Last year",
    custom: "Custom"
  };
  return map[preset];
}

export function comparisonLabel(mode: ComparisonMode, locale: "en" | "he" = "en") {
  if (locale === "he") {
    const map: Record<ComparisonMode, string> = {
      none: "ללא השוואה",
      prev_period: "התקופה הקודמת",
      prev_year: "השנה שעברה",
      prev_year_dow: "השנה שעברה (אותו יום בשבוע)",
      custom: "טווח מותאם"
    };
    return map[mode];
  }
  const map: Record<ComparisonMode, string> = {
    none: "No comparison",
    prev_period: "Previous period",
    prev_year: "Previous year",
    prev_year_dow: "Previous year (match day of week)",
    custom: "Custom"
  };
  return map[mode];
}

function describeRange(start: Date, end: Date, locale: "en" | "he" = "en") {
  const formatter = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const startStr = formatter.format(start);
  const endStr = formatter.format(end);
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
}

function previousPeriod(current: { start: Date; end: Date }): { start: Date; end: Date } {
  // The equal-length block ending the instant before the current window.
  const lengthMs = current.end.getTime() - current.start.getTime();
  const end = new Date(current.start.getTime() - 1);
  const start = new Date(end.getTime() - lengthMs);
  return { start, end };
}

function resolveComparison(
  current: { start: Date; end: Date },
  raw: { mode: ComparisonMode; start?: string; end?: string },
  timeZone: string
): { start: Date; end: Date } {
  switch (raw.mode) {
    case "prev_year": {
      const s = calFrom(current.start);
      const e = calFrom(current.end);
      return {
        start: zonedBoundaryUtc({ ...s, year: s.year - 1 }, "start", timeZone),
        end: zonedBoundaryUtc({ ...e, year: e.year - 1 }, "end", timeZone)
      };
    }
    case "prev_year_dow": {
      const lengthDays = Math.round((current.end.getTime() - current.start.getTime()) / 86400000);
      const cur = calFrom(current.start);
      let start: CalendarDate = { ...cur, year: cur.year - 1 };
      const dowDiff = calWeekday(cur) - calWeekday(start);
      start = addCalendarDays(start, dowDiff);
      const end = addCalendarDays(start, lengthDays);
      return {
        start: zonedBoundaryUtc(start, "start", timeZone),
        end: zonedBoundaryUtc(end, "end", timeZone)
      };
    }
    case "custom": {
      const parsedStart = raw.start ? parseInputDate(raw.start, "start", timeZone) : null;
      const parsedEnd = raw.end ? parseInputDate(raw.end, "end", timeZone) : null;
      if (parsedStart && parsedEnd && parsedStart <= parsedEnd) {
        return { start: parsedStart, end: parsedEnd };
      }
      return previousPeriod(current);
    }
    case "none":
    case "prev_period":
    default:
      return previousPeriod(current);
  }
}

function readState(raw: string | undefined): ReportingPickerState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const preset = (parsed.preset ?? "last_30") as RangePreset;
      const start = typeof parsed.start === "string" ? parsed.start : undefined;
      const end = typeof parsed.end === "string" ? parsed.end : undefined;
      const comparison = parsed.comparison ?? { mode: "prev_period" };
      const fallbackStart = start ?? "";
      const fallbackEnd = end ?? "";
      return {
        preset,
        start: fallbackStart,
        end: fallbackEnd,
        comparison: {
          mode: (comparison.mode ?? "prev_period") as ComparisonMode,
          start: typeof comparison.start === "string" ? comparison.start : undefined,
          end: typeof comparison.end === "string" ? comparison.end : undefined
        }
      };
    }
  } catch {
    // ignore malformed cookie
  }
  return null;
}

export async function getReportingDateRangeSelection(locale: "en" | "he" = "en"): Promise<ReportingDateRangeSelection> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(REPORTING_DATE_RANGE_COOKIE)?.value;
  const state = readState(raw);
  const timeZone = await getStoreTimeZone();

  let preset: RangePreset = state?.preset ?? "last_30";
  let current: { start: Date; end: Date };

  if (preset === "custom") {
    const customStart = state?.start ? parseInputDate(state.start, "start", timeZone) : null;
    const customEnd = state?.end ? parseInputDate(state.end, "end", timeZone) : null;
    if (customStart && customEnd && customStart <= customEnd) {
      current = { start: customStart, end: customEnd };
    } else {
      preset = "last_30";
      current = resolvePreset(preset, timeZone);
    }
  } else {
    current = resolvePreset(preset, timeZone);
  }

  const comparisonRaw = state?.comparison ?? { mode: "prev_period" as ComparisonMode };
  const comparisonRange = resolveComparison(current, comparisonRaw, timeZone);

  return {
    start: current.start,
    end: current.end,
    startInput: toInputDate(current.start, timeZone),
    endInput: toInputDate(current.end, timeZone),
    label: presetLabel(preset, locale) + (preset === "custom" ? "" : ""),
    preset,
    comparison: {
      mode: comparisonRaw.mode,
      enabled: comparisonRaw.mode !== "none",
      start: comparisonRange.start,
      end: comparisonRange.end,
      startInput: toInputDate(comparisonRange.start, timeZone),
      endInput: toInputDate(comparisonRange.end, timeZone),
      label: comparisonLabel(comparisonRaw.mode, locale)
    }
  };
}

export function describeAbsoluteRange(start: Date, end: Date, locale: "en" | "he" = "en") {
  return describeRange(start, end, locale);
}
