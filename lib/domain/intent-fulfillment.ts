// Intent Fulfillment — how much of an initiative's ACTUAL result matches
// what the initiative INTENDED to achieve (docs/DECISION-INBOX-PLAN.md §0g).
//
//   Plan intent → Purchase reality → Omnichannel reality → Audience reality
//
// "Satin sales +43%" is a number. "We meant to sell the full set; 0 of 128
// satin orders contain a set — customers buy the components" is a finding.
// The intent is the manager's (a short form on the initiative); everything
// else here is computed from the initiative's own orders. Nothing is
// inferred from brand-wide data, and a missing intent is a state
// ("not_set"), never a guess.
//
// Pure; tested in tests/unit/intent-fulfillment.test.ts.

import type { Localized } from "@/lib/domain/decision";
import type { OrderChannel } from "@/lib/domain/business-diagnosis";

const L = (he: string, en: string): Localized => ({ he, en });
const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
const pct = (r: number) => `${Math.round(r * 100)}%`;

// ---------------------------------------------------------------------------
// The intent (stored in plan overrides, set by the manager).

export type IntentChannel = "online" | "offline" | "both";
export type IntentAudience = "new" | "existing" | "any";
// any      → an order that contains ANY target product fulfils the intent
//            (the hero product is the offer).
// together → an order must contain EVERY target product (a set built from
//            components — sheet + duvet cover + pillowcases).
export type IntentTargetMode = "any" | "together";
export type IntentGoalKind = "revenue" | "units" | "orders";

export interface InitiativeIntent {
  initiativeId: string;
  // What we intend customers to buy — product ids from the initiative's
  // mapped products. Empty = the intent says nothing about the purchase.
  targetProductIds: string[];
  targetMode: IntentTargetMode;
  // The manager's words for the offer: "סט מלא + כרית טיסה במתנה".
  targetLabel: string | null;
  channel: IntentChannel | null;
  audience: IntentAudience | null;
  goal: { kind: IntentGoalKind; value: number } | null;
  note: string | null;
  setAt: string;
}

// ---------------------------------------------------------------------------
// The evidence: the initiative's orders, whole (every line, not only the
// mapped products) — the purchase mix is the point.

export interface IntentOrderLine {
  productId: string | null;
  title: string;
  units: number; // net of refunds
  revenue: number; // net of line discounts and refunds
  // The line is one of the initiative's mapped products.
  initiativeProduct: boolean;
}

export interface IntentOrder {
  orderId: string;
  channel: OrderChannel;
  // First order at or after the initiative start → new. null = no customer.
  isNewCustomer: boolean | null;
  lines: IntentOrderLine[];
}

export interface IntentPeriod {
  live: boolean;
  dayIndex: number;
  elapsedShare: number; // 0..1
}

// ---------------------------------------------------------------------------
// The evaluation.

export type FulfillmentState = "fulfilled" | "partial" | "diverging" | "insufficient" | "not_set";
export type DimensionMatch = "matches" | "diverges" | "unknown";
export type GoalPace = "ahead" | "on_track" | "behind" | "unknown";

export interface PurchaseMixRow {
  productId: string | null;
  title: string;
  orders: number;
  units: number;
  revenue: number;
  intended: boolean; // a target product
  initiativeProduct: boolean;
}

export interface PurchaseFulfillment {
  intendedLabel: string;
  mode: IntentTargetMode;
  totalOrders: number; // orders that contain any initiative product
  intendedOrders: number; // orders that fulfil the intent
  totalRevenue: number; // initiative-product revenue in those orders
  intendedRevenue: number; // revenue of target lines in fulfilling orders
  orderShare: number | null;
  revenueShare: number | null;
  // Orders with initiative products but NOT the intended purchase — in
  // "together" mode: customers buying pieces of the set separately.
  componentsOnlyOrders: number;
  // Target products that were out of reach (never sold) — in "together"
  // mode a set cannot be completed without them.
  targetsNeverSold: string[];
  mix: PurchaseMixRow[];
}

export interface ChannelFulfillment {
  intended: IntentChannel;
  onlineShare: number | null; // of initiative revenue, classified only
  offlineShare: number | null;
  classifiedShare: number;
  state: DimensionMatch;
}

export interface AudienceFulfillment {
  intended: IntentAudience;
  newShare: number | null; // of orders with a known customer
  knownShare: number; // orders with a customer / all
  state: DimensionMatch;
}

export interface GoalFulfillment {
  kind: IntentGoalKind;
  target: number;
  actual: number;
  progress: number; // actual / target
  expectedByNow: number; // target × elapsed share
  pace: GoalPace;
}

export interface IntentFulfillment {
  defined: boolean;
  state: FulfillmentState;
  headline: Localized;
  findings: Localized[];
  purchase: PurchaseFulfillment | null;
  channel: ChannelFulfillment | null;
  audience: AudienceFulfillment | null;
  goal: GoalFulfillment | null;
  ordersObserved: number;
}

// V0 thresholds — named, not tuned.
export const MIN_ORDERS = 5; // below this nothing is said about the mix
export const FULFILLED_SHARE = 0.6; // ≥ 60% of orders match the intent
export const DIVERGING_SHARE = 0.35; // < 35% → the offer is not selling as planned
export const CHANNEL_MAJORITY = 0.5; // the intended channel should carry most of the revenue
export const AUDIENCE_MAJORITY = 0.5;
export const MIN_CLASSIFIED = 0.7; // channel / audience verdicts need a known majority
export const PACE_TOLERANCE = 0.1; // ±10% around the linear pace

export const FULFILLMENT_STATE_LABEL: Record<FulfillmentState, Localized> = {
  fulfilled: L("כמתוכנן", "as planned"),
  partial: L("חלקי", "partial"),
  diverging: L("לא כמתוכנן", "not as planned"),
  insufficient: L("מעט הזמנות", "few orders"),
  not_set: L("לא הוגדר", "not set")
};

export const INTENT_CHANNEL_LABEL: Record<IntentChannel, Localized> = {
  online: L("אונליין", "online"),
  offline: L("חנויות", "stores"),
  both: L("אונליין וחנויות", "online and stores")
};

export const INTENT_AUDIENCE_LABEL: Record<IntentAudience, Localized> = {
  new: L("לקוחות חדשים", "new customers"),
  existing: L("לקוחות קיימים", "existing customers"),
  any: L("כל לקוח", "any customer")
};

export const INTENT_GOAL_LABEL: Record<IntentGoalKind, Localized> = {
  revenue: L("הכנסות", "revenue"),
  units: L("יחידות", "units"),
  orders: L("הזמנות", "orders")
};

const NOT_SET: IntentFulfillment = {
  defined: false,
  state: "not_set",
  headline: L("לא הוגדר מה היוזמה נועדה להשיג — Hiloomy מודדת מכירות, לא הצלחה.", "What the initiative was meant to achieve is not defined — Hiloomy measures sales, not success."),
  findings: [],
  purchase: null,
  channel: null,
  audience: null,
  goal: null,
  ordersObserved: 0
};

const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// A catalogue can hold the same product twice (two Shopify ids, one title —
// Take a Nap's "סדין סאטן 600 - לבן", 16 Sep 2026). For the intent they are
// ONE thing: a set needs one of them, not both, and "never sold" is judged
// per title. Targets are therefore grouped by normalised title.
function targetGroups(targetIds: Iterable<string>, titles: ReadonlyMap<string, string>): Map<string, { title: string; ids: Set<string> }> {
  const groups = new Map<string, { title: string; ids: Set<string> }>();
  for (const id of targetIds) {
    const title = titles.get(id) ?? id;
    const key = normTitle(title);
    const g = groups.get(key) ?? { title, ids: new Set<string>() };
    g.ids.add(id);
    groups.set(key, g);
  }
  return groups;
}

const orderFulfils = (o: IntentOrder, groups: ReadonlyMap<string, { ids: Set<string> }>, mode: IntentTargetMode): boolean => {
  const bought = new Set(o.lines.filter((l) => l.productId && l.units > 0).map((l) => l.productId as string));
  const hit = [...groups.values()].filter((g) => [...g.ids].some((id) => bought.has(id)));
  if (hit.length === 0) return false;
  return mode === "any" ? true : hit.length === groups.size;
};

export function evaluateIntentFulfillment(intent: InitiativeIntent | null, orders: IntentOrder[], period: IntentPeriod, productTitles: ReadonlyMap<string, string> = new Map()): IntentFulfillment {
  if (!intent) return NOT_SET;
  const findings: Localized[] = [];
  const observed = orders.length;
  const enough = observed >= MIN_ORDERS;

  // ── Purchase reality ─────────────────────────────────────────────────
  let purchase: PurchaseFulfillment | null = null;
  const targets = new Set(intent.targetProductIds.filter(Boolean));
  if (targets.size) {
    const groups = targetGroups(targets, productTitles);
    const label = intent.targetLabel?.trim() || [...groups.values()].map((g) => g.title).join(" + ");
    const mixMap = new Map<string, PurchaseMixRow>();
    let totalRevenue = 0;
    let intendedRevenue = 0;
    let intendedOrders = 0;
    const soldTargets = new Set<string>();
    for (const o of orders) {
      const fulfils = orderFulfils(o, groups, intent.targetMode);
      if (fulfils) intendedOrders += 1;
      const seenInOrder = new Set<string>();
      for (const l of o.lines) {
        if (l.units <= 0) continue;
        const key = l.productId ?? `title:${l.title}`;
        const intended = !!l.productId && targets.has(l.productId);
        if (intended && l.productId) soldTargets.add(l.productId);
        if (l.initiativeProduct) totalRevenue += l.revenue;
        if (fulfils && intended) intendedRevenue += l.revenue;
        const row = mixMap.get(key) ?? { productId: l.productId, title: l.title, orders: 0, units: 0, revenue: 0, intended, initiativeProduct: l.initiativeProduct };
        row.units += l.units;
        row.revenue += l.revenue;
        if (!seenInOrder.has(key)) {
          row.orders += 1;
          seenInOrder.add(key);
        }
        mixMap.set(key, row);
      }
    }
    const mix = [...mixMap.values()].sort((a, b) => b.revenue - a.revenue);
    const orderShare = enough ? intendedOrders / observed : null;
    const revenueShare = enough && totalRevenue > 0 ? Math.min(1, intendedRevenue / totalRevenue) : null;
    const targetsNeverSold = [...groups.values()].filter((g) => ![...g.ids].some((id) => soldTargets.has(id))).map((g) => g.title);
    purchase = { intendedLabel: label, mode: intent.targetMode, totalOrders: observed, intendedOrders, totalRevenue, intendedRevenue, orderShare, revenueShare, componentsOnlyOrders: observed - intendedOrders, targetsNeverSold, mix };
    if (orderShare !== null) {
      if (orderShare < DIVERGING_SHARE) {
        if (intent.targetMode === "together") {
          findings.push(L(`רצינו למכור "${label}"; רק ${pct(orderShare)} מההזמנות (${intendedOrders} מתוך ${observed}) כוללות את כל חלקי הסט — הלקוחות קונים את הרכיבים בנפרד.`, `We meant to sell "${label}"; only ${pct(orderShare)} of orders (${intendedOrders} of ${observed}) contain every part of the set — customers buy the components separately.`));
          if (targetsNeverSold.length) findings.push(L(`${targetsNeverSold.length === 1 ? "רכיב אחד של הסט לא נמכר כלל" : `${targetsNeverSold.length} רכיבים של הסט לא נמכרו כלל`}: ${targetsNeverSold.join(", ")} — לבדוק מלאי, דף ומחיר של הרכיב לפני שמסיקים על הביקוש.`, `${targetsNeverSold.length === 1 ? "One part of the set never sold" : `${targetsNeverSold.length} parts of the set never sold`}: ${targetsNeverSold.join(", ")} — check that part's stock, page and price before concluding on demand.`));
        } else {
          const top = mix.find((m) => !m.intended && m.initiativeProduct);
          findings.push(L(`רצינו למכור "${label}"; רק ${pct(orderShare)} מההזמנות (${intendedOrders} מתוך ${observed}) כוללות אותו${top ? ` — מה שנמכר בפועל: "${top.title}" (${top.orders} הזמנות)` : ""}.`, `We meant to sell "${label}"; only ${pct(orderShare)} of orders (${intendedOrders} of ${observed}) include it${top ? ` — what actually sells: "${top.title}" (${top.orders} orders)` : ""}.`));
        }
      } else if (orderShare < FULFILLED_SHARE) {
        findings.push(L(`${pct(orderShare)} מההזמנות (${intendedOrders} מתוך ${observed}) תואמות את ההצעה שתוכננה ("${label}"); השאר קונים מוצרי יוזמה אחרים.`, `${pct(orderShare)} of orders (${intendedOrders} of ${observed}) match the planned offer ("${label}"); the rest buy other initiative products.`));
      } else {
        findings.push(L(`${pct(orderShare)} מההזמנות (${intendedOrders} מתוך ${observed}) תואמות את ההצעה שתוכננה ("${label}").`, `${pct(orderShare)} of orders (${intendedOrders} of ${observed}) match the planned offer ("${label}").`));
      }
    }
  }

  // ── Channel reality (initiative-product revenue by where the order was taken) ──
  let channel: ChannelFulfillment | null = null;
  if (intent.channel) {
    const rev = { online: 0, offline: 0, manual: 0, unknown: 0 };
    for (const o of orders) for (const l of o.lines) if (l.initiativeProduct && l.units > 0) rev[o.channel] += l.revenue;
    const total = rev.online + rev.offline + rev.manual + rev.unknown;
    const classified = total > 0 ? (total - rev.unknown) / total : 1;
    const known = rev.online + rev.offline + rev.manual;
    const onlineShare = enough && known > 0 ? rev.online / known : null;
    const offlineShare = enough && known > 0 ? rev.offline / known : null;
    let state: DimensionMatch = "unknown";
    if (onlineShare !== null && offlineShare !== null && classified >= MIN_CLASSIFIED) {
      if (intent.channel === "both") state = "matches";
      else if (intent.channel === "online") state = onlineShare >= CHANNEL_MAJORITY ? "matches" : "diverges";
      else state = offlineShare >= CHANNEL_MAJORITY ? "matches" : "diverges";
    }
    channel = { intended: intent.channel, onlineShare, offlineShare, classifiedShare: classified, state };
    if (state === "diverges") {
      const intendedShare = intent.channel === "online" ? onlineShare! : offlineShare!;
      const otherLabel = intent.channel === "online" ? L("מהחנויות", "from stores") : L("מאונליין", "from online");
      findings.push(L(`רצינו ${INTENT_CHANNEL_LABEL[intent.channel].he}; רק ${pct(intendedShare)} ממכירות היוזמה הגיעו משם — ${pct(1 - intendedShare)} ${otherLabel.he}.`, `We meant ${INTENT_CHANNEL_LABEL[intent.channel].en}; only ${pct(intendedShare)} of initiative sales came from there — ${pct(1 - intendedShare)} ${otherLabel.en}.`));
    }
  }

  // ── Audience reality (new vs existing, by orders with a known customer) ──
  let audience: AudienceFulfillment | null = null;
  if (intent.audience) {
    const known = orders.filter((o) => o.isNewCustomer !== null);
    const knownShare = observed > 0 ? known.length / observed : 0;
    const newShare = enough && known.length > 0 ? known.filter((o) => o.isNewCustomer).length / known.length : null;
    let state: DimensionMatch = "unknown";
    if (newShare !== null && knownShare >= MIN_CLASSIFIED) {
      if (intent.audience === "any") state = "matches";
      else if (intent.audience === "new") state = newShare >= AUDIENCE_MAJORITY ? "matches" : "diverges";
      else state = 1 - newShare >= AUDIENCE_MAJORITY ? "matches" : "diverges";
    }
    audience = { intended: intent.audience, newShare, knownShare, state };
    if (state === "diverges" && newShare !== null) {
      findings.push(
        intent.audience === "new"
          ? L(`רצינו לקוחות חדשים; ${pct(1 - newShare)} מהקונים ביוזמה הם לקוחות קיימים.`, `We meant new customers; ${pct(1 - newShare)} of the initiative's buyers are existing customers.`)
          : L(`רצינו לקוחות קיימים; ${pct(newShare)} מהקונים ביוזמה הם לקוחות חדשים.`, `We meant existing customers; ${pct(newShare)} of the initiative's buyers are new.`)
      );
    }
  }

  // ── Goal pace (linear against the elapsed share of the window) ───────
  let goal: GoalFulfillment | null = null;
  if (intent.goal && intent.goal.value > 0) {
    const k = intent.goal.kind;
    const actual =
      k === "orders"
        ? observed
        : orders.reduce((n, o) => n + o.lines.filter((l) => l.initiativeProduct && l.units > 0).reduce((m, l) => m + (k === "revenue" ? l.revenue : l.units), 0), 0);
    const progress = actual / intent.goal.value;
    const expectedByNow = intent.goal.value * period.elapsedShare;
    let pace: GoalPace = "unknown";
    if (period.live && period.dayIndex >= 3 && period.elapsedShare > 0) {
      const ratio = actual / expectedByNow;
      pace = ratio >= 1 + PACE_TOLERANCE ? "ahead" : ratio >= 1 - PACE_TOLERANCE ? "on_track" : "behind";
    } else if (!period.live && period.elapsedShare >= 1) {
      pace = progress >= 1 ? "on_track" : "behind";
    }
    goal = { kind: k, target: intent.goal.value, actual, progress, expectedByNow, pace };
    const fmt = (n: number) => (k === "revenue" ? ils(n) : String(Math.round(n)));
    if (pace === "behind") findings.push(L(`היעד: ${fmt(intent.goal.value)} ${INTENT_GOAL_LABEL[k].he}; עד היום ${fmt(actual)} (${pct(progress)}) כשעברו ${pct(period.elapsedShare)} מהזמן.`, `Goal: ${fmt(intent.goal.value)} ${INTENT_GOAL_LABEL[k].en}; so far ${fmt(actual)} (${pct(progress)}) with ${pct(period.elapsedShare)} of the window gone.`));
    else if (pace === "ahead") findings.push(L(`מקדימים את היעד: ${fmt(actual)} מתוך ${fmt(intent.goal.value)} ${INTENT_GOAL_LABEL[k].he} כשעברו ${pct(period.elapsedShare)} מהזמן.`, `Ahead of the goal: ${fmt(actual)} of ${fmt(intent.goal.value)} ${INTENT_GOAL_LABEL[k].en} with ${pct(period.elapsedShare)} of the window gone.`));
  }

  // ── Overall state ────────────────────────────────────────────────────
  const anyDimension = purchase !== null || channel !== null || audience !== null || goal !== null;
  let state: FulfillmentState;
  if (!anyDimension) state = "not_set";
  else if (!enough && (purchase || channel || audience)) state = "insufficient";
  else if ((purchase?.orderShare !== null && purchase?.orderShare !== undefined && purchase.orderShare < DIVERGING_SHARE) || channel?.state === "diverges" || audience?.state === "diverges") state = "diverging";
  else if (purchase?.orderShare !== null && purchase?.orderShare !== undefined && purchase.orderShare < FULFILLED_SHARE) state = "partial";
  else if (goal?.pace === "behind") state = "partial";
  else if (purchase || channel?.state === "matches" || audience?.state === "matches" || goal) state = "fulfilled";
  else state = "insufficient";

  // ── Headline ─────────────────────────────────────────────────────────
  let headline: Localized;
  if (state === "not_set") headline = NOT_SET.headline;
  else if (state === "insufficient") headline = L(`${observed} הזמנות בלבד עד כה — מעט מדי כדי לומר אם היוזמה מתבצעת כפי שתוכננה.`, `Only ${observed} orders so far — too few to say whether the initiative is unfolding as planned.`);
  else if (state === "diverging") {
    const first = findings[0];
    headline = L(`יש ביקוש למוצרי היוזמה, אבל היוזמה לא מתבצעת כפי שתוכננה: ${first?.he ?? ""}`, `There is demand for the initiative's products, but the initiative is not unfolding as planned: ${first?.en ?? ""}`);
  } else if (state === "partial") headline = L(`היוזמה מתבצעת חלקית כפי שתוכננה: ${findings[0]?.he ?? ""}`, `The initiative is partly unfolding as planned: ${findings[0]?.en ?? ""}`);
  else headline = L(`היוזמה מתבצעת כפי שתוכננה${purchase?.orderShare !== null && purchase?.orderShare !== undefined ? ` — ${pct(purchase.orderShare)} מההזמנות תואמות את ההצעה` : ""}.`, `The initiative is unfolding as planned${purchase?.orderShare !== null && purchase?.orderShare !== undefined ? ` — ${pct(purchase.orderShare)} of orders match the offer` : ""}.`);

  return { defined: true, state, headline, findings, purchase, channel, audience, goal, ordersObserved: observed };
}

// Validation for the stored shape (plan overrides are JSON the operator wrote through the UI).
export function normalizeIntent(raw: unknown): InitiativeIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.initiativeId !== "string" || !r.initiativeId) return null;
  const ids = Array.isArray(r.targetProductIds) ? [...new Set(r.targetProductIds.filter((x): x is string => typeof x === "string" && x.length > 0).map((x) => x.slice(0, 200)))].slice(0, 24) : [];
  const mode: IntentTargetMode = r.targetMode === "together" && ids.length > 1 ? "together" : "any";
  const channel = r.channel === "online" || r.channel === "offline" || r.channel === "both" ? r.channel : null;
  const audience = r.audience === "new" || r.audience === "existing" || r.audience === "any" ? r.audience : null;
  let goal: InitiativeIntent["goal"] = null;
  if (r.goal && typeof r.goal === "object") {
    const g = r.goal as Record<string, unknown>;
    const value = Number(g.value);
    if ((g.kind === "revenue" || g.kind === "units" || g.kind === "orders") && Number.isFinite(value) && value > 0) goal = { kind: g.kind, value };
  }
  const setAt = typeof r.setAt === "string" ? r.setAt : new Date(0).toISOString();
  if (!ids.length && !channel && !audience && !goal) return null;
  return {
    initiativeId: r.initiativeId,
    targetProductIds: ids,
    targetMode: mode,
    targetLabel: typeof r.targetLabel === "string" && r.targetLabel.trim() ? r.targetLabel.trim().slice(0, 160) : null,
    channel,
    audience,
    goal,
    note: typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 400) : null,
    setAt
  };
}
