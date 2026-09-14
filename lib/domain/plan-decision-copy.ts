// Plan-decision copy — the words a plan decision puts in front of the manager.
//
// Four rules (owner, 2026-09-14):
//   1. A REVIEW hook answers the question it asked — continue, change, stop —
//      or says explicitly that there is not enough evidence to choose. An
//      option is never forced because one number looks good.
//   2. Decision first, evidence second.
//   3. Every number carries its scope in the sentence: which entities, which
//      days, compared with what. Provisional mappings are named as such.
//   4. needs_context is a BLOCKED evaluation, not a recommendation: say what
//      is missing and offer the resolve action.
// Conditional (discount) hooks keep their activate / shallower / hold
// vocabulary — that matches the question those hooks ask.
//
// Pure and unit-tested. The decision builder only assembles.

import type { Localized } from "@/lib/domain/decision";
import type { InitiativeRealitySummary, MappingKind } from "@/lib/domain/initiative-reality";
import { MAPPING_KIND_LABEL } from "@/lib/domain/initiative-reality";

const L = (he: string, en: string): Localized => ({ he, en });

export type ReviewVerdict = "continue" | "change" | "stop" | "insufficient" | "blocked";

export interface ReviewRecommendation {
  verdict: ReviewVerdict;
  decision: Localized; // the answer, one sentence
  evidence: Localized; // the scoped facts, one or two sentences
  // Blocked only: what is missing and the resolve action.
  blocked: { missing: MappingKind[]; required: number; cta: Localized } | null;
  // Which option key the receipt should mark as recommended (null = none).
  recommendedOption: "keep" | "change" | "stop" | null;
}

const num = (v: string | null | undefined) => (v ? Number(v.replace(/[^\d.-]/g, "")) : null);
const kinds = (ks: MappingKind[], loc: "he" | "en") => ks.map((k) => MAPPING_KIND_LABEL[k][loc]).join(loc === "he" ? ", " : ", ");

// "מכירות 3 המוצרים המקושרים ב-14 הימים הראשונים: ₪32,480, +18% מול 14 הימים שלפני ההשקה"
export function scopedSalesSentence(r: InitiativeRealitySummary): Localized | null {
  const rev = r.metrics.find((m) => m.key === "revenue");
  if (!rev || rev.value === null) return null;
  const n = rev.provenance.length;
  const days = r.period.dayIndex;
  const vs = rev.note?.en.match(/([+-]\d+)% vs the previous comparable period/)?.[1] ?? null;
  const prov = rev.basis === "provisional";
  return L(
    `מכירות ${n} המוצרים המקושרים ב-${days} הימים הראשונים: ${rev.value}${vs ? `, ${vs}% מול ${days} הימים שלפני היוזמה` : ""}${prov ? ` (מבוסס על ${n} התאמות אוטומטיות שטרם אושרו)` : ""}`,
    `Sales of the ${n} linked product${n === 1 ? "" : "s"} in the first ${days} days: ${rev.value}${vs ? `, ${vs}% vs the ${days} days before the initiative` : ""}${prov ? ` (based on ${n} automatic match${n === 1 ? "" : "es"} not yet confirmed)` : ""}`
  );
}

// The pace clause a CONDITIONAL (discount) hook uses, with its scope.
export function scopedPaceSentence(r: InitiativeRealitySummary | null, storePace: number | null): Localized | null {
  if (r) {
    const s = scopedSalesSentence(r);
    if (s) return s;
  }
  if (storePace === null) return null;
  const pct = `${storePace >= 0 ? "+" : ""}${Math.round(storePace * 100)}%`;
  return L(`מכירות כל החנות (הקשר רחב, לא היוזמה): ${pct} ב-7 הימים האחרונים מול 7 הקודמים`, `Whole-store sales (broader context, not the initiative): ${pct} in the last 7 days vs the prior 7`);
}

function giftSentence(r: InitiativeRealitySummary): Localized | null {
  const g = r.findings.find((f) => f.kind === "gift_inventory_short");
  if (g?.product) {
    const cover = g.product.coverDays ?? 0;
    return (g.product.inventory ?? 0) <= 0
      ? L(`מלאי המתנה "${g.product.title}" אזל, ${r.period.daysRemaining} ימים נותרו לקמפיין`, `Gift stock for "${g.product.title}" is out, ${r.period.daysRemaining} campaign days remain`)
      : L(`למתנה "${g.product.title}" נשארו ${cover} ימי כיסוי בלבד מול ${r.period.daysRemaining} ימים שנותרו לקמפיין`, `The gift "${g.product.title}" has only ${cover} days of cover left against ${r.period.daysRemaining} remaining campaign days`);
  }
  const gi = r.metrics.find((m) => m.key.startsWith("gift_inventory:"));
  const gu = r.metrics.find((m) => m.key.startsWith("gift:"));
  if (gi && gi.value !== null && gi.note?.en.includes("days of cover")) return L(`מלאי המתנה מספיק ל-${gi.value} ימים מתוך ${r.period.daysRemaining} שנותרו${gu?.value ? ` (${gu.value} ניתנו)` : ""}`, `Gift stock covers ${gi.value} of the ${r.period.daysRemaining} remaining days${gu?.value ? ` (${gu.value} given)` : ""}`);
  return null;
}

function stockSentence(r: InitiativeRealitySummary): Localized | null {
  const f = r.findings.find((x) => x.kind === "inventory_short_of_window");
  if (!f?.product) return null;
  return (f.product.inventory ?? 0) <= 0
    ? L(`"${f.product.title}" אזל מהמלאי, ${r.period.daysRemaining} ימים נותרו`, `"${f.product.title}" is out of stock, ${r.period.daysRemaining} days remain`)
    : L(`ל"${f.product.title}" נשארו ${f.product.coverDays} ימי כיסוי מול ${r.period.daysRemaining} ימים שנותרו`, `"${f.product.title}" has ${f.product.coverDays} days of cover against ${r.period.daysRemaining} remaining days`);
}

function campaignSentence(r: InitiativeRealitySummary): Localized | null {
  const spend = r.metrics.find((m) => m.key === "meta_spend");
  if (!spend || spend.value === null) return null;
  const roas = r.metrics.find((m) => m.key === "meta_roas")?.value ?? null;
  const over = r.findings.find((f) => f.kind === "spend_exceeds_attributed_revenue");
  const none = r.findings.find((f) => f.kind === "campaign_no_spend");
  if (none) return L(`הקמפיין המקושר לא הוציא תקציב מאז ${r.period.start}`, `The linked campaign has spent nothing since ${r.period.start}`);
  return L(`הוצאת Meta מתחילת היוזמה ${spend.value}${roas ? `, ROAS ${roas} לפי ייחוס Meta` : ""}${over ? " — גבוהה מההכנסה שהקמפיין מייחס לעצמו" : ""}`, `Meta spend since the initiative started ${spend.value}${roas ? `, ROAS ${roas} by Meta's attribution` : ""}${over ? " — above the revenue the campaign attributes to itself" : ""}`);
}

function couponSentence(r: InitiativeRealitySummary): Localized | null {
  const c = r.metrics.find((m) => m.key === "coupon_orders");
  if (!c || c.value === null) return null;
  const unused = r.findings.some((f) => f.kind === "coupon_unused");
  const code = c.label.en.replace(/^Coupon | usage$/g, "");
  return unused ? L(`הקופון ${code} לא שימש באף הזמנה מאז ${r.period.start}`, `Coupon ${code} was not used on any order since ${r.period.start}`) : L(`${c.value} הזמנות עם הקופון ${code} מאז ${r.period.start}`, `${c.value} orders with coupon ${code} since ${r.period.start}`);
}

function marginSentence(r: InitiativeRealitySummary): Localized | null {
  const m = r.metrics.find((x) => x.key === "margin");
  if (!m || m.value === null) return null;
  const q = m.quality === "estimated" ? L("אומדן", "estimated") : L("מחושב מעלויות אמיתיות", "from real costs");
  return L(`מרווח תרומה על מכירות היוזמה ${m.value} (${q.he})`, `Contribution margin on initiative sales ${m.value} (${q.en})`);
}

const join = (parts: Array<Localized | null>): Localized => {
  const ps = parts.filter((p): p is Localized => !!p);
  return L(ps.map((p) => p.he).join(" · "), ps.map((p) => p.en).join(" · "));
};

// The review answer. Deterministic, conservative: "continue" needs sales
// evidence AND known inventory with no issue; any risk → "change" (or
// "stop" when margin is negative with real costs and sales are not
// growing); otherwise "not enough evidence to choose".
export function composeReviewRecommendation(r: InitiativeRealitySummary | null, storePace: number | null): ReviewRecommendation {
  if (!r) {
    const pace = scopedPaceSentence(null, storePace);
    return {
      verdict: "insufficient",
      decision: L("עדיין אין מספיק ראיות כדי לבחור בין להמשיך, לשנות או לעצור.", "There is not yet enough evidence to choose between continue, change or stop."),
      evidence: join([L("אין מצב יוזמה זמין להחלטה הזו", "No initiative reality is available for this decision"), pace]),
      blocked: null,
      recommendedOption: null
    };
  }
  if (r.status === "needs_context") {
    const missing = r.context.missingCritical;
    return {
      verdict: "blocked",
      decision: L("אי אפשר עדיין להעריך אם להמשיך, לשנות או לעצור.", "It is not yet possible to evaluate whether to continue, change or stop."),
      evidence: L(`חסרים: ${kinds(missing, "he")}.`, `Missing: ${kinds(missing, "en")}.`),
      blocked: { missing, required: r.context.required, cta: L(`השלם ${r.context.required} חיבורים`, `Complete ${r.context.required} connection${r.context.required === 1 ? "" : "s"}`) },
      recommendedOption: null
    };
  }
  const sales = scopedSalesSentence(r);
  const gift = giftSentence(r);
  const stock = stockSentence(r);
  const campaign = campaignSentence(r);
  const coupon = couponSentence(r);
  const margin = marginSentence(r);
  const rev = r.metrics.find((m) => m.key === "revenue");
  const vs = num(rev?.note?.en.match(/([+-]\d+)% vs the previous comparable period/)?.[1] ?? null);
  const risks = r.findings.filter((f) => f.severity === "risk");
  const attention = r.findings.filter((f) => f.severity === "attention");
  const negativeMargin = risks.some((f) => f.kind === "negative_margin");
  const noSales = attention.some((f) => f.kind === "no_sales_since_start" || f.kind === "half_window_no_activity");
  const inventoryKnown = r.metrics.some((m) => (m.key.startsWith("inventory:") || m.key.startsWith("gift_inventory:")) && m.value !== null);
  const evidence = join([sales, gift ?? stock, campaign, coupon, margin]);

  if (r.status === "insufficient_data" || !sales) {
    return { verdict: "insufficient", decision: L("עדיין אין מספיק ראיות כדי לבחור בין להמשיך, לשנות או לעצור.", "There is not yet enough evidence to choose between continue, change or stop."), evidence: evidence.en ? evidence : L("אין עדיין מכירות מדודות של המוצרים המקושרים.", "No measured sales of the linked products yet."), blocked: null, recommendedOption: null };
  }
  if (negativeMargin && (noSales || (vs !== null && vs < 0))) {
    return { verdict: "stop", decision: L("לעצור.", "Stop."), evidence, blocked: null, recommendedOption: "stop" };
  }
  if (risks.length || attention.some((f) => f.kind === "spend_exceeds_attributed_revenue" || f.kind === "coupon_unused" || f.kind === "campaign_no_spend")) {
    const what = risks.find((f) => f.kind === "gift_inventory_short")
      ? L("לשנות את ההצעה: להחליף את המתנה או לסיים את ההטבה לפני שהמלאי נגמר.", "Change the offer: replace the gift or end the perk before its stock runs out.")
      : risks.find((f) => f.kind === "inventory_short_of_window")
        ? L("לשנות את התוכנית: לקצר את היוזמה או לחדש מלאי.", "Change the plan: shorten the initiative or restock.")
        : negativeMargin
          ? L("לשנות את ההצעה: הרווחיות שלילית.", "Change the offer: profitability is negative.")
          : L("לשנות: הקמפיין או הקופון לא עובדים כמתוכנן.", "Change: the campaign or the coupon is not working as planned.");
    return { verdict: "change", decision: what, evidence, blocked: null, recommendedOption: "change" };
  }
  if (noSales) {
    return { verdict: "insufficient", decision: L("עדיין אין מספיק ראיות כדי לבחור: אין מכירות מדודות מאז תחילת היוזמה.", "Not enough evidence to choose yet: no measured sales since the initiative started."), evidence, blocked: null, recommendedOption: null };
  }
  if (inventoryKnown && r.inventory.atRisk === 0) {
    return { verdict: "continue", decision: L("להמשיך כמתוכנן.", "Continue as planned."), evidence, blocked: null, recommendedOption: "keep" };
  }
  return {
    verdict: "insufficient",
    decision: L("עדיין אין מספיק ראיות כדי לבחור בין להמשיך, לשנות או לעצור.", "There is not yet enough evidence to choose between continue, change or stop."),
    evidence: join([evidence, inventoryKnown ? null : L("המלאי של המוצרים המקושרים לא ידוע", "Inventory of the linked products is unknown")]),
    blocked: null,
    recommendedOption: null
  };
}

// "בדיקה שהתוכנית קבעה ל-2026-09-01 · יום 14 מתוך 30"
export function reviewWhyNow(r: InitiativeRealitySummary | null, windowStart: string, kind: "review" | "conditional"): Localized {
  const head = kind === "review" ? L(`בדיקה שהתוכנית קבעה ל-${windowStart}`, `Review scheduled by the plan for ${windowStart}`) : L(`הפעלה שהתוכנית קבעה ל-${windowStart}`, `Activation scheduled by the plan for ${windowStart}`);
  if (!r) return head;
  const day = r.period.start <= r.period.today && r.period.end >= r.period.today ? L(`יום ${r.period.dayIndex} מתוך ${r.period.totalDays}`, `day ${r.period.dayIndex} of ${r.period.totalDays}`) : null;
  const tail = r.status === "needs_context" ? L(`חסרים ${r.context.required} חיבורים`, `${r.context.required} connection${r.context.required === 1 ? "" : "s"} missing`) : (scopedSalesSentence(r) ?? null);
  return join([head, day, tail]);
}
