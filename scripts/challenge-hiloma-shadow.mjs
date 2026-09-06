// SHADOW-MODE decision-layer test: runs the full 5-phase "decision inbox"
// prompt through the real Hiloma turn (same tool loop + synthesis as the chat
// widget), non-interactively. Prints every tool call (with its window) and her
// full output, plus a scorecard signal for the phase design (did she separate
// internal-only from market-influenced).
//
// The turn allows 6 tool rounds and a 16k-token answer, so the 5-phase output
// fits without truncation.
//
// Runs where the data + keys live (NOT the assistant session).
//
// Usage (PowerShell, against production):
//   $env:DATABASE_URL  = "postgresql://...pooler.supabase.com:5432/postgres?sslmode=require"
//   $env:OPENAI_API_KEY = "sk-..."
//   node --import tsx scripts/challenge-hiloma-shadow.mjs [storeId] [--locale en|he]

import { runBiChatTurn, resolveBiProvider } from "../lib/services/bi-chat-service";

const argv = process.argv.slice(2);
const storeId = argv.find((a) => !a.startsWith("--")) || "cmofolt410000wkzw93wecvf7"; // Incense
const li = argv.indexOf("--locale");
const locale = li >= 0 && (argv[li + 1] === "he" || argv[li + 1] === "en") ? argv[li + 1] : "en";

if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL."); process.exit(1); }
if (!resolveBiProvider()) { console.error("Set OPENAI_API_KEY (the key Hiloma uses)."); process.exit(1); }

const PROMPT = `You are operating in SHADOW MODE as the commercial decision layer for this brand.

You are NOT allowed to execute any action.

Your job is to identify the few commercial decisions that genuinely deserve management attention right now.

The purpose of this test is to determine whether Hiloomy can create value from the brand's own business data first — and only then measure whether external competitor intelligence changes the decision.

Do not behave like a dashboard.
Do not summarize KPIs.
Do not generate recommendations just to fill the output.

A valid output is:
"NO MANAGEMENT DECISION REQUIRED."

---

# PHASE 1 — INTERNAL BUSINESS ONLY

First, IGNORE all competitor data.

Use only the brand's internal context where available:

* Shopify sales and orders
* products and SKU performance
* verified COGS
* contribution margin
* discounts
* bundles
* refunds
* inventory / stock cover
* Meta / Google performance
* affiliates
* customer behavior
* marketing plan / Gantt
* launches and promotions
* historical trends
* previous decisions if available

Scan for situations where management may reasonably need to:

ACT
WATCH
DO NOT ACT
CHANGE PLAN
TEST

Return no more than 5 decisions.

Do not surface routine KPI changes.

---

For every decision return:

## DECISION
State the actual management question.
Example: "Should we continue the planned 20% promotion on PRODUCT X?"
Not: "PRODUCT X performance changed."

## TRIGGER
What caused this question to become relevant now? Use exact facts.

## EVIDENCE
List the evidence used. For every item mark: KNOWN / CALCULATED / ESTIMATE / MISSING.
Include the source category: SHOPIFY / PROFIT / META / INVENTORY / AFFILIATE / PLAN / CUSTOMER / OTHER.

## COMMERCIAL EXPOSURE
Explain what is financially or strategically at stake. Where reliable, calculate:
₪ revenue exposure / ₪ contribution-profit exposure / ₪ spend exposure / inventory exposure.
Do not fabricate a number. If it cannot be calculated, say: "FINANCIAL IMPACT NOT RELIABLY QUANTIFIABLE."

## OPTIONS
Give 2–4 realistic management options. Include DO NOTHING whenever appropriate.

## RECOMMENDATION
Choose exactly one: ACT / WATCH / DO NOT ACT / CHANGE PLAN / TEST. Then give the concrete recommendation.

## WHY
Explain why this option is preferable to the alternatives. Protect contribution profit rather than vanity revenue.

## CONFIDENCE
HIGH / MEDIUM / LOW. Explain exactly what is limiting confidence.

## WHAT WOULD CHANGE MY MIND?
Mandatory. List the specific future data or event that would cause Hiloomy to change the recommendation.
Example: "Escalate WATCH → ACT if conversion falls more than 10% for 3 consecutive days."

---

# PHASE 2 — MARKET CHECK

Only AFTER Phase 1 is complete, inspect competitor / market intelligence where available.
For each Phase 1 decision ask: "Does external market information materially change this recommendation?"
Answer: YES / NO / INSUFFICIENT MARKET DATA.
If YES, show: MARKET SIGNAL / WHY IT MATTERS / ORIGINAL INTERNAL-ONLY RECOMMENDATION / NEW RECOMMENDATION / WHAT CHANGED IN THE LOGIC.
If NO, do not invent a competitor narrative. Simply state: "Market data does not materially change this decision."

---

# PHASE 3 — MARKET-ONLY OPPORTUNITIES

Now inspect competitor intelligence for events that did NOT originate from internal data.
Only surface an event if it creates a plausible commercial decision for THIS brand.
Bad: "Competitor launched 20% discount."
Good: "Competitor launched 20% discount on a directly comparable product, but your conversion and sales velocity remain stable. Matching the discount is currently unjustified."
For each market-originated decision use the same Decision Receipt structure.
If there are no relevant market-originated decisions, say: "NO EXTERNAL MARKET EVENT CURRENTLY REQUIRES MANAGEMENT ATTENTION."

---

# PHASE 4 — DECISION COMPRESSION

Return: ## TODAY'S DECISION INBOX — maximum 5 items. For each:
DECISION / ACT|WATCH|DO NOT ACT|CHANGE PLAN|TEST / Confidence / ₪ exposure if reliable / Internal-only or Market-influenced. Rank by importance.

---

# PHASE 5 — DECISION RECEIPT

For every surfaced decision save: Trigger / Evidence used / Missing evidence / Options considered / Recommendation / Confidence / What would change the recommendation / Human response: PENDING / Outcome: NOT YET KNOWN.
Do not claim that the recommendation was correct. This is a decision record, not a chain-of-thought transcript.

---

# FINAL DIAGNOSTIC

Answer:
1. How many useful decisions were generated from INTERNAL DATA ONLY?
2. How many decisions materially changed after adding COMPETITOR DATA?
3. How many decisions originated ONLY because of competitor data?
4. Which internal data source produced the most valuable decisions?
5. Which missing data source is currently limiting decision quality the most?
6. If competitor intelligence disappeared tomorrow, would Hiloomy still produce meaningful management decisions? Answer YES / PARTIALLY / NO and explain why.

---

STRICT RULES
* Never invent an action because the prompt asks for decisions.
* WATCH and DO NOT ACT are valid outcomes.
* Missing data must reduce confidence.
* Never pretend correlation proves causation.
* Do not call Meta-attributed revenue incremental revenue.
* Do not use unreliable COGS to generate precise profit claims.
* Competitor data is optional evidence, not mandatory evidence.
* The objective is to compress management attention, not maximize the number of recommendations.`;

const line = (c) => console.log(c);
line(`# SHADOW-MODE decision test — store ${storeId} · locale ${locale} · ${new Date().toISOString()}`);
line("=".repeat(78));

const toolCalls = [];
try {
  const answer = await runBiChatTurn({
    storeId,
    locale,
    question: PROMPT,
    section: "/growth-agent",
    onToolCall: (name, args) => {
      toolCalls.push(name);
      const win = args.start && args.end ? `start=${args.start} end=${args.end}` : args.days != null ? `days=${args.days}` : "";
      line(`  → tool: ${name}${win ? "  [" + win + "]" : ""}`);
    }
  });
  line("\n--- Hiloma's answer ---\n" + answer);
  const internal = toolCalls.filter((n) => n !== "get_competitor_week");
  line("\n[scorecard signals]");
  line(`  tools called (${toolCalls.length}): ${toolCalls.join(", ") || "(none)"}`);
  line(`  internal-data tools used: ${[...new Set(internal)].join(", ") || "(none)"}`);
  line(`  competitor tool used: ${toolCalls.includes("get_competitor_week") ? "YES" : "NO"}`);
  line("\nJudge: did Phase-1 stand on its own (internal-only decisions)? Did Phase-2 avoid inventing competitor narratives? Did missing data lower confidence? Is the Final Diagnostic Q6 honest?");
} catch (err) {
  line("ERROR: " + (err instanceof Error ? err.message : String(err)));
}
process.exit(0);
