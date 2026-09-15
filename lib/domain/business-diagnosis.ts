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
//   • "strong" / "weak" are said ONLY against a real benchmark: the same
//     initiative's own pre-window period, or an objective floor (spend above
//     attributed revenue; contribution margin below zero). Without a
//     benchmark the state is "measured" and the evidence is the numbers.
//     "stores sold more than online" is a fact, not a diagnosis.
//   • A product at or below zero stock is ALREADY constrained — never
//     "runs out in 0 days".
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
export type ChannelSplit = Record<OrderChannel, { revenue: number; units: number }>;

export interface ChannelEvidence extends ChannelSplit {
  // Initiative-scoped (mapped products, initiative window), split by where
  // the order was taken. `classifiedShare` = share of revenue whose channel
  // is known (online + offline + manual); the rest is "unknown".
  classifiedShare: number; // 0..1
  basis: Exclude<LinkBasis, "suggested"> | null;
  // The same split over the comparable period before the window — the
  // only benchmark that allows "strong" / "weak" per channel.
  baseline?: ChannelSplit | null;
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
  // The same campaign over the comparable period before the window.
  baseline?: { spend: number; purchases: number; clicks: number | null; attributedRevenue: number | null } | null;
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
export type ConversionState = "strong" | "weak" | "measured" | "unknown";
export type PaidState = "strong" | "weak" | "measured" | "unknown" | "not_running";
export type CreatorState = "measured" | "unknown" | "none";
export type OfflineState = "strong" | "healthy" | "weak" | "measured" | "unknown" | "none";
export type InventoryState = "healthy" | "constrained" | "out_of_stock" | "unknown";
export type ReplenishmentState = "possible_in_time" | "impossible_in_time" | "transfer_possible" | "unknown" | "not_needed";
export type MarginState = "measured" | "unprofitable" | "unknown";
export type OfferState = "in_use" | "unused" | "possibly_unnecessary" | "unknown" | "none";
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
  // Stock is already at or below zero: the constraint is current, not
  // forecast. Deadlines are then "as soon as possible", never "0 days".
  alreadyOut: boolean;
  // Locations that still hold units while another location is at or below
  // zero — the only case where a transfer helps. Empty otherwise.
  transferable: Array<{ name: string; available: number }>;
  depletedLocations: string[];
  otherLocationStock: number; // units available elsewhere (sum of transferable)
  // Verified alternatives: same family, stock covers the window, and NEVER
  // the constrained product itself (source ≠ target).
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
  marginRate: number | null; // the number the actions reason on
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

// V0 thresholds — named, not tuned. Each one is a change against the
// initiative's OWN baseline (±10%) or an objective floor.
export const DELTA_STRONG = 0.1;
export const DELTA_WEAK = -0.1;
export const MARGIN_HEALTHY = 0.3; // used by actions as a stated V0 gate, never as a label
export const WINDOW_NARROW_DAYS = 7;
const MIN_BASELINE_UNITS = 5; // below this the baseline is noise

const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const delta = (now: number, before: number | null): number | null => (before !== null && before > 0 ? now / before - 1 : null);
const stateOf = (d: number | null): "strong" | "healthy" | "weak" | null => (d === null ? null : d >= DELTA_STRONG ? "strong" : d <= DELTA_WEAK ? "weak" : "healthy");

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
  const beforeLabel = L(`${period.dayIndex} הימים שלפני היוזמה`, `the ${period.dayIndex} days before the initiative`);

  // ── Demand: TOTAL initiative sales (all channels) vs the comparable period ──
  let demand: Dimension<DemandState>;
  if (!revM || revM.value === null) {
    demand = { state: "unknown", evidence: L("אין מכירות מדודות של מוצרי היוזמה", "No measured sales of the initiative's products"), basis: null };
    unknowns.push(L("מכירות היוזמה", "Initiative sales"));
  } else if (vs === null) {
    demand = { state: unitsM && Number(unitsM.value) > 0 ? "healthy" : "unknown", evidence: L(`מכירות ${nProducts} המוצרים המקושרים ב-${period.dayIndex} הימים הראשונים: ${revM.value}, אין תקופה מקבילה להשוואה`, `Sales of the ${nProducts} linked products in the first ${period.dayIndex} days: ${revM.value}, no comparable period`), basis: salesBasis };
  } else {
    const state: DemandState = vs >= DELTA_STRONG ? "strong" : vs <= DELTA_WEAK ? "weak" : "healthy";
    demand = { state, evidence: L(`מכירות ${nProducts} המוצרים המקושרים ב-${period.dayIndex} הימים הראשונים (כל הערוצים): ${revM.value}, ${pctStr(vs)} מול ${beforeLabel.he}`, `Sales of the ${nProducts} linked products in the first ${period.dayIndex} days (all channels): ${revM.value}, ${pctStr(vs)} vs ${beforeLabel.en}`), basis: salesBasis };
  }

  // ── Offline vs online — numbers always; strong/weak only vs the baseline ──
  let offline: Dimension<OfflineState>;
  const ch = input.channels;
  if (!ch || ch.basis === null) {
    offline = { state: "unknown", evidence: L("אין פיצול ערוצים למכירות היוזמה", "No channel split for the initiative's sales"), basis: null };
  } else if (ch.classifiedShare < 0.7) {
    offline = { state: "unknown", evidence: L(`רק ${Math.round(ch.classifiedShare * 100)}% מהכנסות היוזמה מסווגות לערוץ — הפיצול לא אמין`, `Only ${Math.round(ch.classifiedShare * 100)}% of the initiative's revenue is channel-classified — the split is unreliable`), basis: ch.basis };
    unknowns.push(L("ערוץ המכירה של חלק מההזמנות", "The sales channel of part of the orders"));
  } else {
    const numbers = L(
      `חנויות ${ils(ch.offline.revenue)} (${ch.offline.units} יח׳) · אונליין ${ils(ch.online.revenue)} (${ch.online.units} יח׳)${ch.manual.revenue > 0 ? ` · ידני ${ils(ch.manual.revenue)}` : ""}${ch.classifiedShare < 1 ? ` · ${Math.round(ch.classifiedShare * 100)}% מסווג` : ""}`,
      `Stores ${ils(ch.offline.revenue)} (${ch.offline.units} u) · online ${ils(ch.online.revenue)} (${ch.online.units} u)${ch.manual.revenue > 0 ? ` · manual ${ils(ch.manual.revenue)}` : ""}${ch.classifiedShare < 1 ? ` · ${Math.round(ch.classifiedShare * 100)}% classified` : ""}`
    );
    const base = ch.baseline ?? null;
    const dOff = base && base.offline.units >= MIN_BASELINE_UNITS ? delta(ch.offline.revenue, base.offline.revenue) : null;
    const st = stateOf(dOff);
    if (ch.offline.revenue === 0 && ch.offline.units === 0) offline = { state: "none", evidence: L(`אין מכירות בחנויות למוצרי היוזמה · ${numbers.he}`, `No store sales of the initiative's products · ${numbers.en}`), basis: ch.basis };
    else if (st && dOff !== null) offline = { state: st, evidence: L(`${numbers.he} · חנויות ${pctStr(dOff)} מול ${beforeLabel.he}`, `${numbers.en} · stores ${pctStr(dOff)} vs ${beforeLabel.en}`), basis: ch.basis };
    else offline = { state: "measured", evidence: L(`${numbers.he} · אין תקופה קודמת להשוואה לפי ערוץ`, `${numbers.en} · no prior period to compare by channel`), basis: ch.basis };
  }

  // ── Paid media (Meta) — objective floor (spend > attributed revenue) or own baseline ──
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
    const pb = pm.baseline ?? null;
    const baseRoas = pb && pb.spend > 0 && pb.attributedRevenue !== null ? pb.attributedRevenue / pb.spend : null;
    const dRoas = roas !== null && baseRoas !== null && baseRoas > 0 ? roas / baseRoas - 1 : null;
    const head = L(`הוצאת Meta ${ils(pm.spend)} מתחילת היוזמה`, `Meta spend ${ils(pm.spend)} since the initiative started`);
    if (roas === null) {
      paid = { state: "unknown", evidence: L(`${head.he}, ללא ערך רכישה מדווח`, `${head.en}, no reported purchase value`), basis: pm.basis };
      unknowns.push(L("ערך הרכישות המיוחס לקמפיין", "Purchase value attributed to the campaign"));
    } else if (roas < 1) {
      paid = { state: "weak", evidence: L(`${head.he}, ROAS ${roas.toFixed(1)} לפי ייחוס Meta — ההוצאה גבוהה מההכנסה המיוחסת לה`, `${head.en}, ROAS ${roas.toFixed(1)} by Meta's attribution — spend exceeds the revenue attributed to it`), basis: pm.basis };
    } else if (dRoas !== null && stateOf(dRoas) !== "healthy") {
      const st = stateOf(dRoas) === "strong" ? "strong" : "weak";
      paid = { state: st, evidence: L(`${head.he}, ROAS ${roas.toFixed(1)} לפי ייחוס Meta, ${pctStr(dRoas)} מול אותו קמפיין ב-${beforeLabel.he}`, `${head.en}, ROAS ${roas.toFixed(1)} by Meta's attribution, ${pctStr(dRoas)} vs the same campaign in ${beforeLabel.en}`), basis: pm.basis };
    } else {
      paid = { state: "measured", evidence: L(`${head.he}, ROAS ${roas.toFixed(1)} לפי ייחוס Meta${dRoas !== null ? ` (${pctStr(dRoas)} מול ${beforeLabel.he})` : " · אין תקופה קודמת לאותו קמפיין להשוואה"}`, `${head.en}, ROAS ${roas.toFixed(1)} by Meta's attribution${dRoas !== null ? ` (${pctStr(dRoas)} vs ${beforeLabel.en})` : " · no prior period of the same campaign to compare"}`), basis: pm.basis };
    }
    if (pm.clicks !== null && pm.clicks > 0) {
      const rate = pm.purchases / pm.clicks;
      const baseRate = pb && pb.clicks !== null && pb.clicks > 0 ? pb.purchases / pb.clicks : null;
      const dConv = baseRate !== null && baseRate > 0 ? rate / baseRate - 1 : null;
      const st = stateOf(dConv);
      const nums = L(`${pm.purchases} רכישות מתוך ${pm.clicks} קליקים בקמפיין (${(rate * 100).toFixed(1)}%)`, `${pm.purchases} purchases from ${pm.clicks} campaign clicks (${(rate * 100).toFixed(1)}%)`);
      conversion =
        st && st !== "healthy" && dConv !== null
          ? { state: st === "strong" ? "strong" : "weak", evidence: L(`${nums.he}, ${pctStr(dConv)} מול ${(baseRate! * 100).toFixed(1)}% ב-${beforeLabel.he}`, `${nums.en}, ${pctStr(dConv)} vs ${(baseRate! * 100).toFixed(1)}% in ${beforeLabel.en}`), basis: pm.basis }
          : { state: "measured", evidence: L(`${nums.he}${dConv !== null ? ` (${pctStr(dConv)} מול ${beforeLabel.he})` : " · אין תקופה קודמת להשוואה"}`, `${nums.en}${dConv !== null ? ` (${pctStr(dConv)} vs ${beforeLabel.en})` : " · no prior period to compare"}`), basis: pm.basis };
    }
  }

  // ── Creators — numbers, no verdict (no benchmark exists per initiative) ──
  let creators: Dimension<CreatorState>;
  const cr = input.creators;
  if (!cr || cr.basis === null) creators = { state: "unknown", evidence: L("אין ייחוס קריאייטורים למוצרי היוזמה", "No creator attribution for the initiative's products"), basis: null };
  else if (cr.orders === 0) creators = { state: "none", evidence: L("אין הזמנות מקריאייטורים על מוצרי היוזמה", "No creator orders on the initiative's products"), basis: cr.basis };
  else {
    const total = revM && revM.value ? Number(revM.value.replace(/[^\d.]/g, "")) : null;
    const share = total && total > 0 ? cr.revenue / total : null;
    creators = { state: "measured", evidence: L(`${cr.orders} הזמנות מ-${cr.creators} קריאייטורים, ${ils(cr.revenue)} הכנסה, ${ils(cr.commission)} עמלות${share !== null ? ` (${Math.round(share * 100)}% ממכירות היוזמה)` : ""}`, `${cr.orders} orders from ${cr.creators} creator${cr.creators === 1 ? "" : "s"}, ${ils(cr.revenue)} revenue, ${ils(cr.commission)} commission${share !== null ? ` (${Math.round(share * 100)}% of initiative sales)` : ""}`), basis: cr.basis };
  }

  // ── Inventory + the constraint ───────────────────────────────────────
  const risk = r.findings.find((f) => f.kind === "gift_inventory_short" || f.kind === "inventory_short_of_window");
  const inv = r.inventory;
  let inventory: Dimension<InventoryState>;
  let constraint: ConstrainedItem | null = null;
  if (risk?.product) {
    const p = risk.product;
    const loc = input.locations.find((l) => l.productId === p.id);
    const total = p.inventory ?? 0;
    const alreadyOut = total <= 0 || p.coverDays === 0;
    const depleted = loc ? loc.locations.filter((x) => x.available <= 0).map((x) => x.name) : [];
    const stocked = loc ? loc.locations.filter((x) => x.available > 0) : [];
    // A transfer only helps when one location is at/below zero while another
    // still holds units. Low stock spread thin across locations is not that.
    const transferable = depleted.length && stocked.length ? stocked : [];
    const pool = p.role === "gift" ? input.alternatives.gift : input.alternatives.product;
    const alternatives = pool.filter((a) => a.id !== p.id && normTitle(a.title) !== normTitle(p.title) && a.inventory > 0);
    constraint = { productId: p.id, title: p.title, role: p.role, inventory: p.inventory, coverDays: p.coverDays, daysRemaining: period.daysRemaining, alreadyOut, transferable, depletedLocations: depleted, otherLocationStock: transferable.reduce((n, x) => n + x.available, 0), alternatives };
    const locNote = depleted.length && stocked.length ? L(` · אזל ב-${depleted.join(", ")}; ${stocked.map((x) => `${x.available} יח׳ ב-${x.name}`).join(", ")}`, ` · out at ${depleted.join(", ")}; ${stocked.map((x) => `${x.available} u at ${x.name}`).join(", ")}`) : L("", "");
    inventory = { state: alreadyOut ? "out_of_stock" : "constrained", evidence: L(`${risk.statement.he}${locNote.he}`, `${risk.statement.en}${locNote.en}`), basis: risk.basis };
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
  // The deadline is the days of cover left — or, once stock is already out,
  // the days the initiative still runs. Never "within 0 days".
  let replenishment: Dimension<ReplenishmentState>;
  const f = input.facts;
  if (!constraint) replenishment = { state: "not_needed", evidence: L("אין אילוץ מלאי פעיל", "No active inventory constraint"), basis: null };
  else if (constraint.transferable.length) replenishment = { state: "transfer_possible", evidence: L(`${constraint.otherLocationStock} יחידות של "${constraint.title}" זמינות ב-${constraint.transferable.map((x) => x.name).join(", ")} בזמן שהמלאי אזל ב-${constraint.depletedLocations.join(", ")}`, `${constraint.otherLocationStock} units of "${constraint.title}" available at ${constraint.transferable.map((x) => x.name).join(", ")} while stock is out at ${constraint.depletedLocations.join(", ")}`), basis: "confirmed" };
  else if (f.replenishmentPossible === false) replenishment = { state: "impossible_in_time", evidence: L(`המנהל ענה: לא ניתן לחדש את "${constraint.title}" בזמן`, `The operator answered: "${constraint.title}" cannot be replenished in time`), basis: "confirmed" };
  else if (f.replenishmentWithinDays !== null) {
    const bound = constraint.alreadyOut ? constraint.daysRemaining : (constraint.coverDays ?? constraint.daysRemaining);
    const inTime = f.replenishmentWithinDays <= bound;
    replenishment = {
      state: inTime ? "possible_in_time" : "impossible_in_time",
      evidence: constraint.alreadyOut
        ? L(`המלאי כבר אזל; חידוש תוך ${f.replenishmentWithinDays} ימים מול ${constraint.daysRemaining} ימים שנותרו ליוזמה`, `Stock is already out; replenishment within ${f.replenishmentWithinDays} days against ${constraint.daysRemaining} initiative days left`)
        : L(`חידוש מלאי תוך ${f.replenishmentWithinDays} ימים מול ${bound} ימי כיסוי`, `Replenishment within ${f.replenishmentWithinDays} days against ${bound} days of cover`),
      basis: "confirmed"
    };
  } else if (f.replenishmentPossible === true) replenishment = { state: "possible_in_time", evidence: L("המנהל ענה: ניתן לחדש בזמן", "The operator answered: replenishment is possible in time"), basis: "confirmed" };
  else {
    replenishment = { state: "unknown", evidence: L(`אין ל-Hiloomy מידע על זמן האספקה של "${constraint.title}"`, `Hiloomy has no information on the supply lead time of "${constraint.title}"`), basis: null };
    unknowns.push(L(`זמן חידוש מלאי של "${constraint.title}"`, `Replenishment lead time of "${constraint.title}"`));
  }

  // ── Margin — objective floor only; otherwise the number ──────────────
  const mM = r.metrics.find((m) => m.key === "margin");
  let margin: Dimension<MarginState>;
  let marginRate: number | null = null;
  if (!mM || mM.value === null) {
    margin = { state: "unknown", evidence: L("אין עלות אמיתית למוצרי היוזמה — הרווחיות לא ניתנת להערכה", "No real cost on the initiative's products — profitability cannot be evaluated"), basis: null };
    unknowns.push(L("רווחיות היוזמה (עלויות אמיתיות)", "Initiative profitability (real costs)"));
  } else {
    marginRate = Number(mM.value.replace("%", "")) / 100;
    const q = mM.quality === "estimated" ? L("אומדן", "estimated") : L("מעלויות אמיתיות", "from real costs");
    margin = { state: marginRate < 0 ? "unprofitable" : "measured", evidence: L(`מרווח תרומה על מכירות היוזמה ${mM.value} (${q.he})${marginRate < 0 ? " — מתחת לאפס" : ""}`, `Contribution margin on initiative sales ${mM.value} (${q.en})${marginRate < 0 ? " — below zero" : ""}`), basis: mM.basis };
  }

  // ── Offer (coupon) ───────────────────────────────────────────────────
  const cM = r.metrics.find((m) => m.key === "coupon_orders");
  let offer: Dimension<OfferState>;
  if (!cM) offer = { state: "none", evidence: L("אין קופון ביוזמה", "No coupon in the initiative"), basis: null };
  else if (cM.value === null) offer = { state: "unknown", evidence: L("קופון לא מקושר", "Coupon not linked"), basis: null };
  else {
    const orders = Number(cM.value);
    const unused = r.findings.some((x) => x.kind === "coupon_unused");
    offer = { state: unused ? "unused" : demand.state === "strong" && orders === 0 ? "possibly_unnecessary" : "in_use", evidence: L(`${orders} הזמנות עם הקופון מאז ${period.start}`, `${orders} orders with the coupon since ${period.start}`), basis: cM.basis };
  }

  // ── Time ─────────────────────────────────────────────────────────────
  let time: Dimension<TimeState>;
  if (!live && period.end < period.today) time = { state: "ended", evidence: L("היוזמה הסתיימה", "The initiative has ended"), basis: null };
  else if (constraint?.alreadyOut) time = { state: "decision_required_now", evidence: L(`"${constraint.title}" כבר אזל; ${period.daysRemaining} ימים נותרו ליוזמה`, `"${constraint.title}" is already out; ${period.daysRemaining} initiative days remain`), basis: null };
  else if (constraint && constraint.coverDays !== null && constraint.coverDays <= WINDOW_NARROW_DAYS) time = { state: "decision_required_now", evidence: L(`"${constraint.title}" ייגמר תוך ~${constraint.coverDays} ימים; ${period.daysRemaining} ימים נותרו ליוזמה`, `"${constraint.title}" runs out in ~${constraint.coverDays} days; ${period.daysRemaining} initiative days remain`), basis: null };
  else if (period.daysRemaining <= WINDOW_NARROW_DAYS) time = { state: "window_narrowing", evidence: L(`${period.daysRemaining} ימים נותרו ליוזמה`, `${period.daysRemaining} initiative days remain`), basis: null };
  else time = { state: "enough_time", evidence: L(`יום ${period.dayIndex} מתוך ${period.totalDays}, ${period.daysRemaining} ימים נותרו`, `Day ${period.dayIndex} of ${period.totalDays}, ${period.daysRemaining} days remain`), basis: null };

  // ── Channel problem vs business problem ──────────────────────────────
  const demandOk = demand.state === "strong" || demand.state === "healthy";
  const demandWord = L(demand.state === "strong" ? "חזק" : "בריא", demand.state);
  const storesToo = offline.state === "strong" ? L(" גם בחנויות", " in stores too") : L("", "");
  let scope: BusinessDiagnosis["scope"];
  let headline: Localized;
  if (demand.state === "unknown") {
    scope = "unknown";
    headline = L("אין עדיין מספיק מכירות מדודות כדי לאבחן את היוזמה.", "Not enough measured sales yet to diagnose the initiative.");
  } else if (demandOk && paid.state === "weak") {
    scope = "channel";
    const metaWhy = /spend exceeds/.test(paid.evidence.en) ? L("מוציא יותר מההכנסה המיוחסת לו", "spends more than the revenue attributed to it") : L(`נחלש מול ${beforeLabel.he}`, `weakened vs ${beforeLabel.en}`);
    headline = L(`הביקוש ${demandWord.he}${storesToo.he}, אבל Meta ${metaWhy.he}.`, `Demand is ${demandWord.en}${storesToo.en}, but Meta ${metaWhy.en}.`);
  } else if (demandOk && constraint) {
    scope = "business";
    const what = constraint.role === "gift" ? L(`מלאי המתנה "${constraint.title}"`, `gift stock for "${constraint.title}"`) : L(`המלאי של "${constraint.title}"`, `stock of "${constraint.title}"`);
    headline = constraint.alreadyOut
      ? L(`הביקוש ${demandWord.he}, אבל ${what.he} כבר אזל${constraint.transferable.length ? ` — ${constraint.otherLocationStock} יחידות קיימות ב-${constraint.transferable.map((x) => x.name).join(", ")}` : ""}.`, `Demand is ${demandWord.en}, but ${what.en} is already out${constraint.transferable.length ? ` — ${constraint.otherLocationStock} units exist at ${constraint.transferable.map((x) => x.name).join(", ")}` : ""}.`)
      : L(`הביקוש ${demandWord.he}, אבל ${what.he} לא יספיק לחלון היוזמה.`, `Demand is ${demandWord.en}, but ${what.en} will not last the initiative window.`);
  } else if (demandOk && margin.state === "unprofitable") {
    scope = "business";
    headline = L("היוזמה מוכרת, אבל בהפסד — הרווחיות היא הבעיה, לא הביקוש.", "The initiative sells, but at a loss — profitability is the problem, not demand.");
  } else if (demand.state === "weak" && conversion.state === "weak") {
    scope = "business";
    headline = L("יש עניין (תנועה), אבל ההמרה חלשה — ההצעה, הדף או המחיר, לא כמות התנועה.", "Interest exists (traffic), but conversion is weak — the offer, the page or the price, not the amount of traffic.");
  } else if (demand.state === "weak" && offline.state === "strong") {
    scope = "channel";
    headline = L(`המכירות הכוללות ירדו, אבל בחנויות הן עלו מול ${beforeLabel.he} — המוצר בריא; תמהיל הערוצים הוא השאלה.`, `Overall sales fell, but stores rose vs ${beforeLabel.en} — the product is healthy; the channel mix is the question.`);
  } else if (demand.state === "weak") {
    scope = "business";
    headline = L(`הביקוש ליוזמה ירד מול ${beforeLabel.he} בכל הערוצים המדודים.`, `Demand for the initiative fell vs ${beforeLabel.en} across every measured channel.`);
  } else {
    scope = "none";
    headline = L(`הביקוש ${demandWord.he} ולא נמצא אילוץ מהותי.`, `Demand is ${demandWord.en} and no material constraint was found.`);
  }

  return { demand, conversion, paid, creators, offline, inventory, replenishment, margin, marginRate, offer, time, constraint, headline, scope, unknowns };
}
