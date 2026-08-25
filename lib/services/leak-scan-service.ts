// Hiloomy Leak Scan — the aggregation layer that turns the insight
// engines into ONE number: "מצאנו ₪X דליפות רווח החודש".
//
// This is the product's spearhead (2026-08 repositioning: "Ecommerce
// Profit Intelligence — find the money your store is leaking"). Every
// leak item follows the same contract the battle card demands:
//
//   ₪ LOST → REASON → ACTION → EXPECTED IMPACT (→ deep link)
//
// Three legs, each honest about its data requirements:
//   1. Affiliate leakage    — commissions paid on customers the brand
//                             already owned. Needs NO setup (no COGS) —
//                             deliberately the first-scan wow number.
//   2. Underwater discounts — codes whose orders net negative margin.
//                             Needs product costs (COGS).
//   3. Returns ad waste     — Meta spend pushing products with high
//                             return rates. Needs a Meta connection.
//
// Legs with missing prerequisites return available:false with an unlock
// hint instead of a fabricated zero — the scan never fakes precision.
// Competitor pricing opportunities join later once snapshot history is
// deep enough to price them honestly.
//
// Consumers: Command Center hero (first thing after login), the weekly
// report cover ("Your Money Leaks This Week"), and — later — the free
// Leak Scan onboarding funnel.

import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";
import {
  applyReturningCommissionPolicy,
  classifyUnclassifiedAttributions,
  getCommissionLeakageSummary
} from "@/lib/services/affiliate-leakage-service";
import { buildDiscountScorecards } from "@/lib/services/discount-scorecard-service";
import { computeSilentProducts } from "@/lib/services/silent-product-alert-service";
import { computeSilentAffiliates } from "@/lib/services/silent-affiliate-alert-service";

// The leak catalog is the OWNER's list of leaks that actually matter
// (F-004): money burning on things that don't work, and money not being
// made from things that did work. The old third leg (ad spend on
// high-return products) was judged "not a valuable check at all" (F-003)
// and was replaced by the three detectors below.
export type LeakId =
  | "affiliate_leakage"
  | "underwater_discounts"
  | "roas_burn"
  | "silent_products"
  | "silent_affiliates";

export interface LeakItem {
  id: LeakId;
  /** ₪ leaked in the scan window (30d). 0 = checked and healthy. */
  amount: number;
  /** Expected ₪/month recovered if the action is taken (conservative). */
  monthlyImpact: number;
  reason: { he: string; en: string };
  action: { he: string; en: string };
  href: string;
  /** false = prerequisites missing; show the unlock hint, exclude from total. */
  available: boolean;
  unlockHint?: { he: string; en: string };
  /** Supporting detail for the row (top offender names etc.). */
  detail?: { he: string; en: string };
}

export interface LeakScanReport {
  windowStart: string;
  windowEnd: string;
  windowDays: number;
  /** Σ amounts of AVAILABLE legs only. */
  total: number;
  items: LeakItem[];
  /** How many legs actually had the data to run. */
  legsAvailable: number;
}

const WINDOW_DAYS = 30;
const RETURNS_WINDOW_DAYS = 60; // returns lag purchases

const round = (v: number) => Math.round(v);

export async function buildLeakScan(input: { storeId: string; end?: Date }): Promise<LeakScanReport> {
  const end = input.end ?? new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);

  const [affiliate, discounts, roasBurn, silentProducts, silentAffiliates] = await Promise.all([
    affiliateLeg(input.storeId, start, end).catch(() => unavailable("affiliate_leakage")),
    discountLeg(input.storeId, start, end).catch(() => unavailable("underwater_discounts")),
    roasBurnLeg(input.storeId, end).catch(() => unavailable("roas_burn")),
    silentProductsLeg(input.storeId).catch(() => unavailable("silent_products")),
    silentAffiliatesLeg(input.storeId).catch(() => unavailable("silent_affiliates"))
  ]);

  const items = [roasBurn, silentProducts, affiliate, discounts, silentAffiliates];
  const availableItems = items.filter((i) => i.available);

  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    windowDays: WINDOW_DAYS,
    total: round(availableItems.reduce((sum, i) => sum + i.amount, 0)),
    items,
    legsAvailable: availableItems.length
  };
}

function unavailable(id: LeakId): LeakItem {
  const base = LEG_META[id];
  return {
    id,
    amount: 0,
    monthlyImpact: 0,
    reason: base.reason,
    action: base.action,
    href: base.href,
    available: false,
    unlockHint: base.unlockHint
  };
}

const LEG_META: Record<LeakId, Pick<LeakItem, "reason" | "action" | "href" | "unlockHint">> = {
  affiliate_leakage: {
    reason: {
      he: "עמלות ששולמו על לקוחות שכבר היו שלכם",
      en: "Commissions paid on customers you already owned"
    },
    action: {
      he: "הגדירו מדיניות עמלה מופחתת ללקוח חוזר",
      en: "Set a reduced returning-customer commission policy"
    },
    href: "/affiliate-portal/programs#returning-policy",
    unlockHint: {
      he: "אין עדיין תוכנית שותפים מחוברת — הדליפה הזו נבדקת אוטומטית כשיש המרות שותפים.",
      en: "No affiliate program connected yet — this leak is scanned automatically once affiliate conversions exist."
    }
  },
  underwater_discounts: {
    reason: {
      he: "קודי הנחה שמוכרים בהפסד אחרי עלות המוצר",
      en: "Discount codes selling at a loss after product costs"
    },
    action: {
      he: "עצרו או הקטינו את הקודים המסומנים",
      en: "Stop or shrink the flagged codes"
    },
    href: "/discounts",
    unlockHint: {
      he: "הגדירו עלויות מוצרים (COGS) כדי לפתוח את בדיקת ההנחות ההפסדיות.",
      en: "Set product costs (COGS) to unlock the underwater-discount check."
    }
  },
  roas_burn: {
    reason: {
      he: "קמפיינים שרצים עם ROAS גרוע — כסף חי שנשרף",
      en: "Campaigns running at a losing ROAS — live money burning"
    },
    action: {
      he: "לעצור או לחתוך את הקמפיינים המסומנים היום",
      en: "Pause or cut the flagged campaigns today"
    },
    href: "/dashboard",
    unlockHint: {
      he: "חברו את Meta Ads כדי לפתוח את בדיקת שריפת התקציב.",
      en: "Connect Meta Ads to unlock the budget-burn check."
    }
  },
  silent_products: {
    reason: {
      he: "מוצרים שמכרו טוב והשתתקו — הכנסה מוכחת שנעלמה",
      en: "Products with a proven sales history that went silent"
    },
    action: {
      he: "להחזיר מלאי/זמינות/תנועה למוצרים המסומנים",
      en: "Restore stock/availability/traffic to the flagged products"
    },
    href: "/profit",
    unlockHint: {
      he: "נדרשת היסטוריית מכירות של ~3 חודשים כדי לזהות מוצר שהשתתק.",
      en: "Needs ~3 months of sales history to spot a product going silent."
    }
  },
  silent_affiliates: {
    reason: {
      he: "שותפים שקיבלו מוצרים/עמלות בלי חשיפה בצד השני",
      en: "Affiliates we invested in with no exposure delivered"
    },
    action: {
      he: "לתאם פרסום או להשהות את הקודים של השותפים המסומנים",
      en: "Schedule the content or pause the flagged affiliates' codes"
    },
    href: "/affiliate-portal",
    unlockHint: {
      he: "מופעל כשיש תוכנית שותפים ופרופילים במעקב אינסטגרם.",
      en: "Unlocks once affiliates exist and their Instagram profiles are tracked."
    }
  }
};

// ── Leg 1: affiliate leakage (no COGS needed — the first-scan number) ──
async function affiliateLeg(storeId: string, start: Date, end: Date): Promise<LeakItem> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const hasAttributions = await db.affiliateAttribution.findFirst({
    where: { storeId },
    select: { id: true }
  });
  if (!hasAttributions) return unavailable("affiliate_leakage");

  await classifyUnclassifiedAttributions(storeId).catch(() => 0);
  await applyReturningCommissionPolicy(storeId).catch(() => null);
  const summary = await getCommissionLeakageSummary({ storeId, start, end });

  const amount = round(summary.returningCustomer.commission);
  const top = summary.topLeakyAffiliates.slice(0, 2).map((a) => a.name).filter((n) => n !== "—");
  // Recovery is NOT 1:1 — some of these conversions only happened because
  // the affiliate re-engaged the customer, and win-back carve-outs keep
  // paying. Claim a conservative 50% and SAY it's a range, instead of the
  // old confident single figure the owner called unrealistic (F-002).
  const recoveryLow = round(amount * 0.5);
  const recoveryHigh = round(amount * 0.8);
  return {
    id: "affiliate_leakage",
    amount,
    monthlyImpact: recoveryLow,
    reason: LEG_META.affiliate_leakage.reason,
    action: LEG_META.affiliate_leakage.action,
    href: LEG_META.affiliate_leakage.href,
    available: true,
    detail:
      amount > 0
        ? {
            he: `${summary.returningCustomer.conversions} המרות על לקוחות חוזרים (${Math.round(summary.leakageRate * 100)}% מהעמלות)${top.length ? ` · מובילות: ${top.join(", ")}` : ""} · חיסכון ריאלי: ₪${recoveryLow.toLocaleString("en-US")}–₪${recoveryHigh.toLocaleString("en-US")} בחודש, לא את כל הסכום`,
            en: `${summary.returningCustomer.conversions} conversions on returning customers (${Math.round(summary.leakageRate * 100)}% of commissions)${top.length ? ` · top: ${top.join(", ")}` : ""} · realistic recovery: ₪${recoveryLow.toLocaleString("en-US")}–₪${recoveryHigh.toLocaleString("en-US")}/month, not the full amount`
          }
        : {
            he: "לא נמצאה דליפת עמלות בחלון — מצוין.",
            en: "No commission leakage found in this window — excellent."
          }
  };
}

// ── Leg 2: underwater discounts (needs COGS) ───────────────────────────
async function discountLeg(storeId: string, start: Date, end: Date): Promise<LeakItem> {
  const report = await buildDiscountScorecards({ storeId, start, end });
  if (report.cards.length === 0) {
    // No codes used — the leg ran and found nothing to leak.
    return {
      ...unavailable("underwater_discounts"),
      available: true,
      detail: {
        he: "לא נעשה שימוש בקודי הנחה בחלון הנבדק.",
        en: "No discount codes were used in the scanned window."
      }
    };
  }
  const withCost = report.cards.filter((c) => c.hasCostData);
  if (withCost.length === 0) return unavailable("underwater_discounts");

  // Seeding codes (deliberate affiliate/PR giveaways) are marketing spend,
  // not a leak — flagging them here is the F-001 false positive. The
  // classification lives in the scorecard (data layer) so this filter and
  // the alert engine read the same call.
  const underwater = report.cards.filter(
    (c) => c.verdict === "stop" && c.classification !== "seeding"
  );
  const amount = round(underwater.reduce((sum, c) => sum + Math.abs(Math.min(0, c.marginAfterDiscount)), 0));
  const codes = underwater.map((c) => c.code).slice(0, 3);
  return {
    id: "underwater_discounts",
    amount,
    monthlyImpact: amount, // stopping the codes recovers the bleed directly
    reason: LEG_META.underwater_discounts.reason,
    action: LEG_META.underwater_discounts.action,
    href: LEG_META.underwater_discounts.href,
    available: true,
    detail:
      amount > 0
        ? {
            he: `${underwater.length} קודים הפסדיים: ${codes.join(", ")}`,
            en: `${underwater.length} loss-making codes: ${codes.join(", ")}`
          }
        : {
            he: `${withCost.length} קודים נבדקו — כולם רווחיים.`,
            en: `${withCost.length} codes checked — all profitable.`
          }
  };
}

// ── Leg 3: ROAS burn — live spend that returns less than it costs ──────
async function roasBurnLeg(storeId: string, end: Date): Promise<LeakItem> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const spendStart = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
  const rows: Array<{
    campaignId: string;
    campaignName: string;
    _sum: { spend: unknown };
  }> = await db.metaAdsCampaignInsight.groupBy({
    by: ["campaignId", "campaignName"],
    where: { storeId, level: "campaign", dateStart: { gte: spendStart, lte: end } },
    _sum: { spend: true }
  });
  if (rows.length === 0) return unavailable("roas_burn");

  // Attributed revenue per campaign = Σ(roas × spend) over daily rows —
  // needs the raw rows, not the groupBy, because roas varies per day.
  const daily: Array<{ campaignId: string; spend: unknown; purchaseRoas: unknown }> =
    await db.metaAdsCampaignInsight.findMany({
      where: { storeId, level: "campaign", dateStart: { gte: spendStart, lte: end } },
      select: { campaignId: true, spend: true, purchaseRoas: true }
    });
  const perCampaign = new Map<string, { spend: number; revenue: number; hasRoas: boolean }>();
  for (const d of daily) {
    const acc = perCampaign.get(d.campaignId) ?? { spend: 0, revenue: 0, hasRoas: false };
    const spend = toNumber(d.spend);
    acc.spend += spend;
    if (d.purchaseRoas != null) {
      acc.hasRoas = true;
      acc.revenue += toNumber(d.purchaseRoas) * spend;
    }
    perCampaign.set(d.campaignId, acc);
  }
  const nameById = new Map(rows.map((r) => [r.campaignId, r.campaignName]));

  let burned = 0;
  const flagged: string[] = [];
  let considered = 0;
  for (const [campaignId, c] of perCampaign) {
    if (c.spend < 500 || !c.hasRoas) continue; // noise / no attribution data
    considered += 1;
    if (c.revenue >= c.spend) continue; // at least breaking even
    const loss = c.spend - c.revenue;
    burned += loss;
    if (flagged.length < 3) {
      flagged.push(
        `"${nameById.get(campaignId) ?? campaignId}" (₪${Math.round(loss).toLocaleString("en-US")} הפסד)`
      );
    }
  }

  const amount = round(burned);
  return {
    id: "roas_burn",
    amount,
    monthlyImpact: amount, // pausing stops the burn directly
    reason: LEG_META.roas_burn.reason,
    action: LEG_META.roas_burn.action,
    href: LEG_META.roas_burn.href,
    available: true,
    detail:
      amount > 0
        ? {
            he: `קמפיינים שמחזירים פחות ממה שהם עולים: ${flagged.join(" · ")}`,
            en: `Campaigns returning less than they cost: ${flagged.join(" · ")}`
          }
        : {
            he: `${considered} קמפיינים עם הוצאה אמיתית נבדקו — כולם מעל נקודת האיזון.`,
            en: `${considered} campaigns with real spend checked — all above breakeven.`
          }
  };
}

// ── Leg 4: silent products — proven sellers that went quiet ────────────
async function silentProductsLeg(storeId: string): Promise<LeakItem> {
  const offenders = await computeSilentProducts(storeId);
  const amount = round(offenders.reduce((sum, o) => sum + o.lostEstimate, 0));
  const names = offenders.slice(0, 2).map((o) => `"${o.title}"`);
  const oosCount = offenders.filter((o) => o.stock != null && o.stock <= 0).length;
  return {
    id: "silent_products",
    amount,
    // Restoring availability recaptures most of a proven run-rate — claim
    // 70%, not all of it (demand can cool on its own).
    monthlyImpact: round(amount * 0.7 * (30 / 14)),
    reason: LEG_META.silent_products.reason,
    action: LEG_META.silent_products.action,
    href: LEG_META.silent_products.href,
    available: true,
    detail:
      amount > 0
        ? {
            he: `${offenders.length} מוצרים שהשתתקו${oosCount > 0 ? ` (${oosCount} מהם אזלו מהמלאי)` : ""}: ${names.join(", ")}`,
            en: `${offenders.length} products went silent${oosCount > 0 ? ` (${oosCount} out of stock)` : ""}: ${names.join(", ")}`
          }
        : {
            he: "כל המוצרים עם היסטוריית מכירות ממשיכים למכור בקצב שלהם.",
            en: "Every product with a sales history is still selling at its pace."
          }
  };
}

// ── Leg 5: silent affiliates — investment with no exposure delivered ───
async function silentAffiliatesLeg(storeId: string): Promise<LeakItem> {
  const computation = await computeSilentAffiliates(storeId);
  if (computation.membersConsidered === 0) return unavailable("silent_affiliates");
  const amount = round(computation.flagged.reduce((sum, f) => sum + f.investment, 0));
  const names = computation.flagged.slice(0, 2).map((f) => f.name);
  return {
    id: "silent_affiliates",
    amount,
    monthlyImpact: amount,
    reason: LEG_META.silent_affiliates.reason,
    action: LEG_META.silent_affiliates.action,
    href: LEG_META.silent_affiliates.href,
    available: true,
    detail:
      amount > 0
        ? {
            he: `${computation.flagged.length} שותפים בלי תוצר: ${names.join(", ")}${computation.untracked > 0 ? ` · ${computation.untracked} נוספים ללא פרופיל במעקב (לא נבדקו)` : ""}`,
            en: `${computation.flagged.length} affiliates with no delivery: ${names.join(", ")}${computation.untracked > 0 ? ` · ${computation.untracked} more untracked (not judged)` : ""}`
          }
        : {
            he: `כל השותפים שהשקעתם בהם החודש פרסמו וקיבלו מעורבות${computation.untracked > 0 ? ` (${computation.untracked} ללא פרופיל במעקב — לא נבדקו)` : ""}.`,
            en: `Every affiliate you invested in this month posted with engagement${computation.untracked > 0 ? ` (${computation.untracked} untracked — not judged)` : ""}.`
          }
  };
}
