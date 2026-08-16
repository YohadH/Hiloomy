// Hebrew AI-generated insights for the weekly Meta Ads report.
//
// Given a brand bucket plus an optional prior-week snapshot, produces:
//   • hookLine — one-sentence Hebrew summary of the week
//   • observations (2-4 bullets) — concrete patterns the AI saw in the data,
//     not metric restatements. Each must reference at least one real number
//     AND explain the implication.
//   • actions (2-3 bullets) — verb-led recommendations for next week
//     (Pause / Scale / Test / Shift budget / Refresh creative…).
//
// What we feed the model:
//   • Headline KPIs (spend / CPC / CPM / CTR / ROAS / purchases)
//   • Full funnel (Impressions → Clicks → LPV → ATC → IC → Purchase)
//   • Daily breakdown (so it can call out trends like "drop on day 5")
//   • Top campaigns + top ads
//   • Optional prior-week comparison (delta % per KPI + winner/loser ads)
//
// Provider waterfall (via lib/clients/ai-insights-client):
//   1. Brandzp BI agent (askBiAgentJson) — primary; domain-tuned
//   2. OpenAI gpt-4o-mini — fallback if BI is unconfigured or throws
//   3. Deterministic fallback content if both fail (no fabrication)

import type { MetaAdsReportBrand } from "@/lib/services/meta-ads-report-service";
import { generateInsightsJson } from "@/lib/clients/ai-insights-client";

export interface BrandInsights {
  hookLine: string;
  observations: string[];
  actions: string[];
}

// Optional prior-period snapshot the caller can compute and pass in for
// week-over-week comparison. Keep it small and pre-aggregated — the model
// doesn't need raw rows again, just deltas.
export interface PriorWeekSnapshot {
  spend: number;
  clicks: number;
  impressions: number;
  purchases: number;
  purchaseRoas: number | null;
  ctr: number;
  cpc: number;
}

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Deterministic fallback — no LLM, no fabrication. Reads the brand
// bucket the report already has and turns its top-line numbers into
// founder-readable observations and actions. Wired in when both the BI
// agent and OpenAI are unreachable so the report never surfaces "check
// server logs" copy to the operator.
function fallbackInsights(brand: MetaAdsReportBrand, isHe: boolean): BrandInsights {
  const spend = Math.round(brand.kpis.spend);
  const purchases = brand.kpis.purchases;
  const roas = brand.kpis.purchaseRoas;
  const money = (n: number) => `₪${Math.round(n).toLocaleString(isHe ? "he-IL" : "en-US")}`;
  const roasStr = (r: number | null | undefined) => (r != null ? `${r.toFixed(2)}x` : "—");

  const hookLine = isHe
    ? `${brand.name} — הוצאה של ${money(spend)} על ${purchases} רכישות${roas != null ? `, ROAS ${roas.toFixed(2)}x` : ""}.`
    : `${brand.name} — spent ${money(spend)} on ${purchases} purchases${roas != null ? `, ROAS ${roas.toFixed(2)}x` : ""}.`;

  const observations: string[] = [];
  const actions: string[] = [];

  // Top campaign by spend — always exists when there's any activity.
  const topCampaign = [...brand.campaigns].sort((a, b) => b.spend - a.spend)[0];
  if (topCampaign) {
    observations.push(
      isHe
        ? `הקמפיין הכי גדול השבוע הוא "${topCampaign.campaignName}" — הוצאה ${money(topCampaign.spend)}, ROAS ${roasStr(topCampaign.purchaseRoas)}.`
        : `Largest spend was "${topCampaign.campaignName}" — ${money(topCampaign.spend)} at ROAS ${roasStr(topCampaign.purchaseRoas)}.`
    );
  }

  // Best ad by ROAS with meaningful spend (avoid noise from ads that got ₪2 and one lucky purchase).
  const MIN_MEANINGFUL_SPEND = 100;
  const bestAd = [...brand.ads]
    .filter((a) => a.spend >= MIN_MEANINGFUL_SPEND && a.purchaseRoas != null)
    .sort((a, b) => (b.purchaseRoas ?? 0) - (a.purchaseRoas ?? 0))[0];
  if (bestAd) {
    observations.push(
      isHe
        ? `המודעה הכי רווחית עם תקציב אמיתי: "${bestAd.adName ?? "?"}" — ROAS ${roasStr(bestAd.purchaseRoas)} על ${money(bestAd.spend)}.`
        : `Best ROAS with real spend: "${bestAd.adName ?? "?"}" — ${roasStr(bestAd.purchaseRoas)} on ${money(bestAd.spend)}.`
    );
  }

  // Funnel bottleneck — the step with the biggest %-wise drop. High signal
  // because it points to WHERE money is being wasted.
  const f = brand.funnel;
  const stages: Array<{ from: number; to: number; label: { he: string; en: string } }> = [
    { from: f.impressions, to: f.clicks, label: { he: "חשיפות → קליקים", en: "impressions → clicks" } },
    { from: f.clicks, to: f.landingPageViews, label: { he: "קליקים → צפייה בדף", en: "clicks → landing views" } },
    { from: f.landingPageViews, to: f.addToCart, label: { he: "צפייה → הוספה לסל", en: "landing → add-to-cart" } },
    { from: f.addToCart, to: f.initiateCheckout, label: { he: "סל → תשלום", en: "cart → checkout" } },
    { from: f.initiateCheckout, to: f.purchases, label: { he: "תשלום → רכישה", en: "checkout → purchase" } }
  ];
  const worstStage = stages
    .filter((s) => s.from > 0)
    .map((s) => ({ ...s, dropPct: ((s.from - s.to) / s.from) * 100 }))
    .sort((a, b) => b.dropPct - a.dropPct)[0];
  if (worstStage && worstStage.dropPct > 30) {
    observations.push(
      isHe
        ? `נקודת הכי הרבה נשירה במשפך: ${worstStage.label.he} — ${worstStage.dropPct.toFixed(0)}% נופלים בשלב הזה.`
        : `Biggest funnel drop: ${worstStage.label.en} — ${worstStage.dropPct.toFixed(0)}% fall off here.`
    );
  }

  // Wasteful ad — spend ≥ threshold and zero purchases. Highest-leverage cut.
  const wastefulAd = [...brand.ads]
    .filter((a) => a.spend >= MIN_MEANINGFUL_SPEND && a.purchases === 0)
    .sort((a, b) => b.spend - a.spend)[0];
  if (wastefulAd) {
    actions.push(
      isHe
        ? `השהו את "${wastefulAd.adName ?? "?"}" — ${money(wastefulAd.spend)} ללא רכישות.`
        : `Pause "${wastefulAd.adName ?? "?"}" — ${money(wastefulAd.spend)} spent, 0 purchases.`
    );
  }

  // Scale a proven winner — campaign with ROAS ≥ 3x and spend ≥ ₪500.
  const scaleCandidate = [...brand.campaigns]
    .filter((c) => (c.purchaseRoas ?? 0) >= 3 && c.spend >= 500)
    .sort((a, b) => (b.purchaseRoas ?? 0) - (a.purchaseRoas ?? 0))[0];
  if (scaleCandidate) {
    actions.push(
      isHe
        ? `הגדילו את התקציב של "${scaleCandidate.campaignName}" ב20% — ROAS ${roasStr(scaleCandidate.purchaseRoas)} על ${money(scaleCandidate.spend)}.`
        : `Scale "${scaleCandidate.campaignName}" by 20% — ROAS ${roasStr(scaleCandidate.purchaseRoas)} on ${money(scaleCandidate.spend)}.`
    );
  } else if (bestAd) {
    // No clear scale winner? Point at the best-ROAS ad as a creative angle to explore.
    actions.push(
      isHe
        ? `בנו וריאציה של "${bestAd.adName ?? "?"}" — המודעה עם הROAS הכי גבוה השבוע.`
        : `Test a variant of "${bestAd.adName ?? "?"}" — this week's top-ROAS ad.`
    );
  }

  // Funnel-fix action when there's a big drop.
  if (worstStage && worstStage.dropPct > 50 && actions.length < 3) {
    actions.push(
      isHe
        ? `בדקו את השלב ${worstStage.label.he} — נשירה של ${worstStage.dropPct.toFixed(0)}% משאירה כסף על השולחן.`
        : `Investigate the ${worstStage.label.en} step — a ${worstStage.dropPct.toFixed(0)}% drop is where money leaks.`
    );
  }

  // Empty-set guards — if literally nothing to say, at least surface the top-line.
  if (observations.length === 0) {
    observations.push(
      isHe
        ? `לא נצברו מספיק נתונים לזיהוי דפוס — הטבלאות למטה מציגות את הפירוט המלא.`
        : `Not enough data to spot a pattern — the tables below have the full breakdown.`
    );
  }
  if (actions.length === 0) {
    actions.push(
      isHe
        ? `המשיכו לצבור נתונים — צריך לפחות שבוע של תקציב מלא לפני החלטת אופטימיזציה.`
        : `Keep collecting data — you need at least a full week of spend before making optimization calls.`
    );
  }

  return {
    hookLine,
    observations: observations.slice(0, 4),
    actions: actions.slice(0, 3)
  };
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

interface RawInsights {
  hookLine?: string;
  observations?: string[];
  actions?: string[];
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function deltaPct(current: number, prior: number): string {
  if (prior === 0) return "n/a";
  const change = ((current - prior) / prior) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function buildPrompt(
  brand: MetaAdsReportBrand,
  dateRange: { start: string; end: string },
  prior: PriorWeekSnapshot | null,
  _locale: "he" | "en"
): string {
  const lines: string[] = [];
  lines.push(`Brand: ${brand.name}`);
  lines.push(`Date range: ${dateRange.start} → ${dateRange.end}`);
  lines.push("");

  // Headline KPIs.
  lines.push("HEADLINE KPIs:");
  lines.push(
    `  spend ₪${brand.kpis.spend.toFixed(2)} | CPC ₪${brand.kpis.cpc.toFixed(2)} | CPM ₪${brand.kpis.cpm.toFixed(2)} | CTR ${brand.kpis.ctr.toFixed(2)}%`
  );
  lines.push(
    `  clicks ${brand.kpis.clicks} | impressions ${brand.kpis.impressions} | purchases ${brand.kpis.purchases} | ROAS ${brand.kpis.purchaseRoas != null ? brand.kpis.purchaseRoas.toFixed(2) + "x" : "n/a"}`
  );

  // Week-over-week deltas (huge for "is this trending up or down" framing).
  if (prior) {
    lines.push("");
    lines.push("WEEK-OVER-WEEK CHANGE (this week vs prior):");
    lines.push(`  spend: ${deltaPct(brand.kpis.spend, prior.spend)}`);
    lines.push(`  clicks: ${deltaPct(brand.kpis.clicks, prior.clicks)}`);
    lines.push(`  impressions: ${deltaPct(brand.kpis.impressions, prior.impressions)}`);
    lines.push(`  purchases: ${deltaPct(brand.kpis.purchases, prior.purchases)}`);
    lines.push(`  CPC: ${deltaPct(brand.kpis.cpc, prior.cpc)} (lower is better)`);
    lines.push(`  CTR: ${deltaPct(brand.kpis.ctr, prior.ctr)}`);
    if (prior.purchaseRoas != null && brand.kpis.purchaseRoas != null) {
      lines.push(`  ROAS: ${deltaPct(brand.kpis.purchaseRoas, prior.purchaseRoas)}`);
    }
  }

  // Funnel — this is where "where do users fall off" insights come from.
  const f = brand.funnel;
  lines.push("");
  lines.push("CONVERSION FUNNEL (step → step %):");
  lines.push(`  impressions: ${f.impressions}`);
  lines.push(`  → clicks: ${f.clicks} (${pct(f.clicks, f.impressions)} of impressions)`);
  lines.push(`  → landing page views: ${f.landingPageViews} (${pct(f.landingPageViews, f.clicks)} of clicks)`);
  lines.push(`  → add to cart: ${f.addToCart} (${pct(f.addToCart, f.landingPageViews)} of LPVs)`);
  lines.push(`  → initiate checkout: ${f.initiateCheckout} (${pct(f.initiateCheckout, f.addToCart)} of ATCs)`);
  lines.push(`  → purchase: ${f.purchases} (${pct(f.purchases, f.initiateCheckout)} of ICs)`);

  // Daily breakdown — lets the model spot weekday/weekend patterns or
  // monotonic decline.
  if (brand.daily.length > 0) {
    lines.push("");
    lines.push(`DAILY BREAKDOWN (${brand.daily.length} days):`);
    for (const d of brand.daily) {
      lines.push(
        `  ${d.date}: spend ₪${d.spend.toFixed(0)} | clicks ${d.clicks} | purchases ${d.purchases} | ROAS ${d.purchaseRoas != null ? d.purchaseRoas.toFixed(2) + "x" : "—"}`
      );
    }
  }

  // Campaigns.
  lines.push("");
  lines.push(`CAMPAIGNS (${brand.campaigns.length}, sorted by spend):`);
  for (const c of brand.campaigns.slice(0, 12)) {
    lines.push(
      `  "${c.campaignName}" — spend ₪${c.spend.toFixed(0)} | clicks ${c.clicks} | CPC ₪${c.cpc.toFixed(2)} | CTR ${c.ctr.toFixed(2)}% | purchases ${c.purchases} | ROAS ${c.purchaseRoas != null ? c.purchaseRoas.toFixed(2) + "x" : "—"}`
    );
  }

  // Top ads with creative-level signals.
  if (brand.ads.length > 0) {
    lines.push("");
    lines.push(`TOP ADS (${Math.min(10, brand.ads.length)} of ${brand.ads.length}):`);
    for (const a of brand.ads.slice(0, 10)) {
      lines.push(
        `  "${a.adName ?? "?"}" in adset "${a.adsetName ?? "?"}" — spend ₪${a.spend.toFixed(0)} | clicks ${a.clicks} | CPC ₪${a.cpc.toFixed(2)} | purchases ${a.purchases} | ROAS ${a.purchaseRoas != null ? a.purchaseRoas.toFixed(2) + "x" : "—"}`
      );
    }
  }

  return lines.join("\n");
}

// System prompt — this is where insight QUALITY actually lives. The prior
// version asked for "observations + actions" generically and got back
// "spend was ₪5,000, ROAS was 3.5x" — useless. This version forces the
// model to identify SPECIFIC PATTERNS (trend, winner, loser, funnel
// bottleneck) and tie every observation to a concrete recommendation.
function buildSystemPrompt(locale: "he" | "en"): string {
  const heGuidance = `
שפת המוצא: עברית טבעית של מקצוען. אסור להשתמש באנגלית מלבד שמות קמפיינים, שמות מודעות, ויחידות מידה (₪, %, x). הימנעו ממילים כמו "אופטימיזציה" / "סינרגיה" / "פוטנציאל" — דברו כמו מנהל מדיה לפאונדר ישראלי. הסבירו את ה"למה" של כל אבחנה, לא רק "מה קרה".

כללי ברזל לניסוח ולפורמט (הפרה = תשובה פסולה):
1. טקסט נקי בלבד — אסור בשום מקרה סימוני markdown: בלי כוכביות (**), בלי גרשיים כפולים מסביב להדגשות, בלי backticks. הדוח מדפיס את הטקסט כמו שהוא.
2. מספרים בעברית זורמת, בלי סימני + או - לפני מספר: כתבו "עלה 17.8%" / "ירד 50%" / "צנח ביותר מחצי", לעולם לא "+17.8%" או "-50%" (הסימנים נשברים בטקסט מימין לשמאל).
3. טווחי תאריכים במילים: "בין 4 ל8 באוגוסט", לא "04-06/08".
4. מונחים מקצועיים מוסברים בפעם הראשונה במשפט: "ROAS 5.3 (כל שקל פרסום החזיר 5.3 שקל)", "CTR (אחוז הקלקה על המודעה)".
5. פעולות בפעלים עבריים: "הגדילו תקציב", "עצרו", "שכפלו", "בדקו" — לא Scale / Pause / Kill.
6. בלי מקף מחבר בין אות שימוש למספר או מילה לועזית: "ב31", "הROAS", "לShopify".
7. כל בולט = משפט שלם אחד או שניים שמנהל שאינו איש פרסום מבין בקריאה ראשונה.
8. גבולות סמכות: פעולות רק על מה שיש עליו מנוף ישיר — קמפיינים, תקציבים, קריאייטיבים, עמודי האתר, מלאי. אסור להורות על החלטות כוח אדם או יחסים עם שותפים (גיוס, הסרה, אולטימטום) — לכל היותר "שווה לבדוק".`;

  const enGuidance = `
Write in clear founder-readable English. Avoid jargon ("synergy", "optimization", "potential"). Talk like a senior media buyer giving a brand owner a Monday briefing.`;

  // CRITICAL — language directive at the TOP. Without this the model can
  // mirror the English data dump and ignore the trailing Hebrew hint.
  const languageHeader =
    locale === "he"
      ? "ענה אך ורק בעברית. כל המחרוזות בJSON (hookLine, observations, actions) חייבות להיות בעברית טבעית. אסור להחזיר אנגלית מלבד שמות קמפיינים, שמות מודעות, ויחידות מידה (₪, %, x)."
      : "Respond exclusively in English. All strings in the JSON must be in English.";

  return [
    languageHeader,
    "",
    "You are a senior Meta Ads media buyer producing a weekly readout for a Shopify brand owner.",
    "",
    "You receive raw KPI + funnel + daily + campaign + ad data, including week-over-week deltas when available.",
    "",
    "Your job: identify SPECIFIC, ACTIONABLE PATTERNS — not metric restatements.",
    "",
    "DO say things like:",
    '  • "CTR dropped from 2.4% to 1.6% — ad fatigue is starting to bite on the Advantage+ creatives."',
    '  • "Funnel is healthy until checkout — 38% of add-to-carts abandon before completing. Worth checking checkout speed / payment options."',
    '  • "ROAS spiked midweek on the Paz adset (10.7x on May 28) — that creative is doing the heavy lifting; consider duplicating it into a fresh adset."',
    "",
    "DO NOT say things like:",
    '  • "Spend was ₪5,855."  (that\'s just restating a metric)',
    '  • "ROAS was strong."  (vague, no number)',
    '  • "Consider optimizing performance."  (no concrete action)',
    "",
    "REQUIRED JSON STRUCTURE — return ONLY this, no prose, no markdown, no code fences:",
    "{",
    '  "hookLine": "ONE sentence, 12-22 words, summarising the most important pattern of the week. Cite at least one real number.",',
    '  "observations": [',
    "    \"2 to 4 bullets. Each cites a specific number AND explains the implication. Patterns to look for:\",",
    '    "  – trend direction (improving / declining vs prior week)",',
    '    "  – funnel bottleneck (which step lost the most users %-wise)",',
    '    "  – best-performing ad / adset / campaign — call it out by NAME with its number",',
    '    "  – worst-performing ad / adset / campaign — call it out by NAME with its number",',
    '    "  – day-of-week pattern in the daily breakdown if there is one",',
    '    "  – ad fatigue signal (rising CPM, falling CTR)"',
    "  ],",
    '  "actions": [',
    '    "2 to 3 verb-led recommendations for next week. Each must reference a specific entity (campaign/adset/ad by name) and a specific outcome.",',
    '    "Examples of good actions:",',
    '    "  – \\"שכפלו את \'Paz_1_day_click\' לקבוצה נפרדת כדי לבחון את התקרה שלו ב₪200/יום\\"",',
    '    "  – \\"השהו את \'Static_Omer\' — ₪147 הוצאה, 0 רכישות, סימן לרענון יצירתי\\"",',
    '    "  – \\"בדקו את שלב הcheckout — 38% נשירה מהוספה לסל לתחילת תשלום היא חריגה\\""',
    "  ]",
    "}",
    "",
    "RULES:",
    "1. Never invent campaigns, ads, or numbers not in the data.",
    "2. Every observation must cite at least one real number from the input.",
    "3. If a metric is missing (n/a), do not fabricate a value — call out the gap.",
    "4. If week-over-week data is provided, USE IT — trend framing is the highest-value observation.",
    "5. If the funnel has a sharp drop-off, that's almost always the most important observation.",
    "6. Maximum 4 observations, maximum 3 actions.",
    "",
    locale === "he" ? heGuidance : enGuidance
  ].join("\n");
}

export async function generateBrandInsights(
  brand: MetaAdsReportBrand,
  dateRange: { start: string; end: string },
  locale: "he" | "en" = "he",
  options: { prior?: PriorWeekSnapshot | null } = {}
): Promise<BrandInsights> {
  const systemPrompt = buildSystemPrompt(locale);
  const userPrompt = buildPrompt(brand, dateRange, options.prior ?? null, locale);
  const fallback = fallbackInsights(brand, locale === "he");

  const parsed = await generateInsightsJson<RawInsights>({
    systemPrompt,
    userPrompt,
    openaiModel: OPENAI_MODEL,
    temperature: 0.5,
    maxTokens: 900,
    jsonHint: 'object with hookLine:string, observations:string[2-4], actions:string[2-3]'
  });
  if (!parsed) return fallback;

  return {
    hookLine:
      typeof parsed.hookLine === "string" && parsed.hookLine.trim()
        ? parsed.hookLine.trim()
        : fallback.hookLine,
    observations:
      Array.isArray(parsed.observations) && parsed.observations.length > 0
        ? parsed.observations.map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
        : fallback.observations,
    actions:
      Array.isArray(parsed.actions) && parsed.actions.length > 0
        ? parsed.actions.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
        : fallback.actions
  };
}
