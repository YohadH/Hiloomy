// Monthly meta-report synthesis.
//
// Reads the most recent ~4 weekly reports for a store and produces a single
// month-level insight block that frames the cross-week story: which weeks
// were peaks, where the trend bent, which patterns repeated.
//
// This is what makes the monthly report DIFFERENT from "a weekly report
// with a bigger window." Without this, the monthly PDF is just a wider
// snapshot. With this, the founder gets: "Week 2 was the peak (₪22k spend,
// 4.1x ROAS), then the next two weeks bled — most likely a creative-fatigue
// problem now that the same Advantage+ ads have been running for 24 days."

import { getDb } from "@/lib/server/db";

export interface MonthlyMetaSynthesis {
  hookLine: string;
  observations: string[];
  actions: string[];
  weeksUsed: number;
}

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

interface WeeklyDigest {
  periodStart: string;
  periodEnd: string;
  metaHook: string | null;
  instaHook: string | null;
  brandKpis: Array<{
    brand: string;
    spend: number;
    clicks: number;
    purchases: number;
    purchaseRoas: number | null;
    ctr: number;
  }>;
}

function fallback(weeks: WeeklyDigest[], isHe: boolean): MonthlyMetaSynthesis {
  if (isHe) {
    return {
      hookLine: `סקירת ${weeks.length} שבועות. תובנות חודשיות אוטומטיות לא זמינות (OPENAI_API_KEY חסר).`,
      observations: weeks.map(
        (w) => `${w.periodStart} → ${w.periodEnd}: ${w.metaHook ?? "אין סיכום שבועי"}`
      ),
      actions: ["הוסיפו OPENAI_API_KEY ל.env כדי לקבל ניתוח חודשי."],
      weeksUsed: weeks.length
    };
  }
  return {
    hookLine: `Cross-week summary of ${weeks.length} weeks (AI synthesis unavailable).`,
    observations: weeks.map((w) => `${w.periodStart} → ${w.periodEnd}: ${w.metaHook ?? "no weekly summary"}`),
    actions: ["Set OPENAI_API_KEY in .env to enable AI synthesis."],
    weeksUsed: weeks.length
  };
}

async function loadRecentWeeklies(
  storeId: string,
  periodEnd: Date,
  count = 5
): Promise<WeeklyDigest[]> {
  const db = getDb() as any;
  const rows = await db.weeklyReport.findMany({
    where: {
      storeId,
      kind: "weekly",
      periodEnd: { lte: periodEnd }
    },
    orderBy: { periodEnd: "desc" },
    take: count,
    select: { dataJson: true, insightsJson: true, periodStart: true, periodEnd: true }
  });

  return rows.map((row: any): WeeklyDigest => {
    const bundle = row.dataJson as any;
    const insights = (row.insightsJson ?? {}) as any;
    const firstBrandName = bundle?.metaAds?.brands?.[0]?.name as string | undefined;
    const metaHook = firstBrandName ? insights.metaAds?.[firstBrandName]?.hookLine ?? null : null;
    const instaHook = insights.instagram?.hookLine ?? null;
    const brands = (bundle?.metaAds?.brands ?? []).map((b: any) => ({
      brand: b.name,
      spend: b.kpis.spend,
      clicks: b.kpis.clicks,
      purchases: b.kpis.purchases,
      purchaseRoas: b.kpis.purchaseRoas,
      ctr: b.kpis.ctr
    }));
    return {
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10),
      metaHook,
      instaHook,
      brandKpis: brands
    };
  });
}

function buildSystemPrompt(locale: "he" | "en"): string {
  const languageHeader =
    locale === "he"
      ? "ענה אך ורק בעברית. כל המחרוזות בJSON (hookLine, observations, actions) חייבות להיות בעברית טבעית."
      : "Respond exclusively in English.";

  return [
    languageHeader,
    "",
    "You are a senior media buyer producing the MONTHLY meta-report for a Shopify brand owner.",
    "",
    "You receive a digest of the prior 4-5 WEEKLY reports — each one's hookline + per-brand KPIs.",
    "",
    "Your job: identify CROSS-WEEK patterns the founder would miss reading the weekly reports alone.",
    "",
    "DO say things like:",
    '  • "Spend climbed every week (₪14k → ₪16k → ₪22k → ₪18k) but ROAS only held in week 2. Past that, more spend bought fewer purchases — classic ad fatigue."',
    '  • "Week 3 was an outlier — 11x ROAS driven by the Paz adset variant. That single creative is carrying the month; protect it."',
    '  • "Across the month, CTR slid from 2.4% to 1.6%. The creative library needs a refresh before next month."',
    "",
    "DO NOT say things like:",
    '  • "Spend was high."  (no number, no pattern)',
    '  • "Continue current strategy."  (no concrete next step)',
    "",
    "Return STRICT JSON, no prose, no markdown:",
    "{",
    '  "hookLine": "ONE sentence summarising the month. Cite a real number, name a real pattern.",',
    '  "observations": [',
    '    "3 to 5 bullets, each citing real numbers from at least 2 different weeks. Talk about TRENDS (improving/declining), TURNING POINTS (which week changed), or RECURRING PATTERNS (day-of-week, creative type, etc.)."',
    "  ],",
    '  "actions": [',
    '    "2 to 3 verb-led recommendations for next month. Each must reference a specific entity (brand/campaign/ad/creator) and a specific outcome."',
    "  ]",
    "}",
    "",
    "Maximum 5 observations, maximum 3 actions. Never invent weeks or numbers not in the data."
  ].join("\n");
}

function buildUserPrompt(weeks: WeeklyDigest[]): string {
  const lines: string[] = [];
  lines.push(`WEEKLY DIGEST (${weeks.length} weeks, most recent first):`);
  lines.push("");
  // Reverse so the AI reads oldest-to-newest, which makes trend framing
  // natural.
  for (const w of [...weeks].reverse()) {
    lines.push(`Week ${w.periodStart} → ${w.periodEnd}:`);
    if (w.metaHook) lines.push(`  Meta hook: ${w.metaHook}`);
    if (w.instaHook) lines.push(`  Instagram hook: ${w.instaHook}`);
    for (const b of w.brandKpis) {
      lines.push(
        `  ${b.brand}: spend ₪${b.spend.toFixed(0)} | clicks ${b.clicks} | CTR ${b.ctr.toFixed(2)}% | purchases ${b.purchases} | ROAS ${b.purchaseRoas != null ? b.purchaseRoas.toFixed(2) + "x" : "—"}`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function buildMonthlyMetaSynthesis(
  storeId: string,
  periodEnd: Date,
  locale: "he" | "en" = "he"
): Promise<MonthlyMetaSynthesis> {
  const weeks = await loadRecentWeeklies(storeId, periodEnd, 5);
  const isHe = locale === "he";
  if (weeks.length === 0) {
    return {
      hookLine: isHe
        ? "אין דוחות שבועיים שמורים לחישוב סינתזה חודשית."
        : "No stored weekly reports found to synthesise.",
      observations: [],
      actions: [],
      weeksUsed: 0
    };
  }

  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return fallback(weeks, isHe);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(locale) },
          { role: "user", content: buildUserPrompt(weeks) }
        ],
        temperature: 0.5,
        max_tokens: 900
      })
    });
    if (!response.ok) return fallback(weeks, isHe);
    const payload = (await response.json()) as any;
    if (payload.error) return fallback(weeks, isHe);
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback(weeks, isHe);
    const parsed = JSON.parse(raw);
    const fb = fallback(weeks, isHe);
    return {
      hookLine:
        typeof parsed.hookLine === "string" && parsed.hookLine.trim()
          ? parsed.hookLine.trim()
          : fb.hookLine,
      observations:
        Array.isArray(parsed.observations) && parsed.observations.length > 0
          ? parsed.observations.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 5)
          : fb.observations,
      actions:
        Array.isArray(parsed.actions) && parsed.actions.length > 0
          ? parsed.actions.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 3)
          : fb.actions,
      weeksUsed: weeks.length
    };
  } catch {
    return fallback(weeks, isHe);
  }
}
