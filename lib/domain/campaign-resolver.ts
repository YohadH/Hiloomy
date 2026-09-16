// Campaign Resolver — which Meta campaign probably serves this initiative,
// and how sure we are (docs/DECISION-INBOX-PLAN.md §0g, pass 2).
//
// Not binary. Every campaign that carries at least one CONTENT signal
// (a product link, the initiative's name, its coupon, a destination page or
// creative text that names it) is scored; timing and spend then corroborate
// or weaken. Output: a ranked list with a percentage and the reasons, a
// "likely" pick only when it stands clear of the rest, and the alternatives.
//
//   Likely: קמפיין סאטן אוגוסט 2026 — 62%
//     name contains "סאטן" · ₪19,950 in the window (largest) · destination
//     /collections/סאטן · started 24 days before the initiative
//   Alternative: Sateen Tailored web traffic v2 — 21%
//
// The score feeds the mapping tiers: high → provisional (used as an
// estimate, awaiting confirmation), otherwise a suggestion the manager can
// confirm. Timing + spend alone never qualify (an always-on retargeting
// campaign is not "the initiative's campaign" because it ran that month).
//
// Pure; tested in tests/unit/campaign-resolver.test.ts. Weights are V0 and
// named — not tuned, not learned.

import type { Localized } from "@/lib/domain/decision";
import { eventMentions, type HolidayKey } from "@/lib/domain/calendar-events";

const L = (he: string, en: string): Localized => ({ he, en });
const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export interface CampaignDaily {
  date: string; // YYYY-MM-DD
  spend: number;
  clicks: number;
}

export interface CampaignSignals {
  daily: CampaignDaily[]; // last ~60 days, one row per day the campaign reported
  destinationUrls: string[]; // ad destination pages (creativeObjectUrl), distinct
  creativeText: string; // titles + bodies of the campaign's ads, joined
}

export interface ResolverCampaign {
  id: string;
  name: string;
  linkedProductIds: string[]; // CampaignProductLink rows
  signals?: CampaignSignals | null;
}

export interface ResolverInitiative {
  title: string;
  anchorLabel: string;
  text: string;
  start: string;
  end: string;
  couponCode: string | null;
  // The initiative's mapped products (usable links): ids, titles, handles.
  products: Array<{ id: string; title: string; handle?: string | null }>;
  // The canonical calendar event this initiative is about (Sukkot), when
  // known. A campaign that names a DIFFERENT event is rejected outright —
  // "rosh Hasana 2026 - 15% off" is never a Sukkot candidate, whatever the
  // dates say. Detected from the anchor / title when not given.
  event?: { key: HolidayKey; name: Localized } | null;
  // Campaign ids the manager rejected for this initiative.
  rejectedIds?: string[];
}

export type ResolverConfidence = "high" | "medium" | "low";

export interface CampaignCandidate {
  id: string;
  name: string;
  score: number; // 0..1
  confidence: ResolverConfidence;
  reasons: Localized[];
  // The numbers behind the reasons.
  spendInWindow: number;
  clicksInWindow: number;
  firstDay: string | null;
  lastDay: string | null;
  contentSignals: number; // how many content signals fired
  // The campaign names the initiative's own calendar event — several such
  // campaigns can all belong to one holiday initiative.
  eventMatch: boolean;
}

export interface RejectedCampaign {
  id: string;
  name: string;
  reason: Localized; // "its name indicates Rosh Hashanah"
  by: "event_conflict" | "manager";
}

export interface CampaignResolution {
  likely: CampaignCandidate | null;
  alternatives: CampaignCandidate[]; // ranked, excluding `likely`
  // Candidates excluded WITH a reason — absence is information.
  rejected: RejectedCampaign[];
  considered: number; // campaigns that had any content signal
  total: number; // campaigns seen
  // The initiative's event, when the resolver reasoned about one.
  event: { key: HolidayKey; name: Localized } | null;
}

// ── V0 weights (named, not tuned) ────────────────────────────────────
export const W_PRODUCT_LINK = 0.35; // a real campaign–product link to a mapped product
export const W_NAME_ANCHOR = 0.3; // the initiative's anchor label appears in the campaign name
export const W_NAME_TOKEN = 0.2; // a specific token of the initiative name appears in the campaign name
export const W_NAME_TOKEN_EXTRA = 0.05; // a second token
export const W_EVENT_MATCH = 0.3; // the campaign names the initiative's own calendar event
export const W_DESTINATION = 0.25; // the ad's destination page names a mapped product or the initiative
export const W_COUPON = 0.2; // the initiative's coupon appears in the creative text
export const W_CREATIVE_TEXT = 0.1; // the creative text names the initiative / a mapped product
export const W_SPEND_SHARE = 0.15; // × share of the largest candidate's spend in the window
export const W_STARTED_NEAR = 0.1; // first active day within ±10 days of the initiative start
export const W_SPEND_IN_WINDOW = 0.05; // ≥ half of the campaign's recent spend falls inside the window
export const W_CLICK_SPIKE = 0.05; // clicks in the first 7 window days ≥ 1.5× the 7 days before
export const P_NO_SPEND = -0.3; // ran nothing inside the window — cannot be the demand engine
export const HIGH = 0.7;
export const MEDIUM = 0.45;
export const CLEAR_MARGIN = 0.1; // "likely" must beat the runner-up by this, unless it is high

// Hebrew ↔ English product-family terms that appear in bilingual campaign
// names ("קמפיין סאטן" vs "Sateen Tailored"). Explicit and small; a miss
// here only costs a suggestion, never a wrong number.
export const TERM_ALIASES: ReadonlyArray<readonly string[]> = [
  ["סאטן", "satin", "sateen"],
  ["במבוק", "bamboo"],
  ["כותנה", "cotton"],
  ["פשתן", "linen"],
  ["מצעים", "bedding"],
  ["כרית", "כריות", "pillow", "pillows"],
  ["שמיכה", "שמיכות", "blanket", "duvet", "comforter"],
  ["ציפה", "ציפות", "duvet cover"],
  ["מגבת", "מגבות", "towel", "towels"],
  ["חלוק", "חלוקים", "robe", "robes"],
  ["תינוק", "תינוקות", "baby"],
  ["ילדים", "kids", "children"],
  ["בושם", "בשמים", "perfume", "parfum", "fragrance"],
  ["נר", "נרות", "candle", "candles"]
];

const GENERIC = new Set(["campaign", "launch", "sale", "promo", "promotion", "meta", "facebook", "instagram", "september", "october", "november", "december", "adset", "budget", "traffic", "web", "conversion", "conversions", "retargeting", "prospecting", "קמפיין", "השקה", "מבצע", "מכירה", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר", "אוגוסט", "august", "2025", "2026", "2027"]);

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[״"'׳`’‘]/g, "")
    .replace(/[-_/|·•+,.()[\]{}!?:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokensOf = (s: string) => normalize(s).split(" ").filter((w) => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w));

// Expand a token to its alias family, so "סאטן" also matches "sateen".
const expand = (tok: string): string[] => {
  const fam = TERM_ALIASES.find((f) => f.some((t) => t === tok || (t.length >= 4 && tok.includes(t))));
  return fam ? [tok, ...fam] : [tok];
};

const containsAny = (haystack: string, needles: string[]) => needles.find((n) => n.length >= 3 && haystack.includes(n)) ?? null;

// The words in a URL path, decoded ("%D7%A1%D7%90%D7%98%D7%9F-1" → "סאטן 1").
export function urlWords(url: string): string {
  try {
    const u = new URL(url);
    return normalize(decodeURIComponent(u.pathname).replace(/\+/g, " "));
  } catch {
    return normalize(url);
  }
}

export function resolveCampaigns(initiative: ResolverInitiative, campaigns: ResolverCampaign[]): CampaignResolution {
  const start = initiative.start;
  const end = initiative.end;
  const mapped = new Map(initiative.products.map((p) => [p.id, p]));
  const initiativeTokens = [...new Set([...tokensOf(initiative.anchorLabel), ...tokensOf(initiative.title)])];
  const anchor = normalize(initiative.anchorLabel);
  const productTokens = [...new Set(initiative.products.flatMap((p) => tokensOf(p.title)))];
  const handles = initiative.products.map((p) => (p.handle ?? "").toLowerCase()).filter((h) => h.length >= 3);
  const coupon = initiative.couponCode ? normalize(initiative.couponCode) : null;
  // Event semantics: the initiative's own event (given, or read from its
  // anchor / title), and the events each campaign name mentions.
  const ownEvent = initiative.event ?? (() => {
    const m = eventMentions(`${initiative.anchorLabel} ${initiative.title}`).find((x) => x.strength === "strong");
    return m ? { key: m.key, name: m.name } : null;
  })();
  const rejectedIds = new Set(initiative.rejectedIds ?? []);
  const rejected: RejectedCampaign[] = [];

  type Scored = CampaignCandidate & { spendShareBase: number };
  const scored: Scored[] = [];
  for (const c of campaigns) {
    if (rejectedIds.has(c.id)) {
      rejected.push({ id: c.id, name: c.name, reason: L("נדחה על ידי המנהל", "rejected by the manager"), by: "manager" });
      continue;
    }
    const reasons: Localized[] = [];
    let s = 0;
    let content = 0;
    const name = normalize(c.name);
    // A campaign that names ANOTHER calendar event is not this initiative's
    // campaign, however close the dates. Rejected, with the reason.
    const mentions = eventMentions(`${c.name} ${c.signals?.creativeText?.slice(0, 400) ?? ""}`);
    const strongMentions = mentions.filter((m) => m.strength === "strong");
    const nameMentions = eventMentions(c.name).filter((m) => m.strength === "strong");
    let eventMatch = false;
    if (ownEvent) {
      const other = strongMentions.find((m) => m.key !== ownEvent.key);
      const own = strongMentions.find((m) => m.key === ownEvent.key);
      if (other && !own) {
        rejected.push({
          id: c.id,
          name: c.name,
          reason: nameMentions.some((m) => m.key === other.key)
            ? L(`נדחה כמועמד ל${ownEvent.name.he}: השם ("${other.alias}") מצביע על ${other.name.he}`, `rejected as a ${ownEvent.name.en} candidate because its name ("${other.alias}") indicates ${other.name.en}`)
            : L(`נדחה כמועמד ל${ownEvent.name.he}: טקסט המודעות ("${other.alias}") מצביע על ${other.name.he}`, `rejected as a ${ownEvent.name.en} candidate because its ad copy ("${other.alias}") indicates ${other.name.en}`),
          by: "event_conflict"
        });
        continue;
      }
      if (own) {
        s += W_EVENT_MATCH;
        content += 1;
        eventMatch = true;
        reasons.push(L(`שם הקמפיין מציין ${ownEvent.name.he} ("${own.alias}")`, `the campaign name names ${ownEvent.name.en} ("${own.alias}")`));
      }
    }

    // ── Content signals ─────────────────────────────────────────────
    const viaLink = c.linkedProductIds.find((id) => mapped.has(id));
    if (viaLink) {
      s += W_PRODUCT_LINK;
      content += 1;
      reasons.push(L(`מקושר ל"${mapped.get(viaLink)!.title}" בקישורי קמפיין–מוצר`, `linked to "${mapped.get(viaLink)!.title}" through campaign–product links`));
    }
    if (anchor.length >= 3 && name.includes(anchor)) {
      s += W_NAME_ANCHOR;
      content += 1;
      reasons.push(L(`שם הקמפיין מכיל "${initiative.anchorLabel}"`, `the campaign name contains "${initiative.anchorLabel}"`));
    } else {
      const hits = initiativeTokens.filter((tk) => containsAny(name, expand(tk)));
      if (hits.length) {
        s += W_NAME_TOKEN + (hits.length > 1 ? W_NAME_TOKEN_EXTRA : 0);
        content += 1;
        reasons.push(L(`שם הקמפיין מכיל "${hits.slice(0, 2).join('", "')}"`, `the campaign name contains "${hits.slice(0, 2).join('", "')}"`));
      }
    }
    const sig = c.signals ?? null;
    if (sig?.destinationUrls.length) {
      let matched: { url: string; on: string } | null = null;
      for (const url of sig.destinationUrls) {
        const words = urlWords(url);
        const h = handles.find((hd) => words.includes(hd.replace(/-/g, " ")) || url.toLowerCase().includes(`/products/${hd}`));
        const tk = h ? null : [...initiativeTokens, ...productTokens].find((t) => containsAny(words, expand(t)));
        if (h || tk) {
          matched = { url, on: h ?? tk! };
          break;
        }
      }
      if (matched) {
        s += W_DESTINATION;
        content += 1;
        let path = matched.url;
        try {
          path = decodeURIComponent(new URL(matched.url).pathname);
        } catch {
          /* keep raw */
        }
        reasons.push(L(`דף הנחיתה של המודעות: ${path} (תואם "${matched.on}")`, `the ads land on ${path} (matches "${matched.on}")`));
      }
    }
    if (sig?.creativeText) {
      const text = normalize(sig.creativeText);
      if (coupon && text.includes(coupon)) {
        s += W_COUPON;
        content += 1;
        reasons.push(L(`הקופון ${initiative.couponCode} מופיע במודעות`, `coupon ${initiative.couponCode} appears in the ads`));
      }
      const tk = [...initiativeTokens, ...productTokens].find((t) => containsAny(text, expand(t)));
      if (tk) {
        s += W_CREATIVE_TEXT;
        content += 1;
        reasons.push(L(`טקסט המודעות מזכיר "${tk}"`, `the ad copy mentions "${tk}"`));
      }
    }
    if (content === 0) continue; // timing and spend alone never qualify

    // ── Timing and spend ────────────────────────────────────────────
    const daily = sig?.daily ?? [];
    const inWindow = daily.filter((d) => d.date >= start && d.date <= end);
    const spendInWindow = inWindow.reduce((n, d) => n + d.spend, 0);
    const clicksInWindow = inWindow.reduce((n, d) => n + d.clicks, 0);
    const spendTotal = daily.reduce((n, d) => n + d.spend, 0);
    const active = daily.filter((d) => d.spend > 0).map((d) => d.date).sort();
    const firstDay = active[0] ?? null;
    const lastDay = active[active.length - 1] ?? null;
    if (daily.length) {
      if (spendInWindow <= 0) {
        s += P_NO_SPEND;
        reasons.push(L("לא הוציא תקציב בחלון היוזמה", "spent nothing inside the initiative window"));
      } else {
        if (firstDay && Math.abs(daysBetween(start, firstDay)) <= 10) {
          s += W_STARTED_NEAR;
          const d = daysBetween(firstDay, start);
          reasons.push(L(d === 0 ? "התחיל ביום תחילת היוזמה" : d > 0 ? `התחיל ${d} ימים לפני היוזמה` : `התחיל ${-d} ימים אחרי תחילת היוזמה`, d === 0 ? "started on the initiative's first day" : d > 0 ? `started ${d} days before the initiative` : `started ${-d} days after the initiative began`));
        } else if (firstDay && firstDay < start) {
          reasons.push(L(`רץ מ-${firstDay}, לפני היוזמה`, `running since ${firstDay}, before the initiative`));
        }
        if (spendTotal > 0 && spendInWindow / spendTotal >= 0.5) s += W_SPEND_IN_WINDOW;
        const first7 = daily.filter((d) => d.date >= start && d.date < addDays(start, 7)).reduce((n, d) => n + d.clicks, 0);
        const before7 = daily.filter((d) => d.date >= addDays(start, -7) && d.date < start).reduce((n, d) => n + d.clicks, 0);
        if (first7 >= 50 && first7 >= before7 * 1.5) {
          s += W_CLICK_SPIKE;
          reasons.push(L(`קפיצת קליקים עם תחילת היוזמה (${first7} מול ${before7} בשבוע שלפני)`, `click spike as the initiative began (${first7} vs ${before7} the week before)`));
        }
      }
    }
    scored.push({ id: c.id, name: c.name, score: s, confidence: "low", reasons, spendInWindow, clicksInWindow, firstDay, lastDay, contentSignals: content, eventMatch, spendShareBase: spendInWindow });
  }

  // Spend share is relative to the largest listed candidate — ₪19,950 vs ₪731
  // is the difference between the engine and a side test.
  const maxSpend = Math.max(0, ...scored.map((x) => x.spendShareBase));
  for (const x of scored) {
    if (maxSpend > 0 && x.spendInWindow > 0) {
      const share = x.spendInWindow / maxSpend;
      x.score += W_SPEND_SHARE * share;
      x.reasons.push(share >= 0.999 ? L(`${ils(x.spendInWindow)} בחלון — ההוצאה הגדולה ביותר מבין המועמדים`, `${ils(x.spendInWindow)} in the window — the largest spend among the candidates`) : L(`${ils(x.spendInWindow)} בחלון (${Math.round(share * 100)}% מהמועמד הגדול)`, `${ils(x.spendInWindow)} in the window (${Math.round(share * 100)}% of the largest candidate)`));
    }
    x.score = Math.max(0, Math.min(1, x.score));
    x.confidence = x.score >= HIGH ? "high" : x.score >= MEDIUM ? "medium" : "low";
  }
  scored.sort((a, b) => b.score - a.score || b.spendInWindow - a.spendInWindow);
  const strip = ({ spendShareBase: _b, ...rest }: Scored): CampaignCandidate => rest;
  const ranked = scored.map(strip);
  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const clear = !!top && top.score >= MEDIUM && (top.score >= HIGH || !second || top.score - second.score >= CLEAR_MARGIN);
  const likely = clear ? top : null;
  return { likely, alternatives: (likely ? ranked.slice(1) : ranked).slice(0, 3), rejected, considered: ranked.length, total: campaigns.length, event: ownEvent };
}

export const pct = (score: number) => `${Math.round(score * 100)}%`;
