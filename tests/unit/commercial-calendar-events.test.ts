// Commercial calendar: calendar truth (Hebrew-calendar source) is kept
// apart from brand intent (plan initiatives) and from decisions. Links are
// confirmed only by the operator; text matching is a suggestion, never a fact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { hebrewCalendarSource, holidayEvent } from "@/lib/domain/hebrew-calendar-source";
import { HEBREW_MONTH, gregorianFromHebrew, hebrewFromGregorian, isHebrewLeapYear } from "@/lib/domain/hebrew-calendar";
import { buildCommercialContext, eventTimeLabel, initiativeTimeLabel, suggestEventLink } from "@/lib/domain/calendar-events";
import { composeCommercialContext } from "@/lib/services/commercial-calendar-service";
import { buildBusinessContext, buildCoverage } from "@/lib/services/decision-impact-service";
import type { Initiative, PlanView } from "@/lib/domain/plan";

const NOW = new Date("2026-09-11T12:00:00.000Z");

const initiative = (id: string, title: string, start: string, end: string, over: Partial<Initiative> = {}): Initiative =>
  ({
    id,
    sheetId: "s",
    kind: "move",
    excludedFromEngine: false,
    title,
    anchor: { kind: "event", label: title },
    groupingConfidence: "high",
    category: null,
    start,
    end,
    days: 1,
    offer: { discountPct: null, couponCode: null },
    products: [],
    channels: [],
    executions: [],
    dependencies: [],
    checked: [],
    status: "on_track",
    statusReason: null,
    profitConfidence: null,
    decisionHooks: [],
    relatedDecisions: [],
    rowIds: [],
    ...over
  }) as unknown as Initiative;

test("Rosh Hashanah 2026: canonical dates from the Hebrew calendar (eve Sep 11, days Sep 12–13), with the rule on the event", () => {
  const rh = holidayEvent("rosh_hashanah", 5787);
  assert.equal(rh.id, "rosh_hashanah_2026");
  assert.equal(rh.startDate, "2026-09-11"); // the eve — begins at sunset
  assert.equal(rh.firstDay, "2026-09-12");
  assert.equal(rh.endDate, "2026-09-13");
  assert.equal(rh.source, "hebrew_calendar");
  assert.equal(rh.hebrewDate, "1–2 Tishrei 5787");
  assert.equal(rh.precision, "date");
  // Other supported holidays, cross-checked against published Hebcal dates.
  assert.equal(holidayEvent("yom_kippur", 5787).firstDay, "2026-09-21");
  assert.equal(holidayEvent("sukkot", 5787).firstDay, "2026-09-26");
  assert.equal(holidayEvent("sukkot", 5787).endDate, "2026-10-02");
  assert.equal(holidayEvent("shemini_atzeret", 5787).firstDay, "2026-10-03");
  assert.equal(holidayEvent("hanukkah", 5787).startDate, "2026-12-04"); // first candle
  assert.equal(holidayEvent("hanukkah", 5787).endDate, "2026-12-12");
  assert.equal(holidayEvent("hanukkah", 5787).hebrewDate, "25 Kislev – 2 Tevet 5787");
  assert.equal(holidayEvent("purim", 5787).firstDay, "2027-03-23"); // Adar II in a leap year
  assert.equal(holidayEvent("purim", 5786).firstDay, "2026-03-03");
  assert.equal(holidayEvent("passover", 5786).firstDay, "2026-04-02");
  assert.equal(holidayEvent("passover", 5786).endDate, "2026-04-08"); // 7 days in Israel
  assert.equal(holidayEvent("shavuot", 5786).firstDay, "2026-05-22");
});

// Independent cross-check: first days of RH, YK, Sukkot, Hanukkah, Purim,
// Passover, Shavuot for 5784–5795 as computed by @hebcal/core 6.3.3 (a
// separate implementation of the same fixed calendar).
const HEBCAL_TABLE: Array<[number, string, string, string, string, string, string, string]> = [
[5784, "2023-09-16", "2023-09-25", "2023-09-30", "2023-12-08", "2024-03-24", "2024-04-23", "2024-06-12"],
  [5785, "2024-10-03", "2024-10-12", "2024-10-17", "2024-12-26", "2025-03-14", "2025-04-13", "2025-06-02"],
  [5786, "2025-09-23", "2025-10-02", "2025-10-07", "2025-12-15", "2026-03-03", "2026-04-02", "2026-05-22"],
  [5787, "2026-09-12", "2026-09-21", "2026-09-26", "2026-12-05", "2027-03-23", "2027-04-22", "2027-06-11"],
  [5788, "2027-10-02", "2027-10-11", "2027-10-16", "2027-12-25", "2028-03-12", "2028-04-11", "2028-05-31"],
  [5789, "2028-09-21", "2028-09-30", "2028-10-05", "2028-12-13", "2029-03-01", "2029-03-31", "2029-05-20"],
  [5790, "2029-09-10", "2029-09-19", "2029-09-24", "2029-12-02", "2030-03-19", "2030-04-18", "2030-06-07"],
  [5791, "2030-09-28", "2030-10-07", "2030-10-12", "2030-12-21", "2031-03-09", "2031-04-08", "2031-05-28"],
  [5792, "2031-09-18", "2031-09-27", "2031-10-02", "2031-12-10", "2032-02-26", "2032-03-27", "2032-05-16"],
  [5793, "2032-09-06", "2032-09-15", "2032-09-20", "2032-11-28", "2033-03-15", "2033-04-14", "2033-06-03"],
  [5794, "2033-09-24", "2033-10-03", "2033-10-08", "2033-12-17", "2034-03-05", "2034-04-04", "2034-05-24"],
  [5795, "2034-09-14", "2034-09-23", "2034-09-28", "2034-12-07", "2035-03-25", "2035-04-24", "2035-06-13"]
];

test("Hebrew-calendar arithmetic reproduces @hebcal/core for every supported holiday, 5784–5795", () => {
  for (const [hy, rh, yk, sukkot, hanukkah, purim, pesach, shavuot] of HEBCAL_TABLE) {
    assert.equal(holidayEvent("rosh_hashanah", hy).firstDay, rh, `RH ${hy}`);
    assert.equal(holidayEvent("yom_kippur", hy).firstDay, yk, `YK ${hy}`);
    assert.equal(holidayEvent("sukkot", hy).firstDay, sukkot, `Sukkot ${hy}`);
    assert.equal(holidayEvent("hanukkah", hy).firstDay, hanukkah, `Hanukkah ${hy}`);
    assert.equal(holidayEvent("purim", hy).firstDay, purim, `Purim ${hy}`);
    assert.equal(holidayEvent("passover", hy).firstDay, pesach, `Pesach ${hy}`);
    assert.equal(holidayEvent("shavuot", hy).firstDay, shavuot, `Shavuot ${hy}`);
  }
});

// Second independent cross-check: Node's ICU Hebrew calendar, for 1 Tishrei
// (the new-year computation carries all four postponement rules). Bounded
// at 5805: from 5806 ICU lengthens Cheshvan (385-day year) where both hebcal
// and this arithmetic give 384 days, so ICU's later dates shift by a day.
test("Hebrew-calendar arithmetic agrees with Node's ICU Hebrew calendar for 1 Tishrei across 5760–5805", () => {
  const icu = new Intl.DateTimeFormat("en-u-ca-hebrew", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
  const icuParts = (iso: string) => {
    const parts = icu.formatToParts(new Date(`${iso}T12:00:00Z`));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return { year: Number(get("year")), month: get("month"), day: Number(get("day")) };
  };
  for (let hy = 5760; hy <= 5805; hy++) {
    const rh = gregorianFromHebrew(hy, HEBREW_MONTH.TISHREI, 1);
    const p = icuParts(rh);
    assert.equal(p.year, hy, `1 Tishrei ${hy} → ${rh}`);
    assert.equal(p.day, 1, `1 Tishrei ${hy} → ${rh}`);
    assert.equal(p.month, "Tishri", `1 Tishrei ${hy} → ${rh}`);
    // Round trips through the inverse conversion.
    assert.deepEqual(hebrewFromGregorian(rh), { year: hy, month: HEBREW_MONTH.TISHREI, day: 1 });
    assert.deepEqual(hebrewFromGregorian(gregorianFromHebrew(hy, HEBREW_MONTH.NISAN, 15)), { year: hy, month: HEBREW_MONTH.NISAN, day: 15 });
  }
  assert.equal(isHebrewLeapYear(5787), true);
  assert.equal(isHebrewLeapYear(5786), false);
});

test("source window: events intersecting a range, sorted; a year boundary is handled", () => {
  const sep = hebrewCalendarSource.eventsBetween("2026-09-01", "2026-10-10");
  assert.deepEqual(
    sep.map((e) => e.id),
    ["rosh_hashanah_2026", "yom_kippur_2026", "sukkot_2026", "shemini_atzeret_2026"]
  );
  const winter = hebrewCalendarSource.eventsBetween("2026-12-01", "2027-01-31");
  assert.deepEqual(
    winter.map((e) => e.id),
    ["hanukkah_2026"]
  );
});

test("time language: an event 'starts tomorrow / ends on', a campaign 'is active until' — never the other way round", () => {
  const rh = holidayEvent("rosh_hashanah", 5787);
  assert.equal(eventTimeLabel(rh, new Date("2026-09-10T12:00:00Z")).he, "מתחיל מחר");
  assert.equal(eventTimeLabel(rh, new Date("2026-09-09T12:00:00Z")).he, "מתחיל בעוד יומיים");
  assert.equal(eventTimeLabel(rh, NOW).he, "מתחיל היום");
  assert.equal(eventTimeLabel(rh, new Date("2026-09-12T12:00:00Z")).en, "Ends on September 13");
  assert.equal(initiativeTimeLabel("2026-09-01", "2026-09-30", NOW).he, "הקמפיין פעיל עד 30 בספטמבר");
  assert.equal(initiativeTimeLabel("2026-09-01", "2026-09-30", NOW).en, "The campaign is active until September 30");
});

test("initiative longer than the holiday: the event keeps Sep 11–13 and the campaign keeps Sep 1–30 — the ranges are never merged", () => {
  const camp = initiative("i1", "קמפיין ראש השנה", "2026-09-01", "2026-09-30");
  const { events } = buildCommercialContext([camp], hebrewCalendarSource.eventsBetween("2026-09-01", "2026-10-11"), new Map([["i1", "rosh_hashanah_2026"]]), NOW);
  const rh = events.find((e) => e.calendarEvent.id === "rosh_hashanah_2026")!;
  assert.equal(rh.calendarEvent.startDate, "2026-09-11");
  assert.equal(rh.calendarEvent.endDate, "2026-09-13");
  assert.equal(rh.dateRange.en, "September 11 – September 13");
  assert.equal(rh.timeLabel.he, "מתחיל היום");
  const li = rh.linkedInitiatives[0];
  assert.equal(li.linkState, "confirmed");
  assert.equal(li.startDate, "2026-09-01");
  assert.equal(li.endDate, "2026-09-30");
  assert.equal(li.timeLabel.he, "הקמפיין פעיל עד 30 בספטמבר");
  assert.notEqual(li.endDate, rh.calendarEvent.endDate);
});

test("suggested match: 'Holiday Campaign September' is only a low-confidence suggestion, never a confirmed Rosh Hashanah link", () => {
  const events = hebrewCalendarSource.eventsBetween("2026-09-01", "2026-10-11");
  const s = suggestEventLink("Holiday Campaign September", { start: "2026-09-01", end: "2026-09-30" }, events);
  assert.equal(s?.eventId, "rosh_hashanah_2026");
  assert.equal(s?.confidence, "low");
  const { events: ctx } = buildCommercialContext([initiative("i9", "Holiday Campaign September", "2026-09-01", "2026-09-30", { anchor: { kind: "text", label: "" } })], events, new Map(), NOW);
  const li = ctx.find((e) => e.calendarEvent.id === "rosh_hashanah_2026")!.linkedInitiatives[0];
  assert.equal(li.linkState, "suggested");
  assert.equal(li.confidence, "low");
  assert.match(li.linkReason.en, /contains "holiday"/);
  // A stronger phrase gets a stronger, still unconfirmed, suggestion.
  assert.equal(suggestEventLink("מבצע שנה טובה", { start: "2026-09-01", end: "2026-09-30" }, events)?.confidence, "medium");
  assert.equal(suggestEventLink("ראש השנה 2026", { start: "2026-09-01", end: "2026-09-30" }, events)?.confidence, "high");
  // Name match without date proximity is NOT a suggestion.
  assert.equal(suggestEventLink("ראש השנה", { start: "2026-03-01", end: "2026-03-15" }, events), null);
});

test("no match: 'September Growth Push' stays unlinked and falls back to a campaign window, never headed with an event name", () => {
  const push = initiative("i2", "September Growth Push", "2026-09-01", "2026-09-30", { anchor: { kind: "event", label: "September Growth Push" } });
  const plan = { sheetId: "s", title: "t", rangeStart: null, rangeEnd: null, today: "2026-09-11", initiatives: [push] } as unknown as PlanView;
  const { events, linkedInitiativeIds } = composeCommercialContext(plan, new Map(), NOW);
  assert.equal(linkedInitiativeIds.size, 0);
  assert.ok(events.every((e) => e.linkedInitiatives.length === 0));
  const ctx = buildBusinessContext(plan, [], null, buildCoverage(null, null, {}), NOW);
  assert.equal(ctx.windows.length, 1);
  assert.equal(ctx.windows[0].campaignTitle.en, "September Growth Push campaign");
  assert.equal(ctx.events[0].calendarEvent.id, "rosh_hashanah_2026"); // the holiday still exists with no initiative
});

test("multiple initiatives link to one holiday; confirmed ones come first and only they drive decision urgency", () => {
  const a = initiative("a", "קמפיין ראש השנה - מייל", "2026-09-01", "2026-09-13", {
    relatedDecisions: [{ id: "d1", hookId: "h", state: "open", choice: "pending", optionKey: null, decidedAt: null, question: { he: "להפעיל 20%?", en: "Activate 20%?" } }],
    decisionHooks: [{ id: "h", rowId: "r", kind: "review", sourceText: "", question: { he: "להפעיל 20%?", en: "Activate 20%?" }, windowStart: "2026-09-10", windowEnd: "2026-09-12", requiredEvidence: [] }]
  } as Partial<Initiative>);
  const b = initiative("b", "שנה טובה - אינסטגרם", "2026-09-05", "2026-09-20");
  const c = initiative("c", "Rosh Hashana gift sets", "2026-08-20", "2026-09-13");
  const { events, linkedInitiativeIds } = buildCommercialContext([a, b, c], hebrewCalendarSource.eventsBetween("2026-09-01", "2026-10-11"), new Map([["a", "rosh_hashanah_2026"]]), NOW);
  const rh = events.find((e) => e.calendarEvent.id === "rosh_hashanah_2026")!;
  assert.deepEqual(linkedInitiativeIds, new Set(["a", "b", "c"]));
  assert.deepEqual(
    rh.linkedInitiatives.map((l) => [l.id, l.linkState, l.confidence]),
    [
      ["a", "confirmed", null],
      ["c", "suggested", "high"],
      ["b", "suggested", "medium"]
    ]
  );
  assert.deepEqual(rh.linkedInitiatives[0].decisionWindow, { start: "2026-09-10", end: "2026-09-12", question: { he: "להפעיל 20%?", en: "Activate 20%?" } });
  assert.equal(rh.linkedInitiatives[0].openDecisionCount, 1);
  assert.match(rh.decisionUrgency!.en, /Decision window closing — Rosh Hashanah starts today/);
  // With only suggested links, no urgency is derived — inference never becomes context.
  const { events: sug } = buildCommercialContext([b, c], hebrewCalendarSource.eventsBetween("2026-09-01", "2026-10-11"), new Map(), NOW);
  assert.equal(sug.find((e) => e.calendarEvent.id === "rosh_hashanah_2026")!.decisionUrgency, null);
});

test("no initiative: the holiday is still shown from its source; a confirmed link to an event outside the horizon is ignored, not invented", () => {
  const { events } = composeCommercialContext(null, new Map(), NOW);
  const ids = events.map((e) => e.calendarEvent.id);
  assert.deepEqual(ids, ["rosh_hashanah_2026", "yom_kippur_2026", "sukkot_2026", "shemini_atzeret_2026"]);
  assert.ok(events.every((e) => e.linkedInitiatives.length === 0));
  const stale = initiative("z", "קמפיין חנוכה", "2026-09-01", "2026-09-30");
  const plan = { sheetId: "s", title: "t", rangeStart: null, rangeEnd: null, today: "2026-09-11", initiatives: [stale] } as unknown as PlanView;
  const ctx = composeCommercialContext(plan, new Map([["z", "hanukkah_2025"]]), NOW);
  assert.ok(ctx.events.every((e) => e.linkedInitiatives.every((l) => l.id !== "z" || l.linkState === "suggested")));
});

test("business summary line names the calendar event with event language and the confirmed campaign with campaign language", () => {
  const camp = initiative("i1", "קמפיין ראש השנה", "2026-09-01", "2026-09-30");
  const plan = { sheetId: "s", title: "t", rangeStart: null, rangeEnd: null, today: "2026-09-11", initiatives: [camp] } as unknown as PlanView;
  const ctx = buildBusinessContext(plan, [], null, buildCoverage(null, null, {}), NOW, new Map([["i1", "rosh_hashanah_2026"]]));
  assert.equal(ctx.sheetId, "s");
  assert.deepEqual(ctx.calendarSources.map((s) => s.en), ["Hebrew calendar"]);
  assert.match(ctx.summaryLine.he, /^ראש השנה מתחיל היום, "קמפיין ראש השנה" — הקמפיין פעיל עד 30 בספטמבר/);
  assert.equal(ctx.windows.length, 0); // linked → not duplicated as a campaign window
});
