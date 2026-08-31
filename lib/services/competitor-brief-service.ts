import { isSafeScrapedText, safeScrapedText, safeScrapedTexts } from "@/lib/server/scraped-text-safety";
// Competitor brief — the Command Center's "מתחרים" section.
//
// Takes the latest competitor-intel snapshot (lib/data/competitor-intel-latest)
// and asks the BI agent for a prescriptive brief: what to do on the site
// TODAY and THIS WEEK given what competitors are doing. The agent's answer is
// cached in SystemConfig for 24h per intel version so the dashboard doesn't
// pay the tunnel round-trip on every load.
//
// Degrades gracefully: when the BI agent is unconfigured or unreachable
// (e.g. local dev with the tunnel down), the section falls back to the
// intel snapshot's own pre-written action list — labeled `source: "fallback"`
// so the UI can say where the advice came from.

import { getDb } from "@/lib/server/db";
import { askBiAgentJson, isBiAgentConfigured } from "@/lib/clients/bi-agent-client";
import { askOpenAiJson, isOpenAiConfigured } from "@/lib/clients/openai-json-client";
import { anthropicChatJson } from "@/lib/clients/anthropic-client";
import { fetchCompetitorActivity, type CompetitorActivityEntry } from "@/lib/clients/rivalsweeper-client";
import { normalizeDomain } from "@/lib/services/competitor-intel-service";
import {
  COMPETITOR_INTEL_LATEST,
  type CompetitorIntel
} from "@/lib/data/competitor-intel-latest";

// A single prescribed action, structured for clarity: the WHAT stays a
// short clean imperative; the numbers and reasoning live in `why`; `how`
// says where/how to actually do it; `target` is the measurable goal.
export interface BriefAction {
  action: string;
  why?: string | null;
  how?: string | null;
  target?: string | null;
}

export interface CompetitorBrief {
  intelVersion: string;
  generatedAt: string;
  source: "bi-agent" | "fallback";
  competitors: CompetitorIntel["competitors"];
  influencerNote: string;
  today: BriefAction[];
  thisWeek: BriefAction[];
}

const CACHE_KEY_PREFIX = "competitor_brief:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// The local gateway runs a full `claude -p` turn — real analyses with live
// store facts can take minutes. The dashboard NEVER waits: on a cache miss
// the BI call runs in the background (fire-and-cache) and this render
// serves the fallback; the next load reads the cached BI answer.
const BI_TIMEOUT_MS = 300_000;

interface BiBriefAnswer {
  today: BriefAction[];
  thisWeek: BriefAction[];
}

function isValidAction(a: unknown): a is BriefAction {
  return (
    typeof a === "object" &&
    a !== null &&
    typeof (a as BriefAction).action === "string" &&
    (a as BriefAction).action.trim().length > 0
  );
}

function isValidAnswer(answer: BiBriefAnswer | null | undefined): answer is BiBriefAnswer {
  return (
    Array.isArray(answer?.today) &&
    Array.isArray(answer?.thisWeek) &&
    answer.today.length > 0 &&
    answer.today.every(isValidAction) &&
    answer.thisWeek.every(isValidAction)
  );
}

// One background generation at a time per process.
let biRefreshInFlight = false;

// Direct-API fallback availability — the tunnel is optional when the
// deployment carries an Anthropic key.
function isAnthropicDirectAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ── Live intel (RivalSweeper snapshots, per store) ──────────────────────
//
// Replaces the static research file with the store's OWN competitor set +
// the latest CompetitorSnapshot rows the 2-hour refresh cron upserts via
// syncCompetitorSignals. The static COMPETITOR_INTEL_LATEST remains only
// as a legacy fallback for calls without a storeId.

// Activity-based intel — the pre-snapshot fallback. Built from the live
// RivalSweeper activity feed (ad library, homepage top links, news), which
// fills days before the promo/coupon analyses that power snapshots.
//
// TENANCY GUARD: fetchCompetitorActivity is COMPANY-scoped (every domain
// the RivalSweeper account monitors, across all stores) — so we keep only
// the domains in THIS store's own competitor set before rendering.
// Render one competitor entry from the LIVE activity feed (ads / homepage /
// news). Shared by buildActivityIntel and buildLiveIntel's no-snapshot
// branch, so a competitor without a stored snapshot still appears in the
// dashboard's competitor set — matching the weekly report (owner: "why isn't
// it aligned with the weekly report?"). `a` null = monitored but not crawled.
function renderActivityEntry(
  competitor: { name: string; domain: string },
  a: CompetitorActivityEntry | undefined,
  isHe: boolean
): CompetitorIntel["competitors"][number] {
  const t = (he: string, en: string) => (isHe ? he : en);
  const moveParts: string[] = [];
  if (a) {
    if (a.adsActive !== null && a.adsActive > 0) {
      moveParts.push(t(`כ־${a.adsActive} מודעות פעילות בספריית המודעות`, `~${a.adsActive} active ads in the ad library`));
    }
    // Scraped ad copy is unfiltered upstream — never quote it unscreened
    // (explicit adult copy reached the Command Center; see scraped-text-safety).
    const topHeadline = safeScrapedTexts(a.adHeadlines)[0];
    if (topHeadline) {
      moveParts.push(t(`מסר מוביל: "${topHeadline}"`, `Top ad message: "${topHeadline}"`));
    }
    if (a.homepageLinks.length > 0) {
      moveParts.push(
        t(`בדף הבית: ${a.homepageLinks.slice(0, 3).join(", ")}`, `Homepage highlights: ${a.homepageLinks.slice(0, 3).join(", ")}`)
      );
    }
    if (a.news.length > 0) {
      moveParts.push(t(`בחדשות: "${a.news[0].title}"`, `In the news: "${a.news[0].title}"`));
    }
  }
  if (moveParts.length === 0) {
    moveParts.push(t("במעקב — הסריקה הראשונה עדיין לא הסתיימה", "Monitored — first crawl not finished yet"));
  }
  return {
    name: competitor.name,
    tier: "tracked",
    move: moveParts.join(" · "),
    implication: t(
      "נתוני פעילות חיים (מודעות, דף בית, חדשות). ניתוח מבצעים והנחות יתווסף כשסריקות המבצעים של הספק יבשילו.",
      "Live activity data (ads, homepage, news). Promo/discount analysis arrives once the provider's promo scans mature."
    )
  };
}

async function buildActivityIntel(
  competitors: Array<{ id: string; name: string; domain: string }>,
  locale: "he" | "en"
): Promise<CompetitorIntel | null> {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);

  const activity = await fetchCompetitorActivity({ timeoutMs: 12_000 }).catch(() => null);
  if (!activity || activity.length === 0) return null;

  const byDomain = new Map(activity.map((a) => [normalizeDomain(a.domain), a]));
  const entries: CompetitorIntel["competitors"] = [];
  for (const competitor of competitors) {
    const a = byDomain.get(normalizeDomain(competitor.domain));
    if (!a) continue;
    entries.push(renderActivityEntry(competitor, a, isHe));
  }
  if (entries.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  return {
    version: `live-activity-${today}-${locale}`,
    generatedAt: today,
    storeContext: "",
    competitors: entries,
    influencerNote: "",
    suggestedActions: {
      today: [
        t(
          "לסקור את המסרים הפרסומיים של המתחרים ולוודא שהבידול שלכם עדיין ברור מולם.",
          "Scan the competitors' ad messages and make sure your differentiation still stands out."
        )
      ],
      thisWeek: [
        t(
          "לעקוב אחרי שינויים בדפי הבית של המתחרים — קטגוריה חדשה בתפריט היא לרוב סימן להשקה.",
          "Watch competitor homepage changes — a new menu category usually signals a launch."
        )
      ]
    }
  };
}

// Activity payload the sync cron embeds in CompetitorSnapshot.signalsJson
// (ad-library volume, top ad messages, homepage links, news). Parsed
// defensively — old snapshots simply don't have it.
interface SnapshotActivity {
  adsActive: number | null;
  adHeadlines: string[];
  homepageLinks: string[];
  news: Array<{ title: string; source: string; date: string }>;
}

function activityFromSignals(signalsJson: unknown): SnapshotActivity | null {
  if (typeof signalsJson !== "object" || signalsJson === null) return null;
  const a = (signalsJson as Record<string, unknown>).activity;
  if (typeof a !== "object" || a === null) return null;
  const o = a as Record<string, unknown>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  return {
    adsActive: typeof o.adsActive === "number" && Number.isFinite(o.adsActive) ? o.adsActive : null,
    // Screened at READ time as well as at write time, so snapshots stored
    // before the filter existed can't resurface explicit copy.
    adHeadlines: safeScrapedTexts(strings(o.adHeadlines)),
    homepageLinks: strings(o.homepageLinks),
    news: Array.isArray(o.news)
      ? (o.news as Array<Record<string, unknown>>)
          .filter((n) => n && typeof n.title === "string" && n.title.trim() !== "" && isSafeScrapedText(n.title))
          .map((n) => ({
            title: String(n.title),
            source: typeof n.source === "string" ? n.source : "",
            date: typeof n.date === "string" ? n.date : ""
          }))
      : []
  };
}

async function buildLiveIntel(
  storeId: string,
  locale: "he" | "en"
): Promise<CompetitorIntel | null> {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const db = getDb() as any;
  if (!db?.competitor || !db?.competitorSnapshot) return null;

  const competitors = (await db.competitor.findMany({
    where: { storeId, status: "active" },
    select: { id: true, name: true, domain: true }
  })) as Array<{ id: string; name: string; domain: string }>;
  if (competitors.length === 0) return null;

  const since = new Date(Date.now() - 14 * 86_400_000);
  const snaps = (await db.competitorSnapshot.findMany({
    where: { storeId, snapshotDate: { gte: since } },
    orderBy: { snapshotDate: "desc" },
    select: {
      competitorId: true,
      snapshotDate: true,
      source: true,
      activePromoCount: true,
      maxDiscountPct: true,
      freeShippingThreshold: true,
      homepageMessage: true,
      signalsJson: true
    }
  })) as Array<{
    competitorId: string;
    snapshotDate: Date;
    source: string;
    activePromoCount: number;
    maxDiscountPct: unknown;
    freeShippingThreshold: unknown;
    homepageMessage: string | null;
    signalsJson: unknown;
  }>;
  // No promo snapshots yet (the provider's promo analyses fill later than
  // its raw crawl) — fall back to live activity data (ads / homepage links
  // / news) so the section shows real intelligence instead of hiding.
  if (snaps.length === 0) return buildActivityIntel(competitors, locale);

  const num = (v: unknown) => (v == null ? null : Number(v));
  const nf = new Intl.NumberFormat(isHe ? "he-IL" : "en-US");
  const byCompetitor = new Map<string, typeof snaps>();
  for (const s of snaps) {
    const list = byCompetitor.get(s.competitorId) ?? [];
    list.push(s);
    byCompetitor.set(s.competitorId, list);
  }

  // Live activity for competitors with NO stored snapshot yet, so the
  // dashboard lists the SAME full competitor set as the weekly report
  // instead of hiding the ones the promo crawler hasn't snapshotted (owner:
  // dashboard showed 2, weekly report showed 5). Only fetched when at least
  // one active competitor lacks a snapshot — no needless API call otherwise.
  const missingSnapshot = competitors.some((c) => !byCompetitor.has(c.id));
  const liveActivity = missingSnapshot
    ? await fetchCompetitorActivity({ timeoutMs: 12_000 }).catch(() => null)
    : null;
  const activityByDomain = new Map((liveActivity ?? []).map((a) => [normalizeDomain(a.domain), a]));

  let latestDate = "";
  const entries: CompetitorIntel["competitors"] = [];
  const todayActions: string[] = [];
  const weekActions: string[] = [];

  for (const competitor of competitors) {
    const rows = byCompetitor.get(competitor.id) ?? [];
    if (rows.length === 0) {
      // No snapshot — show the competitor from its live activity (or a
      // "monitored, not crawled yet" note) rather than dropping it.
      entries.push(renderActivityEntry(competitor, activityByDomain.get(normalizeDomain(competitor.domain)), isHe));
      continue;
    }
    const latest = rows[0];
    const prev = rows.find(
      (r) => r.snapshotDate.getTime() !== latest.snapshotDate.getTime()
    );
    const dateStr = latest.snapshotDate.toISOString().slice(0, 10);
    if (dateStr > latestDate) latestDate = dateStr;

    const pct = num(latest.maxDiscountPct);
    const ship = num(latest.freeShippingThreshold);
    const activity = activityFromSignals(latest.signalsJson);
    // Ads-derived snapshots measure the competitor's ADS, not their site —
    // "no promos on site" would be a claim the data doesn't make.
    const fromAds = latest.source === "rivalsweeper-ads";
    const moveParts: string[] = [];
    moveParts.push(
      latest.activePromoCount > 0
        ? fromAds
          ? t(`${latest.activePromoCount} מודעות עם מבצע או הנחה`, `${latest.activePromoCount} ads carrying a promo or discount`)
          : t(`${latest.activePromoCount} מבצעים פעילים באתר`, `${latest.activePromoCount} active promos on site`)
        : fromAds
          ? t("לא זוהו מבצעים או הנחות במודעות שלהם", "No promos or discounts detected in their ads")
          : t("אין מבצעים פעילים באתר", "No active promos on site")
    );
    if (pct != null && pct > 0) moveParts.push(t(`הנחה עד ${Math.round(pct)}%`, `Discounts up to ${Math.round(pct)}%`));
    if (ship != null && ship > 0) moveParts.push(t(`משלוח חינם מעל ₪${Math.round(ship)}`, `Free shipping over ₪${Math.round(ship)}`));
    const homepageMessage = safeScrapedText(latest.homepageMessage);
    if (homepageMessage) moveParts.push(t(`בעמוד הבית: "${homepageMessage}"`, `Homepage: "${homepageMessage}"`));
    if (activity) {
      if (activity.adsActive != null && activity.adsActive > 0) {
        moveParts.push(
          t(
            `מריצים כ־${nf.format(activity.adsActive)} מודעות בספריית המודעות`,
            `Running ~${nf.format(activity.adsActive)} ads in the ad library`
          )
        );
      }
      if (activity.adHeadlines.length > 0) {
        moveParts.push(
          t(`המסר המוביל במודעות: "${activity.adHeadlines[0]}"`, `Top ad message: "${activity.adHeadlines[0]}"`)
        );
      }
      if (activity.homepageLinks.length > 0) {
        // Join with commas, not "·" — the UI splits the move line on "·".
        moveParts.push(
          t(
            `מקדמים בדף הבית: ${activity.homepageLinks.slice(0, 3).join(", ")}`,
            `Pushing on their homepage: ${activity.homepageLinks.slice(0, 3).join(", ")}`
          )
        );
      }
      if (activity.news.length > 0) {
        moveParts.push(t(`בחדשות: "${activity.news[0].title}"`, `In the news: "${activity.news[0].title}"`));
      }
    }

    // Week-over-week read: this is where the intel becomes an action.
    let implication = t("ללא שינוי מהותי מול הבדיקה הקודמת.", "No material change since the previous check.");
    const prevPromos = prev?.activePromoCount ?? null;
    const prevPct = prev ? num(prev.maxDiscountPct) : null;
    if (prev && prevPromos === 0 && latest.activePromoCount > 0) {
      implication = t(
        "פתחו מבצע חדש מאז הבדיקה הקודמת — שווה לבדוק אם הוא נוגע בקטגוריות שלכם.",
        "Opened a new promo since the previous check — worth verifying it doesn't touch your categories."
      );
      todayActions.push(
        t(
          `לבדוק את המבצע החדש אצל ${competitor.name} (${competitor.domain}) ולוודא שאין התנגשות עם התמחור שלכם.`,
          `Review the new promo at ${competitor.name} (${competitor.domain}) and make sure it doesn't clash with your pricing.`
        )
      );
    } else if (prev && prevPct != null && pct != null && pct > prevPct) {
      implication = t(
        `העמיקו את ההנחה (מ־${Math.round(prevPct)}% ל־${Math.round(pct)}%) — לחץ מחיר מתגבר.`,
        `Deepened the discount (${Math.round(prevPct)}% → ${Math.round(pct)}%) — price pressure is building.`
      );
      todayActions.push(
        t(
          `${competitor.name} העמיקו הנחה ל־${Math.round(pct)}% — לא להגיב במחיר לפני בדיקת המרווח.`,
          `${competitor.name} deepened their discount to ${Math.round(pct)}% — don't respond on price before checking your margin.`
        )
      );
    } else if (latest.activePromoCount > 0) {
      implication = t("מריצים מבצע פעיל — לעקוב אם הוא הופך לקבוע.", "Running an active promo — watch whether it becomes permanent.");
    } else if (activity && activity.adsActive != null && activity.adsActive > 0) {
      implication = t(
        "מפרסמים בתקציב אמיתי בלי הנחות — המסר שלהם הוא המותג והמוצר. לוודא שהבידול שלכם מולם ברור.",
        "Advertising with real budget and no discounts — their message is brand and product. Make sure your differentiation against them is clear."
      );
    }

    entries.push({
      name: competitor.name,
      tier: "tracked",
      move: moveParts.join(" · "),
      implication,
      lastChecked: dateStr
    });
  }
  if (entries.length === 0) return null;

  if (todayActions.length === 0) {
    todayActions.push(
      t(
        "לעבור על הודעות עמוד הבית של המתחרים ולוודא שההצעה שלכם עדיין בולטת.",
        "Scan competitor homepage messages and make sure your own offer still stands out."
      )
    );
  }
  weekActions.push(
    t(
      "להשוות את רצפת ההנחות שלכם מול ההנחה המקסימלית שנצפתה אצל המתחרים השבוע.",
      "Compare your discount floor against the deepest competitor discount observed this week."
    ),
    t(
      "לסמן מבצע מתחרה אחד שנמשך מעל שבועיים — כנראה הפך לקבוע ושווה תגובה מתוכננת.",
      "Flag one competitor promo running for over two weeks — it's probably permanent and deserves a planned response."
    )
  );

  return {
    version: `live-${latestDate}-${locale}`,
    generatedAt: latestDate,
    storeContext: "",
    competitors: entries,
    influencerNote: "",
    suggestedActions: { today: todayActions, thisWeek: weekActions }
  };
}

export async function getCompetitorBrief(
  storeId?: string,
  locale: "he" | "en" = "he"
): Promise<CompetitorBrief | null> {
  // Per-store live intel first (refreshed by the 2-hour sync cron); the
  // static research file only serves legacy storeless calls. A store with
  // no competitor set (or no snapshots yet) gets NULL — the dashboard
  // hides the section rather than showing another brand's intel.
  const live = storeId ? await buildLiveIntel(storeId, locale).catch(() => null) : null;
  const intel = live ?? (storeId ? null : COMPETITOR_INTEL_LATEST);
  if (!intel) return null;
  const base: Omit<CompetitorBrief, "source" | "today" | "thisWeek"> = {
    intelVersion: intel.version,
    generatedAt: intel.generatedAt,
    competitors: intel.competitors,
    influencerNote: intel.influencerNote
  };

  // Fresh cached BI answer?
  const cached = await readCache(cacheKey(intel.version, storeId));
  if (cached) {
    return { ...base, source: "bi-agent", today: cached.today, thisWeek: cached.thisWeek };
  }

  // Cache miss: kick a background BI generation (fire-and-cache, never
  // blocks this render) and serve the fallback meanwhile.
  //
  // Provider order (see generateBiBrief): OpenAI first — the provider
  // actually wired on this deployment — then the self-hosted tunnel, then
  // Anthropic. The gate fires if ANY of the three is available, so an
  // OpenAI-only deployment (the current one) generates a real brief instead
  // of being stuck on the generic fallback tips forever.
  if (
    (isOpenAiConfigured() || isBiAgentConfigured() || isAnthropicDirectAvailable()) &&
    !biRefreshInFlight
  ) {
    biRefreshInFlight = true;
    void generateBiBrief(intel, storeId, locale)
      .catch((err) =>
        console.warn(
          "[competitor-brief] background BI generation failed:",
          err instanceof Error ? err.message : err
        )
      )
      .finally(() => {
        biRefreshInFlight = false;
      });
  }

  return {
    ...base,
    source: "fallback",
    today: intel.suggestedActions.today.map((s) => ({ action: s })),
    thisWeek: intel.suggestedActions.thisWeek.map((s) => ({ action: s }))
  };
}

// BLOCKING variant for the client-side loader: awaits BI generation (or
// serves the cache) instead of fire-and-cache, so the dashboard can show a
// spinner and swap in the real analysis when it lands — the same UX as the
// Meta campaigns insight, rather than the static "BI unavailable" banner.
export interface CompetitorBriefActions {
  source: "bi-agent" | "fallback";
  today: BriefAction[];
  thisWeek: BriefAction[];
  generatedAt: string;
}

export async function getCompetitorBriefBlocking(
  storeId?: string,
  locale: "he" | "en" = "he"
): Promise<CompetitorBriefActions | null> {
  const live = storeId ? await buildLiveIntel(storeId, locale).catch(() => null) : null;
  const intel = live ?? (storeId ? null : COMPETITOR_INTEL_LATEST);
  if (!intel) return null;

  const fallback = (): CompetitorBriefActions => ({
    source: "fallback",
    today: intel.suggestedActions.today.map((s) => ({ action: s })),
    thisWeek: intel.suggestedActions.thisWeek.map((s) => ({ action: s })),
    generatedAt: intel.generatedAt
  });

  const cached = await readCache(cacheKey(intel.version, storeId));
  if (cached) {
    return { source: "bi-agent", today: cached.today, thisWeek: cached.thisWeek, generatedAt: intel.generatedAt };
  }
  if (isOpenAiConfigured() || isBiAgentConfigured() || isAnthropicDirectAvailable()) {
    const answer = await generateBiBrief(intel, storeId, locale).catch(() => null);
    if (isValidAnswer(answer)) {
      return { source: "bi-agent", today: answer.today, thisWeek: answer.thisWeek, generatedAt: intel.generatedAt };
    }
  }
  return fallback();
}

function cacheKey(version: string, storeId?: string): string {
  return `${version}:${storeId ?? "org"}`;
}

// ── Live store facts — the difference between consultant fluff and a
// decision. Pulled fresh from the DB on every generation so the agent's
// actions can name actual products, campaigns and numbers.
async function buildLiveFacts(storeId: string): Promise<string> {
  const db = getDb();
  const now = new Date();
  const curStart = new Date(now.getTime() - 30 * 86_400_000);
  const prevStart = new Date(now.getTime() - 60 * 86_400_000);
  const facts: string[] = [];

  try {
    // Product movers: revenue by title, current vs previous 30d.
    const lineWhere = (gte: Date, lte: Date) => ({
      storeId,
      order: { processedAt: { gte, lte }, cancelledAt: null, test: false }
    });
    const [curRows, prevRows] = await Promise.all([
      db.orderLineItem.findMany({
        where: lineWhere(curStart, now),
        select: { title: true, lineSubtotal: true }
      }),
      db.orderLineItem.findMany({
        where: lineWhere(prevStart, curStart),
        select: { title: true, lineSubtotal: true }
      })
    ]);
    const sumBy = (rows: Array<{ title: string | null; lineSubtotal: unknown }>) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const t = (r.title ?? "?").trim();
        m.set(t, (m.get(t) ?? 0) + Number(r.lineSubtotal ?? 0));
      }
      return m;
    };
    const cur = sumBy(curRows);
    const prev = sumBy(prevRows);
    const titles = new Set([...cur.keys(), ...prev.keys()]);
    const deltas = [...titles]
      .map((t) => ({ t, cur: Math.round(cur.get(t) ?? 0), delta: Math.round((cur.get(t) ?? 0) - (prev.get(t) ?? 0)) }))
      .sort((a, b) => b.delta - a.delta);
    const gainers = deltas.slice(0, 3).filter((d) => d.delta > 0);
    const losers = deltas.slice(-3).filter((d) => d.delta < 0).reverse();
    if (gainers.length) {
      facts.push(
        `מוצרים עולים (30 יום מול 30 הקודמים): ` +
          gainers.map((g) => `"${g.t}" (הכנסה ₪${g.cur.toLocaleString()}, שינוי +₪${g.delta.toLocaleString()})`).join(" · ")
      );
    }
    if (losers.length) {
      facts.push(
        `מוצרים צונחים: ` +
          losers.map((l) => `"${l.t}" (הכנסה ₪${l.cur.toLocaleString()}, שינוי -₪${Math.abs(l.delta).toLocaleString()})`).join(" · ")
      );
    }
  } catch { /* facts are best-effort */ }

  try {
    // Meta campaigns, last 14d: top spender + best/worst ROAS (campaign level).
    const rows = (await db.metaAdsCampaignInsight.findMany({
      where: { storeId, dateStart: { gte: new Date(now.getTime() - 14 * 86_400_000) }, level: "campaign" },
      select: { campaignName: true, spend: true, purchaseRoas: true }
    })) as Array<{ campaignName: string; spend: unknown; purchaseRoas: unknown }>;
    const byCampaign = new Map<string, { spend: number; roasWeighted: number }>();
    for (const r of rows) {
      const spend = Number(r.spend ?? 0);
      const roas = r.purchaseRoas === null ? null : Number(r.purchaseRoas);
      const e = byCampaign.get(r.campaignName) ?? { spend: 0, roasWeighted: 0 };
      e.spend += spend;
      if (roas !== null && Number.isFinite(roas)) e.roasWeighted += roas * spend;
      byCampaign.set(r.campaignName, e);
    }
    const campaigns = [...byCampaign.entries()]
      .map(([name, v]) => ({ name, spend: Math.round(v.spend), roas: v.spend > 0 ? v.roasWeighted / v.spend : 0 }))
      .filter((c) => c.spend >= 100)
      .sort((a, b) => b.spend - a.spend);
    if (campaigns.length) {
      const best = [...campaigns].sort((a, b) => b.roas - a.roas)[0];
      const worst = [...campaigns].sort((a, b) => a.roas - b.roas)[0];
      facts.push(
        `קמפיינים במטא (14 יום, לפי הוצאה): ` +
          campaigns.slice(0, 3).map((c) => `"${c.name}" (₪${c.spend.toLocaleString()}, ROAS ${c.roas.toFixed(1)})`).join(" · ")
      );
      if (best && worst && best.name !== worst.name) {
        facts.push(
          `הפער: "${best.name}" עם ROAS ${best.roas.toFixed(1)} מול "${worst.name}" עם ROAS ${worst.roas.toFixed(1)} (הוצאה ₪${worst.spend.toLocaleString()}).`
        );
      }
    }
  } catch { /* best-effort */ }

  try {
    // Open alerts awaiting a decision.
    const alerts = (await db.alert.findMany({
      where: { storeId, status: "open" },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 5,
      select: { title: true, severity: true }
    })) as Array<{ title: string; severity: string }>;
    if (alerts.length) {
      facts.push(`התראות פתוחות שמחכות להחלטה: ` + alerts.map((a) => `[${a.severity}] ${a.title}`).join(" · "));
    }
  } catch { /* best-effort */ }

  return facts.join("\n");
}

// Full BI round-trip + cache write. Exported so a script/cron can warm the
// cache explicitly (the dashboard only ever kicks it in the background).
export async function generateBiBrief(
  intel: CompetitorIntel = COMPETITOR_INTEL_LATEST,
  storeId?: string,
  locale: "he" | "en" = "he"
): Promise<BiBriefAnswer | null> {
  const answerLang = locale === "he" ? "ענה בעברית בלבד." : "Answer in English only — every field in English.";
  const liveFacts = storeId ? await buildLiveFacts(storeId).catch(() => "") : "";
  const question =
    `אתה אנליסט BI למותג איקומרס. לפניך (א) נתוני אמת חיים מהחנות ו(ב) תמונת מודיעין ` +
    `מתחרים. ענה בעברית בלבד.\n\n` +
    `הקשר החנות: ${intel.storeContext}\n` +
    (liveFacts ? `\nנתוני אמת חיים מהחנות (מקור: מסד הנתונים, עכשיו):\n${liveFacts}\n` : "") +
    `\nמתחרים:\n` +
    intel.competitors
      .map((c) => `- ${c.name}: ${c.move} משמעות: ${c.implication}`)
      .join("\n") +
    `\n\nמשפיעניות: ${intel.influencerNote}\n\n` +
    `תן בדיוק 3 פעולות לביצוע היום ו3 פעולות לשבוע הקרוב, כל אחת כאובייקט עם 4 שדות:\n` +
    `- action: משפט פקודה קצר ונקי (עד 12 מילים), בלי סוגריים ובלי מספרים.\n` +
    `- why: הסבר במשפטשניים בעברית פשוטה — כאן שמים את המספרים מהנתונים, ומסבירים ` +
    `כל מונח מקצועי במילים פשוטות (למשל: ROAS = כמה שקלים חוזרים על כל שקל פרסום).\n` +
    `- how: איך מבצעים בפועל — באיזה מסך/כלי (מנהל המודעות של מטא, ההגדרות בשופיפיי, ` +
    `מסך ההתראות באפליקציה) ומה בדיוק לוחצים/משנים.\n` +
    `- target: יעד מדיד לשבוע במספרים, או null אם אין.\n` +
    `רף איכות — פעולה שלא עומדת בו פסולה:\n` +
    `(1) כל פעולה נשענת על מוצר, קמפיין או התראה ספציפיים מנתוני האמת למעלה.\n` +
    `(2) אסורות פעולות כלליות ("השק קמפיין עם סיפור", "הגדר מעקב", "שקול", "בחן").\n` +
    `(3) אל תסיק סיבתיות שלא נמדדה ואל תמציא תאריכים/מספרים/מבצעים.\n` +
    `(4) משפיעניות: רק אם יש להן אזכור בנתונים, ורק כצעד תהליכי — לא "surge".\n` +
    `(5) המודיעין על המתחרים הוא הקשר לתעדוף — לא תחליף לנתוני האמת.\n` +
    `(6) סגנון: אל תשתמש במקף מחבר בין אותיות שימוש למספרים או מילים לועזיות — ` +
    `כתוב "ב31 אוגוסט", "הROAS", "מ4" (בלי מקף).`;
  const jsonHint =
    `{"today": [{"action": "...", "why": "...", "how": "...", "target": "... או null"}, ...3 פריטים], ` +
    `"thisWeek": [{"action": "...", "why": "...", "how": "...", "target": null}, ...3 פריטים]}`;
  // Provider waterfall. OpenAI FIRST — it's the BI provider actually wired
  // on this deployment (same one the chat widget uses via bi-chat-service),
  // and the brief's question already carries every live fact it needs, so a
  // one-shot structured call produces a real store-specific answer. The
  // Cloudflare tunnel (askBiAgentJson) used to be first, but it points at a
  // self-hosted agent (localhost) that isn't reachable in production, so it
  // silently failed and the owner only ever saw the generic fallback tips.
  // Tunnel + Anthropic remain as ordered fallbacks when configured.
  const attempt = async (
    label: string,
    fn: () => Promise<BiBriefAnswer>
  ): Promise<BiBriefAnswer | null> =>
    fn().catch((err) => {
      console.warn(`[competitor-brief] ${label} generation failed:`, err instanceof Error ? err.message : err);
      return null;
    });

  let answer: BiBriefAnswer | null = null;
  if (isOpenAiConfigured()) {
    answer = await attempt("openai", () =>
      askOpenAiJson<BiBriefAnswer>({ question, jsonHint, timeoutMs: BI_TIMEOUT_MS, maxOutputTokens: 3000 })
    );
  }
  if (!isValidAnswer(answer) && isBiAgentConfigured()) {
    answer = await attempt("bi-agent", () =>
      askBiAgentJson<BiBriefAnswer>({ question, jsonHint, timeoutMs: BI_TIMEOUT_MS })
    );
  }
  if (!isValidAnswer(answer) && isAnthropicDirectAvailable()) {
    answer = await attempt("anthropic", () =>
      anthropicChatJson<BiBriefAnswer>({ messages: [{ role: "user", content: question }], jsonHint, maxTokens: 3000 })
    );
  }
  if (isValidAnswer(answer)) {
    await writeCache(cacheKey(intel.version, storeId), answer);
    return answer;
  }
  return null;
}

async function readCache(version: string): Promise<BiBriefAnswer | null> {
  try {
    const db = getDb();
    const row = await db.systemConfig.findUnique({
      where: { key: `${CACHE_KEY_PREFIX}${version}` },
      select: { value: true, updatedAt: true }
    });
    if (!row) return null;
    if (Date.now() - new Date(row.updatedAt).getTime() > CACHE_TTL_MS) return null;
    const parsed = JSON.parse(row.value) as BiBriefAnswer;
    // Full shape validation — a cache entry from the older string-array
    // format must be rejected, not rendered as empty action objects.
    if (!isValidAnswer(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(version: string, answer: BiBriefAnswer): Promise<void> {
  try {
    const db = getDb();
    const key = `${CACHE_KEY_PREFIX}${version}`;
    const value = JSON.stringify(answer);
    await db.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
  } catch (err) {
    console.warn("[competitor-brief] cache write failed:", err instanceof Error ? err.message : err);
  }
}
