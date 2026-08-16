// Hebrew AI-generated Instagram + affiliate insights for the weekly report.
//
// Produces 3 short blocks the same shape as the Meta Ads insights so the
// print page can render them in a matching layout:
//   • hookLine — one sentence summarising the Instagram week
//   • observations — patterns the AI saw across affiliates and posts
//   • actions — recommended outreach / content moves
//
// Inputs fed to the model:
//   • Per-affiliate roster including silent ones (so it can spot who's
//     dormant)
//   • Posts in the last 30 days with engagement
//   • Optional sales attribution (which affiliates drove orders)
//
// Provider: same gpt-4o-mini path as Meta Ads insights.

export interface InstagramAffiliateSummary {
  username: string;
  displayName?: string | null;
  status: "stored" | "scanned" | "handle_saved" | "missing";
  postsStored: number;
  lastPostAt?: string | null;
  attributedSales?: number;
  attributedOrders?: number;
}

export interface InstagramPostSummary {
  username: string;
  postedAt: string; // YYYY-MM-DD
  likes: number;
  comments: number;
  captionPreview?: string | null;
}

export interface InstagramInsightsInput {
  dateRange: { start: string; end: string };
  affiliates: InstagramAffiliateSummary[];
  recentPosts: InstagramPostSummary[];
}

export interface InstagramInsights {
  hookLine: string;
  observations: string[];
  actions: string[];
}

const OPENAI_MODEL = "gpt-4o-mini";

// Deterministic fallback — same shape / same intent as the Meta version.
// Derives observations and actions from the affiliate roster + posts we
// already have. Runs only when both the BI agent and OpenAI failed.
function fallback(isHe: boolean, summary: InstagramInsightsInput): InstagramInsights {
  const total = summary.affiliates.length;
  const active = summary.affiliates.filter((a) => a.status === "stored").length;
  const money = (n: number) => `₪${Math.round(n).toLocaleString(isHe ? "he-IL" : "en-US")}`;

  const hookLine = isHe
    ? `${active} מתוך ${total} משפיענים פעילים השבוע · ${summary.recentPosts.length} פוסטים ב30 הימים האחרונים.`
    : `${active} of ${total} affiliates active this week · ${summary.recentPosts.length} posts in the last 30 days.`;

  const observations: string[] = [];
  const actions: string[] = [];

  // Top affiliate by attributed sales.
  const topByCash = [...summary.affiliates]
    .filter((a) => (a.attributedSales ?? 0) > 0)
    .sort((a, b) => (b.attributedSales ?? 0) - (a.attributedSales ?? 0))[0];
  if (topByCash) {
    observations.push(
      isHe
        ? `@${topByCash.username} הובילה עם ${money(topByCash.attributedSales ?? 0)} ב${topByCash.attributedOrders ?? 0} הזמנות.`
        : `@${topByCash.username} led with ${money(topByCash.attributedSales ?? 0)} across ${topByCash.attributedOrders ?? 0} orders.`
    );
  }

  // Silent affiliates — configured but no posts or no store scan match.
  const silent = summary.affiliates.filter(
    (a) => a.postsStored === 0 || a.status === "handle_saved" || a.status === "missing"
  );
  if (silent.length >= 2) {
    const names = silent.slice(0, 3).map((a) => `@${a.username}`).join(", ");
    observations.push(
      isHe
        ? `${silent.length} משפיענים ללא פוסט ב30 יום: ${names}${silent.length > 3 ? " ועוד" : ""}.`
        : `${silent.length} affiliates with no posts in 30 days: ${names}${silent.length > 3 ? " and more" : ""}.`
    );
  }

  // Top post by engagement.
  const topPost = [...summary.recentPosts].sort(
    (a, b) => b.likes + b.comments - (a.likes + a.comments)
  )[0];
  if (topPost && topPost.likes + topPost.comments > 20) {
    observations.push(
      isHe
        ? `הפוסט הכי חזק ב30 יום: @${topPost.username} מ${topPost.postedAt} — ${topPost.likes} לייקים, ${topPost.comments} תגובות.`
        : `Top post in 30 days: @${topPost.username} on ${topPost.postedAt} — ${topPost.likes} likes, ${topPost.comments} comments.`
    );
  }

  // Actions.
  if (topByCash) {
    actions.push(
      isHe
        ? `הציעו ל@${topByCash.username} קוד בלעדי או עמלה גבוהה יותר — היא מובילה את החודש.`
        : `Offer @${topByCash.username} an exclusive code or bumped commission — she's leading the month.`
    );
  }
  if (silent.length >= 2) {
    const names = silent.slice(0, 2).map((a) => `@${a.username}`).join(", ");
    actions.push(
      isHe
        ? `פנו ל${names} — לא פרסמו ב30 יום, שווה לחדש את הקשר או להסיר מהרשימה הפעילה.`
        : `Reach out to ${names} — no posts in 30 days; renew the relationship or drop from the active roster.`
    );
  }
  if (topPost && actions.length < 3) {
    actions.push(
      isHe
        ? `בקשו מ@${topPost.username} להשקיע יותר בפורמט הזה — האנגייג'מנט מוכיח שהוא עובד.`
        : `Ask @${topPost.username} to lean into this format — the engagement shows it works.`
    );
  }

  if (observations.length === 0) {
    observations.push(
      isHe
        ? "אין מספיק פעילות ב30 הימים האחרונים כדי לזהות דפוס — הטבלאות למטה מציגות את הרוסטר המלא."
        : "Not enough activity in the last 30 days to spot a pattern — the tables below have the full roster."
    );
  }
  if (actions.length === 0) {
    actions.push(
      isHe
        ? "הפעילו את המשפיענים הרשומים — לחצו על השם כדי לפתוח שרשור הודעה דרך פורטל השותפים."
        : "Activate configured affiliates — click a name to open a message thread from the partner portal."
    );
  }

  return {
    hookLine,
    observations: observations.slice(0, 4),
    actions: actions.slice(0, 3)
  };
}

import { generateInsightsJson } from "@/lib/clients/ai-insights-client";

interface RawInsights {
  hookLine?: string;
  observations?: string[];
  actions?: string[];
}

function buildUserPrompt(input: InstagramInsightsInput): string {
  const lines: string[] = [];
  lines.push(`Date range: ${input.dateRange.start} → ${input.dateRange.end}`);
  lines.push("");

  // Affiliate roster — including silent ones so the AI can call them out.
  lines.push(`AFFILIATE ROSTER (${input.affiliates.length} configured):`);
  for (const a of input.affiliates) {
    const sales = a.attributedSales ?? 0;
    const orders = a.attributedOrders ?? 0;
    lines.push(
      `  @${a.username}${a.displayName ? ` (${a.displayName})` : ""} — status:${a.status} | postsStored:${a.postsStored} | lastPost:${a.lastPostAt?.slice(0, 10) ?? "never"} | attributedSales:₪${sales.toFixed(0)} | attributedOrders:${orders}`
    );
  }
  lines.push("");

  // Posts sorted by engagement so the AI sees the strongest content first.
  lines.push(`RECENT POSTS LAST 30 DAYS (${input.recentPosts.length} posts):`);
  const sorted = input.recentPosts
    .slice()
    .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
    .slice(0, 25);
  for (const p of sorted) {
    const caption = (p.captionPreview ?? "").slice(0, 100).replace(/\s+/g, " ").trim();
    lines.push(
      `  @${p.username} ${p.postedAt} — likes:${p.likes}, comments:${p.comments}${caption ? ` | "${caption}"` : ""}`
    );
  }

  return lines.join("\n");
}

function buildSystemPrompt(locale: "he" | "en"): string {
  const heGuidance = `
שפת המוצא: עברית טבעית של מקצוען. שמות משפיענים נשארים בפורמט @username. הימנעו ממונחים שיווקיים כלליים — דברו ספציפית על מי, מה, ומה אפשר לעשות עם זה השבוע הבא.

כללי ברזל לניסוח ולפורמט (הפרה = תשובה פסולה):
1. טקסט נקי בלבד — אסור סימוני markdown: בלי כוכביות (**), בלי backticks. הדוח מדפיס את הטקסט כמו שהוא.
2. בלי סימני + או - לפני מספרים: "עלה 20%" / "ירד 15%", לא "+20%".
3. רלוונטיות למנהל בלבד: אל תזכירו סטטוסים טכניים של הסורק ('stored', 'crawl', 'פוסטים שמורים 0'). משפיענית נכנסת לתובנה רק אם יש לה נתון עסקי אמיתי (מכירות משויכות, קופון שמומש, פוסט עם ביצועים). אם אין נתונים עסקיים לאף אחת — החזירו תובנה אחת בלבד שאומרת זאת בפשטות, בלי רשימת שמות.
4. אל תמליצו "לשלוח קוד קופון" למי שאין שום ראיה שפעילה — המלצה כזו חייבת נימוק מהנתונים.
5. בלי מקף מחבר בין אות שימוש למילה לועזית: "ל@username", "הROAS".
6. גבולות סמכות — אתם אנליסטים, לא מנהלי אנשים. שיתוף פעולה עם שותפה הוא מערכת יחסים עסקית שהסוכן לא מכיר את תנאיה. לכן:
   אסור בהחלט: להורות "להסיר מהרשימה", להציב אולטימטומים ("אחרת תוסרנה"), להגדיר יעדי תפוקה לאנשים, "לגייס" או "לסיים התקשרות".
   מותר: לכל היותר הצעת בדיקה אחת ומנומקת ("שווה לבדוק מול @X אם הקוד שלה עדיין בשימוש — 0 מימושים החודש").
7. עדיפות הפעולות: דברים שהמערכת או הבעלים יכולים לבצע ישירות באתר ובקמפיינים — עמוד מוצר, הצעה, קופון קיים, תקציב מודעות, קריאייטיב. פעולה על אנשים היא תמיד האחרונה, ורק כהצעת בדיקה.`;

  const enGuidance = `Write in clear English. Founder-readable, concrete, no marketing jargon.`;

  // CRITICAL — put the language directive at the TOP. The model otherwise
  // tends to mirror the language of the data dump (English handles +
  // English status enums) and produce English output even when the
  // language hint is at the end of the prompt.
  const languageHeader =
    locale === "he"
      ? "ענה אך ורק בעברית. כל המחרוזות בJSON (hookLine, observations, actions) חייבות להיות בעברית טבעית. אסור להחזיר אנגלית מלבד שמות @handles, מספרים, וROAS."
      : "Respond exclusively in English. All strings in the JSON must be in English.";

  return [
    languageHeader,
    "",
    "You are a senior creator-marketing manager producing the Instagram block of a Shopify brand's weekly report.",
    "",
    "You receive: a roster of every configured affiliate (including silent ones), and the last 30 days of crawled posts with engagement counts.",
    "",
    "Your job: identify SPECIFIC PATTERNS that help the brand owner decide who to invest in, who to nudge, and what content is working.",
    "",
    "DO say things like:",
    '  • "@taliasol drove 64% of all affiliate engagement this month with 3 posts averaging 458 likes. She is the clear creative anchor — worth offering an exclusive code or higher commission."',
    '  • "@advarois and @lee_alon are configured but haven\'t posted anything brand-related in 30 days. Reach out before next cycle or remove from the active roster."',
    '  • "Reels are outperforming static posts ~3x in engagement. Consider asking creators to lead with Reels next month."',
    "",
    "DO NOT say things like:",
    '  • "There were 5 posts this month."  (just restates a count)',
    '  • "Engagement was good."  (vague, no numbers)',
    '  • "Consider boosting affiliate strategy."  (no concrete next step)',
    "",
    "REQUIRED JSON STRUCTURE — return ONLY this, no prose, no markdown, no code fences:",
    "{",
    '  "hookLine": "ONE sentence, 12-22 words, naming the most important pattern. Use a number.",',
    '  "observations": [',
    '    "2 to 4 bullets. Each must name a specific @handle (or specific post if it is a content pattern), cite a real number, and explain what it means."',
    "  ],",
    '  "actions": [',
    '    "2 to 3 verb-led recommendations for next week. Each must name a specific @handle and a specific outcome (a code, an outreach message, a content brief)."',
    "  ]",
    "}",
    "",
    "RULES:",
    "1. Never invent handles, posts, or numbers not in the data.",
    "2. Every observation must name at least one specific @handle.",
    "3. Silent affiliates (status \"handle_saved\" or 0 posts stored) are a high-signal observation — point them out by name.",
    "4. If one affiliate is clearly dominant in engagement, say so by name and number.",
    "5. Maximum 4 observations, maximum 3 actions.",
    "",
    locale === "he" ? heGuidance : enGuidance
  ].join("\n");
}

export async function generateInstagramInsights(
  input: InstagramInsightsInput,
  locale: "he" | "en" = "he"
): Promise<InstagramInsights> {
  const fb = fallback(locale === "he", input);
  const parsed = await generateInsightsJson<RawInsights>({
    systemPrompt: buildSystemPrompt(locale),
    userPrompt: buildUserPrompt(input),
    openaiModel: OPENAI_MODEL,
    temperature: 0.5,
    maxTokens: 800,
    jsonHint: 'object with hookLine:string, observations:string[2-4], actions:string[2-3]'
  });
  if (!parsed) return fb;
  return {
    hookLine:
      typeof parsed.hookLine === "string" && parsed.hookLine.trim()
        ? parsed.hookLine.trim()
        : fb.hookLine,
    observations:
      Array.isArray(parsed.observations) && parsed.observations.length > 0
        ? parsed.observations.map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
        : fb.observations,
    actions:
      Array.isArray(parsed.actions) && parsed.actions.length > 0
        ? parsed.actions.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
        : fb.actions
  };
}
