// Business Diagnosis — "what is actually happening" for ONE commercial
// initiative, across the whole business, BEFORE any recommendation.
//
//   COMMERCIAL VISION → INITIATIVE INTENT → BUSINESS REALITY → DIAGNOSIS →
//   DECISION SPACE → FEASIBILITY → RECOMMENDATION → CHOICE → OUTCOME → MEMORY
//
// Rules:
//   • Channels provide evidence; Hiloomy makes business decisions. A weak
//     channel next to strong demand elsewhere is a CHANNEL problem, not a
//     business problem, and the diagnosis says so.
//   • Every dimension carries its state, the evidence sentence with scope,
//     and the basis it rests on. "unknown" is a state, never a guess.
//   • Thresholds are V0 rules, named in code, no invented targets.
//
// Pure; the service gathers the inputs.

import type { Localized } from "@/lib/domain/decision";
import type { InitiativeReality, LinkBasis } from "@/lib/domain/initiative-reality";

const L = (he: string, en: string): Localized => ({ he, en });
const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
const pctStr = (r: number) => `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`;

// ---------------------------------------------------------------------------
// Extra evidence layers beyond InitiativeReality.

export type OrderChannel = "online" | "offline" | "manual" | "unknown";

export interface ChannelEvidence {
  // Initiative-scoped (mapped products, initiative window), split by where
  // the order was taken. `classifiedShare` = share of revenue whose channel
  // is known (online + offline + manual); the rest is "unknown".
  online: { revenue: number; units: number };
  offline: { revenue: number; units: number };
  manual: { revenue: number; units: number };
  unknown: { revenue: number; units: number };
  classifiedShare: number; // 0..1
  basis: Exclude<LinkBasis, "suggested"> | null;
}

export interface CreatorEvidence {
  orders: number;
  revenue: number;
  commission: number;
  creators: number; // distinct creators with ≥1 order
  basis: Exclude<LinkBasis, "suggested"> | null;
}

export interface LocationStock {
  productId: string;
  title: string;
  role: "product" | "gift";
  locations: Array<{ name: string; available: number }>;
}

export interface PaidEvidence {
  spend: number;
  purchases: number;
  clicks: number | null;
  attributedRevenue: number | null;
  basis: Exclude<LinkBasis, "suggested"> | null;
}

// Facts the operator can answer (stored per initiative, with a validity).
export interface FeasibilityFacts {
  // Can the constrained product be replenished within N days? null = unknown.
  replenishmentWithinDays: number | null;
  replenishmentPossible: boolean | null; // explicit yes/no when asked
  giftOptional: boolean | null; // is the gift optional for the offer?
  alternativeGiftProductId: string | null;
}

export interface AlternativeProduct {
  id: string;
  title: string;
  inventory: number;
  coverDays: number | null; // at its own recent pace; null = no pace
  sameFamily: boolean; // same productType as the constrained product
}

export interface DiagnosisInput {
  reality: InitiativeReality;
  channels: ChannelEvidence | null;
  creators: CreatorEvidence | null;
  paid: PaidEvidence | null;
  locations: LocationStock[];
  facts: FeasibilityFacts;
  alternatives: { gift: AlternativeProduct[]; product: AlternativeProduct[] };
}

// ---------------------------------------------------------------------------
// The diagnosis.

export type DemandState = "strong" | "healthy" | "weak" | "unknown";
export type ConversionState = "strong" | "healthy" | "weak" | "unknown";
export type PaidState = "strong" | "mixed" | "weak" | "unknown" | "not_running";
export type CreatorState = "strong" | "mixed" | "weak" | "unknown" | "none";
export type OfflineState = "strong" | "healthy" | "weak" | "unknown" | "none";
export type InventoryState = "healthy" | "constrained" | "out_of_stock" | "unknown";
export type ReplenishmentState = "possible_in_time" | "impossible_in_time" | "transfer_possible" | "unknown" | "not_needed";
export type MarginState = "healthy" | "constrained" | "unprofitable" | "unknown";
export type OfferState = "effective" | "possibly_unnecessary" | "weak" | "unknown" | "none";
export type TimeState = "enough_time" | "window_narrowing" | "decision_required_now" | "ended";

export interface Dimension<S extends string> {
  state: S;
  evidence: Localized; // with scope
  basis: Exclude<LinkBasis, "suggested"> | null;
}

export interface ConstrainedItem {
  productId: string;
  title: string;
  role: "product" | "gift";
  inventory: number | null;
  coverDays: number | null;
  daysRemaining: number;
  otherLocationStock: number; // units available elsewhere
  alternatives: AlternativeProduct[];
}

export interface BusinessDiagnosis {
  demand: Dimension<DemandState>;
  conversion: Dimension<ConversionState>;
  paid: Dimension<PaidState>;
  creators: Dimension<CreatorState>;
  offline: Dimension<OfflineState>;
  inventory: Dimension<InventoryState>;
  replenishment: Dimension<ReplenishmentState>;
  margin: Dimension<MarginState>;
  offer: Dimension<OfferState>;
  time: Dimension<TimeState>;
  // The constraint (if any) the decision revolves around.
  constraint: ConstrainedItem | null;
  // "Demand is healthy, but Meta is the weakest acquisition layer."
  headline: Localized;
  // channel problem vs business problem
  scope: "business" | "channel" | "none" | "unknown";
  unknowns: Localized[];
}

// V0 thresholds — named, not tuned.
const DEMAND_STRONG = 0.1;
const DEMAND_WEAK = -0.1;
const PAID_STRONG_ROAS = 2;
const CONV_STRONG = 0.02;
const CONV_WEAK = 0.005;
const MARGIN_HEALTHY = 0.3;
const OFFLINE_STRONG_SHARE = 0.25;
const WINDOW_NARROW_DAYS = 7;

export function diagnose(input: DiagnosisInput): BusinessDiagnosis {
  const r = input.reality;
  const unknowns: Localized[] = [];
  const period = r.period;
  const live = period.start <= period.today && period.end >= period.today;
  const revM = r.metrics.find((m) => m.key === "revenue");
  const unitsM = r.metrics.find((m) => m.key === "units");
  const vsMatch = revM?.note?.en.match(/([+-]\d+)% vs the previous comparable period/);
  const vs = vsMatch ? Number(vsMatch[1]) / 100 : null;
  const salesBasis = (revM?.basis ?? null) as Exclude<LinkBasis, "suggested"> | null;
  const nProducts = revM?.provenance.length ?? 0;

  // ── Demand: TOTAL initiative sales (all channels) vs the comparable period ──
  let demand: Dimension<DemandState>;
  if (!revM || revM.value === null) {
    demand = { state: "unknown", evidence: L("אין מכירות מדודות של מוצרי היוזמה", "No measured sales of the initiative's products"), basis: null };
    unknowns.push(L("מכירות היוזמה", "Initiative sales"));
  } else if (vs === null) {
    demand = { state: (unitsM && Number(unitsM.value) > 0) ? "healthy" : "unknown", evidence: L(`מכירות ${nProducts} המוצרים המקושרים ב-${period.dayIndex} הימים הראשונים: ${revM.value}, אין תקופה מקבילה להשוואה`, `Sales of the ${nProducts} linked products in the first ${period.dayIndex} days: ${revM.value}, no comparable period`), basis: salesBasis };
  } else {
    const state: DemandState = vs >= DEMAND_STRONG ? "strong" : vs <= DEMAND_WEAK ? "weak" : "healthy";
    demand = { state, evidence: L(`מכירות ${nProducts} המוצרים המקושרים ב-${period.dayIndex} הימים הראשונים (כל הערוצים): ${revM.value}, ${pctStr(vs)} מול ${period.dayIndex} הימים שלפני היוזמה`, `Sales of the ${nProducts} linked products in the first ${period.dayIndex} days (all channels): ${revM.value}, ${pctStr(vs)} vs the ${period.dayIndex} days before the initiative`), basis: salesBasis };
  }

  // ── Offline vs online ────────────────────────────────────────────────
  let offline: Dimension<OfflineState>;
  const ch = input.channels;
  if (!ch || ch.basis === null) {
    offline = { state: "unknown", evidence: L("אין פיצול ערוצים למכירות היוזמה", "No channel split for the initiative's sales"), basis: null };
  } else if (ch.classifiedShare < 0.7) {
    offline = { state: "unknown", evidence: L(`רק ${Math.round(ch.classifiedShare * 100)}% מהכנסות היוזמה מסווגות לערוץ — הפיצול לא אמין`, `Only ${Math.round(ch.classifiedShare * 100)}% of the initiative's revenue is channel-classified — the split is unreliable`), basis: ch.basis };
    unknowns.push(L("ערוץ המכירה של חלק מההזמנות", "The sales channel of part of the orders"));
  } else {
    const total = ch.online.revenue + ch.offline.revenue + ch.manual.revenue;
    const share = total > 0 ? ch.offline.revenue / total : 0;
    const state: OfflineState = ch.offline.revenue === 0 && ch.offline.units === 0 ? "none" : share >= OFFLINE_STRONG_SHARE ? "strong" : share > 0.05 ? "healthy" : "weak";
    offline = { state, evidence: L(`אונליין ${ils(ch.online.revenue)} (${ch.online.units} יח׳) · חנויות ${ils(ch.offline.revenue)} (${ch.offline.units} יח׳)${ch.manual.revenue > 0 ? ` · ידני ${ils(ch.manual.revenue)}` : ""}${ch.classifiedShare < 1 ? ` · ${Math.round(ch.classifiedShare * 100)}% מסווג` : ""}`, `Online ${ils(ch.online.revenue)} (${ch.online.units} u) · stores ${ils(ch.offline.revenue)} (${ch.offline.units} u)${ch.manual.revenue > 0 ? ` · manual ${ils(ch.manual.revenue)}` : ""}${ch.classifiedShare < 1 ? ` · ${Math.round(ch.classifiedShare * 100)}% classified` : ""}`), basis: ch.basis };
  }

  // ── Paid media (Meta) ────────────────────────────────────────────────
  let paid: Dimension<PaidState>;
  let conversion: Dimension<ConversionState> = { state: "unknown", evidence: L("אין נתוני תנועה מול רכישות", "No traffic-to-purchase data"), basis: null };
  const pm = input.paid;
  if (!pm || pm.basis === null) {
    paid = { state: "unknown", evidence: L("קמפיין לא מקושר", "Campaign not linked"), basis: null };
    unknowns.push(L("ביצועי הקמפיין של היוזמה", "The initiative's campaign performance"));
  } else if (pm.spend === 0) {
    paid = { state: "not_running", evidence: L("הקמפיין המקושר לא הוציא תקציב בחלון היוזמה", "The linked campaign spent nothing in the initiative window"), basis: pm.basis };
  } else {
    const roas = pm.attributedRevenue !== null ? pm.attributedRevenue / pm.spend : null;
    const state: PaidState = roas === null ? "unknown" : roas >= PAID_STRONG_ROAS ? "strong" : roas >= 1 ? "mixed" : "weak";
    paid = { state, evidence: L(`הוצאת Meta ${ils(pm.spend)} מתחילת היוזמה${roas !== null ? `, ROAS ${roas.toFixed(1)} לפי ייחוס Meta` : ", ללא ערך רכישה מדווח"}`, `Meta spend ${ils(pm.spend)} since the initiative started${roas !== null ? `, ROAS ${roas.toFixed(1)} by Meta's attribution` : ", no reported purchase value"}`), basis: pm.basis };
    if (pm.clicks !== null && pm.clicks > 0) {
      const rate = pm.purchases / pm.clicks;
      const cs: ConversionState = rate >= CONV_STRONG ? "strong" : rate <= CONV_WEAK ? "weak" : "healthy";
      conversion = { state: cs, evidence: L(`${pm.purchases} רכישות מתוך ${pm.clicks} קליקים בקמפיין (${(rate * 100).toFixed(1)}%)`, `${pm.purchases} purchases from ${pm.clicks} campaign clicks (${(rate * 100).toFixed(1)}%)`), basis: pm.basis };
    }
  }

  // ── Creators ─────────────────────────────────────────────────────────
  let creators: Dimension<CreatorState>;
  const cr = input.creators;
  if (!cr || cr.basis === null) creators = { state: "unknown", evidence: L("אין ייחוס קריאייטורים למוצרי היוזמה", "No creator attribution for the initiative's products"), basis: null };
  else if (cr.orders === 0) creators = { state: "none", evidence: L("אין הזמנות מקריאייטורים על מוצרי היוזמה", "No creator orders on the initiative's products"), basis: cr.basis };
  else {
    const total = revM && revM.value ? Number(revM.value.replace(/[^\d.]/g, "")) : null;
    const share = total && total > 0 ? cr.revenue / total : null;
    creators = { state: share !== null && share >= 0.15 ? "strong" : "mixed", evidence: L(`${cr.orders} הזמנות מ-${cr.creators} קריאייטורים, ${ils(cr.revenue)} הכנסה, ${ils(cr.commission)} עמלות${share !== null ? ` (${Math.round(share * 100)}% ממכירות היוזמה)` : ""}`, `${cr.orders} orders from ${cr.creators} creator${cr.creators === 1 ? "" : "s"}, ${ils(cr.revenue)} revenue, ${ils(cr.commission)} commission${share !== null ? ` (${Math.round(share * 100)}% of initiative sales)` : ""}`), basis: cr.basis };
  }

  // ── Inventory + the constraint ───────────────────────────────────────
  const risk = r.findings.find((f) => f.kind === "gift_inventory_short" || f.kind === "inventory_short_of_window");
  const inv = r.inventory;
  let inventory: Dimension<InventoryState>;
  let constraint: ConstrainedItem | null = null;
  if (risk?.product) {
    const loc = input.locations.find((l) => l.productId === risk.product!.id);
    const total = risk.product.inventory ?? 0;
    const other = loc ? Math.max(0, loc.locations.reduce((n, x) => n + Math.max(0, x.available), 0) - Math.max(0, total)) : 0;
    constraint = {
      productId: risk.product.id,
      title: risk.product.title,
      role: risk.product.role,
      inventory: risk.product.inventory,
      coverDays: risk.product.coverDays,
      daysRemaining: period.daysRemaining,
      otherLocationStock: other,
      alternatives: risk.product.role === "gift" ? input.alternatives.gift : input.alternatives.product
    };
    inventory = { state: total <= 0 ? "out_of_stock" : "constrained", evidence: risk.statement, basis: risk.basis };
  } else if (inv.negative > 0) {
    inventory = { state: "unknown", evidence: L(`${inv.negative} מוצרים עם מלאי שלילי — דורש בדיקת נתונים`, `${inv.negative} product${inv.negative === 1 ? "" : "s"} with negative inventory — data check required`), basis: null };
    unknowns.push(L("מלאי אמיתי של מוצרים עם ערך שלילי", "Real stock of products showing negative inventory"));
  } else if (r.metrics.some((m) => (m.key.startsWith("inventory:") || m.key.startsWith("gift_inventory:")) && m.value !== null)) {
    inventory = { state: "healthy", evidence: L(`המלאי מספיק לחלון היוזמה (${period.daysRemaining} ימים נותרו)`, `Stock covers the initiative window (${period.daysRemaining} days remain)`), basis: salesBasis };
  } else {
    inventory = { state: "unknown", evidence: L("מלאי המוצרים המקושרים לא ידוע", "Inventory of the linked products is unknown"), basis: null };
    unknowns.push(L("מלאי המוצרים המקושרים", "Inventory of the linked products"));
  }

  // ── Replenishment feasibility (facts, transfers, unknown) ────────────
  let replenishment: Dimension<ReplenishmentState>;
  const f = input.facts;
  if (!constraint) replenishment = { state: "not_needed", evidence: L("אין אילוץ מלאי פעיל", "No active inventory constraint"), basis: null };
  else if (constraint.otherLocationStock > 0) replenishment = { state: "transfer_possible", evidence: L(`${constraint.otherLocationStock} יחידות של "${constraint.title}" זמינות בלוקיישן אחר`, `${constraint.otherLocationStock} units of "${constraint.title}" available in another location`), basis: "confirmed" };
  else if (f.replenishmentPossible === false) replenishment = { state: "impossible_in_time", evidence: L(`המנהל ענה: לא ניתן לחדש את "${constraint.title}" בזמן`, `The operator answered: "${constraint.title}" cannot be replenished in time`), basis: "confirmed" };
  else if (f.replenishmentWithinDays !== null && constraint.coverDays !== null) {
    const inTime = f.replenishmentWithinDays <= constraint.coverDays;
    replenishment = { state: inTime ? "possible_in_time" : "impossible_in_time", evidence: L(`חידוש מלאי תוך ${f.replenishmentWithinDays} ימים מול ${constraint.coverDays} ימי כיסוי`, `Replenishment within ${f.replenishmentWithinDays} days against ${constraint.coverDays} days of cover`), basis: "confirmed" };
  } else if (f.replenishmentPossible === true) replenishment = { state: "possible_in_time", evidence: L("המנהל ענה: ניתן לחדש בזמן", "The operator answered: replenishment is possible in time"), basis: "confirmed" };
  else {
    replenishment = { state: "unknown", evidence: L(`אין ל-Hiloomy מידע על זמן האספקה של "${constraint.title}"`, `Hiloomy has no information on the supply lead time of "${constraint.title}"`), basis: null };
    unknowns.push(L(`זמן חידוש מלאי של "${constraint.title}"`, `Replenishment lead time of "${constraint.title}"`));
  }

  // ── Margin ───────────────────────────────────────────────────────────
  const mM = r.metrics.find((m) => m.key === "margin");
  let margin: Dimension<MarginState>;
  if (!mM || mM.value === null) {
    margin = { state: "unknown", evidence: L("אין עלות אמיתית למוצרי היוזמה — הרווחיות לא ניתנת להערכה", "No real cost on the initiative's products — profitability cannot be evaluated"), basis: null };
    unknowns.push(L("רווחיות היוזמה (עלויות אמיתיות)", "Initiative profitability (real costs)"));
  } else {
    const rate = Number(mM.value.replace("%", "")) / 100;
    margin = { state: rate < 0 ? "unprofitable" : rate >= MARGIN_HEALTHY ? "healthy" : "constrained", evidence: L(`מרווח תרומה על מכירות היוזמה ${mM.value} (${mM.quality === "estimated" ? "אומדן" : "מעלויות אמיתיות"})`, `Contribution margin on initiative sales ${mM.value} (${mM.quality === "estimated" ? "estimated" : "from real costs"})`), basis: mM.basis };
  }

  // ── Offer (coupon) ───────────────────────────────────────────────────
  const cM = r.metrics.find((m) => m.key === "coupon_orders");
  let offer: Dimension<OfferState>;
  if (!cM) offer = { state: "none", evidence: L("אין קופון ביוזמה", "No coupon in the initiative"), basis: null };
  else if (cM.value === null) offer = { state: "unknown", evidence: L("קופון לא מקושר", "Coupon not linked"), basis: null };
  else {
    const orders = Number(cM.value);
    const unused = r.findings.some((x) => x.kind === "coupon_unused");
    offer = { state: unused ? "weak" : demand.state === "strong" && orders === 0 ? "possibly_unnecessary" : "effective", evidence: L(`${orders} הזמנות עם הקופון מאז ${period.start}`, `${orders} orders with the coupon since ${period.start}`), basis: cM.basis };
  }

  // ── Time ─────────────────────────────────────────────────────────────
  let time: Dimension<TimeState>;
  if (!live && period.end < period.today) time = { state: "ended", evidence: L("היוזמה הסתיימה", "The initiative has ended"), basis: null };
  else if (constraint && constraint.coverDays !== null && constraint.coverDays <= WINDOW_NARROW_DAYS) time = { state: "decision_required_now", evidence: L(`"${constraint.title}" ייגמר תוך ~${constraint.coverDays} ימים; ${period.daysRemaining} ימים נותרו ליוזמה`, `"${constraint.title}" runs out in ~${constraint.coverDays} days; ${period.daysRemaining} initiative days remain`), basis: null };
  else if (period.daysRemaining <= WINDOW_NARROW_DAYS) time = { state: "window_narrowing", evidence: L(`${period.daysRemaining} ימים נותרו ליוזמה`, `${period.daysRemaining} initiative days remain`), basis: null };
  else time = { state: "enough_time", evidence: L(`יום ${period.dayIndex} מתוך ${period.totalDays}, ${period.daysRemaining} ימים נותרו`, `Day ${period.dayIndex} of ${period.totalDays}, ${period.daysRemaining} days remain`), basis: null };

  // ── Channel problem vs business problem ──────────────────────────────
  const demandOk = demand.state === "strong" || demand.state === "healthy";
  const paidBad = paid.state === "weak" || paid.state === "mixed";
  let scope: BusinessDiagnosis["scope"];
  let headline: Localized;
  if (demand.state === "unknown") {
    scope = "unknown";
    headline = L("אין עדיין מספיק מכירות מדודות כדי לאבחן את היוזמה.", "Not enough measured sales yet to diagnose the initiative.");
  } else if (demandOk && paidBad) {
    scope = "channel";
    headline = L(`הביקוש ${demand.state === "strong" ? "חזק" : "בריא"}${offline.state === "strong" || offline.state === "healthy" ? " גם בחנויות" : ""}${creators.state === "strong" ? " וגם דרך קריאייטורים" : ""}, אבל Meta הוא כרגע ערוץ הרכישה החלש ביותר.`, `Demand is ${demand.state}${offline.state === "strong" || offline.state === "healthy" ? " in stores too" : ""}${creators.state === "strong" ? " and through creators" : ""}, but Meta is currently the weakest acquisition layer.`);
  } else if (demandOk && constraint) {
    scope = "business";
    headline = L(`הביקוש ${demand.state === "strong" ? "חזק" : "בריא"}, אבל ${constraint.role === "gift" ? `מלאי המתנה "${constraint.title}"` : `המלאי של "${constraint.title}"`} לא יספיק לחלון היוזמה.`, `Demand is ${demand.state}, but ${constraint.role === "gift" ? `gift stock for "${constraint.title}"` : `stock of "${constraint.title}"`} will not last the initiative window.`);
  } else if (demandOk && margin.state === "unprofitable") {
    scope = "business";
    headline = L("היוזמה מוכרת, אבל בהפסד — הרווחיות היא הבעיה, לא הביקוש.", "The initiative sells, but at a loss — profitability is the problem, not demand.");
  } else if (demand.state === "weak" && conversion.state === "weak") {
    scope = "business";
    headline = L("יש עניין (תנועה), אבל ההמרה חלשה — ההצעה, הדף או המחיר, לא כמות התנועה.", "Interest exists (traffic), but conversion is weak — the offer, the page or the price, not the amount of traffic.");
  } else if (demand.state === "weak" && (offline.state === "strong" || creators.state === "strong")) {
    scope = "channel";
    headline = L("המכירות הכוללות חלשות באונליין אבל חזקות בחנויות/קריאייטורים — המוצר בריא; תמהיל הערוצים הוא השאלה.", "Overall sales are weak online but strong in stores/creators — the product is healthy; the channel mix is the question.");
  } else if (demand.state === "weak") {
    scope = "business";
    headline = L("הביקוש ליוזמה חלש בכל הערוצים המדודים.", "Demand for the initiative is weak across every measured channel.");
  } else {
    scope = "none";
    headline = L(`הביקוש ${demand.state === "strong" ? "חזק" : "בריא"} ולא נמצא אילוץ מהותי.`, `Demand is ${demand.state} and no material constraint was found.`);
  }

  return { demand, conversion, paid, creators, offline, inventory, replenishment, margin, offer, time, constraint, headline, scope, unknowns };
}
