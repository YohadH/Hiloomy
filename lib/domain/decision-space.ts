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
import type { BusinessDiagnosis } from "@/lib/domain/business-diagnosis";

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
  | "SHIFT_BUDGET"
  | "TEST_CREATIVE"
  | "REDUCE_DISCOUNT"
  | "DEEPEN_DISCOUNT"
  | "ADD_BUNDLE"
  | "FIX_CONVERSION"
  | "SHORTEN_INITIATIVE"
  | "STOP";

export type ActionFamily = "continue" | "scale" | "reduce_demand" | "reallocate" | "offer" | "product" | "creative" | "inventory" | "timing" | "stop";
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
  because: string[];
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
  wouldChange: Localized[];
  questions: FeasibilityQuestion[];
  confidence: "high" | "medium" | "low";
  confidenceReason: Localized;
}

const giftName = (d: BusinessDiagnosis) => d.constraint?.title ?? "";
const altGift = (d: BusinessDiagnosis) => d.constraint?.alternatives.find((a) => a.coverDays === null || a.coverDays >= (d.constraint?.daysRemaining ?? 0)) ?? d.constraint?.alternatives[0] ?? null;

// ─── Action registry ─────────────────────────────────────────────────
export const ACTIONS: ActionDefinition[] = [
  {
    type: "CONTINUE",
    family: "continue",
    answer: "continue",
    label: L("להמשיך ללא שינוי", "Continue unchanged"),
    applicableWhen: () => true,
    feasibility: (d) => (d.constraint ? { state: "conditional", condition: d.replenishment.state === "possible_in_time" ? L("חידוש המלאי מגיע לפני שהמלאי נגמר", "replenishment arrives before stock runs out") : L(`מלאי חדש של "${giftName(d)}" מגיע תוך ${d.constraint.coverDays ?? 0} ימים`, `new stock of "${giftName(d)}" arrives within ${d.constraint.coverDays ?? 0} days`), note: null } : { state: "feasible", condition: null, note: null }),
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
    applicableWhen: (d) => d.demand.state === "strong" && d.inventory.state === "healthy" && d.margin.state === "healthy",
    feasibility: (d) => ({ state: d.paid.state === "strong" ? "feasible" : d.paid.state === "unknown" || d.paid.state === "not_running" ? "unknown" : "conditional", condition: d.paid.state === "strong" ? null : L("היעילות של הקמפיין נשמרת בהגדלה", "campaign efficiency holds when scaled"), note: null }),
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
    feasibility: (d) => (d.replenishment.state === "possible_in_time" ? { state: "feasible", condition: null, note: null } : d.replenishment.state === "impossible_in_time" ? { state: "infeasible", condition: null, note: L("לא ניתן לחדש בזמן", "cannot be replenished in time") } : { state: "unknown", condition: L(`מלאי חדש של "${giftName(d)}" יכול להגיע תוך ${d.constraint?.coverDays ?? 0} ימים`, `new stock of "${giftName(d)}" can arrive within ${d.constraint?.coverDays ?? 0} days`), note: L("אין ל-Hiloomy מידע על זמן האספקה", "Hiloomy has no lead-time information") }),
    concrete: (d) => L(`לחדש את המלאי של "${giftName(d)}" לפני שהוא נגמר`, `Replenish "${giftName(d)}" before it runs out`),
    expectedEffect: L("ההצעה נמשכת עד סוף החלון", "The offer lasts to the end of the window"),
    risks: L("עלות; זמן אספקה לא ודאי", "Cost; uncertain lead time"),
    reversibility: "hard"
  },
  {
    type: "TRANSFER_INVENTORY",
    family: "inventory",
    answer: "continue",
    label: L("להעביר מלאי בין לוקיישנים", "Transfer inventory between locations"),
    applicableWhen: (d) => !!d.constraint && d.constraint.otherLocationStock > 0,
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: (d) => L(`להעביר ${d.constraint?.otherLocationStock ?? 0} יחידות של "${giftName(d)}" מהלוקיישן השני לפני חידוש או החלפה`, `Transfer ${d.constraint?.otherLocationStock ?? 0} units of "${giftName(d)}" from the other location before replenishing or replacing`),
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
    concrete: (d) => (altGift(d) ? L(`להמשיך את היוזמה ולהחליף את המתנה "${giftName(d)}" ב-"${altGift(d)!.title}" כשהמלאי הנוכחי נגמר (בעוד ~${d.constraint?.coverDays ?? 0} ימים)`, `Continue the initiative and replace the "${giftName(d)}" gift with "${altGift(d)!.title}" once current stock is exhausted (in ~${d.constraint?.coverDays ?? 0} days)`) : L(`להמשיך את היוזמה ולהחליף את המתנה "${giftName(d)}" במוצר עם מלאי מספיק כשהמלאי הנוכחי נגמר`, `Continue the initiative and replace the "${giftName(d)}" gift with a product that has enough stock once current stock is exhausted`)),
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
    feasibility: (d) => (d.constraint?.alternatives.length ? { state: "feasible", condition: null, note: L(`מוצרים מאותה משפחה עם מלאי: ${d.constraint.alternatives.slice(0, 3).map((a) => a.title).join(", ")}`, `Same-family products with stock: ${d.constraint.alternatives.slice(0, 3).map((a) => a.title).join(", ")}`) } : { state: "unknown", condition: L("קיים מוצר חלופי מאותה משפחה עם מלאי", "a same-family product with stock exists"), note: null }),
    concrete: (d) => L(`לא להמשיך להזרים תקציב ל"${giftName(d)}" שעומד להיגמר; להעביר את הקמפיין ל${d.constraint?.alternatives[0] ? `"${d.constraint.alternatives[0].title}"` : "מוצרי היוזמה עם מלאי עמוק יותר"}`, `Stop pushing budget at "${giftName(d)}", which is about to run out; move the campaign to ${d.constraint?.alternatives[0] ? `"${d.constraint.alternatives[0].title}"` : "the initiative's deeper-stock products"}`),
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
    type: "SHIFT_BUDGET",
    family: "reallocate",
    answer: "change",
    label: L("להעביר תקציב לערוץ יעיל יותר", "Shift budget to a more efficient channel"),
    applicableWhen: (d) => (d.paid.state === "weak" || d.paid.state === "mixed") && (d.creators.state === "strong" || d.offline.state === "strong" || d.demand.state === "strong"),
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: (d) => (d.creators.state === "strong" ? L("להעביר חלק מתקציב Meta לערוץ הקריאייטורים, שמייצר כרגע תרומה חזקה יותר ליוזמה", "Move part of the Meta budget to the creator channel, which currently produces stronger contribution for the initiative") : L("לבדוק העברת תקציב מהקמפיין החלש לערוץ שמביא את הביקוש, לפני הגדלת ההוצאה הכוללת", "Test moving budget from the weak campaign to the channel that brings the demand, before increasing total spend")),
    expectedEffect: L("אותו ביקוש בעלות נמוכה יותר", "The same demand at lower cost"),
    risks: L("הערוץ המקבל לא בהכרח מתרחב", "The receiving channel may not scale"),
    reversibility: "easy"
  },
  {
    type: "TEST_CREATIVE",
    family: "creative",
    answer: "change",
    label: L("לבדוק קריאייטיב / מסר חדש", "Test new creative / message"),
    applicableWhen: (d) => d.paid.state === "weak" || d.paid.state === "mixed" || d.conversion.state === "weak",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
    concrete: () => L("לבדוק קריאייטיב או מסר חדש בקמפיין (למשל תוכן קריאייטורים) לפני הגדלת ההוצאה", "Test a new creative or message in the campaign (for example creator content) before increasing spend"),
    expectedEffect: L("שיפור יעילות בלי תקציב נוסף", "Better efficiency without extra budget"),
    risks: L("לוקח זמן ללמידה", "Takes time to learn"),
    reversibility: "easy"
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
    applicableWhen: (d) => d.margin.state === "unprofitable" || d.margin.state === "constrained" || d.offer.state === "possibly_unnecessary",
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
    applicableWhen: (d) => d.demand.state === "weak" && d.inventory.state === "healthy" && d.margin.state === "healthy",
    feasibility: () => ({ state: "feasible", condition: null, note: null }),
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
    concrete: (d) => L(`לסיים את היוזמה כשהמלאי של "${giftName(d)}" נגמר במקום להמשיך לפרסם מוצר שאין`, `End the initiative when "${giftName(d)}" runs out instead of advertising a product that is not there`),
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
function rank(def: ActionDefinition, feas: Feasibility, d: BusinessDiagnosis): { score: number; because: string[] } {
  const because: string[] = [];
  let s = 50;
  const demandOk = d.demand.state === "strong" || d.demand.state === "healthy";
  const add = (n: number, why: string) => {
    s += n;
    because.push(`${n >= 0 ? "+" : ""}${n} ${why}`);
  };
  // Fulfilment first.
  if (d.constraint) {
    if (def.type === "CONTINUE") add(-30, "constraint: the offer cannot be honoured unchanged");
    if (def.type === "REPLACE_GIFT" || def.type === "LIMIT_GIFT_TO_STOCK" || def.type === "SWITCH_TO_NON_STOCK_PERK" || def.type === "SHIFT_PRODUCT_FOCUS" || def.type === "TRANSFER_INVENTORY") add(25, "resolves the fulfilment constraint");
    if (def.type === "REPLENISH" && feas === "feasible") add(30, "replenishment confirmed in time");
    if (def.type === "REPLENISH" && feas === "unknown") add(-10, "replenishment lead time unknown");
    if (def.type === "TRANSFER_INVENTORY") add(10, "uses stock the brand already owns");
    if (def.type === "SHIFT_PRODUCT_FOCUS" && d.constraint.role === "product") add(10, "keeps demand on a product that can ship");
    if (def.type === "LIMIT_GIFT_TO_STOCK") add(-5, "some customers miss the gift");
    if (def.type === "SWITCH_TO_NON_STOCK_PERK") add(-8, "a weaker perk than the planned gift");
  }
  // Margin second.
  if (d.margin.state === "unprofitable") {
    if (def.type === "REDUCE_DISCOUNT") add(25, "margin negative: fix economics first");
    if (def.type === "SCALE" || def.type === "DEEPEN_DISCOUNT") add(-40, "never scale a loss");
    if (def.type === "CONTINUE") add(-20, "continuing at a loss");
  }
  if (d.margin.state === "constrained" && (def.type === "SCALE" || def.type === "DEEPEN_DISCOUNT")) add(-15, "margin constrained");
  // Demand third.
  if (demandOk) {
    if (def.type === "STOP") add(-40, "demand is healthy: stopping gives it up");
    if (def.type === "SHORTEN_INITIATIVE") add(-15, "demand is healthy");
    if (def.answer === "continue" && !d.constraint && d.margin.state !== "unprofitable") add(20, "demand healthy, no constraint");
    if (def.type === "DEEPEN_DISCOUNT") add(-20, "demand strong: no need for promotional pressure");
  }
  if (d.demand.state === "weak") {
    if (def.type === "CONTINUE" || def.type === "CONTINUE_MONITOR") add(-15, "demand weak: unchanged is unlikely to work");
    if (def.type === "STOP" && d.inventory.state === "healthy") add(-10, "stock is healthy: change before stopping");
    if (def.type === "DEEPEN_DISCOUNT" || def.type === "ADD_BUNDLE") add(10, "moves stock");
  }
  // Channel problem: fix the channel, not the initiative.
  if (d.scope === "channel") {
    if (def.type === "SHIFT_BUDGET" || def.type === "TEST_CREATIVE") add(20, "channel problem: adjust the channel");
    if (def.type === "REDUCE_SPEND" && d.paid.state === "weak") add(10, "the weak channel spends without return");
    if (def.type === "STOP") add(-20, "the business is healthy; only a channel is weak");
    if (def.type === "CONTINUE") add(-10, "unchanged keeps paying for the weak channel");
  }
  if (d.conversion.state === "weak" && def.type === "FIX_CONVERSION") add(20, "interest exists; conversion is the gap");
  if (d.conversion.state === "weak" && def.type === "SCALE") add(-25, "do not buy more traffic into weak conversion");
  // Feasibility and reversibility.
  if (feas === "infeasible") add(-100, "infeasible");
  if (feas === "unknown") add(-12, "feasibility unknown");
  if (feas === "conditional") add(-8, "depends on a condition");
  if (def.reversibility === "easy") add(5, "easily reversible");
  if (def.reversibility === "hard") add(-5, "hard to reverse");
  return { score: Math.max(0, Math.min(100, s)), because };
}

export function buildDecisionSpace(d: BusinessDiagnosis): DecisionOption[] {
  return ACTIONS.filter((a) => a.applicableWhen(d))
    .map((a) => {
      const f = a.feasibility(d);
      const { score, because } = rank(a, f.state, d);
      return { type: a.type, family: a.family, answer: a.answer, label: a.label, what: a.concrete(d), feasibility: f.state, condition: f.condition, note: f.note, expectedEffect: a.expectedEffect, risks: a.risks, reversibility: a.reversibility, score, because };
    })
    .filter((o) => o.feasibility !== "infeasible")
    .sort((a, b) => b.score - a.score);
}

// ─── Resolver ────────────────────────────────────────────────────────
export function resolveRecommendation(d: BusinessDiagnosis, space: DecisionOption[], evidenceQuality: { basis: "confirmed" | "provisional" | "none"; stale: boolean }): Recommendation {
  const questions: FeasibilityQuestion[] = [];
  if (d.constraint && d.replenishment.state === "unknown") {
    questions.push({
      key: "replenishment",
      productId: d.constraint.productId,
      question: L(`אפשר לחדש את "${d.constraint.title}" בתוך ${d.constraint.coverDays ?? 0} ימים?`, `Can "${d.constraint.title}" be replenished within ${d.constraint.coverDays ?? 0} days?`),
      ifYes: L("להמשיך ללא שינוי ולחדש מלאי", "Continue unchanged and replenish"),
      ifNo: L(d.constraint.role === "gift" ? "להחליף או להגביל את המתנה" : "להעביר את הביקוש למוצר אחר או לקצר", d.constraint.role === "gift" ? "Replace or limit the gift" : "Shift demand to another product or shorten")
    });
  }
  if (d.constraint?.role === "gift" && !d.constraint.alternatives.length) {
    questions.push({ key: "alternative_gift", productId: d.constraint.productId, question: L("יש מוצר חלופי שיכול לשמש כמתנה?", "Is there an alternative product that can serve as the gift?"), ifYes: L("להחליף את המתנה", "Replace the gift"), ifNo: L("להגביל את המתנה למלאי או לעבור להטבה אחרת", "Limit the gift to stock or switch perk") });
  }

  const unknownsCount = d.unknowns.length;
  const confidence: Recommendation["confidence"] = evidenceQuality.basis === "none" ? "low" : evidenceQuality.basis === "provisional" || evidenceQuality.stale || unknownsCount >= 2 ? "medium" : unknownsCount === 1 ? "medium" : "high";
  const confidenceReason = L(
    `ידוע: ${[d.demand.state !== "unknown" ? "ביקוש" : null, d.inventory.state !== "unknown" ? "מלאי" : null, d.paid.state !== "unknown" ? "Meta" : null, d.margin.state !== "unknown" ? "מרווח" : null, d.offline.state !== "unknown" && d.offline.state !== "none" ? "חנויות" : null].filter(Boolean).join(", ") || "מעט"}${d.unknowns.length ? ` · לא ידוע: ${d.unknowns.map((u) => u.he).join(", ")}` : ""}${evidenceQuality.basis === "provisional" ? " · מבוסס על התאמות אוטומטיות שטרם אושרו" : ""}${evidenceQuality.stale ? " · נתונים לא טריים" : ""}`,
    `Known: ${[d.demand.state !== "unknown" ? "demand" : null, d.inventory.state !== "unknown" ? "inventory" : null, d.paid.state !== "unknown" ? "Meta" : null, d.margin.state !== "unknown" ? "margin" : null, d.offline.state !== "unknown" && d.offline.state !== "none" ? "stores" : null].filter(Boolean).join(", ") || "little"}${d.unknowns.length ? ` · Unknown: ${d.unknowns.map((u) => u.en).join(", ")}` : ""}${evidenceQuality.basis === "provisional" ? " · based on automatic matches not yet confirmed" : ""}${evidenceQuality.stale ? " · stale data" : ""}`
  );

  // Not enough evidence to choose: demand unknown, or nothing usable.
  if (d.demand.state === "unknown" || evidenceQuality.basis === "none" || space.length === 0) {
    return {
      answer: "insufficient",
      primary: null,
      what: L("עדיין אין מספיק ראיות כדי לבחור בין להמשיך, לשנות או לעצור.", "There is not yet enough evidence to choose between continue, change or stop."),
      why: [d.demand.evidence, d.inventory.evidence].filter((x) => x.en),
      alternatives: [],
      wouldChange: [L("מכירות מדודות של המוצרים המקושרים", "Measured sales of the linked products")],
      questions,
      confidence: "low",
      confidenceReason
    };
  }

  const primary = space[0];
  const alternatives = space
    .slice(1, 5)
    .map((o) => ({
      option: o,
      betterIf:
        o.condition ??
        (o.type === "STOP"
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
  if (d.offline.state !== "unknown" && d.offline.state !== "none") why.push(d.offline.evidence);
  if (d.constraint) why.push(d.inventory.evidence);
  if (d.replenishment.state !== "not_needed") why.push(d.replenishment.evidence);
  if (d.paid.state !== "unknown") why.push(d.paid.evidence);
  if (d.margin.state !== "unknown") why.push(d.margin.evidence);
  if (d.creators.state === "strong" || d.creators.state === "mixed") why.push(d.creators.evidence);

  const wouldChange: Localized[] = [];
  if (d.constraint && d.replenishment.state === "unknown") wouldChange.push(L(`מלאי חדש של "${d.constraint.title}" מגיע לפני שהמלאי הקיים נגמר (~${d.constraint.coverDays ?? 0} ימים)`, `New stock of "${d.constraint.title}" arrives before current stock runs out (~${d.constraint.coverDays ?? 0} days)`));
  wouldChange.push(L("קצב המכירות של המוצרים המקושרים משתנה ביותר מ-10%", "Sales pace of the linked products moves more than 10%"));
  if (d.margin.state === "unknown") wouldChange.push(L("עלות אמיתית למוצרי היוזמה (הרווחיות עלולה להפוך את ההמלצה)", "A real cost on the initiative's products (profitability could flip the recommendation)"));
  if (d.paid.state === "unknown") wouldChange.push(L("קישור הקמפיין (יעילות Meta עשויה לשנות את התמהיל)", "Linking the campaign (Meta efficiency may change the mix)"));

  const answer: BusinessAnswer = primary.answer;
  const what = L(`${answer === "continue" ? "להמשיך" : answer === "stop" ? "לעצור" : "לשנות"}: ${primary.what.he}`, `${answer === "continue" ? "Continue" : answer === "stop" ? "Stop" : "Change"}: ${primary.what.en}`);
  return { answer, primary, what, why, alternatives, wouldChange, questions, confidence, confidenceReason };
}
