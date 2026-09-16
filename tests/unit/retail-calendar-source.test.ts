// Retail calendar: arithmetic shopping moments the decision layer can see a
// quarter ahead. Dates are cross-checked against published calendars;
// announced dates (Shopping IL) are deliberately absent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { blackFriday, nthWeekdayOfMonth, retailCalendarSource, retailEvent } from "@/lib/domain/retail-calendar-source";
import { CALENDAR_SOURCES, EVENT_HORIZON_DAYS, calendarEventsAround } from "@/lib/services/commercial-calendar-service";
import { suggestEventLink } from "@/lib/domain/calendar-events";

test("Black Friday is the day after the 4th Thursday of November — published dates 2024–2028", () => {
  assert.equal(blackFriday(2024), "2024-11-29");
  assert.equal(blackFriday(2025), "2025-11-28");
  assert.equal(blackFriday(2026), "2026-11-27");
  assert.equal(blackFriday(2027), "2027-11-26");
  assert.equal(blackFriday(2028), "2028-11-24");
  assert.equal(nthWeekdayOfMonth(2026, 11, 4, 4), "2026-11-26"); // Thanksgiving 2026
});

test("the source yields dated events with an auditable rule; Cyber Monday follows Black Friday by three days", () => {
  const bf = retailEvent("black_friday", 2026);
  assert.equal(bf.id, "black_friday_2026");
  assert.equal(bf.category, "retail");
  assert.equal(bf.source, "retail_calendar");
  assert.equal(bf.startDate, "2026-11-27");
  assert.equal(bf.endDate, "2026-11-27");
  assert.match(bf.hebrewDate, /4th Thursday of November/);
  const cm = retailEvent("cyber_monday", 2026);
  assert.equal(cm.startDate, "2026-11-30");
  assert.equal(retailEvent("singles_day", 2026).startDate, "2026-11-11");
  assert.equal(retailEvent("christmas", 2026).startDate, "2026-12-25");
  assert.equal(retailEvent("valentines_day", 2027).startDate, "2027-02-14");
});

test("eventsBetween respects the window and crosses year boundaries", () => {
  const q4 = retailCalendarSource.eventsBetween("2026-10-01", "2026-12-31").map((e) => e.id);
  assert.deepEqual(q4, ["singles_day_2026", "black_friday_2026", "cyber_monday_2026", "christmas_2026"]);
  const winter = retailCalendarSource.eventsBetween("2026-12-20", "2027-02-20").map((e) => e.id);
  assert.deepEqual(winter, ["christmas_2026", "valentines_day_2027"]);
});

test("the commercial context now sees a quarter ahead: on 16 Sep 2026 Black Friday and Hanukkah are both in view", () => {
  assert.equal(EVENT_HORIZON_DAYS, 90);
  assert.equal(CALENDAR_SOURCES.length, 2);
  const ids = calendarEventsAround(new Date("2026-09-16T10:00:00Z")).map((e) => e.id);
  assert.ok(ids.includes("black_friday_2026"), `black friday in ${ids.join(",")}`);
  assert.ok(ids.includes("cyber_monday_2026"));
  assert.ok(ids.includes("singles_day_2026"));
  assert.ok(ids.includes("hanukkah_2026"), "Hanukkah (Dec 2026) is inside 90 days");
  assert.ok(!ids.includes("christmas_2026"), "Christmas is beyond 90 days from 16 Sep");
});

test("a plan initiative titled 'מבצעי בלאק פריידי' in November is suggested against black_friday_2026 with high confidence", () => {
  const events = retailCalendarSource.eventsBetween("2026-11-01", "2026-12-31");
  const s = suggestEventLink("מבצעי בלאק פריידי 2026", { start: "2026-11-15", end: "2026-11-30" }, events);
  assert.ok(s);
  assert.equal(s!.eventId, "black_friday_2026");
  assert.equal(s!.confidence, "high");
  // Too early for the proximity rule (45 days before) → no suggestion.
  assert.equal(suggestEventLink("בלאק פריידי", { start: "2026-09-01", end: "2026-09-15" }, events), null);
});
