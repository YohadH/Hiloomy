// Subscription plan definitions. Single source of truth for what each
// tier costs + what it includes. Stripe prices live in their dashboard;
// we reference them here by env-var so test/prod can use different IDs
// without code changes.
//
// Plan limits are enforced at action time by `assertPlanAllowsAction()`.

export type PlanId = "trial" | "starter" | "growth" | "agency";
export type Currency = "ILS" | "USD";

export interface PlanDefinition {
  id: PlanId;
  // Display name keyed by locale.
  name: { he: string; en: string };
  description: { he: string; en: string };
  // Stripe Price IDs per currency + interval. Set via env vars; format is
  // STRIPE_PRICE_<PLAN>_<CURRENCY>_<INTERVAL>, e.g.
  //   STRIPE_PRICE_STARTER_ILS_MONTHLY=price_1Abc...
  // Lookup at runtime via getStripePriceId().
  prices: {
    monthly: { ILS: string | null; USD: string | null };
    annual:  { ILS: string | null; USD: string | null };
  };
  // Static price display — used in plan picker. Annual displays the
  // per-month equivalent (20% off list).
  display: {
    monthly: { ILS: number; USD: number };
    annual:  { ILS: number; USD: number };
  };
  // Hard limits enforced in code.
  limits: {
    maxBrands: number; // how many connected Shopify stores allowed
    maxTeammates: number;
  };
  // Marketing bullet list.
  features: {
    he: string[];
    en: string[];
  };
}

function envPrice(plan: string, currency: string, interval: string): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${currency.toUpperCase()}_${interval.toUpperCase()}`;
  return process.env[key] ?? null;
}

export const PLANS: Record<Exclude<PlanId, "trial">, PlanDefinition> = {
  starter: {
    id: "starter",
    name: { he: "סטרטר", en: "Starter" },
    description: {
      he: "מותג יחיד, משתמש אחד, כל התכונות.",
      en: "1 brand, 1 user, all features."
    },
    prices: {
      monthly: { ILS: envPrice("starter", "ils", "monthly"), USD: envPrice("starter", "usd", "monthly") },
      annual:  { ILS: envPrice("starter", "ils", "annual"),  USD: envPrice("starter", "usd", "annual") }
    },
    display: {
      monthly: { ILS: 179, USD: 49 },
      annual:  { ILS: 143, USD: 39 }
    },
    limits: { maxBrands: 1, maxTeammates: 1 },
    features: {
      he: [
        "מותג Shopify אחד",
        "משתמש אחד",
        "כל לוחות הניתוח",
        "סנכרון נתונים אוטומטי",
        "התראות בזמן אמת",
        "דוח שבועי PDF"
      ],
      en: [
        "1 Shopify brand",
        "1 user",
        "All analytics dashboards",
        "Auto data sync",
        "Real-time alerts",
        "Weekly PDF report"
      ]
    }
  },
  growth: {
    id: "growth",
    name: { he: "צמיחה", en: "Growth" },
    description: {
      he: "עד 3 מותגים, עד 3 משתמשים.",
      en: "Up to 3 brands, up to 3 users."
    },
    prices: {
      monthly: { ILS: envPrice("growth", "ils", "monthly"), USD: envPrice("growth", "usd", "monthly") },
      annual:  { ILS: envPrice("growth", "ils", "annual"),  USD: envPrice("growth", "usd", "annual") }
    },
    display: {
      monthly: { ILS: 549, USD: 149 },
      annual:  { ILS: 439, USD: 119 }
    },
    limits: { maxBrands: 3, maxTeammates: 3 },
    features: {
      he: [
        "עד 3 מותגי Shopify",
        "עד 3 משתמשים",
        "כל הכלול בסטרטר",
        "תמיכה במעבר בין מותגים",
        "ייצוא דוחות מותאם"
      ],
      en: [
        "Up to 3 Shopify brands",
        "Up to 3 users",
        "Everything in Starter",
        "Brand switching",
        "Custom report exports"
      ]
    }
  },
  agency: {
    id: "agency",
    name: { he: "סוכנות", en: "Agency" },
    description: {
      he: "עד 10 מותגים, עד 10 משתמשים, תמיכת VIP.",
      en: "Up to 10 brands, up to 10 users, priority support."
    },
    prices: {
      monthly: { ILS: envPrice("agency", "ils", "monthly"), USD: envPrice("agency", "usd", "monthly") },
      annual:  { ILS: envPrice("agency", "ils", "annual"),  USD: envPrice("agency", "usd", "annual") }
    },
    display: {
      monthly: { ILS: 1499, USD: 399 },
      annual:  { ILS: 1199, USD: 319 }
    },
    limits: { maxBrands: 10, maxTeammates: 10 },
    features: {
      he: [
        "עד 10 מותגי Shopify",
        "עד 10 משתמשים",
        "כל הכלול בצמיחה",
        "תמיכת VIP",
        "API גישה (Beta)",
        "מיתוג מותאם אישית"
      ],
      en: [
        "Up to 10 Shopify brands",
        "Up to 10 users",
        "Everything in Growth",
        "Priority support",
        "API access (beta)",
        "White-label branding"
      ]
    }
  }
};

export function getPlan(id: PlanId): PlanDefinition | null {
  if (id === "trial") return null;
  return PLANS[id] ?? null;
}

export function getStripePriceId(planId: PlanId, currency: Currency, interval: "monthly" | "annual"): string | null {
  if (planId === "trial") return null;
  const plan = PLANS[planId];
  if (!plan) return null;
  return plan.prices[interval][currency] ?? null;
}

/**
 * Trial limits — same as Starter to keep the trial useful but bounded.
 */
export const TRIAL_LIMITS = { maxBrands: 1, maxTeammates: 1 };
