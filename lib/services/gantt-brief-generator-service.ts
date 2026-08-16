// Marketing-brief generator.
//
// Turns a parsed Gantt into the structured monthly brief format the
// operator's team already uses (see reference PDFs in the design source:
// "בריף אפטר שאוור // אוקטובר/נובמבר/דצמבר"). Sections match those
// docs 1:1 so the output is drop-in replaceable.
//
// Data comes from:
//   1. The Gantt rows (task text, dates, category, role, action)
//   2. Pattern-extraction on task text (coupon codes, prices, URLs,
//      exclusions) — deterministic, no LLM cost
//   3. The BI agent — structures the rows into sections and writes the
//      theme sentence + campaign summary + KPI targets. Rows are pre-
//      digested so the agent doesn't have to invent anything.

import { askBiAgentJson, isBiAgentConfigured } from "@/lib/clients/bi-agent-client";

// ─── Types ────────────────────────────────────────────────────────────

// One offer/campaign entry. Matches the "each offer" pattern in the
// reference briefs: headline + validity + coupon + body + exclusions.
export interface BriefOffer {
  // 1-line bold pink headline (e.g. "20% הנחה + מתנה בכל רכישה מעל 199 ש״ח").
  headline: string;
  // Optional owner role — drives the "who's responsible" callout.
  ownerRole?: string | null;
  // Free-form body — 1-3 sentences of context. The agent copies from
  // the source task and cleans it up (no invention).
  body?: string | null;
  // ISO date strings. `end` may be null when the offer runs "עד גמר המלאי"
  // (until stock lasts) — display "עד גמר המלאי" in that case.
  validityStart: string | null;
  validityEnd: string | null;
  // Time-of-day cutoff. Defaults to "23:59" in the reference briefs.
  validityEndTime?: string | null;
  // The customer-facing code (e.g. "LIHI", "SET15"). Rendered as a
  // prominent chip; case-preserved so branded codes stay intact.
  couponCode?: string | null;
  // Optional deep link.
  url?: string | null;
  // Exclusion / condition bullets. The reference briefs standardise
  // these: "לא כולל כפל מבצעים", "בהזנת קוד קופון: X", etc.
  conditions: string[];
  // Callouts extracted from the source task:
  //   - "critical" — coupon code missing but text implies one, OR the
  //     dates span into another month, OR a launch with no supporting
  //     creative task on the same day
  //   - "info" — informational note that's not a hard blocker
  callouts?: Array<{ level: "critical" | "warning" | "info"; text: string }>;
  // Optional KPI target for this campaign (revenue, orders, ROAS).
  kpiTarget?: string | null;
  // Source row ids so the UI can back-link to specific Gantt cells.
  sourceRowIds?: string[];
}

// Grouping for the influencer section. Each influencer gets their own
// sub-heading + list of pieces (pulse launch → reminder → close).
export interface BriefInfluencerBlock {
  influencerName: string;
  offers: BriefOffer[];
}

export interface MarketingBrief {
  // Header — brand name, month, theme sentence, cover summary, KPIs.
  header: {
    brandName: string;
    monthLabel: string;
    // The one-sentence framing on the cover ("סוכות וחוה\"מ ורגיעה
    // לפני חגי נובמבר"). LLM-generated from the campaign shape.
    theme?: string | null;
    // 3-6 line executive summary of the month.
    campaignSummary?: string | null;
    // KPI target chips. Text like "20K תקציב", "ROAS 2-3", "50 הזמנות".
    kpis?: string[];
  };
  // Section 1: permanent offers (shipping / club / abandoned cart).
  // These are shop-wide constants — the operator can edit the defaults
  // per-store later; for now they're auto-populated from reasonable
  // defaults and overridden by anything the agent finds in the Gantt.
  permanentOffers: {
    shipping: { text: string; conditions?: string[] };
    memberSignup: { text: string; couponCode?: string | null; conditions?: string[] };
    abandonedCart: { text: string; couponCode?: string | null; conditions?: string[] };
  };
  // Section 2: influencer coupon campaigns.
  influencerBlocks: BriefInfluencerBlock[];
  // Section 3: site-wide built-in discounts.
  siteDiscounts: BriefOffer[];
  // Section 4: paid promotion brief.
  paidPromotion: {
    // "20K כלל הכל בפנים | כולל טיקטוק 2-3 ROAS"
    budgetSummary?: string | null;
    roasTarget?: string | null;
    campaigns: BriefOffer[];
  };
  // Section 5: UGC / creative content requirements.
  ugcContent: string[];
  // Metadata
  generatedAt: string;
  rowCount: number;
}

// ─── Pattern extractors (deterministic — no LLM) ──────────────────────

// "קוד להטבה: welcome" / "קוד קופון: LIHI" / "קופון: NAME15" — an operator
// writing the keyword means it; this is the high-confidence pattern.
const COUPON_KEYWORD_PATTERN =
  /(?:קוד(?:\s+קופון)?(?:\s+להטבה)?|קופון)\s*[:\-]\s*([A-Z0-9][A-Z0-9_\-]{1,32})/i;
// Inline uppercase token (2-16 chars) — a much weaker signal, so it gets
// filtered against marketing vocabulary below.
const COUPON_INLINE_PATTERN = /\b([A-Z][A-Z0-9]{1,15})(?=\s|$|[.,)])/g;

// Uppercase tokens that look like inline coupon codes but never are —
// marketing acronyms and channel names that briefs are full of. Without
// this list, "בושם 702 BUY1 GET2" put "BUY1" on the offer card as the
// customer-facing coupon code.
const COUPON_STOPWORDS = new Set([
  "THE", "AND", "OR", "PDF", "URL", "ROAS", "UGC", "KPI", "SALE", "NEW",
  "SMS", "ASAP", "BOGO", "LIVE", "STORY", "REELS", "REEL", "POST", "FREE",
  "GIFT", "TIKTOK", "END", "TBD", "TBA", "EOD", "ETA", "FAQ", "DIY", "CTA",
  "ASAP", "AB", "QA"
]);
// Shape-based rejects: BXGY mechanics ("BUY1", "GET2"), budget shorthand
// ("20K"), quarter markers ("Q3").
const COUPON_REJECT_SHAPES: RegExp[] = [/^(BUY|GET)\d{0,3}$/, /^\d{1,3}K$/, /^[QH]\d$/];

export function extractCouponCode(text: string): string | null {
  const keyworded = text.match(COUPON_KEYWORD_PATTERN);
  if (keyworded?.[1] && keyworded[1].length >= 2) {
    return keyworded[1];
  }
  // Scan ALL inline candidates and take the first that isn't marketing
  // noise — so "BUY1 GET2 SET15" still yields SET15.
  for (const m of text.matchAll(COUPON_INLINE_PATTERN)) {
    const candidate = m[1];
    if (!candidate || candidate.length < 2) continue;
    const upper = candidate.toUpperCase();
    if (COUPON_STOPWORDS.has(upper)) continue;
    if (COUPON_REJECT_SHAPES.some((re) => re.test(upper))) continue;
    return candidate;
  }
  return null;
}

export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

const KNOWN_EXCLUSION_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /לא\s+כולל\s+כפל\s+מבצעים/, label: "לא כולל כפל מבצעים" },
  { pattern: /לא\s+כולל\s+(?:הטבת\s+)?הרשמה\s+למועדון/, label: "לא כולל הטבת הרשמה למועדון" },
  { pattern: /לא\s+כולל\s+מארזים/, label: "לא כולל מארזים" },
  { pattern: /משלוח\s+חינם\s+מעל\s+150/, label: "משלוח חינם מעל 150₪" },
  { pattern: /בהוספת\s+המוצרים\s+לסל/, label: "בהוספת המוצרים לסל" },
  { pattern: /תקף\s+לרכישה\s+1\s+פר\s+הזמנה/, label: "תקף לרכישה 1 פר הזמנה" }
];

export function extractConditions(text: string): string[] {
  const out: string[] = [];
  for (const { pattern, label } of KNOWN_EXCLUSION_KEYWORDS) {
    if (pattern.test(text) && !out.includes(label)) out.push(label);
  }
  return out;
}

// Detect a percentage discount headline (e.g. "20%", "15% הנחה").
export function extractDiscountPct(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 99 ? n : null;
}

// ─── Digest row for the agent ─────────────────────────────────────────
//
// The agent sees pre-extracted structured facts alongside the raw text,
// so it doesn't hallucinate coupon codes or dates.

interface RowDigest {
  id: string;
  date: string | null;
  // Last day the (deduped) task appears on. Same as `date` for one-day
  // tasks; a longer span means "this offer ran date→dateEnd".
  dateEnd: string | null;
  category: string | null;
  role: string | null;
  action: string | null;
  extracted: {
    couponCode: string | null;
    url: string | null;
    discountPct: number | null;
    conditions: string[];
  };
  task: string;
}

export interface GanttRowForBrief {
  id: string;
  task: string;
  category: string | null;
  role: string | null;
  startDate: Date | null;
  endDate: Date | null;
  actionType: string | null;
}

export interface BriefGeneratorInput {
  storeBrandName: string;
  monthLabel: string; // e.g. "יולי 2026" or "November 2026"
  rows: GanttRowForBrief[];
}

function digestRow(row: GanttRowForBrief): RowDigest {
  const start = row.startDate ? row.startDate.toISOString().slice(0, 10) : null;
  const end = row.endDate ? row.endDate.toISOString().slice(0, 10) : start;
  return {
    id: row.id,
    date: start,
    dateEnd: end,
    category: row.category,
    role: row.role,
    action: row.actionType,
    extracted: {
      couponCode: extractCouponCode(row.task),
      url: extractUrl(row.task),
      discountPct: extractDiscountPct(row.task),
      conditions: extractConditions(row.task)
    },
    // Truncate to keep context small.
    task: row.task.length > 800 ? row.task.slice(0, 800) + "…" : row.task
  };
}

// ─── Row de-duplication ───────────────────────────────────────────────
//
// The matrix Gantt parser emits ONE ROW PER CALENDAR CELL. An offer the
// operator typed into 10 day-columns ("בושם 702 BUY1 GET2" across the
// whole week) therefore arrives as 10 near-identical rows — and used to
// print as 10 near-identical offer cards in the brief PDF. Collapse
// identical task texts into a single row whose validity window spans
// min(startDate)..max(endDate). This is not lossy: same text on many
// days IS one offer running across those days.

function normalizeTaskKey(task: string): string {
  return task.replace(/\s+/g, " ").trim().toLowerCase();
}

export function dedupeRowsForBrief(rows: GanttRowForBrief[]): GanttRowForBrief[] {
  const byKey = new Map<string, GanttRowForBrief>();
  for (const row of rows) {
    const key = normalizeTaskKey(row.task);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }
    // Merge the date window and remember every source row id.
    if (row.startDate && (!existing.startDate || row.startDate < existing.startDate)) {
      existing.startDate = row.startDate;
    }
    const rowEnd = row.endDate ?? row.startDate;
    const existingEnd = existing.endDate ?? existing.startDate;
    if (rowEnd && (!existingEnd || rowEnd > existingEnd)) {
      existing.endDate = rowEnd;
    }
    // Keep the most specific classification we saw (a labelled row wins
    // over an inherited-category one).
    existing.role = existing.role ?? row.role;
    existing.category = existing.category ?? row.category;
    existing.actionType = existing.actionType ?? row.actionType;
  }
  return Array.from(byKey.values());
}

// ─── Fallback brief (LLM off / failing) ───────────────────────────────
//
// If the BI agent isn't available, we still emit a usable brief by
// grouping rows heuristically. Not as polished as the LLM version but
// operator can hand-edit.

function fallbackBrief(input: BriefGeneratorInput): MarketingBrief {
  const rows = dedupeRowsForBrief(input.rows);
  // Buckets are MUTUALLY EXCLUSIVE, priority order: influencer > paid >
  // site. Before this, a row matching both the "web" role and the
  // paid-promo keywords rendered in TWO sections of the PDF.
  const influencerRows: GanttRowForBrief[] = [];
  const paidRows: GanttRowForBrief[] = [];
  const siteRows: GanttRowForBrief[] = [];
  for (const r of rows) {
    if (r.role === "affiliates") influencerRows.push(r);
    else if (/קידום|ממומן|ROAS|K\b/i.test(r.task) || r.category?.includes("ממומן")) paidRows.push(r);
    else if (r.role === "web" || r.actionType === "web_update") siteRows.push(r);
  }
  const ugcRows = rows.filter(
    (r) => r.actionType === "creative_image" || r.actionType === "creative_video"
  );

  const toOffer = (r: GanttRowForBrief): BriefOffer => ({
    headline: r.task.split(/[\n.]/)[0].slice(0, 100),
    ownerRole: r.role ?? null,
    body: r.task,
    validityStart: r.startDate?.toISOString().slice(0, 10) ?? null,
    validityEnd: r.endDate?.toISOString().slice(0, 10) ?? null,
    validityEndTime: "23:59",
    couponCode: extractCouponCode(r.task),
    url: extractUrl(r.task),
    conditions: extractConditions(r.task),
    sourceRowIds: [r.id]
  });

  const influencerBlocks: BriefInfluencerBlock[] = [];
  if (influencerRows.length) {
    influencerBlocks.push({
      influencerName: "משפיעניות",
      offers: influencerRows.map(toOffer)
    });
  }

  return {
    header: {
      brandName: input.storeBrandName,
      monthLabel: input.monthLabel,
      theme: null,
      campaignSummary: null,
      kpis: []
    },
    permanentOffers: {
      shipping: {
        text: "משלוח סטנדרטי עד 7 ימי עסקים בעלות 30₪ · משלוח חינם ברכישה מעל 150 ש\"ח"
      },
      memberSignup: {
        text: "10% הנחה נשלחים למייל לאחר הרשמה למייל וטלפון",
        couponCode: "welcome",
        conditions: ["למימוש פעם אחת בלבד ללקוח לכל החיים"]
      },
      abandonedCart: {
        text: "הנחת עגלה נטושה 15%- בתוקף ל48 שעות",
        couponCode: "חד ערכי",
        conditions: ["למימוש פעם אחת בלבד ללקוח ל48 שעות", "לא כולל מארזים"]
      }
    },
    influencerBlocks,
    siteDiscounts: siteRows.map(toOffer),
    paidPromotion: {
      budgetSummary: null,
      roasTarget: null,
      campaigns: paidRows.map(toOffer)
    },
    ugcContent:
      ugcRows.length > 0
        ? [`${ugcRows.length} משימות תוכן/עיצוב בגאנט לחודש זה`]
        : ["2 סרטוני UGC לכל הטבה (עם בנות שונות)", "מינימום 3 עיצובי גרפיקה לכל הטבה"],
    generatedAt: new Date().toISOString(),
    rowCount: input.rows.length
  };
}

// ─── LLM prompt ───────────────────────────────────────────────────────

function buildAgentPrompt(digests: RowDigest[], input: BriefGeneratorInput): string {
  // Derive the actual date range from the digest so the agent can't drift
  // to a different month. This is the fix for "the app shows December
  // dates but my file is July" — we anchor the agent explicitly.
  const validDates = digests.map((d) => d.date).filter(Boolean) as string[];
  const rangeStart = validDates.length ? validDates.reduce((a, b) => (a < b ? a : b)) : "unknown";
  const rangeEnd = validDates.length ? validDates.reduce((a, b) => (a > b ? a : b)) : "unknown";
  return [
    `You are a senior marketing operations lead for the Israeli e-commerce brand "${input.storeBrandName}".`,
    `Turn the Gantt data below into a monthly marketing brief in the EXACT format the team uses.`,
    ``,
    `ANCHOR — DATE RANGE OF THIS PLAN (every offer's validity dates MUST be inside this window):`,
    `  Start: ${rangeStart}`,
    `  End:   ${rangeEnd}`,
    `Do NOT invent dates outside this range. If a task's date field is null, mark validity as null — never guess.`,
    ``,
    `Month label: ${input.monthLabel}`,
    ``,
    `SECTIONS the brief MUST have (Hebrew content, RTL):`,
    `  1. Header — brand, month, theme sentence (1 line, sets the mood for the month), campaign summary (3-5 lines), kpis (target metrics as short chips: budget, ROAS, revenue).`,
    `  2. Permanent offers (shipping / club signup / abandoned cart) — usually the standard defaults, override only if the Gantt says something specific.`,
    `  3. Influencer coupon campaigns — grouped by influencer name.`,
    `  4. Site discounts — non-influencer built-in offers.`,
    `  5. Paid promotion brief — budgetSummary (like "20K כלל הכל בפנים | כולל טיקטוק"), roasTarget (like "2-3"), campaigns.`,
    `  6. UGC content — 2-4 bullet strings describing content requirements.`,
    ``,
    `EACH OFFER shape:`,
    `  {`,
    `    "headline": "SHORT bold Hebrew headline (e.g. \\"20% הנחה + מתנה\\")",`,
    `    "ownerRole": "web|social|graphic|affiliates|email|marketing" or null,`,
    `    "body": "1-3 sentences copy from the Gantt task",`,
    `    "validityStart": "YYYY-MM-DD" or null,`,
    `    "validityEnd": "YYYY-MM-DD" or null,`,
    `    "validityEndTime": "23:59",`,
    `    "couponCode": "CODE" or null,`,
    `    "url": "https://..." or null,`,
    `    "conditions": ["לא כולל כפל מבצעים","בהזנת קוד קופון: X"],`,
    `    "callouts": [{"level":"critical","text":"..."}],`,
    `    "kpiTarget": "..." or null,`,
    `    "sourceRowIds": ["<row id>"]`,
    `  }`,
    ``,
    `HARD RULES:`,
    `  - Use ONLY facts present in the Gantt data. Do NOT invent coupon codes, dates, prices.`,
    `  - For each offer, prefer the pre-extracted couponCode / conditions in "extracted" over your own parse.`,
    `  - Preserve the operator's Hebrew wording. Do not translate to English.`,
    `  - If a source task spans days 5–10, set validityStart=day5, validityEnd=day10.`,
    `  - Raise a "critical" callout when: the offer mentions a coupon but no code is present; the date range crosses a month boundary; a launch task has no supporting creative task on the same day.`,
    ``,
    `Row data (rows are DEDUPED: identical tasks that repeated across calendar days were merged — "date" is the first day, "dateEnd" the last; use them as validityStart/validityEnd):`,
    JSON.stringify(digests, null, 2),
    ``,
    `IMPORTANT: each row is ONE offer. Never emit two offers with the same headline — if two rows describe the same promotion, merge them into one offer.`,
    ``,
    `Output ONLY a single JSON object with these top-level keys:`,
    `  { "header": {...}, "permanentOffers": {...}, "influencerBlocks": [...], "siteDiscounts": [...], "paidPromotion": {...}, "ugcContent": [...] }`
  ].join("\n");
}

// ─── Discount audit ───────────────────────────────────────────────────
//
// Deterministic post-pass over a generated brief. Three jobs:
//   1. Duplicates INSIDE the brief — same coupon code on two different
//      offers, or the same headline twice (a dup that slipped the row
//      dedupe or the LLM).
//   2. Collisions with codes that ALREADY exist in the system (affiliate
//      codes / affiliate coupons) — creating them again in Shopify would
//      either fail or, worse, silently retarget an affiliate's discount.
//   3. Shopify-plan feasibility — every offer must be buildable as a
//      standard discount on a NON-Plus plan (percentage / fixed amount /
//      free shipping / Buy X Get Y + combination settings). Mechanics
//      that need extra setup or an app get a callout so the operator
//      finds out at brief time, not on launch day.
//
// Callouts render on the marketing-brief print page (callout-critical /
// callout-warning / callout-info styles already exist there).

export interface ExistingDiscountCode {
  code: string;
  // Where the code lives today, shown to the operator (e.g. "קוד שותף").
  source: string;
}

function collectBriefOffers(brief: MarketingBrief): BriefOffer[] {
  return [
    ...brief.influencerBlocks.flatMap((block) => block.offers ?? []),
    ...brief.siteDiscounts,
    ...(brief.paidPromotion?.campaigns ?? [])
  ];
}

function addCallout(offer: BriefOffer, level: "critical" | "warning" | "info", text: string) {
  offer.callouts = offer.callouts ?? [];
  if (!offer.callouts.some((c) => c.text === text)) {
    offer.callouts.push({ level, text });
  }
}

export function auditBriefDiscounts(
  brief: MarketingBrief,
  existingCodes: ExistingDiscountCode[] = []
): MarketingBrief {
  const offers = collectBriefOffers(brief);

  // 1a. Same coupon code on two+ different offers.
  const byCode = new Map<string, BriefOffer[]>();
  for (const offer of offers) {
    const code = offer.couponCode?.trim().toUpperCase();
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), offer]);
  }
  for (const [code, group] of byCode) {
    if (group.length > 1) {
      for (const offer of group) {
        addCallout(offer, "critical", `קוד הקופון ${code} מופיע ב-${group.length} הטבות שונות בבריף — ודאו שאין כפילות לפני יצירה בשופיפיי`);
      }
    }
  }

  // 1b. Same headline twice — duplicate offer that slipped the dedupe.
  const byHeadline = new Map<string, BriefOffer[]>();
  for (const offer of offers) {
    const key = (offer.headline ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!key) continue;
    byHeadline.set(key, [...(byHeadline.get(key) ?? []), offer]);
  }
  for (const group of byHeadline.values()) {
    if (group.length > 1) {
      for (const offer of group) {
        addCallout(offer, "warning", `הטבה זו מופיעה ${group.length} פעמים בבריף — ככל הנראה כפילות`);
      }
    }
  }

  // 2. Collision with codes that already exist in the system.
  const existing = new Map(
    existingCodes
      .filter((e) => e.code && e.code.trim())
      .map((e) => [e.code.trim().toUpperCase(), e.source] as const)
  );
  for (const offer of offers) {
    const code = offer.couponCode?.trim().toUpperCase();
    if (!code) continue;
    const source = existing.get(code);
    if (source) {
      addCallout(offer, "critical", `הקוד ${code} כבר קיים במערכת (${source}) — אל תיצרו אותו שוב בשופיפיי, או ודאו שמדובר באותה הטבה`);
    }
  }

  // 3. Standard-plan (non-Plus) feasibility per offer.
  for (const offer of offers) {
    const text = [offer.headline, offer.body, ...(offer.conditions ?? [])]
      .filter(Boolean)
      .join(" · ");

    // Tiered discount ("10% מעל 200, 15% מעל 300") — a single Shopify code
    // can't do tiers on any plan; needs one code per tier (or a Functions
    // app). Signal: explicit "מדורג", or 2+ distinct percentages combined
    // with 2+ "מעל <amount>" thresholds.
    const pcts = [...new Set(
      Array.from(text.matchAll(/(\d{1,2})\s*%/g))
        .map((m) => Number(m[1]))
        .filter((n) => n >= 1 && n <= 99)
    )];
    const thresholdCount = (text.match(/מעל\s*\d/g) ?? []).length;
    if (/מדורג|מדרג/.test(text) || (pcts.length >= 2 && thresholdCount >= 2)) {
      addCallout(offer, "warning", "הנחה מדורגת לא נתמכת בקוד אחד בשופיפיי — פצלו לקוד נפרד לכל מדרגה");
    }

    // Unique one-time codes ("חד ערכי") — Shopify can't mass-generate
    // unique codes natively on any plan; needs an app for bulk generation.
    if (/חד[\s\-]?ערכי/.test(text)) {
      addCallout(offer, "info", "קודים חד ערכיים בכמות דורשים אפליקציה — בשופיפיי עצמו ניתן ליצור קוד בודד בלבד; הגבלת שימוש-פעם-אחת-ללקוח נתמכת מובנה");
    }

    // Gift with purchase — fully supported without Plus as Buy X Get Y
    // (minimum purchase amount → gift at 100% off). Info so the operator
    // knows the exact mechanic to pick.
    if (/מתנה/.test(text) && /(מעל|ברכישה|בקנייה|בכל רכישה)/.test(text)) {
      addCallout(offer, "info", "מתנה ברכישה: להגדיר בשופיפיי כBuy X Get Y — תנאי סכום מינימום והמתנה ב100% הנחה. נתמך בכל תוכנית, ללא צורך בPlus");
    }

    // Affirmative stacking ("כולל כפל מבצעים") — supported via the
    // discount Combinations settings, but only if every participating
    // discount is marked combinable.
    if (/כפל\s+מבצעים/.test(text) && !/לא\s+כולל\s+כפל/.test(text)) {
      addCallout(offer, "warning", "כפל מבצעים דורש סימון Combinations בכל אחת מההנחות המשתתפות בשופיפיי — לוודא בהגדרת ההנחה");
    }
  }

  return brief;
}

// ─── Public entry ─────────────────────────────────────────────────────

export async function generateMarketingBrief(input: BriefGeneratorInput): Promise<MarketingBrief> {
  if (!isBiAgentConfigured() || process.env.BI_AGENT_DISABLE === "1") {
    return fallbackBrief(input);
  }
  // Dedupe BEFORE building the agent prompt: the same offer repeated over
  // 10 calendar days used to reach the agent as 10 near-identical rows,
  // and the agent dutifully echoed 10 near-identical offers into the PDF.
  // One deduped row with a date RANGE both shrinks the prompt and makes
  // the "duplicate offers" failure structurally impossible.
  const digests = dedupeRowsForBrief(input.rows).map(digestRow);
  try {
    // 75s so we finish before Cloudflare's ~100s edge timeout — if we
    // hit Cloudflare's cap we lose the ability to return JSON and the
    // client sees an HTML error page (the "char '{' is not expected"
    // parse failure). Keep this below 90s at all costs.
    const raw = await askBiAgentJson<Partial<MarketingBrief>>({
      question: buildAgentPrompt(digests, input),
      jsonHint: "object matching the MarketingBrief schema in the prompt",
      timeoutMs: 75_000
    });
    // Merge with fallback so missing keys don't leave the print page
    // rendering `undefined`. Agent fields take precedence when present.
    const fb = fallbackBrief(input);
    return {
      header: {
        brandName: raw.header?.brandName ?? fb.header.brandName,
        monthLabel: raw.header?.monthLabel ?? fb.header.monthLabel,
        theme: raw.header?.theme ?? null,
        campaignSummary: raw.header?.campaignSummary ?? null,
        kpis: Array.isArray(raw.header?.kpis) ? raw.header!.kpis : []
      },
      permanentOffers: raw.permanentOffers ?? fb.permanentOffers,
      influencerBlocks: Array.isArray(raw.influencerBlocks)
        ? raw.influencerBlocks
        : fb.influencerBlocks,
      siteDiscounts: Array.isArray(raw.siteDiscounts) ? raw.siteDiscounts : fb.siteDiscounts,
      paidPromotion: raw.paidPromotion ?? fb.paidPromotion,
      ugcContent: Array.isArray(raw.ugcContent) ? raw.ugcContent : fb.ugcContent,
      generatedAt: new Date().toISOString(),
      rowCount: input.rows.length
    };
  } catch (err) {
    console.warn("[gantt-brief-generator] agent failed:", err instanceof Error ? err.message : err);
    return fallbackBrief(input);
  }
}
