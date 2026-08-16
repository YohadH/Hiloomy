// LLM-generated founder digest summary for the Weekly Summary page.
//
// Replaces the hand-crafted template headline in summary-service.ts with an
// OpenAI prompt pipeline. Given the real founder metrics (revenue vs prior
// week, estimated-profit delta, top product, key changes, retention) it
// produces a concise 3-5 sentence founder-facing paragraph in the store's
// locale (Hebrew or English).
//
// Provider: same gpt-4o-mini Chat Completions path used by the weekly PDF's
// Hebrew AI insights (meta-ads-report-insights-service.ts /
// instagram-report-insights-service.ts). Falls back to the deterministic
// template headline (passed in by the caller) when OPENAI_API_KEY is missing
// or the call fails — never throws.

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Structured, pre-aggregated metrics fed to the model. Kept small and
// already-computed — the model only needs the deltas + names, not raw rows.
export interface SummaryInsightInput {
  /** Revenue % change vs the prior period (null when there's no prior data). */
  revenueChange: number | null;
  /** Estimated-profit % change vs the prior period (null when unavailable). */
  profitChange: number | null;
  /** Top product by revenue, with its revenue figure, when known. */
  topProduct: { title: string; revenue: number } | null;
  /** Headline KPI movers, label + period-over-period change. */
  keyChanges: Array<{ label: string; change: number }>;
  discountRate: number | null;
  refundRate: number | null;
  repeatPurchaseRate: number | null;
  secondOrderRate: number | null;
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

interface RawSummary {
  summary?: string;
}

function fmtPct(value: number | null): string {
  if (value == null) return "n/a";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function buildUserPrompt(input: SummaryInsightInput): string {
  const lines: string[] = [];
  lines.push("WEEKLY FOUNDER METRICS:");
  lines.push(`  revenue vs prior period: ${fmtPct(input.revenueChange)}`);
  lines.push(`  estimated profit vs prior period: ${fmtPct(input.profitChange)}`);

  if (input.topProduct) {
    lines.push(
      `  top product by revenue: "${input.topProduct.title}" (${Math.round(input.topProduct.revenue).toLocaleString()})`
    );
  } else {
    lines.push("  top product by revenue: n/a (no product data)");
  }

  if (input.keyChanges.length > 0) {
    lines.push("  key KPI changes vs prior period:");
    for (const c of input.keyChanges) {
      lines.push(`    - ${c.label}: ${fmtPct(c.change)}`);
    }
  }

  lines.push(`  discount rate: ${input.discountRate != null ? input.discountRate.toFixed(1) + "%" : "n/a"}`);
  lines.push(`  refund rate: ${input.refundRate != null ? input.refundRate.toFixed(1) + "%" : "n/a"}`);
  lines.push(
    `  repeat purchase rate: ${input.repeatPurchaseRate != null ? input.repeatPurchaseRate.toFixed(1) + "%" : "n/a"}`
  );
  lines.push(
    `  second-order rate: ${input.secondOrderRate != null ? input.secondOrderRate.toFixed(1) + "%" : "n/a"}`
  );

  return lines.join("\n");
}

function buildSystemPrompt(locale: "he" | "en"): string {
  // CRITICAL — language directive at the TOP. The model otherwise mirrors the
  // English data dump and ignores a trailing Hebrew hint (same lesson as the
  // Meta Ads / Instagram insights services).
  const languageHeader =
    locale === "he"
      ? 'ענה אך ורק בעברית. ערך הsummary בJSON חייב להיות בעברית טבעית של מקצוען. אסור להחזיר אנגלית מלבד שמות מוצרים, מספרים ויחידות מידה (₪, %).'
      : "Respond exclusively in English. The summary string in the JSON must be in clear, founder-readable English.";

  return [
    languageHeader,
    "",
    "You are a senior growth analyst writing the opening summary of a Shopify brand owner's weekly digest.",
    "",
    "You receive pre-computed weekly metrics: revenue vs prior week, estimated-profit delta, the top product, key KPI changes, and retention rates.",
    "",
    "Write a SHORT paragraph of 3 to 5 sentences that a busy founder can read in 15 seconds. It must cover, in flowing prose (not a bullet list):",
    "  1. how revenue moved vs the prior week (cite the number),",
    "  2. the top product driving the week,",
    "  3. the single most important trend (the biggest mover, or a retention / discount / refund signal),",
    "  4. ONE concrete, actionable next step the founder should take this week.",
    "",
    "RULES:",
    "1. Never invent products, numbers, or trends not present in the input.",
    "2. If a value is n/a, do not fabricate it — simply omit that angle.",
    "3. No marketing jargon (\"synergy\", \"optimization\", \"leverage\"). Talk like a sharp operator giving a Monday briefing.",
    "4. Keep it to 3-5 sentences. This is a digest teaser, not an essay.",
    "5. Do NOT restate every metric — pick the few that matter and tell the story.",
    "",
    'REQUIRED JSON STRUCTURE — return ONLY this, no prose, no markdown, no code fences: { "summary": "the 3-5 sentence paragraph" }'
  ].join("\n");
}

/**
 * Generate the founder digest headline via OpenAI. Returns null (rather than
 * throwing) when OPENAI_API_KEY is absent or the call/parse fails, so the
 * caller can fall back to its deterministic template headline.
 */
export async function generateSummaryHeadline(
  input: SummaryInsightInput,
  locale: "he" | "en" = "he"
): Promise<string | null> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;

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
          { role: "user", content: buildUserPrompt(input) }
        ],
        temperature: 0.5,
        max_tokens: 400
      })
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as OpenAIChatResponse;
    if (payload.error) return null;
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RawSummary;
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    return summary || null;
  } catch {
    return null;
  }
}
