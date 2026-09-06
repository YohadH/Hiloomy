// Wedge test: can Hiloma, with the tools she has TODAY, turn a real competitor
// move into a genuine commercial DECISION (act/watch/ignore) crossed against the
// store's own margin, with a decision receipt — rather than a generic dashboard
// blurb? This is the "what comes out" test for Idea A (the competitor-response
// wedge). It runs the real agent turn and prints her tool calls (so you can see
// whether she pulled BOTH competitor data AND margin) plus her answer.
//
// What it does NOT test (because it isn't built yet): category-wide priors
// (needs full RivalSweeper data) and a persistent decision→outcome memory. If
// the core reads well here, those two are what turn it into the moat.
//
// Runs where the data + keys live (NOT the assistant session).
//
// Usage (PowerShell, against production):
//   $env:DATABASE_URL  = "postgresql://...pooler.supabase.com:5432/postgres?sslmode=require"
//   $env:OPENAI_API_KEY = "sk-..."
//   node --import tsx scripts/challenge-hiloma-wedge.mjs [storeId] [--locale he|en]

import { runBiChatTurn, resolveBiProvider } from "../lib/services/bi-chat-service";

const argv = process.argv.slice(2);
const storeId = argv.find((a) => !a.startsWith("--")) || "cmofolt410000wkzw93wecvf7"; // Incense
const li = argv.indexOf("--locale");
const locale = li >= 0 && (argv[li + 1] === "en" || argv[li + 1] === "he") ? argv[li + 1] : "he";

if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL."); process.exit(1); }
if (!resolveBiProvider()) { console.error("Set OPENAI_API_KEY (the key Hiloma uses)."); process.exit(1); }

const Q = {
  he:
    "פעלי כמו מערכת החלטות מסחרית, לא כמו דשבורד.\n" +
    "1) בדקי את מהלכי המתחרים שלי ב-30 הימים האחרונים (מחיר / מבצע / חוסר-מלאי / השקה).\n" +
    "2) בחרי את המהלך היחיד שהכי מצדיק תשומת-לב ניהולית. אם אין מהלך משמעותי — אמרי זאת במפורש ועצרי כאן.\n" +
    "3) הצליבי אותו מול שיעור המרווח (contribution) והנתונים האמיתיים שלי — לא מול המהלך לבדו.\n" +
    "4) תני החלטה אחת בלבד: להגיב / לעקוב / להתעלם, עם ההשפעה המשוערת ב-₪ אם אגיב מול אם לא. הגני על רווח תרומה, לא על מחזור.\n" +
    "5) צרפי RECEIPT במבנה מדויק: טריגר → ראיות (עם המספרים והמקור) → חלופות שנשקלו → ההמלצה → מה היה גורם לך לשנות את ההחלטה.\n" +
    "אל תמציאי מספרים, מתחרים או תאריכים. אם חסר נתון להחלטה טובה — אמרי מה חסר.",
  en:
    "Act like a commercial decision system, not a dashboard.\n" +
    "1) Check my competitors' moves in the last 30 days (price / promo / stockout / launch).\n" +
    "2) Pick the SINGLE move that most deserves management attention. If none is material, say so explicitly and stop.\n" +
    "3) Cross it against my contribution-margin rate and my real numbers — not the move alone.\n" +
    "4) Give ONE decision: respond / watch / ignore, with the estimated ₪ impact of responding vs not. Protect contribution profit, not revenue.\n" +
    "5) Attach a RECEIPT: Trigger → Evidence (numbers + source) → Alternatives considered → Recommendation → What would change your decision.\n" +
    "Do not invent numbers, competitors, or dates. If data is missing for a good decision, say what's missing."
};

const line = (c) => console.log(c);
line(`# Wedge test — store ${storeId} · ${new Date().toISOString()}`);
line("Q: " + (locale === "he" ? Q.he : Q.en) + "\n" + "=".repeat(78));

const toolCalls = [];
try {
  const answer = await runBiChatTurn({
    storeId,
    locale,
    question: locale === "he" ? Q.he : Q.en,
    section: "/growth-agent",
    onToolCall: (name, args) => {
      toolCalls.push({ name, args });
      const win = args.start && args.end ? `start=${args.start} end=${args.end}` : args.days != null ? `days=${args.days}` : "";
      line(`  → tool: ${name}${win ? "  [" + win + "]" : ""}`);
    }
  });
  line("\n--- Hiloma's answer ---\n" + answer);
  const names = toolCalls.map((t) => t.name);
  const pulledCompetitor = names.includes("get_competitor_week");
  const pulledMargin = names.some((n) => ["get_profit_summary", "get_discount_effectiveness", "get_product_performance", "get_ad_performance"].includes(n));
  line("\n[scorecard signals]");
  line(`  tools called: ${names.join(", ") || "(none)"}`);
  line(`  pulled competitor data: ${pulledCompetitor ? "YES" : "NO"}`);
  line(`  pulled margin/own data: ${pulledMargin ? "YES" : "NO"}`);
  line(`  CROSSED both (the whole point): ${pulledCompetitor && pulledMargin ? "YES" : "NO"}`);
  line("\nJudge the answer on: (1) real decision not a summary, (2) ₪ tied to contribution, (3) receipt complete, (4) refused to invent / named missing data, (5) would a manager act on it.");
} catch (err) {
  line("ERROR: " + (err instanceof Error ? err.message : String(err)));
}
process.exit(0);
