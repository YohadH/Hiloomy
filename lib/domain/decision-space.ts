// Decision Space — the realistic management options for a diagnosed
// situation, each checked for feasibility, ranked qualitatively, and
// resolved into ONE recommendation with alternatives and the conditions
// under which each alternative becomes better.
//
//   • ActionRegistry: a reusable vocabulary of business actions (not
//     channel-specific unless the action genuinely is).
//   • FeasibilityEvaluator: feasible / conditional / infeasible / unknown —
//     unknown is a branch with a condition, never a stop.
//   • RecommendationResolver: objective order = never generate demand for
//     an offer the brand cannot fulfil → protect margin → keep demand.
//     Qualitative rank; no fake forecasts.
//   • Business answer (continue / change / stop) stays separate from the
//     implementation actions that carry it out.
//
// Pure; tested in tests/unit/decision-space.test.ts.

import type { Localized } from "@/lib/domain/decision";
import { MARGIN_HEALTHY, type BusinessDiagnosis } from "@/lib/domain/business-diagnosis";

const L = (he: string, en: string): Localized => ({ he, en });

export type ActionType =
  | "CONTINUE"
  | "CONTINUE_MONITOR"
  | "SCALE"
  | "REPLENISH"
  | "TRANSFER_INVENTORY"
  | "REPLACE_GIFT"
  | "LIMIT_GIFT_TO_STOCK"
  | "SWITCH_TO_NON_STOCK_PERK"
  | "SHIFT_PRODUCT_FOCUS"
  | "REDUCE_SPEND"
  | "PAUSE_CAMPAIGN"
  | "FIX_MAPPING"
  | "VERIFY_TRACKING"
  | "SHIFT_BUDGET"
  | "TEST_CREATIVE"
  | "REDUCE_DISCOUNT"
  | "DEEPEN_DISCOUNT"
  | "ADD_BUNDLE"
  | "FIX_OFFER"
  | "FIX_CONVERSION"
  | "SHORTEN_INITIATIVE"
  | "STOP";

export type ActionFamily = "continue" | "scale" | "reduce_demand" | "reallocate" | "offer" | "product" | "creative" | "inventory" | "timing" | "measurement" | "stop";
export type BusinessAnswer = "continue" | "change" | "stop";
export type Feasibility = "feasible" | "conditional" | "infeasible" | "unknown";
export type Reversibility = "easy" | "moderate" | "hard";

export interface ActionDefinition {
  type: ActionType;
  family: ActionFamily;
  answer: BusinessAnswer; // the business answer this action implements
  label: Localized;
  applicableWhen: (d: BusinessDiagnosis) => boolean;
  feasibility: (d: BusinessDiagnosis) => { state: Feasibility; condition: Localized | null; note: Localized | null };
  concrete: (d: BusinessDiagnosis) => Localized; // the specific sentence for this situation
  expectedEffect: Localized;
  risks: Localized;
  reversibility: Reversibility;
  target?: (d: BusinessDiagnosis) => string | null;
}

export interface DecisionOption {
  type: ActionType;
  family: ActionFamily;
  answer: BusinessAnswer;
  label: Localized;
  what: Localized; // concrete
  feasibility: Feasibility;
  condition: Localized | null; // when this option is (or becomes) preferable
  note: Localized | null;
  expectedEffect: Localized;
  risks: Localized;
  reversibility: Reversibility;
  score: number; // qualitative 0..100, explained in `because`
  because: Array<{ delta: number; reason: Localized }>;
  // The entity this action moves demand/stock TO (alternative product,
  // other location). Never the constrained product itself — enforced in
  // buildDecisionSpace.
  targetId: string | null;
}

export interface FeasibilityQuestion {
  key: "replenishment" | "gift_optional" | "alternative_gift";
  productId: string | null;
  question: Localized;
  // What each answer would do to the recommendation.
  ifYes: Localized;
  ifNo: Localized;
}

export interface Recommendation {
  answer: BusinessAnswer | "insufficient";
  primary: DecisionOption | null;
  what: Localized; // decision first
  why: Localized[]; // scoped evidence
  alternatives: Array<{ option: DecisionOption; betterIf: Localized }>;
  // Why the primary beats each alternative NOW — taken from the ranking
  // reasons, not written by hand.
  versus: Array<{ type: ActionType; label: Localized; reason: Localized }>;
  wouldChange: Localized[];
  questions: FeasibilityQuestion[];
  confidence: "high" | "medium" | "low";
  confidenceReason: Localized;
  // ── The paid campaign and the initiative are TWO different questions ──
  // (owner, 2026-09-15). "Pause the campaign" never implies "cancel the
  // launch"; the lanes are answered separately.
  paidCampaign: { verdict: "pause" | "fix_mapping" | "verify_tracking" | "reduce" | "none"; line: Localized } | null;
  initiativeLine: Localized | null; // e.g. "do not cancel the launch itself yet"
  // ── Confidence split: performance vs profit. Missing COGS must never
  // silence "the campaign is not producing purchases".
  performanceConfidence: "high" | "medium" | "low";
  performanceReason: Localized;
  profitConfidence: "high" | "medium" | "low";
  profitReason: Localized;
}

const giftName = (d: BusinessDiagnosis) => d.constraint?.title ?? "";
// A verified alternative: same family, stock, cover for the window, and a
// different entity from the constrained product (the diagnosis already
// filters by id and title; the check here is the hard invariant).
const verifiedAlt = (d: BusinessDiagnosis) => {
  const c = d.constraint;
  if (!c) return null;
  const pool = c.alternatives.filter((a) => a.id !== c.productId && a.title.trim().toLowerCase() !== c.title.trim().toLowerCase() && a.inventory > 0);
  return pool.find((a) => a.coverDays === null || a.coverDays >= c.daysRemaining) ?? pool[0] ?? null;
};
const altGift = verifiedAlt;
// When new stock must arrive. Once stock is already out there is no
// countdown left — the deadline is "as soon as possible", bounded by the
// days the initiative still runs.
const deadline = (d: BusinessDiagnosis): Localized => {
  const c = d.constraint;
  if (!c) return L("", "");
  if (c.alreadyOut) return L(`בהקדם — המלאי כבר אזל והיוזמה נמשכת עוד ${c.daysRemaining} ימים`, `as soon as possible — stock is already out and the initiative runs ${c.daysRemaining} more days`);
  return L(`תוך ${c.coverDays ?? c.daysRemaining} ימים`, `within ${c.coverDays ?? c.daysRemaining} days`);
};
const whenExhausted = (d: BusinessDiagnosis): Localized => (d.constraint?.alreadyOut ? L("עכשיו — המלאי כבר אזל", "now — stock is already out") : L(`כשהמלאי הנוכחי נגמר (בעוד ~${d.constraint?.coverDays ?? 0} ימים)`, `once current stock is exhausted (in ~${d.constraint?.coverDays ?? 0} days)`));
const NO_TARGET = L("אין כרגע מוצר חלופי מאומת להעברת הביקוש.", "There is currently no verified alternative product to shift demand to.");

// ─── Action registry ─────────────────────────────────────────────────
export const ACTIONS: ActionDefinition[] = [
  {
    type: "CONTINUE",
    family: "continue",
    answer: "continue",
    label: L("להמשיך ללא שינוי", "Continue unchanged"),
    applicableWhen: () => true,
    feasibility: (d) => (d.constraint ? { state: "conditional", condition: d.replenishment.state === "possible_in_time" ? L("חידוש המלאי מגיע לפני שהמלאי נגמר", "replenishment arrives before stock runs out") : d.replenishment.state === "transfer_possible" ? L("ההעברה בין הלוקיישנים מתבצעת", "the transfer between locations is carried out") : L(`מלאי חדש של "${giftName(d)}" מגיע ${deadline(d).he}`, `new stock of "${giftName(d)}" arrives ${deadline(d).en}`), note: null } : { state: "feasible", condition: null, note: null }),
    concrete: (d) => (d.constraint ? L(`להמשיך את היוזמה ללא שינוי בהצעה`, `Continue the initiative with the offer unchanged`) : L("להמשיך את היוזמה כמתוכנן", "Continue the initiative as planned")),
    expectedEffect: L("שומר על הביקוש הקיים", "Keeps current demand"),
    risks: L("אם אילוץ מתממש, ההצעה לא תקוים", "If a constraint bites, the offer cannot be honoured"),
    reversibility: "easy"
  },
  {
    type: "CONTINUE_MONITOR",
    family: "continue",
    answer: "continue",
    label: L("להמשיך ולעקוב", "Continue and monitor"),
    applicableWhen: (d) => !d.constraint && d.scope === "none",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: (d) => L(`להמשיך כמתוכנן ולבדוק שוב בעוד ${Math.min(7, Math.max(1, Math.floor(d.time.state === "enough_time" ? 7 : 3)))} ימים`, `Continue as planned and review again in ${Math.min(7, Math.max(1, Math.floor(d.time.state === "enough_time" ? 7 : 3)))} days`),
    expectedEffect: L("ללא שינוי; מעקב", "No change; monitoring"),
    risks: L("נמוך", "Low"),
    reversibility: "easy"
  },
  {
    type: "SCALE",
    family: "scale",
    answer: "continue",
    label: L("להגדיל חשיפה", "Increase exposure"),
    applicableWhen: (d) => d.demand.state === "strong" && d.inventory.state === "healthy" && d.margin.state === "measured" && (d.marginRate ?? 0) >= MARGIN_HEALTHY,
    feasibility: (d) => ({ state: d.paid.state === "unknown" || d.paid.state === "not_running" ? "unknown" : "conditional", condition: L(`המרווח (${Math.round((d.marginRate ?? 0) * 100)}%) עומד ביעד המותג והיעילות של הקמפיין נשמרת בהגדלה`, `the margin (${Math.round((d.marginRate ?? 0) * 100)}%) meets the brand's target and campaign efficiency holds when scaled`), note: L(`סף V0: מרווח ≥ ${Math.round(MARGIN_HEALTHY * 100)}%; Hiloomy לא יודעת את יעד המרווח של המותג`, `V0 gate: margin ≥ ${Math.round(MARGIN_HEALTHY * 100)}%; Hiloomy does not know the brand's margin target`) }),
    concrete: () => L("להגדיל בהדרגה את ההשקעה בערוצים שמביאים את הביקוש, כל עוד המלאי והמרווח מחזיקים", "Gradually increase investment in the channels that bring the demand, while stock and margin hold"),
    expectedEffect: L("יותר מכירות מהיוזמה", "More sales from the initiative"),
    risks: L("יעילות יורדת בהגדלה; לחץ על המלאי", "Efficiency falls when scaled; pressure on stock"),
    reversibility: "easy"
  },
  {
    type: "REPLENISH",
    family: "inventory",
    answer: "continue",
    label: L("לחדש מלאי", "Replenish"),
    applicableWhen: (d) => !!d.constraint,
    feasibility: (d) => (d.replenishment.state === "possible_in_time" ? { state: "feasible", condition: null, note: null } : d.replenishment.state === "impossible_in_time" ? { state: "infeasible", condition: null, note: L("לא ניתן לחדש בזמן", "cannot be replenished in time") } : { state: "unknown", condition: L(`מלאי חדש של "${giftName(d)}" יכול להגיע ${deadline(d).he}`, `new stock of "${giftName(d)}" can arrive ${deadline(d).en}`), note: L("אין ל-Hiloomy מידע על זמן האספקה", "Hiloomy has no lead-time information") }),
    concrete: (d) => (d.constraint?.alreadyOut ? L(`לחדש את המלאי של "${giftName(d)}" בהקדם — הוא כבר אזל`, `Replenish "${giftName(d)}" as soon as possible — it is already out`) : L(`לחדש את המלאי של "${giftName(d)}" לפני שהוא נגמר`, `Replenish "${giftName(d)}" before it runs out`)),
    expectedEffect: L("ההצעה נמשכת עד סוף החלון", "The offer lasts to the end of the window"),
    risks: L("עלות; זמן אספקה לא ודאי", "Cost; uncertain lead time"),
    reversibility: "hard"
  },
  {
    type: "TRANSFER_INVENTORY",
    family: "inventory",
    answer: "continue",
    label: L("להעביר מלאי בין לוקיישנים", "Transfer inventory between locations"),
    applicableWhen: (d) => !!d.constraint && d.constraint.transferable.length > 0,
    feasibility: () => ({ state: "feasible", condition: null, note: L("מלאי שהמותג כבר מחזיק; אין ייצור חדש", "Stock the brand already holds; no new production") }),
    concrete: (d) => L(`לבדוק העברת ${d.constraint?.otherLocationStock ?? 0} יחידות של "${giftName(d)}" מ-${d.constraint?.transferable.map((x) => x.name).join(", ")} ל-${d.constraint?.depletedLocations.join(", ")} לפני שינוי הקמפיין, חידוש או החלפה`, `Check a transfer of ${d.constraint?.otherLocationStock ?? 0} units of "${giftName(d)}" from ${d.constraint?.transferable.map((x) => x.name).join(", ")} to ${d.constraint?.depletedLocations.join(", ")} before changing the campaign, replenishing or replacing`),
    target: (d) => d.constraint?.transferable[0]?.name ?? null,
    expectedEffect: L("מאריך את כיסוי המלאי בלי ייצור חדש", "Extends cover without new production"),
    risks: L("מרוקן את הלוקיישן השני", "Empties the other location"),
    reversibility: "moderate"
  },
  {
    type: "REPLACE_GIFT",
    family: "offer",
    answer: "change",
    label: L("להחליף את המתנה", "Replace the gift"),
    applicableWhen: (d) => d.constraint?.role === "gift",
    feasibility: (d) => (altGift(d) ? { state: "feasible", condition: null, note: L(`חלופה עם מלאי: "${altGift(d)!.title}" (${altGift(d)!.inventory} יח׳)`, `Alternative with stock: "${altGift(d)!.title}" (${altGift(d)!.inventory} u)`) } : { state: "unknown", condition: L("קיים מוצר חלופי עם מלאי מספיק", "an alternative product with enough stock exists"), note: L("לא נמצאה חלופה אוטומטית מאותה משפחה", "no alternative from the same family was found automatically") }),
    concrete: (d) => (altGift(d) ? L(`להמשיך את היוזמה ולהחליף את המתנה "${giftName(d)}" ב-"${altGift(d)!.title}" ${whenExhausted(d).he}`, `Continue the initiative and replace the "${giftName(d)}" gift with "${altGift(d)!.title}" ${whenExhausted(d).en}`) : L(`להמשיך את היוזמה ולהחליף את המתנה "${giftName(d)}" במוצר עם מלאי מספיק ${whenExhausted(d).he}`, `Continue the initiative and replace the "${giftName(d)}" gift with a product that has enough stock ${whenExhausted(d).en}`)),
    target: (d) => altGift(d)?.id ?? null,
    expectedEffect: L("הביקוש נשמר, ההצעה ניתנת לקיום", "Demand kept, the offer can be honoured"),
    risks: L("החלופה עשויה למשוך פחות", "The alternative may pull less"),
    reversibility: "easy"
  },
  {
    type: "LIMIT_GIFT_TO_STOCK",
    family: "offer",
    answer: "change",
    label: L("להגביל את המתנה למלאי הקיים", "Limit the gift to remaining stock"),
    applicableWhen: (d) => d.constraint?.role === "gift",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: (d) => L(`להמשיך את היוזמה ולהגביל את הטבת "${giftName(d)}" למלאי הקיים ("עד גמר המלאי"), ואז לעבור להטבה שאינה תלויה במלאי`, `Continue the initiative and limit the "${giftName(d)}" perk to existing stock ("while stocks last"), then switch to a perk that does not depend on stock`),
    expectedEffect: L("ההצעה מקוימת; חלק מהלקוחות לא יקבלו את המתנה", "The offer is honoured; some customers will not get the gift"),
    risks: L("אכזבה למאחרים; דורש עדכון בעמוד", "Late buyers disappointed; the page must say so"),
    reversibility: "easy"
  },
  {
    type: "SWITCH_TO_NON_STOCK_PERK",
    family: "offer",
    answer: "change",
    label: L("לעבור להטבה שאינה תלויה במלאי", "Switch to a perk that does not depend on stock"),
    applicableWhen: (d) => d.constraint?.role === "gift",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: () => L("להחליף את המתנה בהטבה שאינה תלויה במלאי — קופון, משלוח חינם או הטבה אחרת — במקום לעצור את היוזמה", "Replace the gift with a perk that does not depend on stock — a coupon, free shipping or another benefit — instead of stopping the initiative"),
    expectedEffect: L("היוזמה נמשכת בלי אילוץ מלאי", "The initiative continues without the stock constraint"),
    risks: L("ההטבה החדשה עשויה להיות פחות אטרקטיבית; עלות מרווח", "The new perk may be less attractive; margin cost"),
    reversibility: "easy"
  },
  {
    type: "SHIFT_PRODUCT_FOCUS",
    family: "product",
    answer: "change",
    label: L("להעביר את הביקוש למוצר עם מלאי עמוק", "Shift demand to a deeper-stock product"),
    applicableWhen: (d) => d.constraint?.role === "product",
    feasibility: (d) => (verifiedAlt(d) ? { state: "feasible", condition: null, note: L(`מוצרים מאותה משפחה עם מלאי: ${d.constraint!.alternatives.slice(0, 3).map((a) => a.title).join(", ")}`, `Same-family products with stock: ${d.constraint!.alternatives.slice(0, 3).map((a) => a.title).join(", ")}`) } : { state: "infeasible", condition: null, note: NO_TARGET }),
    // The sentence names a campaign only when the initiative's campaign is
    // actually linked. Without it Hiloomy does not know that the campaign is
    // the demand engine (15 Sep 2026: "move the campaign to bamboo" was said
    // while Meta was "unknown") — so the shift is about pages and promotion.
    concrete: (d) => {
      const out = d.constraint?.alreadyOut ? L("כבר אזל", "is already out") : L("עומד להיגמר", "is about to run out");
      const alt = verifiedAlt(d)?.title ?? "—";
      if (d.paid.state === "unknown" || d.paid.state === "not_running") {
        const why =
          d.paid.basis === null
            ? L("הקמפיין לא מקושר, ולכן לא ידוע אם הוא מנוע הביקוש", "the campaign is not linked, so whether it drives the demand is unknown")
            : d.paid.state === "not_running"
              ? L("הקמפיין המקושר לא הוציא תקציב בחלון היוזמה", "the linked campaign spent nothing in the initiative window")
              : L("הקמפיין מקושר אבל Meta לא מדווח ערך רכישה, ולכן לא ידוע אם הוא מנוע הביקוש", "the campaign is linked but Meta reports no purchase value, so whether it drives the demand is unknown");
        return L(`להפנות את הביקוש מ"${giftName(d)}" ש${out.he} ל"${alt}" בדף הבית, בקולקציה ובקידום; ${why.he}`, `Point demand from "${giftName(d)}", which ${out.en}, to "${alt}" on the homepage, the collection and promotion; ${why.en}`);
      }
      return L(`לא להמשיך להזרים תקציב ל"${giftName(d)}" ש${out.he}; להעביר את הקמפיין ל"${alt}"`, `Stop pushing budget at "${giftName(d)}", which ${out.en}; move the campaign to "${alt}"`);
    },
    target: (d) => verifiedAlt(d)?.id ?? null,
    expectedEffect: L("הביקוש נשמר על מוצר שאפשר לספק", "Demand is kept on a product that can be supplied"),
    risks: L("החלופה מוכרת פחות", "The alternative sells less"),
    reversibility: "easy"
  },
  {
    type: "REDUCE_SPEND",
    family: "reduce_demand",
    answer: "change",
    label: L("לצמצם הוצאה", "Reduce spend"),
    applicableWhen: (d) => (!!d.constraint && d.constraint.role === "product") || d.paid.state === "weak" || d.margin.state === "unprofitable",
    feasibility: (d) => ({ state: d.paid.state === "unknown" || d.paid.state === "not_running" ? "infeasible" : "feasible", condition: null, note: d.paid.state === "unknown" ? L("קמפיין לא מקושר", "campaign not linked") : null }),
    concrete: (d) => (d.paid.state === "weak" ? L("לצמצם את ההוצאה בקמפיין Meta של היוזמה עד שהיעילות משתפרת; לא לעצור את היוזמה", "Reduce spend on the initiative's Meta campaign until efficiency improves; do not stop the initiative") : L(`לצמצם את ההוצאה על "${giftName(d)}" עד שחידוש המלאי אפשרי`, `Reduce spend on "${giftName(d)}" until replenishment is possible`)),
    expectedEffect: L("פחות ביקוש שאי אפשר לספק / פחות הוצאה לא יעילה", "Less demand that cannot be served / less inefficient spend"),
    risks: L("מאט את היוזמה", "Slows the initiative"),
    reversibility: "easy"
  },
  {
    type: "PAUSE_CAMPAIGN",
    family: "reduce_demand",
    answer: "change",
    label: L("להשהות את הקמפיין הממומן", "Pause the paid campaign"),
    // Material exposure, zero purchases, measurement believable — the paid
    // execution failed; the initiative itself is judged separately.
    applicableWhen: (d) => d.funnel?.purchaseDemand === "no_observed_purchase_demand",
    feasibility: (d) => ({ state: d.paid.state === "not_running" ? "infeasible" : "feasible", condition: null, note: d.paid.state === "not_running" ? L("הקמפיין ממילא לא רץ", "the campaign is not running anyway") : null }),
    concrete: (d) => {
      const stage = d.funnel?.stages.find((s) => s.key === d.funnel?.breakStage) ?? null;
      return stage
        ? L(`להשהות את הקמפיין ולאבחן את השלב שנשבר (${stage.label.he}) לפני עוד הוצאה — קריאייטיב, קהל, דף מוצר, הצעה או טראקינג`, `Pause the campaign and diagnose the failing stage (${stage.label.en}) before spending more — creative, audience, product page, offer or tracking`)
        : L("להשהות את הקמפיין ולאבחן איפה המשפך נשבר לפני עוד הוצאה — קריאייטיב, קהל, דף מוצר, הצעה וטראקינג", "Pause the campaign and diagnose where the funnel breaks before spending more — creative, audience, product page, offer and tracking");
    },
    expectedEffect: L("עוצר הוצאה שלא מייצרת רכישות; שומר את היוזמה לשיפוט נפרד", "Stops spend that produces no purchases; the initiative is judged separately"),
    risks: L("מאבד למידה של הקמפיין; מאט את ההשקה", "Loses campaign learning; slows the launch"),
    reversibility: "easy"
  },
  {
    type: "FIX_MAPPING",
    family: "measurement",
    answer: "change",
    label: L("לתקן את המיפוי לפני כל החלטה", "Fix the mapping before any decision"),
    applicableWhen: (d) => d.funnel?.verdict === "attribution_mismatch",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: (d) =>
      L(
        `להרחיב את מיפוי המוצרים למה שהקמפיין מוכר בפועל${d.funnel?.mismatchReasons[0] ? ` — ${d.funnel.mismatchReasons[0].he}` : ""}; רק אחרי שהמדידה מכסה את המכירות אפשר לשפוט את היוזמה`,
        `Extend the product mapping to what the campaign actually sells${d.funnel?.mismatchReasons[0] ? ` — ${d.funnel.mismatchReasons[0].en}` : ""}; only once the measurement covers the sales can the initiative be judged`
      ),
    expectedEffect: L("המספרים מודדים את מה שנמכר; ההחלטה הבאה עומדת על אמת", "The numbers measure what sells; the next decision stands on truth"),
    risks: L("נמוך — פעולת מדידה, לא פעולה מסחרית", "Low — a measurement action, not a commercial one"),
    reversibility: "easy"
  },
  {
    type: "VERIFY_TRACKING",
    family: "measurement",
    answer: "change",
    label: L("לאמת את המדידה", "Verify the measurement"),
    applicableWhen: (d) => d.funnel?.verdict === "measurement_suspected",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: () => L("לאמת פיקסל, יעדי מודעות וחיבור נתונים לפני כל מסקנה עסקית — יש הוצאה בלי שלבי משפך אמינים", "Verify the pixel, ad destinations and the data connection before any business conclusion — spend exists without believable funnel stages"),
    expectedEffect: L("מפריד כשל מדידה מכשל עסקי", "Separates a measurement failure from a business failure"),
    risks: L("נמוך", "Low"),
    reversibility: "easy"
  },
  {
    type: "SHIFT_BUDGET",
    family: "reallocate",
    answer: "change",
    label: L("להעביר תקציב לערוץ יעיל יותר", "Shift budget to a more efficient channel"),
    applicableWhen: (d) => d.paid.state === "weak" && (d.offline.state === "strong" || d.demand.state === "strong"),
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: (d) => (d.creators.state === "measured" ? L("לבדוק העברת חלק מתקציב Meta לערוץ הקריאייטורים, שכבר מייצר הזמנות ליוזמה, לפני הגדלת ההוצאה הכוללת", "Test moving part of the Meta budget to the creator channel, which already produces orders for the initiative, before increasing total spend") : L("לבדוק העברת תקציב מהקמפיין החלש לערוץ שמביא את הביקוש, לפני הגדלת ההוצאה הכוללת", "Test moving budget from the weak campaign to the channel that brings the demand, before increasing total spend")),
    expectedEffect: L("אותו ביקוש בעלות נמוכה יותר", "The same demand at lower cost"),
    risks: L("הערוץ המקבל לא בהכרח מתרחב", "The receiving channel may not scale"),
    reversibility: "easy"
  },
  {
    type: "TEST_CREATIVE",
    family: "creative",
    answer: "change",
    label: L("לבדוק קריאייטיב / מסר חדש", "Test new creative / message"),
    applicableWhen: (d) => d.paid.state === "weak" || d.conversion.state === "weak",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: () => L("לבדוק קריאייטיב או מסר חדש בקמפיין (למשל תוכן קריאייטורים) לפני הגדלת ההוצאה", "Test a new creative or message in the campaign (for example creator content) before increasing spend"),
    expectedEffect: L("שיפור יעילות בלי תקציב נוסף", "Better efficiency without extra budget"),
    risks: L("לוקח זמן ללמידה", "Takes time to learn"),
    reversibility: "easy"
  },
  {
    type: "FIX_OFFER",
    family: "offer",
    answer: "change",
    label: L("לשנות את האופן שבו ההצעה נמכרת", "Change how the offer is sold"),
    applicableWhen: (d) => d.intent.state === "diverging" || d.intent.state === "partial",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: (d) => {
      const f = d.fulfillment;
      const p = f?.purchase ?? null;
      const label = p?.intendedLabel ?? "";
      if (p && p.mode === "together" && (p.orderShare ?? 1) < 0.6) {
        const missing = p.targetsNeverSold.length ? L(` לוודא שכל רכיבי הסט במלאי ובדף (${p.targetsNeverSold.join(", ")} לא נמכרו כלל).`, ` Make sure every part of the set is in stock and on the page (${p.targetsNeverSold.join(", ")} never sold).`) : L("", "");
        return L(`להמשיך את היוזמה, אבל לפני הגדלת תקציב לשנות את האופן שבו "${label}" נמכר: להפנות את הקידום לדף שבו הסט בנוי מראש כחבילה אחת, לבדוק אם מחיר הסט אטרקטיבי מול סכום החלקים, ולעדכן את מוצר ההירו.${missing.he}`, `Continue the initiative, but before adding budget change how "${label}" is sold: send promotion to a page where the set is pre-built as one bundle, check whether the set price beats the sum of the parts, and update the hero product.${missing.en}`);
      }
      if (p && (p.orderShare ?? 1) < 0.6) {
        const top = p.mix.find((m) => !m.intended && m.initiativeProduct);
        return L(`להמשיך את היוזמה, אבל לפני הגדלת תקציב ליישר את ההצעה עם מה שנקנה בפועל: ${top ? `"${top.title}" מוביל את הרכישות — ` : ""}לבחור אם "${label}" נשאר ההירו (ואז לתקן דף, מחיר והצגה) או שההצלחה נמדדת מחדש לפי מה שהלקוחות באמת קונים`, `Continue the initiative, but before adding budget align the offer with what is actually bought: ${top ? `"${top.title}" leads purchases — ` : ""}decide whether "${label}" stays the hero (then fix page, price and presentation) or whether success is re-measured by what customers really buy`);
      }
      if (f?.channel?.state === "diverges") {
        return f.channel.intended === "online"
          ? L("להמשיך את היוזמה, אבל הצמיחה מגיעה מהחנויות: לפני הגדלת תקציב אונליין לבדוק את דף הנחיתה, ההצעה והמחיר באונליין מול מה שעובד בחנות", "Continue the initiative, but the growth comes from stores: before adding online budget, check the online landing page, offer and price against what works in-store")
          : L("להמשיך את היוזמה, אבל הצמיחה מגיעה מאונליין: לבדוק את הצגת ההצעה בחנויות לפני שמסיקים על הביקוש", "Continue the initiative, but the growth comes from online: check how the offer is presented in stores before concluding on demand");
      }
      if (f?.audience?.state === "diverges") {
        return f.audience.intended === "new"
          ? L("להמשיך את היוזמה, אבל הקונים הם לקוחות קיימים: לפני הגדלת תקציב לבדוק את הקהלים והמסר — היוזמה כרגע לא מביאה לקוחות חדשים", "Continue the initiative, but the buyers are existing customers: before adding budget, check audiences and message — the initiative is not bringing new customers yet")
          : L("להמשיך את היוזמה, אבל הקונים הם לקוחות חדשים: לבדוק את הפנייה ללקוחות הקיימים (CRM, ניוזלטר) לפני שמסיקים", "Continue the initiative, but the buyers are new customers: check the outreach to existing customers (CRM, newsletter) before concluding");
      }
      return L("להמשיך את היוזמה ולתקן את ההצעה לפני הגדלת תקציב", "Continue the initiative and fix the offer before adding budget");
    },
    expectedEffect: L("הביקוש הקיים מומר להצעה שהמותג התכוון למכור", "Existing demand converts into the offer the brand meant to sell"),
    risks: L("דורש עבודה על דף / חבילה / מחיר; הלקוחות אולי מעדיפים את החלקים", "Requires page / bundle / price work; customers may simply prefer the parts"),
    reversibility: "moderate"
  },
  {
    type: "FIX_CONVERSION",
    family: "offer",
    answer: "change",
    label: L("לטפל בהמרה: הצעה, דף, מחיר", "Fix conversion: offer, page, price"),
    applicableWhen: (d) => d.conversion.state === "weak" && d.demand.state !== "strong",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: () => L("לא לקנות עוד תנועה: לבדוק את דף המוצר, את ההצעה, את המחיר ואת התאמת המסר לקריאייטיב לפני הגדלת התקציב", "Do not buy more traffic: review the product page, the offer, the price and the message-to-creative fit before adding budget"),
    expectedEffect: L("אותה תנועה, יותר מכירות", "The same traffic, more sales"),
    risks: L("דורש עבודה על האתר", "Requires site work"),
    reversibility: "moderate"
  },
  {
    type: "REDUCE_DISCOUNT",
    family: "offer",
    answer: "change",
    label: L("לצמצם את ההנחה", "Reduce the discount"),
    applicableWhen: (d) => d.margin.state === "unprofitable" || d.offer.state === "possibly_unnecessary",
    feasibility: (d) => ({ state: d.offer.state === "none" || d.offer.state === "unknown" ? "infeasible" : "feasible", condition: null, note: d.offer.state === "none" ? L("אין הנחה ביוזמה", "no discount in the initiative") : null }),
    concrete: (d) => (d.margin.state === "unprofitable" ? L("לצמצם או לבטל את ההנחה: היוזמה מוכרת אבל בהפסד", "Reduce or remove the discount: the initiative sells but at a loss") : L("לשקול הנחה רדודה יותר: הביקוש חזק גם בלי לחץ מבצעי", "Consider a shallower discount: demand is strong without promotional pressure")),
    expectedEffect: L("שיפור מרווח", "Better margin"),
    risks: L("ירידה מסוימת בהמרה", "Some drop in conversion"),
    reversibility: "easy"
  },
  {
    type: "DEEPEN_DISCOUNT",
    family: "offer",
    answer: "change",
    label: L("להעמיק את ההנחה", "Deepen the discount"),
    applicableWhen: (d) => d.demand.state === "weak" && d.inventory.state === "healthy" && d.margin.state === "measured" && (d.marginRate ?? 0) >= MARGIN_HEALTHY,
    feasibility: (d) => ({ state: "conditional", condition: L(`המרווח (${Math.round((d.marginRate ?? 0) * 100)}%) סופג הנחה עמוקה יותר לפי יעד המותג`, `the margin (${Math.round((d.marginRate ?? 0) * 100)}%) absorbs a deeper discount under the brand's target`), note: null }),
    concrete: () => L("להעמיק את ההנחה או להוסיף הטבה כדי להזיז מלאי, כל עוד המרווח מחזיק", "Deepen the discount or add a perk to move stock, while margin holds"),
    expectedEffect: L("יותר יחידות", "More units"),
    risks: L("מרווח; הרגלת לקוחות למבצעים", "Margin; training customers to wait for promotions"),
    reversibility: "easy"
  },
  {
    type: "ADD_BUNDLE",
    family: "offer",
    answer: "change",
    label: L("לבנות חבילה", "Bundle"),
    applicableWhen: (d) => d.demand.state === "weak" && d.inventory.state === "healthy",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: () => L("לשלב את המוצר בחבילה עם מוצר שנמכר טוב, במקום להוריד את המחיר שלו לבד", "Bundle the product with a strong seller instead of cutting its price alone"),
    expectedEffect: L("מזיז מלאי בלי לפגוע במחיר", "Moves stock without cutting the price"),
    risks: L("מורכבות תפעולית", "Operational complexity"),
    reversibility: "easy"
  },
  {
    type: "SHORTEN_INITIATIVE",
    family: "timing",
    answer: "change",
    label: L("לקצר את היוזמה", "Shorten the initiative"),
    applicableWhen: (d) => !!d.constraint && d.constraint.role === "product",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: (d) => (d.constraint?.alreadyOut ? L(`לסיים את היוזמה עכשיו — המלאי של "${giftName(d)}" כבר אזל — במקום להמשיך לפרסם מוצר שאין`, `End the initiative now — "${giftName(d)}" is already out — instead of advertising a product that is not there`) : L(`לסיים את היוזמה כשהמלאי של "${giftName(d)}" נגמר במקום להמשיך לפרסם מוצר שאין`, `End the initiative when "${giftName(d)}" runs out instead of advertising a product that is not there`)),
    expectedEffect: L("אין ביקוש שאי אפשר לספק", "No demand that cannot be served"),
    risks: L("מוותר על החלון שנותר", "Gives up the remaining window"),
    reversibility: "moderate"
  },
  {
    type: "STOP",
    family: "stop",
    answer: "stop",
    label: L("לעצור את היוזמה", "Stop the initiative"),
    applicableWhen: () => true,
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: () => L("לעצור את היוזמה", "Stop the initiative"),
    expectedEffect: L("אין הוצאה נוספת", "No further spend"),
    risks: L("מוותר על ביקוש קיים", "Gives up existing demand"),
    reversibility: "hard"
  }
];

// ─── Ranking (qualitative) ────────────────────────────────────────────
// Objective order: never generate demand for an offer the brand cannot
// fulfil → protect margin → keep demand. Feasibility and reversibility
// adjust; every point is explained in `because`.
function rank(def: ActionDefinition, feas: Feasibility, d: BusinessDiagnosis): { score: number; because: Array<{ delta: number; reason: Localized }> } {
  const because: Array<{ delta: number; reason: Localized }> = [];
  let s = 50;
  const demandOk = d.demand.state === "strong" || d.demand.state === "healthy";
  const add = (n: number, he: string, en: string) => {
    s += n;
    because.push({ delta: n, reason: L(he, en) });
  };
  const t = def.type;
  // Measurement outranks everything: no budget/stop decision stands on
  // numbers that measure the wrong thing (owner, 2026-09-15).
  const fv = d.funnel?.verdict ?? null;
  if (fv === "attribution_mismatch") {
    if (t === "FIX_MAPPING") add(50, "המדידה לא מכסה את מה שהקמפיין מוכר — קודם מתקנים אותה", "the measurement does not cover what the campaign sells — fix it first");
    if (t === "STOP" || t === "SHORTEN_INITIATIVE") add(-45, "אי אפשר לעצור יוזמה על סמך מדידה שלא מכסה את המכירות", "never stop an initiative on numbers that miss its sales");
    if (t === "PAUSE_CAMPAIGN" || t === "REDUCE_SPEND") add(-30, "הקמפיין ממיר לפי מטא — עצירת הוצאה לפני תיקון המדידה זורקת ביקוש", "the campaign converts by Meta — cutting spend before fixing the measurement throws demand away");
    if (t === "SCALE") add(-25, "לא מגדילים על מדידה שבורה", "never scale on broken measurement");
  }
  if (fv === "measurement_suspected") {
    if (t === "VERIFY_TRACKING") add(50, "יש הוצאה בלי שלבי משפך אמינים — קודם מאמתים את המדידה", "spend exists without believable funnel stages — verify the measurement first");
    if (t === "STOP" || t === "SCALE" || t === "PAUSE_CAMPAIGN") add(-40, "כשל מדידה חשוד אינו כשל עסקי — אין החלטה עסקית עד האימות", "a suspected measurement failure is not a business failure — no business decision until verified");
  }
  // Negative evidence: material exposure, zero purchases, believable data.
  if (d.funnel?.purchaseDemand === "no_observed_purchase_demand" && fv !== "attribution_mismatch" && fv !== "measurement_suspected") {
    if (t === "PAUSE_CAMPAIGN") add(45, "חשיפה מהותית ואפס רכישות: עוצרים את ההוצאה ומאבחנים את השלב שנשבר", "material exposure with zero purchases: stop the spend and diagnose the failing stage");
    if (t === "SCALE") add(-50, "לא קונים עוד חשיפה לתוך אפס רכישות", "never buy more exposure into zero purchases");
    if (t === "CONTINUE" || t === "CONTINUE_MONITOR") add(-25, "להמשיך ללא שינוי = עוד הוצאה בלי רכישות", "unchanged means more spend with no purchases");
    if (t === "STOP") add(-25, "כשל בביצוע הממומן עוד לא גוזר ביטול היוזמה עצמה", "a paid-execution failure does not yet cancel the initiative itself");
    if (t === "TEST_CREATIVE" && d.funnel?.breakStage === "clicks") add(12, "השבירה בשלב הקריאייטיב/קהל", "the break is at the creative/audience stage");
    if (t === "FIX_CONVERSION" && (d.funnel?.breakStage === "atc" || d.funnel?.breakStage === "ic" || d.funnel?.breakStage === "meta_purchases")) add(12, "השבירה בדף/בהצעה/בצ'קאאוט", "the break is at the page/offer/checkout");
  }
  // Fulfilment first. Under a stock constraint the prior is explicit:
  //   transfer existing stock > fast replenishment > substitute product >
  //   reduce demand > stop. It is a V0 prior, not a learned weight.
  if (d.constraint) {
    if (t === "CONTINUE") add(-30, "אילוץ מלאי: ההצעה לא ניתנת לקיום ללא שינוי", "stock constraint: the offer cannot be honoured unchanged");
    if (t === "TRANSFER_INVENTORY") add(45, "משתמש במלאי שהמותג כבר מחזיק — בלי ייצור, בלי לוותר על ביקוש", "uses stock the brand already holds — no production, no demand given up");
    if (t === "REPLENISH" && feas === "feasible") add(38, "חידוש מלאי אושר בזמן — ההצעה נשמרת כפי שתוכננה", "replenishment confirmed in time — the offer stays as planned");
    if (t === "REPLENISH" && feas === "unknown") add(15, "חידוש מלאי היה שומר על ההצעה, אבל זמן האספקה לא ידוע", "replenishment would keep the offer, but the lead time is unknown");
    if (t === "REPLACE_GIFT" || t === "SHIFT_PRODUCT_FOCUS") add(feas === "feasible" ? 25 : 12, feas === "feasible" ? "מעביר את הביקוש למוצר מאומת עם מלאי" : "מעביר את הביקוש למוצר חלופי — טרם אומת", feas === "feasible" ? "moves demand to a verified product with stock" : "moves demand to an alternative product — not yet verified");
    if (t === "LIMIT_GIFT_TO_STOCK") add(15, "ההצעה מקוימת עד גמר המלאי; חלק מהלקוחות לא יקבלו את המתנה", "the offer is honoured while stock lasts; some customers miss the gift");
    if (t === "SWITCH_TO_NON_STOCK_PERK") add(12, "פותר את אילוץ המלאי בהטבה חלשה יותר מהמתנה שתוכננה", "solves the stock constraint with a weaker perk than the planned gift");
    if (t === "REDUCE_SPEND" || t === "SHORTEN_INITIATIVE") add(8, "מצמצם ביקוש במקום לספק אותו", "reduces demand instead of serving it");
  }
  // Margin second.
  if (d.margin.state === "unprofitable") {
    if (t === "REDUCE_DISCOUNT") add(25, "המרווח שלילי: לתקן את הכלכלה לפני הכול", "margin below zero: fix the economics first");
    if (t === "SCALE" || t === "DEEPEN_DISCOUNT") add(-40, "לא מגדילים הפסד", "never scale a loss");
    if (t === "CONTINUE") add(-20, "ממשיך בהפסד", "continues at a loss");
  }
  // Demand third.
  if (demandOk) {
    if (t === "STOP") add(-40, "הביקוש בריא: עצירה מוותרת עליו", "demand is healthy: stopping gives it up");
    if (t === "SHORTEN_INITIATIVE") add(-15, "הביקוש בריא: קיצור מוותר על החלון שנותר", "demand is healthy: shortening gives up the remaining window");
    if (def.answer === "continue" && !d.constraint && d.margin.state !== "unprofitable") add(20, "ביקוש בריא ללא אילוץ", "demand healthy, no constraint");
    if (t === "DEEPEN_DISCOUNT") add(-20, "הביקוש חזק: אין צורך בלחץ מבצעי", "demand strong: no need for promotional pressure");
  }
  if (d.demand.state === "weak") {
    if (t === "CONTINUE" || t === "CONTINUE_MONITOR") add(-15, "הביקוש ירד: ללא שינוי לא סביר שיעבוד", "demand fell: unchanged is unlikely to work");
    if (t === "STOP" && d.inventory.state === "healthy") add(-10, "המלאי בריא: לשנות לפני שעוצרים", "stock is healthy: change before stopping");
    if (t === "DEEPEN_DISCOUNT" || t === "ADD_BUNDLE") add(10, "מזיז מלאי", "moves stock");
  }
  // Channel problem: fix the channel, not the initiative.
  if (d.scope === "channel") {
    if (t === "SHIFT_BUDGET" || t === "TEST_CREATIVE") add(20, "בעיית ערוץ: מתקנים את הערוץ", "channel problem: adjust the channel");
    if (t === "REDUCE_SPEND" && d.paid.state === "weak") add(10, "הערוץ החלש מוציא בלי תמורה", "the weak channel spends without return");
    if (t === "STOP") add(-20, "העסק בריא; רק ערוץ אחד חלש", "the business is healthy; only a channel is weak");
    if (t === "CONTINUE") add(-10, "ללא שינוי ממשיך לשלם על הערוץ החלש", "unchanged keeps paying for the weak channel");
  }
  if (d.conversion.state === "weak" && t === "FIX_CONVERSION") add(20, "יש עניין; ההמרה היא הפער", "interest exists; conversion is the gap");
  if (d.conversion.state === "weak" && t === "SCALE") add(-25, "לא קונים עוד תנועה לתוך המרה חלשה", "do not buy more traffic into weak conversion");
  // Intent vs reality: an offer that does not sell as planned is fixed
  // before anyone buys more traffic into it or moves a campaign onto it.
  if (d.intent.state === "diverging") {
    if (t === "FIX_OFFER") add(30, "יש ביקוש, אבל ההצעה לא נמכרת כמתוכנן — מתקנים את ההצעה לפני תקציב", "demand exists, but the offer does not sell as planned — fix the offer before budget");
    if (t === "SCALE" || t === "DEEPEN_DISCOUNT") add(-25, "לא מגדילים הצעה שלא נמכרת כמתוכנן", "do not scale an offer that does not sell as planned");
    if (t === "CONTINUE" || t === "CONTINUE_MONITOR") add(-12, "ללא שינוי ממשיך למכור לא את מה שתוכנן", "unchanged keeps selling something other than what was planned");
  }
  if (d.intent.state === "partial" && t === "FIX_OFFER") add(12, "חלק מהרכישות לא תואמות את ההצעה שתוכננה", "part of the purchases do not match the planned offer");
  // Meta effectiveness unknown: a campaign move or budget shift is a guess.
  if ((d.paid.state === "unknown" || d.paid.state === "not_running") && (t === "SHIFT_PRODUCT_FOCUS" || t === "SHIFT_BUDGET")) add(-10, "יעילות Meta לא ידועה — שינוי קמפיין הוא ניחוש", "Meta effectiveness unknown — a campaign change is a guess");
  // Feasibility and reversibility.
  if (feas === "infeasible") add(-100, "לא ישים", "infeasible");
  if (feas === "unknown") add(-12, "ישימות לא ידועה", "feasibility unknown");
  if (feas === "conditional") add(-8, "תלוי בתנאי", "depends on a condition");
  if (def.reversibility === "easy") add(5, "הפיך בקלות", "easily reversible");
  if (def.reversibility === "hard") add(-5, "קשה להפוך", "hard to reverse");
  return { score: Math.max(0, Math.min(100, s)), because };
}

export function buildDecisionSpace(d: BusinessDiagnosis): DecisionOption[] {
  return ACTIONS.filter((a) => a.applicableWhen(d))
    .map((a) => {
      const f = a.feasibility(d);
      const { score, because } = rank(a, f.state, d);
      const targetId = a.target ? a.target(d) : null;
      return { type: a.type, family: a.family, answer: a.answer, label: a.label, what: a.concrete(d), feasibility: f.state, condition: f.condition, note: f.note, expectedEffect: a.expectedEffect, risks: a.risks, reversibility: a.reversibility, score, because, targetId };
    })
    .filter((o) => o.feasibility !== "infeasible")
    // Hard invariant: an action never moves demand or stock to the entity
    // it is moving them away from.
    .filter((o) => !(o.targetId && d.constraint && o.targetId === d.constraint.productId))
    .sort((a, b) => b.score - a.score);
}

// ─── Resolver ────────────────────────────────────────────────────────
export function resolveRecommendation(d: BusinessDiagnosis, space: DecisionOption[], evidenceQuality: { basis: "confirmed" | "provisional" | "none"; stale: boolean }): Recommendation {
  const questions: FeasibilityQuestion[] = [];
  if (d.constraint && d.replenishment.state === "unknown") {
    questions.push({
      key: "replenishment",
      productId: d.constraint.productId,
      question: d.constraint.alreadyOut
        ? L(`"${d.constraint.title}" כבר אזל. אפשר לחדש אותו בימים הקרובים? (היוזמה נמשכת עוד ${d.constraint.daysRemaining} ימים)`, `"${d.constraint.title}" is already out. Can it be replenished in the next few days? (the initiative runs ${d.constraint.daysRemaining} more days)`)
        : L(`אפשר לחדש את "${d.constraint.title}" בתוך ${d.constraint.coverDays ?? d.constraint.daysRemaining} ימים?`, `Can "${d.constraint.title}" be replenished within ${d.constraint.coverDays ?? d.constraint.daysRemaining} days?`),
      ifYes: L("להמשיך ללא שינוי ולחדש מלאי", "Continue unchanged and replenish"),
      ifNo: L(d.constraint.role === "gift" ? "להחליף או להגביל את המתנה" : "להעביר את הביקוש למוצר אחר או לקצר", d.constraint.role === "gift" ? "Replace or limit the gift" : "Shift demand to another product or shorten")
    });
  }
  if (d.constraint?.role === "gift" && !d.constraint.alternatives.length) {
    questions.push({ key: "alternative_gift", productId: d.constraint.productId, question: L("יש מוצר חלופי שיכול לשמש כמתנה?", "Is there an alternative product that can serve as the gift?"), ifYes: L("להחליף את המתנה", "Replace the gift"), ifNo: L("להגביל את המתנה למלאי או לעבור להטבה אחרת", "Limit the gift to stock or switch perk") });
  }

  // Confidence split (owner, 2026-09-15): PERFORMANCE (spend + purchase
  // outcome, both verified sources) apart from PROFIT (costs). Missing COGS
  // lowers only the profit lane — it never silences "this is not selling".
  const performanceConfidence: Recommendation["performanceConfidence"] = evidenceQuality.basis === "none" ? "low" : evidenceQuality.basis === "provisional" || evidenceQuality.stale ? "medium" : "high";
  const performanceReason =
    evidenceQuality.basis === "none"
      ? L("אין ישויות ממופות למדידה", "No mapped entities to measure")
      : evidenceQuality.basis === "provisional"
        ? L("הוצאה ורכישות נמדדות, אבל על התאמות אוטומטיות שטרם אושרו", "Spend and purchases are measured, but on automatic matches not yet confirmed")
        : evidenceQuality.stale
          ? L("הוצאה ורכישות נמדדות ממטא ושופיפיי, אך הנתונים לא טריים", "Spend and purchases measured from Meta and Shopify, but the data is stale")
          : L("הוצאה ותוצאת הרכישות מאומתות ממטא ושופיפיי, והמיפוי מאושר", "Spend and the purchase outcome are verified from Meta and Shopify, and the mapping is confirmed");
  const marginEstimated = d.margin.state === "measured" && d.margin.evidence.he.includes("אומדן");
  const profitConfidence: Recommendation["profitConfidence"] = d.margin.state === "unknown" ? "low" : marginEstimated ? "medium" : "high";
  const profitReason =
    d.margin.state === "unknown"
      ? L("עלויות מוצר חסרות — אי אפשר לתרגם את הביצוע לרווח מדויק", "Product costs are missing — the performance cannot be priced precisely")
      : marginEstimated
        ? L("המרווח מבוסס חלקית על אומדן עלויות", "The margin partly rests on estimated costs")
        : L("המרווח מחושב מעלויות אמיתיות", "The margin is computed from real costs");

  const unknownsCount = d.unknowns.length;
  const confidence: Recommendation["confidence"] = evidenceQuality.basis === "none" ? "low" : evidenceQuality.basis === "provisional" || evidenceQuality.stale || unknownsCount >= 2 ? "medium" : unknownsCount === 1 ? "medium" : "high";
  const confidenceReason = L(
    `ידוע: ${[d.demand.state !== "unknown" ? "ביקוש" : null, d.inventory.state !== "unknown" ? "מלאי" : null, d.paid.state !== "unknown" ? "Meta" : null, d.margin.state !== "unknown" ? "מרווח" : null, d.offline.state !== "unknown" && d.offline.state !== "none" ? "חנויות" : null].filter(Boolean).join(", ") || "מעט"}${d.unknowns.length ? ` · לא ידוע: ${d.unknowns.map((u) => u.he).join(", ")}` : ""}${evidenceQuality.basis === "provisional" ? " · מבוסס על התאמות אוטומטיות שטרם אושרו" : ""}${evidenceQuality.stale ? " · נתונים לא טריים" : ""}`,
    `Known: ${[d.demand.state !== "unknown" ? "demand" : null, d.inventory.state !== "unknown" ? "inventory" : null, d.paid.state !== "unknown" ? "Meta" : null, d.margin.state !== "unknown" ? "margin" : null, d.offline.state !== "unknown" && d.offline.state !== "none" ? "stores" : null].filter(Boolean).join(", ") || "little"}${d.unknowns.length ? ` · Unknown: ${d.unknowns.map((u) => u.en).join(", ")}` : ""}${evidenceQuality.basis === "provisional" ? " · based on automatic matches not yet confirmed" : ""}${evidenceQuality.stale ? " · stale data" : ""}`
  );

  // A definitive funnel verdict IS evidence: material exposure with zero
  // purchases, a mapping/attribution mismatch, or a measurement suspicion
  // each pick an action — the insufficient gate is only for genuinely
  // unjudgeable cases (Case E: not enough exposure; or nothing usable).
  const funnelDefinitive = d.funnel ? d.funnel.verdict === "attribution_mismatch" || d.funnel.verdict === "measurement_suspected" || d.funnel.purchaseDemand === "no_observed_purchase_demand" : false;
  if ((d.demand.state === "unknown" && !funnelDefinitive) || evidenceQuality.basis === "none" || space.length === 0) {
    const underExposed = d.funnel?.purchaseDemand === "insufficient_exposure" && d.funnel.verdict !== "measurement_suspected";
    return {
      answer: "insufficient",
      primary: null,
      what: underExposed
        ? L(`עדיין אין מספיק ראיות: ${d.funnel!.headline.he}`, `There is not yet enough evidence: ${d.funnel!.headline.en}`)
        : L("עדיין אין מספיק ראיות כדי לבחור בין להמשיך, לשנות או לעצור.", "There is not yet enough evidence to choose between continue, change or stop."),
      why: [underExposed ? d.funnel!.detail : null, d.demand.evidence, d.inventory.evidence].filter((x): x is Localized => !!x && !!x.en),
      alternatives: [],
      versus: [],
      wouldChange: [
        L("מכירות מדודות של המוצרים המקושרים", "Measured sales of the linked products"),
        ...(underExposed ? [L("החשיפה חוצה את רף המהותיות (ואז אפס רכישות הופך לראיה)", "Exposure crosses the materiality bar (then zero purchases becomes evidence)")] : [])
      ],
      questions,
      confidence: "low",
      confidenceReason,
      paidCampaign: null,
      initiativeLine: null,
      performanceConfidence,
      performanceReason,
      profitConfidence,
      profitReason
    };
  }

  const primary = space[0];
  const alternatives = space
    .slice(1, 5)
    .map((o) => ({
      option: o,
      betterIf:
        o.condition ??
        (o.type === "TRANSFER_INVENTORY"
          ? L("ההעברה בין הלוקיישנים אפשרית בזמן", "the transfer between locations is possible in time")
          : o.type === "STOP"
          ? L("הביקוש נחלש או הרווחיות שלילית — לא מועדף כל עוד הביקוש נמשך", "demand weakens or profitability turns negative — not preferred while demand holds")
          : o.type === "REDUCE_SPEND"
            ? L("אין מתנה חלופית ואי אפשר להגביל את ההטבה", "no replacement gift exists and the perk cannot be limited")
            : o.type === "LIMIT_GIFT_TO_STOCK"
              ? L("אין מוצר חלופי למתנה", "no alternative gift product exists")
              : o.type === "REPLACE_GIFT"
                ? L("קיימת מתנה חלופית עם מלאי", "an alternative gift with stock exists")
                : o.type === "CONTINUE_MONITOR" || o.type === "CONTINUE"
                  ? L("האילוץ נפתר לפני שהוא משפיע", "the constraint is resolved before it bites")
                  : L("הראיות של הממד הזה מתחזקות", "the evidence for this dimension strengthens"))
    }));

  // Why: the diagnosis facts that drove the primary option.
  const why: Localized[] = [d.demand.evidence];
  if (d.intent.state === "diverging" || d.intent.state === "partial") why.push(d.intent.evidence);
  if (d.offline.state !== "unknown" && d.offline.state !== "none") why.push(d.offline.evidence);
  if (d.constraint) why.push(d.inventory.evidence);
  if (d.replenishment.state !== "not_needed") why.push(d.replenishment.evidence);
  if (d.paid.state !== "unknown") why.push(d.paid.evidence);
  if (d.margin.state !== "unknown") why.push(d.margin.evidence);
  if (d.creators.state === "measured") why.push(d.creators.evidence);
  // Why this action and not the others — from the ranking itself.
  const versus = alternatives.map((a) => {
    const altReasons = new Set(a.option.because.map((b) => b.reason.en));
    const edge = primary.because.filter((b) => b.delta > 0 && !altReasons.has(b.reason.en)).sort((x, y) => y.delta - x.delta)[0];
    const drag = a.option.because.filter((b) => b.delta < 0).sort((x, y) => x.delta - y.delta)[0];
    const reason = edge ? edge.reason : drag ? drag.reason : a.betterIf;
    return { type: a.option.type, label: a.option.label, reason };
  });
  if (versus.length) why.push(L(`נבחר לפני ${versus.slice(0, 2).map((v) => `"${v.label.he}"`).join(" ו-")}: ${versus[0].reason.he}`, `Chosen over ${versus.slice(0, 2).map((v) => `"${v.label.en}"`).join(" and ")}: ${versus[0].reason.en}`));

  const wouldChange: Localized[] = [];
  if (d.constraint && d.replenishment.state === "unknown") wouldChange.push(d.constraint.alreadyOut ? L(`מלאי חדש של "${d.constraint.title}" מגיע בימים הקרובים`, `New stock of "${d.constraint.title}" arrives in the next few days`) : L(`מלאי חדש של "${d.constraint.title}" מגיע לפני שהמלאי הקיים נגמר (~${d.constraint.coverDays ?? 0} ימים)`, `New stock of "${d.constraint.title}" arrives before current stock runs out (~${d.constraint.coverDays ?? 0} days)`));
  if (d.constraint && d.replenishment.state === "transfer_possible") wouldChange.push(L("ההעברה בין הלוקיישנים לא אפשרית — אז חידוש מלאי או מוצר חלופי", "The transfer between locations is not possible — then replenishment or an alternative product"));
  wouldChange.push(L("קצב המכירות של המוצרים המקושרים משתנה ביותר מ-10%", "Sales pace of the linked products moves more than 10%"));
  if (d.margin.state === "unknown") wouldChange.push(L("עלות אמיתית למוצרי היוזמה (הרווחיות עלולה להפוך את ההמלצה)", "A real cost on the initiative's products (profitability could flip the recommendation)"));
  if (d.paid.state === "unknown") wouldChange.push(L("קישור הקמפיין (יעילות Meta עשויה לשנות את התמהיל)", "Linking the campaign (Meta efficiency may change the mix)"));
  if (d.intent.state === "not_set") wouldChange.push(L("הגדרת הכוונה — מה היוזמה נועדה למכול, לאיזה ערוץ ולמי (ההצלחה נמדדת אחרת)", "Stating the intent — what the initiative was meant to sell, where and to whom (success is measured differently)"));
  if (d.intent.state === "diverging" && d.fulfillment?.purchase) wouldChange.push(L(`הסט/ההצעה עצמם מתחילים להימכר (מעל ${Math.round(0.6 * 100)}% מההזמנות) — אז להמשיך או להגדיל`, `The set/offer itself starts selling (above ${Math.round(0.6 * 100)}% of orders) — then continue or scale`));
  if (d.intent.state === "insufficient") wouldChange.push(L("עוד הזמנות של היוזמה — כדי לומר אם ההצעה נמכרת כמתוכנן", "More initiative orders — to say whether the offer sells as planned"));

  const answer: BusinessAnswer = primary.answer;
  const what = L(`${answer === "continue" ? "להמשיך" : answer === "stop" ? "לעצור" : "לשנות"}: ${primary.what.he}`, `${answer === "continue" ? "Continue" : answer === "stop" ? "Stop" : "Change"}: ${primary.what.en}`);

  // The paid-campaign lane, separate from the initiative's fate.
  const paidCampaign: Recommendation["paidCampaign"] =
    primary.type === "PAUSE_CAMPAIGN"
      ? { verdict: "pause", line: L("להשהות את הקמפיין הממומן הנוכחי", "Pause the current paid campaign") }
      : primary.type === "FIX_MAPPING"
        ? { verdict: "fix_mapping", line: L("לא לגעת בקמפיין עד שהמיפוי מתוקן — לפי מטא הוא ממיר", "Do not touch the campaign until the mapping is fixed — by Meta it converts") }
        : primary.type === "VERIFY_TRACKING"
          ? { verdict: "verify_tracking", line: L("לא לקבל החלטת תקציב עד שהמדידה מאומתת", "No budget decision until the measurement is verified") }
          : primary.type === "REDUCE_SPEND"
            ? { verdict: "reduce", line: L("לצמצם את ההוצאה על הקמפיין", "Reduce the campaign's spend") }
            : null;
  const initiativeLine: Recommendation["initiativeLine"] =
    primary.type === "PAUSE_CAMPAIGN" || primary.type === "REDUCE_SPEND"
      ? L("לא לבטל את היוזמה עצמה בשלב הזה — הכשל הוא בביצוע הממומן, וההשקה נשפטת בנפרד.", "Do not cancel the initiative itself yet — the failure is in the paid execution; the launch is judged separately.")
      : primary.type === "FIX_MAPPING" || primary.type === "VERIFY_TRACKING"
        ? L("לא לבטל ולא להרחיב את היוזמה עד שהמדידה מתוקנת.", "Neither cancel nor scale the initiative until the measurement is fixed.")
        : null;

  return { answer, primary, what, why, alternatives, versus, wouldChange, questions, confidence, confidenceReason, paidCampaign, initiativeLine, performanceConfidence, performanceReason, profitConfidence, profitReason };
}
