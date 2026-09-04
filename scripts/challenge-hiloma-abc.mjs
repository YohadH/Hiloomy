// Challenge Hiloma (the real BI) on the three July–August decisions, non-
// interactively — so you don't have to chat with her by hand. It runs the SAME
// agent turn the chat widget runs (tool loop + synthesis) for each question and
// prints, per case:
//   • every tool call she made WITH its arguments (so you can see whether she
//     used the new start/end historical windows or fell back to trailing days),
//   • her full written answer.
//
// This is the product under test. Grade her answers against the ground-truth
// numbers from scripts/decision-backtest-abc.mjs (Hiloma answers, the extractor
// judges — not the assistant self-grading).
//
// Runs where the data + keys live (like the other scripts), NOT from the
// assistant session.
//
// Usage (PowerShell, against production):
//   $env:DATABASE_URL  = "postgresql://...pooler.supabase.com:5432/postgres?sslmode=require"
//   $env:OPENAI_API_KEY = "sk-..."          # the BI provider Hiloma uses
//   node --import tsx scripts/challenge-hiloma-abc.mjs [storeId] [--locale he|en]
//
// Note: contribution/margin for a PAST window uses today's COGS (no cost
// history) — a limit Hiloma is told to flag; judge PROFIT claims with that in
// mind. Sales / coupon / spend figures are clean.

import { runBiChatTurn, resolveBiProvider } from "../lib/services/bi-chat-service";

const argv = process.argv.slice(2);
const storeId = argv.find((a) => !a.startsWith("--")) || "cmofolt410000wkzw93wecvf7"; // Incense
const li = argv.indexOf("--locale");
const locale = li >= 0 && (argv[li + 1] === "en" || argv[li + 1] === "he") ? argv[li + 1] : "he";

if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL."); process.exit(1); }
if (!resolveBiProvider()) {
  console.error("No BI provider configured — set OPENAI_API_KEY (the key Hiloma uses).");
  process.exit(1);
}

const CASES = [
  {
    id: "A · LOVE 20% sitewide (Tu B'Av)",
    he: "השוואת ביצועי החנות בשלושה חלונות: 10–20 ביולי 2026, 21–31 ביולי 2026, ו-1–11 באוגוסט 2026. מבצע LOVE (20% הנחה על כל האתר, טו באב, 21–31 ביולי) — האם הוא באמת הגדיל את רווח התרומה, או בעיקר נתן הנחה על מכירות שהיו קורות ממילא? תני החלטה: להשאיר / לצמצם / לבטל, עם המספרים. אם אי אפשר להוכיח אינקרמנטליות — אמרי זאת במפורש.",
    en: "Compare the store across three windows: 10–20 Jul 2026, 21–31 Jul 2026, and 1–11 Aug 2026. Did the LOVE promo (20% off the entire site, Tu B'Av, 21–31 Jul) actually raise contribution profit, or mostly discount sales that would have happened anyway? Give a decision — keep / narrow / cancel — with the numbers. If incrementality can't be proven, say so explicitly."
  },
  {
    id: "B · INTENSE 50 (NEW50 20% + PAZ)",
    he: "עבור בושם INTENSE 50 בין 1 ביולי ל-31 באוגוסט 2026: כמה יחידות נמכרו, וכמה מההזמנות השתמשו בקופון NEW50 או PAZ מול ללא קופון? ההנחה של 20% יחד עם מתנת הקנייה (PAZ) — השתלמה, או מימנה ביקוש שהיה קורה גם בלעדיה? התייחסי לאינקרמנטליות רק אם הנתונים תומכים.",
    en: "For INTENSE 50 between 1 Jul and 31 Aug 2026: how many units sold, and what share of orders used coupon NEW50 or PAZ vs no coupon? Did the 20% discount plus the PAZ gift-with-purchase pay for itself, or fund demand that would have happened anyway? Only claim incrementality if the data supports it."
  },
  {
    id: "C · RECETTE 702 10% on restock",
    he: "עבור בושם RECETTE 702: הראי יחידות שבועיות ושימוש בקופון 702 בין מאי לאוגוסט 2026. האם הבושם הזה היה צריך את הנחת ה-10% עם החזרה למלאי, או שהביקוש היה חזק גם בלי ההנחה? החלטה עם המספרים.",
    en: "For RECETTE 702: show weekly units and coupon-702 usage from May to August 2026. Did it need the 10% restock discount, or was demand strong without it? Give a decision with the numbers."
  }
];

const line = (c) => console.log(c);

for (const c of CASES) {
  line("\n" + "=".repeat(78));
  line("# " + c.id);
  line("=".repeat(78));
  line("Q: " + (locale === "he" ? c.he : c.en) + "\n");
  const toolCalls = [];
  try {
    const answer = await runBiChatTurn({
      storeId,
      locale,
      question: locale === "he" ? c.he : c.en,
      section: "/growth-agent",
      onToolCall: (name, args) => {
        toolCalls.push({ name, args });
        const win = args.start && args.end ? `start=${args.start} end=${args.end}` : args.days != null ? `days=${args.days}` : "(no window)";
        line(`  → tool: ${name}  [${win}]  ${JSON.stringify(args)}`);
      }
    });
    line("\n--- Hiloma's answer ---\n" + answer);
    const usedHistorical = toolCalls.some((t) => t.args.start && t.args.end);
    line(`\n[meta] tools called: ${toolCalls.length} · used historical start/end window: ${usedHistorical ? "YES" : "NO"}`);
  } catch (err) {
    line("ERROR: " + (err instanceof Error ? err.message : String(err)));
  }
}

line("\nDone. Paste this output + the output of decision-backtest-abc.mjs back for grading.");
process.exit(0);
