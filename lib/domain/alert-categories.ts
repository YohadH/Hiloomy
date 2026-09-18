// Alert categories — the /alerts page groups the inbox by WHAT the alert is
// about (inventory, campaigns, competitors…) instead of by severity alone
// (owner, 18 Sep 2026: "תחלק את ההתראות לפי קטגוריות").
//
// The mapping is keyed by the stored Alert.type slug each engine writes.
// Severity still orders alerts inside a category and decides which category
// surfaces first, so an urgent stockout is never buried under a low-priority
// competitor note. Unknown slugs land in "other" — nothing is dropped.

import type { Alert, Severity } from "@/lib/domain/types";

export type AlertCategoryId =
  | "inventory"
  | "products"
  | "campaigns"
  | "competitors"
  | "returns"
  | "affiliates"
  | "plan"
  | "money"
  | "customers"
  | "data"
  | "other";

export interface AlertCategoryMeta {
  id: AlertCategoryId;
  label: { he: string; en: string };
  hint: { he: string; en: string };
}

// Display order when two categories share the same worst severity.
export const ALERT_CATEGORIES: AlertCategoryMeta[] = [
  {
    id: "inventory",
    label: { he: "מלאי", en: "Inventory" },
    hint: { he: "מוצרים שעומדים להיגמר או שכדאי לחדש — כמה זמן נשאר וכמה כסף מונח על המדף.", en: "Products about to run out or worth restocking — days left and money on the shelf." }
  },
  {
    id: "campaigns",
    label: { he: "קמפיינים ופרסום", en: "Campaigns & ads" },
    hint: { he: "קמפיינים שמוציאים כסף בלי להחזיר אותו, וקריסות ROAS מול התקופה הקודמת.", en: "Campaigns spending without converting, and ROAS collapses versus the prior period." }
  },
  {
    id: "competitors",
    label: { he: "מתחרים ושוק", en: "Competitors & market" },
    hint: { he: "מבצעים ומהלכים אצל המתחרים שנמצאים במעקב. הקשר — לא מספרים של החנות.", en: "Promotions and moves by tracked competitors. Context — not your store's numbers." }
  },
  {
    id: "plan",
    label: { he: "תוכנית והחלטות", en: "Plan & decisions" },
    hint: { he: "יוזמות מהתוכנית שדורשות החלטה, והחלטות שכבר עומדות על הפרק.", en: "Initiatives from the plan that need a decision, and decisions already on the table." }
  },
  {
    id: "products",
    label: { he: "מוצרים וביקוש", en: "Products & demand" },
    hint: { he: "מוצרים שהשתתקו או מאיצים — לפני שזה מגיע למספרים של החודש.", en: "Products going silent or accelerating — before it shows in the monthly numbers." }
  },
  {
    id: "returns",
    label: { he: "החזרות והחזרים", en: "Returns & refunds" },
    hint: { he: "שיעורי החזרה והחזרים שחורגים מהבסיס הרגיל של החנות.", en: "Return and refund rates running above the store's usual baseline." }
  },
  {
    id: "affiliates",
    label: { he: "שותפים ועמלות", en: "Affiliates & commissions" },
    hint: { he: "עמלות שמשולמות על הזמנות שלא הגיעו דרך השותף.", en: "Commissions paid on orders the affiliate did not bring." }
  },
  {
    id: "money",
    label: { he: "הכנסות ורווח", en: "Revenue & profit" },
    hint: { he: "הכנסות, הנחות ורווח מול התקופה הקודמת.", en: "Revenue, discounts and profit versus the prior period." }
  },
  {
    id: "customers",
    label: { he: "לקוחות ושימור", en: "Customers & retention" },
    hint: { he: "רכישה חוזרת ושימור לקוחות.", en: "Repeat purchase and retention." }
  },
  {
    id: "data",
    label: { he: "נתונים וחיבורים", en: "Data & connections" },
    hint: { he: "סנכרונים שנכשלו וחיבורים שדורשים תשומת לב.", en: "Failed syncs and connections that need attention." }
  },
  {
    id: "other",
    label: { he: "אחר", en: "Other" },
    hint: { he: "התראות שעדיין לא שויכו לקטגוריה.", en: "Alerts not yet assigned to a category." }
  }
];

export const ALERT_CATEGORY_BY_ID: Record<AlertCategoryId, AlertCategoryMeta> = Object.fromEntries(ALERT_CATEGORIES.map((c) => [c.id, c])) as Record<AlertCategoryId, AlertCategoryMeta>;

// Alert.type slug → category. Keep in sync with the engines that write rows
// (stockout, restock hero, ROAS collapse, competitor intel, decision inbox,
// affiliate leakage) and the rule alerts in alert-service.
const TYPE_TO_CATEGORY: Record<string, AlertCategoryId> = {
  stockout_imminent: "inventory",
  restock_hero: "inventory",
  inventory_low: "inventory",
  campaign_no_conversion: "campaigns",
  roas_collapse: "campaigns",
  campaign: "campaigns",
  competitor_promo: "competitors",
  competitor: "competitors",
  plan_decision: "plan",
  plan_initiative: "plan",
  decision_standalone_loss: "plan",
  decision_discount_tradeoff: "plan",
  product_gone_silent: "products",
  product_growth: "products",
  product: "products",
  return_rate_high: "returns",
  refund_spike: "returns",
  commission_leakage: "affiliates",
  silent_affiliate: "affiliates",
  revenue_down: "money",
  discount_spike: "money",
  repeat_rate_drop: "customers",
  sync_failure: "data",
  no_anomalies: "other"
};

const ENTITY_TO_CATEGORY: Record<string, AlertCategoryId> = {
  product: "products",
  campaign: "campaigns",
  competitor: "competitors",
  affiliate: "affiliates",
  plan_initiative: "plan"
};

export function categorizeAlert(alert: Pick<Alert, "type" | "relatedEntityType">): AlertCategoryId {
  const byType = alert.type ? TYPE_TO_CATEGORY[alert.type] : undefined;
  if (byType) return byType;
  const byEntity = alert.relatedEntityType ? ENTITY_TO_CATEGORY[alert.relatedEntityType] : undefined;
  if (byEntity) return byEntity;
  return "other";
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity] ?? 9;
}

export interface AlertCategoryGroup {
  category: AlertCategoryMeta;
  alerts: Alert[];
  worst: Severity;
  counts: Record<Severity, number>;
}

// Groups alerts by category. Categories are ordered by their worst severity
// (critical first), then by the fixed ALERT_CATEGORIES order; alerts inside a
// category are ordered by severity, then newest first. Empty categories are
// omitted.
export function groupAlertsByCategory(alerts: Alert[]): AlertCategoryGroup[] {
  const buckets = new Map<AlertCategoryId, Alert[]>();
  for (const alert of alerts) {
    const id = categorizeAlert(alert);
    const list = buckets.get(id) ?? [];
    list.push(alert);
    buckets.set(id, list);
  }
  const groups: AlertCategoryGroup[] = [];
  for (const category of ALERT_CATEGORIES) {
    const list = buckets.get(category.id);
    if (!list?.length) continue;
    const sorted = [...list].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.timestamp.localeCompare(a.timestamp));
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const a of sorted) counts[a.severity] = (counts[a.severity] ?? 0) + 1;
    groups.push({ category, alerts: sorted, worst: sorted[0].severity, counts });
  }
  const order = new Map(ALERT_CATEGORIES.map((c, i) => [c.id, i]));
  return groups.sort((a, b) => severityRank(a.worst) - severityRank(b.worst) || (order.get(a.category.id) ?? 99) - (order.get(b.category.id) ?? 99));
}
