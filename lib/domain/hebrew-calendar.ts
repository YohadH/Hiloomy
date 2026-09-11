// Hebrew (Jewish) calendar arithmetic — the fixed calendar of Hillel II, as
// formulated in Reingold & Dershowitz, "Calendrical Calculations". Pure,
// deterministic, dependency-free. Every date it produces can be checked
// against any published calendar; the unit tests compare a range of years
// with Node's ICU Hebrew calendar (Intl) and with Hebcal's published dates.
//
// Month numbers follow the traditional order from Nisan: 1 Nisan, 2 Iyar,
// 3 Sivan, 4 Tammuz, 5 Av, 6 Elul, 7 Tishrei, 8 Cheshvan, 9 Kislev,
// 10 Tevet, 11 Shevat, 12 Adar (Adar I in a leap year), 13 Adar II.
// The year number changes on 1 Tishrei.

export const HEBREW_MONTH = { NISAN: 1, IYAR: 2, SIVAN: 3, TAMMUZ: 4, AV: 5, ELUL: 6, TISHREI: 7, CHESHVAN: 8, KISLEV: 9, TEVET: 10, SHEVAT: 11, ADAR_I: 12, ADAR_II: 13 } as const;

const MONTH_NAME_EN = ["", "Nisan", "Iyar", "Sivan", "Tammuz", "Av", "Elul", "Tishrei", "Cheshvan", "Kislev", "Tevet", "Shevat", "Adar", "Adar II"];

// Fixed (Rata Die) day numbers: RD 1 = 1 January 1 CE (proleptic Gregorian).
const HEBREW_EPOCH = -1373427; // RD of 1 Tishrei AM 1
const RD_UNIX_EPOCH = 719163; // RD of 1970-01-01
const DAY_MS = 86_400_000;

const floor = Math.floor;
const mod = (a: number, b: number) => a - b * floor(a / b);

export function isHebrewLeapYear(year: number): boolean {
  return mod(7 * year + 1, 19) < 7;
}

export function lastMonthOfHebrewYear(year: number): number {
  return isHebrewLeapYear(year) ? 13 : 12;
}

// Days from the Hebrew epoch to the molad-based new year, with the
// "lo ADU Rosh" postponement folded in.
function hebrewCalendarElapsedDays(year: number): number {
  const monthsElapsed = floor((235 * year - 234) / 19);
  const partsElapsed = 12084 + 13753 * monthsElapsed;
  const day = 29 * monthsElapsed + floor(partsElapsed / 25920);
  return mod(3 * (day + 1), 7) < 3 ? day + 1 : day;
}

// The two remaining postponements (years of 356 / 382 days are not allowed).
function hebrewNewYearDelay(year: number): number {
  const ny0 = hebrewCalendarElapsedDays(year - 1);
  const ny1 = hebrewCalendarElapsedDays(year);
  const ny2 = hebrewCalendarElapsedDays(year + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}

export function hebrewNewYearRd(year: number): number {
  return HEBREW_EPOCH + hebrewCalendarElapsedDays(year) + hebrewNewYearDelay(year);
}

export function daysInHebrewYear(year: number): number {
  return hebrewNewYearRd(year + 1) - hebrewNewYearRd(year);
}

export function daysInHebrewMonth(year: number, month: number): number {
  if (month === 2 || month === 4 || month === 6 || month === 10 || month === 13) return 29;
  if (month === 12 && !isHebrewLeapYear(year)) return 29;
  if (month === 8 && mod(daysInHebrewYear(year), 10) !== 5) return 29;
  if (month === 9 && mod(daysInHebrewYear(year), 10) === 3) return 29;
  return 30;
}

export function rdFromHebrew(year: number, month: number, day: number): number {
  let total = hebrewNewYearRd(year) + day - 1;
  if (month < 7) {
    for (let m = 7; m <= lastMonthOfHebrewYear(year); m++) total += daysInHebrewMonth(year, m);
    for (let m = 1; m < month; m++) total += daysInHebrewMonth(year, m);
  } else {
    for (let m = 7; m < month; m++) total += daysInHebrewMonth(year, m);
  }
  return total;
}

export function hebrewFromRd(rd: number): { year: number; month: number; day: number } {
  const approx = floor((98496 / 35975351) * (rd - HEBREW_EPOCH)) + 1;
  let year = approx - 1;
  while (hebrewNewYearRd(year + 1) <= rd) year++;
  const start = rd < rdFromHebrew(year, 1, 1) ? 7 : 1;
  let month = start;
  while (rd > rdFromHebrew(year, month, daysInHebrewMonth(year, month))) month++;
  const day = rd - rdFromHebrew(year, month, 1) + 1;
  return { year, month, day };
}

export function isoFromRd(rd: number): string {
  return new Date((rd - RD_UNIX_EPOCH) * DAY_MS).toISOString().slice(0, 10);
}

export function rdFromIso(iso: string): number {
  return Math.round(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS) + RD_UNIX_EPOCH;
}

export function hebrewMonthName(year: number, month: number): string {
  if (month === 12) return isHebrewLeapYear(year) ? "Adar I" : "Adar";
  return MONTH_NAME_EN[month] ?? String(month);
}

// Gregorian calendar day for a Hebrew date, e.g. (5787, TISHREI, 1) → "2026-09-12".
export function gregorianFromHebrew(year: number, month: number, day: number): string {
  return isoFromRd(rdFromHebrew(year, month, day));
}

export function hebrewFromGregorian(iso: string): { year: number; month: number; day: number } {
  return hebrewFromRd(rdFromIso(iso));
}
