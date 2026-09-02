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
import { getMetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";
import { getStoreTimeZone, lastNDaysRange } from "@/lib/server/reporting-date-range";
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
    const links = safeScrapedTexts(a.homepageLinks);
    if (links.length > 0) {
      moveParts.push(
        t(`בדף הבית: ${links.slice(0, 3).join(", ")}`, `Homepage highlights: ${links.slice(0, 3).join(", ")}`)
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
    homepageLinks: safeScrapedTexts(strings(o.homepageLinks)),
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
  /** Fallback served while a BI generation is still running — poll again. */
  pending?: boolean;
}

// How long the "blocking" loader actually blocks. The BI call itself may run
// up to BI_TIMEOUT_MS (5 min); holding the dashboard's request open that
// long is what read as "the app hangs" in QA (C-08: 13s in run 2, 60s+ in
// run 4). After this, the fallback is served with `pending: true`, the
// generation keeps running and writes the cache, and the client re-polls.
const BLOCKING_WAIT_MS = 20_000;

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
    let settled = false;
    const generation = generateBiBrief(intel, storeId, locale)
      .catch(() => null)
      .finally(() => {
        settled = true;
      });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), BLOCKING_WAIT_MS);
    });
    const answer = await Promise.race([generation, deadline]);
    if (timer) clearTimeout(timer);
    if (isValidAnswer(answer)) {
      return { source: "bi-agent", today: answer.today, thisWeek: answer.thisWeek, generatedAt: intel.generatedAt };
    }
    // Not done yet: generation continues in the background and caches its
    // answer; tell the client to come back for it.
    if (!settled) return { ...fallback(), pending: true };
  }
  return fallback();
}

// Cache schema tag. Bumped to "s1" when the scraped-content screen landed:
// briefs generated before it were composed from unfiltered ad copy and sat
// in the 24h cache — which is why the explicit competitor headline was still
// on the dashboard a deploy AFTER the filter shipped (QA run 4).
// "s2" (2 Sep 2026): the brief prompt is now localized (an EN viewer was
// getting a Hebrew brief because the old prompt was hard-coded Hebrew and
// cached under the EN key) AND leads with the competitor×margin cross. Both
// changes make every "s1" cached answer stale, so bump to force regeneration.
const CACHE_SCHEMA = "s2";
function cacheKey(version: string, storeId?: string): string {
  return `${version}:${storeId ?? "org"}:${CACHE_SCHEMA}`;
}

// A BI answer is only usable if none of its text repeats unsafe scraped
// copy — the model quotes competitor headlines back verbatim.
function isCleanAnswer(answer: BiBriefAnswer): boolean {
  return [...answer.today, ...answer.thisWeek].every((a) =>
    [a.action, a.why, a.how, a.target].every((t) => isSafeScrapedText(t))
  );
}

// ── Live store facts — the difference between consultant fluff and a
// decision. Pulled fresh from the DB on every generation so the agent's
// actions can name actual products, campaigns and numbers.
async function buildLiveFacts(storeId: string, locale: "he" | "en" = "he"): Promise<string> {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
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
        t("מוצרים עולים (30 יום מול 30 הקודמים): ", "Rising products (last 30d vs prior 30d): ") +
          gainers
            .map((g) =>
              t(
                `"${g.t}" (הכנסה ₪${g.cur.toLocaleString()}, שינוי +₪${g.delta.toLocaleString()})`,
                `"${g.t}" (revenue ₪${g.cur.toLocaleString()}, change +₪${g.delta.toLocaleString()})`
              )
            )
            .join(" · ")
      );
    }
    if (losers.length) {
      facts.push(
        t("מוצרים צונחים: ", "Declining products: ") +
          losers
            .map((l) =>
              t(
                `"${l.t}" (הכנסה ₪${l.cur.toLocaleString()}, שינוי -₪${Math.abs(l.delta).toLocaleString()})`,
                `"${l.t}" (revenue ₪${l.cur.toLocaleString()}, change -₪${Math.abs(l.delta).toLocaleString()})`
              )
            )
            .join(" · ")
      );
    }
  } catch { /* facts are best-effort */ }

  try {
    // Meta campaigns: the SAME window and aggregation as the dashboard's Meta
    // block (last 7 complete store-days via getMetaCampaignsOverview), and
    // only campaigns that actually spent in the last 3 data-days. The old raw
    // query (`dateStart >= now − 14d` over insight rows) surfaced a July
    // campaign as the "move budget here" target on 1 Sep, beside a table
    // that didn't list it (C-09). The window is spelled out in the fact so the
    // model can't quote a stale one.
    const tz = await getStoreTimeZone(storeId);
    const overview = await getMetaCampaignsOverview(storeId, lastNDaysRange(7, tz));
    const campaigns = (overview?.campaigns ?? [])
      .filter((c) => c.activeRecently && c.spend >= 100)
      .map((c) => ({ name: c.campaignName, spend: Math.round(c.spend), roas: c.roas ?? 0 }))
      .sort((a, b) => b.spend - a.spend);
    if (overview && campaigns.length) {
      const best = [...campaigns].sort((a, b) => b.roas - a.roas)[0];
      const worst = [...campaigns].sort((a, b) => a.roas - b.roas)[0];
      facts.push(
        t(
          `קמפיינים פעילים במטא (${overview.rangeStart} עד ${overview.rangeEnd}, לפי הוצאה — אלה הקמפיינים היחידים שרצים עכשיו; אין להמליץ על קמפיין שאינו ברשימה): `,
          `Active Meta campaigns (${overview.rangeStart} to ${overview.rangeEnd}, by spend — these are the ONLY campaigns running now; never recommend a campaign not on this list): `
        ) +
          campaigns.slice(0, 3).map((c) => `"${c.name}" (₪${c.spend.toLocaleString()}, ROAS ${c.roas.toFixed(1)})`).join(" · ")
      );
      if (best && worst && best.name !== worst.name) {
        facts.push(
          t(
            `הפער: "${best.name}" עם ROAS ${best.roas.toFixed(1)} מול "${worst.name}" עם ROAS ${worst.roas.toFixed(1)} (הוצאה ₪${worst.spend.toLocaleString()}).`,
            `The gap: "${best.name}" at ROAS ${best.roas.toFixed(1)} vs "${worst.name}" at ROAS ${worst.roas.toFixed(1)} (spend ₪${worst.spend.toLocaleString()}).`
          )
        );
      }
    }
  } catch { /* best-effort */ }

  try {
    // The store's OWN margin — the other half of Hiloma's edge. Competitor
    // intel is only actionable when crossed against what the store can
    // actually afford: the deepest discount a competitor runs means nothing
    // until it's read against this contribution-margin rate and the breakeven
    // ROAS it implies. Without this fact the model can only echo store
    // internals; with it, it can say "don't match their 40% cut — it's below
    // your X% margin" (the owner's stated edge: the cross, not intel alone).
    const margin = await buildContributionMargin({ storeId, start: curStart, end: now }).catch(() => null);
    if (margin && margin.totals.ordersIncluded > 0) {
      const ratePct = Math.round(margin.totals.contributionMarginRate * 100);
      const coveragePct = Math.round((margin.quality.costCoverage ?? 0) * 100);
      const breakevenRoas =
        margin.totals.contributionMarginRate > 0
          ? (1 / margin.totals.contributionMarginRate).toFixed(1)
          : null;
      // Only assert a hard breakeven when cost coverage is real (≥60%),
      // matching the dashboard's ProfitAccuracyBadge — otherwise flag it as an
      // estimate so the model never crosses a competitor discount against a
      // margin the store can't stand behind.
      const solid = (margin.quality.costCoverage ?? 0) >= 0.6;
      facts.push(
        t(
          `המרווח שלכם (30 יום): שיעור רווח תרומה ${ratePct}%${
            breakevenRoas ? `, ROAS איזון ×${breakevenRoas}` : ""
          } · כיסוי עלויות ${coveragePct}%${solid ? "" : " (מוערך — לצלוב הנחת מתחרה בזהירות)"}. ` +
            `כל הנחת מתחרה למעלה נצלבת מול המרווח הזה — הנחה שמתחת ל${ratePct}% שוחקת רווח, לא רק מכירה.`,
          `Your margin (30d): contribution-margin rate ${ratePct}%${
            breakevenRoas ? `, breakeven ROAS ×${breakevenRoas}` : ""
          } · cost coverage ${coveragePct}%${solid ? "" : " (estimated — cross competitor discounts against it cautiously)"}. ` +
            `Every competitor discount above is read against THIS margin — a cut deeper than ${ratePct}% erodes profit, not just a sale.`
        )
      );
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
      facts.push(
        t("התראות פתוחות שמחכות להחלטה: ", "Open alerts awaiting a decision: ") +
          alerts.map((a) => `[${a.severity}] ${a.title}`).join(" · ")
      );
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
  const isHe = locale === "he";
  const liveFacts = storeId ? await buildLiveFacts(storeId, locale).catch(() => "") : "";
  // Localized so the viewer's language is honored end-to-end. The old prompt
  // was hard-coded Hebrew — answerLang was computed but never inserted — so an
  // English viewer still got a Hebrew brief (owner report, 2 Sep 2026).
  const question = isHe
    ? `את הילומה, אנליסטית BI למותג איקומרס. לפנייך (א) נתוני אמת חיים מהחנות ו(ב) תמונת מודיעין ` +
      `מתחרים. ענה בעברית בלבד.\n\n` +
      `הקשר החנות: ${intel.storeContext}\n` +
      (liveFacts ? `\nנתוני אמת חיים מהחנות (מקור: מסד הנתונים, עכשיו):\n${liveFacts}\n` : "") +
      `\nמתחרים:\n` +
      intel.competitors
        .map((c) => `- ${c.name}: ${c.move} משמעות: ${c.implication}`)
        .join("\n") +
      `\n\nמשפיעניות: ${intel.influencerNote}\n\n` +
      `היתרון שלך הוא ההצלבה: כל פעולה חוצה בין מהלך מתחרה ספציפי לבין נתון האמת של החנות ` +
      `(מרווח, מוצר, קמפיין). מהלך מתחרה בלי הצלבה למספר של החנות אינו פעולה.\n\n` +
      `תני בדיוק 3 פעולות לביצוע היום ו3 פעולות לשבוע הקרוב, כל אחת כאובייקט עם 4 שדות:\n` +
      `- action: משפט פקודה קצר ונקי (עד 12 מילים), בלי סוגריים ובלי מספרים.\n` +
      `- why: הסבר במשפט-שניים בעברית פשוטה — כאן שמים את המספרים מהנתונים, ומסבירים ` +
      `כל מונח מקצועי במילים פשוטות (למשל: ROAS = כמה שקלים חוזרים על כל שקל פרסום).\n` +
      `- how: איך מבצעים בפועל — באיזה מסך/כלי (מנהל המודעות של מטא, ההגדרות בשופיפיי, ` +
      `מסך ההתראות באפליקציה) ומה בדיוק לוחצים/משנים.\n` +
      `- target: יעד מדיד לשבוע במספרים, או null אם אין.\n` +
      `רף איכות — פעולה שלא עומדת בו פסולה:\n` +
      `(1) לפחות 2 מ-3 הפעולות בכל רשימה חוצות מהלך מתחרה מפורש מול נתון אמת של החנות ` +
      `(למשל "המתחרה X מוריד ל-40% — המרווח שלך Y%, אל תתאים").\n` +
      `(2) אסורות פעולות כלליות ("השק קמפיין עם סיפור", "הגדר מעקב", "שקול", "בחן").\n` +
      `(3) אל תסיקי סיבתיות שלא נמדדה ואל תמציאי תאריכים/מספרים/מבצעים/מתחרים.\n` +
      `(4) משפיעניות: רק אם יש להן אזכור בנתונים, ורק כצעד תהליכי — לא "surge".\n` +
      `(5) הנחת מתחרה נצלבת תמיד מול שיעור המרווח של החנות לפני המלצה על תגובת מחיר.\n` +
      `(6) סגנון: אל תשתמשי במקף מחבר בין אותיות שימוש למספרים או מילים לועזיות — ` +
      `כתבי "ב31 אוגוסט", "הROAS", "מ4" (בלי מקף).`
    : `You are Hiloma, a BI analyst for an e-commerce brand. You have (a) live store facts and ` +
      `(b) a competitor-intel snapshot. Answer in English only — every field in English.\n\n` +
      `Store context: ${intel.storeContext}\n` +
      (liveFacts ? `\nLive store facts (source: the database, right now):\n${liveFacts}\n` : "") +
      `\nCompetitors:\n` +
      intel.competitors
        .map((c) => `- ${c.name}: ${c.move} Implication: ${c.implication}`)
        .join("\n") +
      `\n\nInfluencers: ${intel.influencerNote}\n\n` +
      `Your edge is the CROSS: every action crosses a specific competitor move against a real ` +
      `store number (margin, product, campaign). A competitor move with no cross to a store number ` +
      `is not an action.\n\n` +
      `Give EXACTLY 3 actions to do today and 3 for this coming week, each an object with 4 fields:\n` +
      `- action: a short, clean imperative (max 12 words), no parentheses and no numbers.\n` +
      `- why: a one-to-two sentence plain-English explanation — put the numbers from the facts HERE, ` +
      `and explain any jargon in plain words (e.g. ROAS = shekels returned per shekel of ad spend).\n` +
      `- how: how to actually do it — which screen/tool (Meta Ads Manager, Shopify settings, the ` +
      `in-app alerts screen) and exactly what to click/change.\n` +
      `- target: a measurable weekly target in numbers, or null if none.\n` +
      `Quality bar — an action that fails it is rejected:\n` +
      `(1) At least 2 of the 3 actions in each list cross an explicit competitor move against a real ` +
      `store number (e.g. "competitor X is cutting to 40% — your margin is Y%, don't match").\n` +
      `(2) No generic actions ("launch a campaign with a story", "set up tracking", "consider", "review").\n` +
      `(3) Never infer causation that wasn't measured, and never invent dates/numbers/promos/competitors.\n` +
      `(4) Influencers: only if they appear in the facts, and only as a process step — never a "surge".\n` +
      `(5) A competitor discount is ALWAYS crossed against the store's margin rate before recommending a price response.\n` +
      `(6) Style: write clean prose, no bracketed notes.`;
  const jsonHint = isHe
    ? `{"today": [{"action": "...", "why": "...", "how": "...", "target": "... או null"}, ...3 פריטים], ` +
      `"thisWeek": [{"action": "...", "why": "...", "how": "...", "target": null}, ...3 פריטים]}`
    : `{"today": [{"action": "...", "why": "...", "how": "...", "target": "... or null"}, ...3 items], ` +
      `"thisWeek": [{"action": "...", "why": "...", "how": "...", "target": null}, ...3 items]}`;
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
    if (!isCleanAnswer(answer)) {
      console.warn("[competitor-brief] answer repeated unsafe scraped copy — not served, not cached");
      return null;
    }
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
    if (!isCleanAnswer(parsed)) return null;
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
