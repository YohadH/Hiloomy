// Calendar events — system-known facts about WHEN things happen, kept
// strictly apart from what the brand PLANS around them and from what the
// manager must DECIDE.
//
//   Calendar truth   — a CalendarEvent: "Rosh Hashanah, Sep 11–13 2026",
//                      from a deterministic source, never from a plan label.
//   Brand intent     — an Initiative in the plan: "קמפיין ראש השנה, Sep 1–30".
//   Decision         — a decision hook / ledger decision on that initiative.
//
// A plan initiative can be LINKED to a calendar event: `confirmed` (the
// operator said so, stored in plan overrides) or `suggested` (a deterministic
// alias + date-proximity rule thinks so). A suggestion is never treated as
// context; it is shown as a question. Text matching is NOT ground truth.
//
// Precision is DATE-LEVEL: `startDate` is the eve (the holiday begins at
// sunset on that date) and `endDate` the last full day. Sunset / location
// precision is a documented future enhancement, not modelled here.

import type { Localized } from "@/lib/domain/decision";
import type { Initiative } from "@/lib/domain/plan";

export type CalendarEventSourceId = "hebrew_calendar"; // future: "retail_calendar" | "national_holidays" | "custom"
export type CalendarEventCategory = "holiday";
export type HolidayKey = "rosh_hashanah" | "yom_kippur" | "sukkot" | "shemini_atzeret" | "hanukkah" | "purim" | "passover" | "shavuot";

export interface CalendarEvent {
  id: string; // `${key}_${gregorian year of the first day}`, e.g. rosh_hashanah_2026
  key: HolidayKey;
  name: Localized;
  category: CalendarEventCategory;
  startDate: string; // YYYY-MM-DD — the eve; the holiday begins at sunset on this date
  firstDay: string; // first full day
  endDate: string; // last full day (inclusive)
  source: CalendarEventSourceId;
  sourceLabel: Localized;
  // The rule that produced the dates, for the audit trail: "1–2 Tishrei 5787".
  hebrewDate: string;
  precision: "date";
}

export interface CalendarEventSource {
  id: CalendarEventSourceId;
  label: Localized;
  // Events whose [startDate, endDate] intersects [from, to] (inclusive).
  eventsBetween(from: string, to: string): CalendarEvent[];
}

export const CALENDAR_SOURCE_LABEL: Record<CalendarEventSourceId, Localized> = {
  hebrew_calendar: { he: "לוח עברי", en: "Hebrew calendar" }
};

export const HOLIDAY_NAME: Record<HolidayKey, Localized> = {
  rosh_hashanah: { he: "ראש השנה", en: "Rosh Hashanah" },
  yom_kippur: { he: "יום כיפור", en: "Yom Kippur" },
  sukkot: { he: "סוכות", en: "Sukkot" },
  shemini_atzeret: { he: "שמחת תורה", en: "Simchat Torah" },
  hanukkah: { he: "חנוכה", en: "Hanukkah" },
  purim: { he: "פורים", en: "Purim" },
  passover: { he: "פסח", en: "Passover" },
  shavuot: { he: "שבועות", en: "Shavuot" }
};

// ---------------------------------------------------------------------------
// Dates (UTC calendar days; the app's plan dates are YYYY-MM-DD strings).

const DAY_MS = 86_400_000;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoDay(new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * DAY_MS));
export const daysBetweenIso = (fromIso: string, toIso: string) => Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / DAY_MS);

// "13 בספטמבר" / "September 13" — day + month only; the year is implied.
export function formatDayMonth(iso: string, locale: "he" | "en"): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
export function formatDateRange(start: string, end: string): Localized {
  if (start === end) return { he: formatDayMonth(start, "he"), en: formatDayMonth(start, "en") };
  return { he: `${formatDayMonth(start, "he")} – ${formatDayMonth(end, "he")}`, en: `${formatDayMonth(start, "en")} – ${formatDayMonth(end, "en")}` };
}

const inDays = (n: number): Localized => (n === 1 ? { he: "מחר", en: "tomorrow" } : n === 2 ? { he: "בעוד יומיים", en: "in two days" } : { he: `בעוד ${n} ימים`, en: `in ${n} days` });

// ---------------------------------------------------------------------------
// Event timing — language for a CALENDAR EVENT ("starts tomorrow", "ends on
// September 13"), never "active until" — that phrase belongs to campaigns.

export type EventState = "ended" | "active" | "starts_today" | "upcoming";

export function eventState(e: Pick<CalendarEvent, "startDate" | "endDate">, now: Date): { state: EventState; daysUntil: number; daysLeft: number } {
  const today = isoDay(now);
  const daysUntil = daysBetweenIso(today, e.startDate);
  const daysLeft = daysBetweenIso(today, e.endDate);
  if (daysLeft < 0) return { state: "ended", daysUntil, daysLeft };
  if (daysUntil === 0) return { state: "starts_today", daysUntil, daysLeft };
  if (daysUntil < 0) return { state: "active", daysUntil, daysLeft };
  return { state: "upcoming", daysUntil, daysLeft };
}

export function eventTimeLabel(e: Pick<CalendarEvent, "startDate" | "endDate">, now: Date): Localized {
  const { state, daysUntil } = eventState(e, now);
  switch (state) {
    case "starts_today":
      return { he: "מתחיל היום", en: "Starts today" };
    case "active":
      return { he: `מסתיים ב־${formatDayMonth(e.endDate, "he")}`, en: `Ends on ${formatDayMonth(e.endDate, "en")}` };
    case "ended":
      return { he: `הסתיים ב־${formatDayMonth(e.endDate, "he")}`, en: `Ended on ${formatDayMonth(e.endDate, "en")}` };
    default: {
      const w = inDays(daysUntil);
      return { he: `מתחיל ${w.he}`, en: `Starts ${w.en}` };
    }
  }
}

// Language for a COMMERCIAL INITIATIVE: "the campaign is active until
// September 30" — never "the holiday is active until".
export function initiativeTimeLabel(start: string, end: string, now: Date): Localized {
  const today = isoDay(now);
  if (end < today) return { he: `הקמפיין הסתיים ב־${formatDayMonth(end, "he")}`, en: `The campaign ended on ${formatDayMonth(end, "en")}` };
  if (start > today) {
    const w = inDays(daysBetweenIso(today, start));
    return { he: `הקמפיין מתחיל ${w.he} (${formatDayMonth(start, "he")})`, en: `The campaign starts ${w.en} (${formatDayMonth(start, "en")})` };
  }
  return { he: `הקמפיין פעיל עד ${formatDayMonth(end, "he")}`, en: `The campaign is active until ${formatDayMonth(end, "en")}` };
}

// ---------------------------------------------------------------------------
// Linking plan initiatives to calendar events.

export type LinkState = "confirmed" | "suggested";
export type LinkConfidence = "high" | "medium" | "low";

export interface LinkSuggestion {
  eventId: string;
  confidence: LinkConfidence;
  matchedAlias: string;
  reason: Localized; // why the system thinks so — shown next to the question, never hidden
}

// Deterministic aliases. `strong` = the holiday's own name (high). `weak` =
// phrases that usually mean it (medium). Generic holiday words (low) only
// point at the nearest event. Every match ALSO requires date proximity.
const ALIASES: Record<HolidayKey, { strong: string[]; weak: string[] }> = {
  rosh_hashanah: { strong: ["ראש השנה", "ראש-השנה", "rosh hashanah", "rosh hashana", "rosh hashona"], weak: ["שנה טובה", "חגי תשרי", "תשרי", "shana tova", "tishrei"] },
  yom_kippur: { strong: ["יום כיפור", "יום הכיפורים", "yom kippur"], weak: [] },
  sukkot: { strong: ["סוכות", "sukkot", "succot", "sukkos"], weak: ["חול המועד", "chol hamoed"] },
  shemini_atzeret: { strong: ["שמחת תורה", "שמיני עצרת", "simchat torah", "shemini atzeret"], weak: [] },
  hanukkah: { strong: ["חנוכה", "hanukkah", "chanukah", "hanukah", "hannukah"], weak: ["סופגניות", "נרות", "candles"] },
  purim: { strong: ["פורים", "purim"], weak: ["תחפושות", "משלוח מנות", "costume"] },
  passover: { strong: ["פסח", "passover", "pesach"], weak: ["חג האביב", "חג החירות", "חול המועד", "chol hamoed", "seder", "סדר"] },
  shavuot: { strong: ["שבועות", "shavuot", "shavuos"], weak: ["חג הביכורים", "גבינות", "cheesecake"] }
};
const GENERIC_HOLIDAY_WORDS = ["חגים", "חגי", "חג", "holidays", "holiday", "festive"];

export const normalizeLabel = (s: string) =>
  s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // niqqud / cantillation
    .replace(/[״"'׳`’‘]/g, "")
    .replace(/[-_/|·•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Proximity: the initiative must overlap the event's run-up or the event
// itself. 45 days before the eve, 7 days after the last day.
const PROXIMITY_BEFORE = 45;
const PROXIMITY_AFTER = 7;
export function isNearEvent(window: { start: string; end: string }, e: Pick<CalendarEvent, "startDate" | "endDate">): boolean {
  return window.end >= addDays(e.startDate, -PROXIMITY_BEFORE) && window.start <= addDays(e.endDate, PROXIMITY_AFTER);
}

const RANK: Record<LinkConfidence, number> = { high: 3, medium: 2, low: 1 };

export function suggestEventLink(label: string, window: { start: string; end: string }, events: CalendarEvent[]): LinkSuggestion | null {
  const text = normalizeLabel(label);
  if (!text) return null;
  const near = events.filter((e) => isNearEvent(window, e));
  if (!near.length) return null;
  let best: LinkSuggestion | null = null;
  const consider = (e: CalendarEvent, confidence: LinkConfidence, alias: string) => {
    const range = formatDateRange(e.startDate, e.endDate);
    const win = formatDateRange(window.start, window.end);
    const cand: LinkSuggestion = {
      eventId: e.id,
      confidence,
      matchedAlias: alias,
      reason: {
        he: `הכותרת מכילה "${alias}" והקמפיין (${win.he}) חופף לחלון של ${e.name.he} (${range.he}).`,
        en: `The title contains "${alias}" and the campaign (${win.en}) overlaps the run-up to ${e.name.en} (${range.en}).`
      }
    };
    if (!best || RANK[cand.confidence] > RANK[best.confidence]) best = cand;
  };
  for (const e of near) {
    const a = ALIASES[e.key];
    const strong = a.strong.find((s) => text.includes(normalizeLabel(s)));
    if (strong) {
      consider(e, "high", strong);
      continue;
    }
    const weak = a.weak.find((s) => text.includes(normalizeLabel(s)));
    if (weak) consider(e, "medium", weak);
  }
  if (!best) {
    const generic = GENERIC_HOLIDAY_WORDS.find((w) => text.includes(w));
    if (generic) {
      // Only the nearest upcoming/active event; a generic word cannot pick between two.
      const nearest = [...near].sort((x, y) => x.startDate.localeCompare(y.startDate))[0];
      consider(nearest, "low", generic);
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Composition: calendar event → the initiatives around it → their decisions.

export interface LinkedInitiative {
  id: string;
  title: string; // the plan's own title, verbatim
  startDate: string; // CAMPAIGN dates — never substituted for the event's
  endDate: string;
  timeLabel: Localized; // "the campaign is active until …"
  linkState: LinkState;
  confidence: LinkConfidence | null; // null when confirmed
  linkReason: Localized; // confirmed: "linked by the operator"; suggested: the rule that fired
  relatedDecisionCount: number;
  openDecisionCount: number;
  openQuestion: Localized | null;
  openDecisionHref: string | null;
  decisionWindow: { start: string; end: string; question: Localized } | null; // the soonest hook window still open
}

export interface CommercialContextEvent {
  calendarEvent: CalendarEvent;
  state: EventState;
  daysUntil: number;
  daysLeft: number;
  timeLabel: Localized;
  dateRange: Localized;
  linkedInitiatives: LinkedInitiative[];
  // Calendar context affects TIMING only. Set when the event is imminent
  // (≤3 days) or active AND a CONFIRMED initiative still has an open
  // decision. It never creates a recommendation.
  decisionUrgency: Localized | null;
}

export function buildCommercialContext(
  initiatives: Initiative[],
  events: CalendarEvent[],
  confirmedLinks: ReadonlyMap<string, string>, // initiative id → calendar event id
  now: Date
): { events: CommercialContextEvent[]; linkedInitiativeIds: Set<string> } {
  const today = isoDay(now);
  const byEvent = new Map<string, LinkedInitiative[]>();
  const linkedIds = new Set<string>();
  for (const i of initiatives) {
    if (i.kind !== "move") continue;
    const confirmedId = confirmedLinks.get(i.id) ?? null;
    let eventId: string | null = null;
    let linkState: LinkState = "confirmed";
    let confidence: LinkConfidence | null = null;
    let linkReason: Localized = { he: "קושר על ידי המנהל", en: "Linked by the operator" };
    if (confirmedId && events.some((e) => e.id === confirmedId)) {
      eventId = confirmedId;
    } else {
      const s = suggestEventLink(`${i.title} ${i.anchor.label}`, { start: i.start, end: i.end }, events);
      if (!s) continue;
      eventId = s.eventId;
      linkState = "suggested";
      confidence = s.confidence;
      linkReason = s.reason;
    }
    const hook = (i.decisionHooks ?? [])
      .filter((h) => h.windowEnd >= today)
      .sort((a, b) => a.windowStart.localeCompare(b.windowStart))[0];
    const open = (i.relatedDecisions ?? []).filter((r) => r.state === "open");
    const li: LinkedInitiative = {
      id: i.id,
      title: i.title,
      startDate: i.start,
      endDate: i.end,
      timeLabel: initiativeTimeLabel(i.start, i.end, now),
      linkState,
      confidence,
      linkReason,
      relatedDecisionCount: (i.relatedDecisions ?? []).length,
      openDecisionCount: open.length,
      openQuestion: open[0]?.question ?? null,
      openDecisionHref: open[0] ? `/today/${open[0].id}` : null,
      decisionWindow: hook ? { start: hook.windowStart, end: hook.windowEnd, question: hook.question } : null
    };
    byEvent.set(eventId, [...(byEvent.get(eventId) ?? []), li]);
    linkedIds.add(i.id);
  }
  const out: CommercialContextEvent[] = events
    .filter((e) => e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((e) => {
      const st = eventState(e, now);
      const linked = (byEvent.get(e.id) ?? []).sort((a, b) => (a.linkState === b.linkState ? a.startDate.localeCompare(b.startDate) : a.linkState === "confirmed" ? -1 : 1));
      const imminent = st.state === "active" || st.state === "starts_today" || (st.state === "upcoming" && st.daysUntil <= 3);
      const pressing = linked.find((l) => l.linkState === "confirmed" && l.openDecisionCount > 0);
      const decisionUrgency: Localized | null =
        imminent && pressing
          ? {
              he: `חלון ההחלטה נסגר — ${e.name.he} ${eventTimeLabel(e, now).he.replace(/^מ/, "מ")}, ויש החלטה פתוחה על "${pressing.title}".`,
              en: `Decision window closing — ${e.name.en} ${eventTimeLabel(e, now).en.toLowerCase()}, and "${pressing.title}" still has an open decision.`
            }
          : null;
      return { calendarEvent: e, ...st, timeLabel: eventTimeLabel(e, now), dateRange: formatDateRange(e.startDate, e.endDate), linkedInitiatives: linked, decisionUrgency };
    });
  return { events: out, linkedInitiativeIds: linkedIds };
}
