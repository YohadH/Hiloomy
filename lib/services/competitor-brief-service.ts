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

export async function getCompetitorBrief(storeId?: string): Promise<CompetitorBrief> {
  const intel = COMPETITOR_INTEL_LATEST;
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
  if (isBiAgentConfigured() && !biRefreshInFlight) {
    biRefreshInFlight = true;
    void generateBiBrief(intel, storeId)
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
  storeId?: string
): Promise<BiBriefAnswer | null> {
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
  const answer = await askBiAgentJson<BiBriefAnswer>({
    question,
    jsonHint:
      `{"today": [{"action": "...", "why": "...", "how": "...", "target": "... או null"}, ...3 פריטים], ` +
      `"thisWeek": [{"action": "...", "why": "...", "how": "...", "target": null}, ...3 פריטים]}`,
    timeoutMs: BI_TIMEOUT_MS
  });
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
