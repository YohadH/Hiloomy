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
import {
  applyReturningCommissionPolicy,
  classifyUnclassifiedAttributions,
  getCommissionLeakageSummary
} from "@/lib/services/affiliate-leakage-service";
import { buildDiscountScorecards } from "@/lib/services/discount-scorecard-service";
import {
  buildReturnsIntelligence,
  extractReturnRisks,
  findReturnRiskForName
} from "@/lib/services/returns-intelligence-service";

export type LeakId = "affiliate_leakage" | "underwater_discounts" | "returns_ad_waste";

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

  const [affiliate, discounts, returnsWaste] = await Promise.all([
    affiliateLeg(input.storeId, start, end).catch(() => unavailable("affiliate_leakage")),
    discountLeg(input.storeId, start, end).catch(() => unavailable("underwater_discounts")),
    returnsAdWasteLeg(input.storeId, end).catch(() => unavailable("returns_ad_waste"))
  ]);

  const items = [affiliate, discounts, returnsWaste];
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
  returns_ad_waste: {
    reason: {
      he: "תקציב פרסום שנשרף על מוצרים עם החזרות גבוהות",
      en: "Ad spend pushing products with high return rates"
    },
    action: {
      he: "השהו את המוצרים האלה במודעות עד לתיקון מידות/תיאור",
      en: "Pause these products in ads until sizing/description is fixed"
    },
    href: "/profit/returns",
    unlockHint: {
      he: "חברו את Meta Ads כדי לפתוח את בדיקת בזבוז הפרסום על מוצרים חוזרים.",
      en: "Connect Meta Ads to unlock the returns-ad-waste check."
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

// ── Leg 3: returns ad waste (needs Meta) ───────────────────────────────
async function returnsAdWasteLeg(storeId: string, end: Date): Promise<LeakItem> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;

  const spendStart = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
  const campaigns: Array<{ campaignId: string; campaignName: string; _sum: { spend: unknown } }> =
    await db.metaAdsCampaignInsight.groupBy({
      by: ["campaignId", "campaignName"],
      where: {
        storeId,
        level: "campaign",
        dateStart: { gte: spendStart, lte: end }
      },
      _sum: { spend: true }
    });
  if (campaigns.length === 0) return unavailable("returns_ad_waste");

  const returnsReport = await buildReturnsIntelligence({
    storeId,
    start: new Date(end.getTime() - RETURNS_WINDOW_DAYS * 86_400_000),
    end
  });
  const risks = extractReturnRisks(returnsReport);

  let wasted = 0;
  const flagged: string[] = [];
  for (const campaign of campaigns) {
    const risk = findReturnRiskForName(campaign.campaignName, risks);
    if (!risk) continue;
    const spend = campaign._sum.spend == null ? 0 : Number(campaign._sum.spend);
    // Conservative: the wasted share of spend ≈ the product's return
    // rate (the fraction of driven sales that come back).
    wasted += spend * risk.returnRate;
    if (flagged.length < 3) flagged.push(`${campaign.campaignName} (${Math.round(risk.returnRate * 100)}%)`);
  }

  const amount = round(wasted);
  return {
    id: "returns_ad_waste",
    amount,
    monthlyImpact: amount,
    reason: LEG_META.returns_ad_waste.reason,
    action: LEG_META.returns_ad_waste.action,
    href: LEG_META.returns_ad_waste.href,
    available: true,
    detail:
      amount > 0
        ? {
            he: `קמפיינים מסומנים: ${flagged.join(" · ")}`,
            en: `Flagged campaigns: ${flagged.join(" · ")}`
          }
        : {
            he: `${campaigns.length} קמפיינים נבדקו — אף אחד לא מקדם מוצר עם החזרות חריגות.`,
            en: `${campaigns.length} campaigns checked — none is pushing a high-return product.`
          }
  };
}
