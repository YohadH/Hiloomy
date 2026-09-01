// Contribution margin engine.
//
// Sources its core numbers (grossSales / discounts / refunds / cogs) from
// the SAME Shopify-parity layer the Overview KPI reads from
// (lib/data/prisma-analytics-repository.ts::computeSalesSummary). This is
// the single-source-of-truth fix: the Money snapshot and the Overview KPI
// previously disagreed because this service used Order.subtotalPrice while
// the Overview used line-item gross sales net of discounts + refunds.
// Now both pull from the same primitive so the numbers reconcile.
//
// Formula (matches Shopify's "Gross sales → Net sales" walk):
//
//   grossSales           (Σ OrderLineItem.lineSubtotal)
// − discounts            (Σ OrderLineItem.lineDiscountAmount)
// − refunds              (Σ Refund.refundedLineItemsAmount — line items only,
//                         attributed to the original order's date to match
//                         Shopify Admin's Sales report)
// = netSales             ← what the brand actually earned from products
// − cogs                 (Σ OrderLineItem.estimatedCostAmount)
// − affiliateCommission  (Σ AffiliateAttribution.commissionAmount)
// = contributionMargin
//
// Shipping + tax are intentionally NOT included — they're pass-through
// (carrier costs, tax remittance) and don't represent margin the brand
// keeps. The Overview "REVENUE" KPI shows Shopify's `totalSales` which
// includes them; this service's headline is contribution margin which
// doesn't. That's a deliberate distinction explained in the UI.
//
// Accuracy tiers (unchanged from v1):
//   estimated   — line-item COGS via Product.estimatedCost.
//                 NO per-order ad spend allocation.
//   attributed  — adds per-order Meta ad spend via UTM matching. (Tier 2.)
//   reconciled  — adds offline reconciliation, tax adjustments, manual
//                 overrides. (Tier 3.)

import { getDb } from "@/lib/server/db";
import { computeCostCoverage } from "@/lib/services/cost-coverage";
import { formatDateInTimeZone, getStoreTimeZone } from "@/lib/server/reporting-date-range";
import {
  computeWindowAffiliateCommission,
  getShopifySalesSummaryForWindow
} from "@/lib/data/prisma-analytics-repository";

export type AccuracyTier = "estimated" | "attributed" | "reconciled";

export interface ContributionMarginTotals {
  // Headline revenue — matches Shopify "Gross sales" exactly.
  revenue: number;
  discounts: number;
  refunds: number;
  cogs: number;
  affiliateCommission: number;
  // Tier 2/3 placeholders — present so the UI doesn't have to special-case
  // their absence. Always 0 in v1.
  attributedAdSpend: number;
  shippingNet: number;
  contributionMargin: number;
  contributionMarginRate: number; // margin / revenue
  ordersIncluded: number;
}

export interface ContributionMarginQuality {
  accuracy: AccuracyTier;
  productsMissingCost: number;
  ordersWithoutLineItemCost: number;
  // Share of revenue (Shopify gross sales) backed by concrete COGS.
  costCoverage: number;
  confidence: "high" | "medium" | "low";
  notes: { he: string; en: string };
}

export interface ContributionMarginReport {
  windowStart: string;
  windowEnd: string;
  totals: ContributionMarginTotals;
  quality: ContributionMarginQuality;
}

export interface BuildContributionMarginInput {
  storeId: string;
  start: Date;
  end: Date;
}

export async function buildContributionMargin(
  input: BuildContributionMarginInput
): Promise<ContributionMarginReport> {
  const db = getDb();

  // ── Source of truth: Shopify-parity summary ────────────────────────
  // This computes grossSales, discounts, refunds, cogs, units etc. using
  // EXACTLY the same logic that powers the Overview KPI. The Money
  // snapshot and the KPI now reconcile because they share this primitive.
  const parity = await getShopifySalesSummaryForWindow(
    input.storeId,
    input.start,
    input.end
  );

  if (!parity) {
    return {
      windowStart: input.start.toISOString().slice(0, 10),
      windowEnd: input.end.toISOString().slice(0, 10),
      totals: {
        revenue: 0,
        discounts: 0,
        refunds: 0,
        cogs: 0,
        affiliateCommission: 0,
        attributedAdSpend: 0,
        shippingNet: 0,
        contributionMargin: 0,
        contributionMarginRate: 0,
        ordersIncluded: 0
      },
      quality: {
        accuracy: "estimated",
        productsMissingCost: 0,
        ordersWithoutLineItemCost: 0,
        costCoverage: 0,
        confidence: "low",
        notes: {
          he: "אין חיבור Shopify פעיל — לא ניתן לחשב רווח תרומה.",
          en: "No active Shopify connection — contribution margin unavailable."
        }
      }
    };
  }

  // ── Affiliate commission — same window, same filtering + refund deduction ──
  // The parity layer doesn't include commission because BixGrow is a
  // separate source. We pull it here and treat it as a contribution
  // margin deduction (= money paid out to affiliates).
  //
  // IMPORTANT: we apply the same refund-fraction deduction the affiliate-portal
  // dashboard uses so the two surfaces agree. Without this the margin panel
  // sums raw commissionAmount (including fully- or partially-refunded orders)
  // while the portal shows commission net of refunds — causing a discrepancy
  // of up to Σ(commission × refundFraction). See DISC-FIX.
  // Single shared implementation (SA clarity fix 2026-08-23) — the same
  // number the overview KPI's estimated profit deducts, so the snapshot
  // and the KPI card can never drift apart again.
  const affiliateCommission = await computeWindowAffiliateCommission(
    db,
    input.storeId,
    input.start,
    input.end
  );

  // ── Quality assessment ────────────────────────────────────────────
  // Coverage = share of the window's line revenue whose PRODUCT has a real
  // cost (manual override or Shopify-provided estimatedCost). The old test
  // (`estimatedCostAmount > 0` on the line) counted the sync's ratio-GUESSED
  // costs as covered, which is how this card claimed "99% coverage, 6
  // products missing" while the costs page truthfully reported 49% and 78
  // missing — the app understating its own uncertainty on its most
  // important number (F-038). Every surface now shares one definition of
  // "has a cost": a real one — via computeCostCoverage (M-10: the same
  // helper feeds /profit's badge and onboarding card, so the dashboard and
  // /profit can no longer quote different coverage for one window).
  const coverageResult = await computeCostCoverage(input.storeId, input.start, input.end);
  const costCoverage = coverageResult.coverage;
  const productsMissingCost = coverageResult.productsMissing;

  // Orders without any line-item cost — diagnostic.
  const ordersTotal = parity.orders;
  const ordersWithCost = (await db.order.count({
    where: {
      storeId: input.storeId,
      createdAt: { gte: input.start, lte: input.end },
      cancelledAt: null,
      test: false,
      lineItems: { some: { estimatedCostAmount: { gt: 0 } } }
    }
  })) as number;
  const ordersWithoutLineItemCost = Math.max(0, ordersTotal - ordersWithCost);

  const confidence: "high" | "medium" | "low" =
    costCoverage >= 0.9 ? "high" : costCoverage >= 0.6 ? "medium" : "low";

  // ── Contribution margin walk ──────────────────────────────────────
  // Use `returnsLineItems` (line-items-only refund total) — NOT `returns`
  // (which includes shipping + tax refund portions). grossSales is a
  // line-item-level metric; mixing in shipping/tax refunds would under-
  // state margin by ~the shipping/tax refund amount. See ShopifySalesSummary.
  const netSales = parity.grossSales - parity.discounts - parity.returnsLineItems;
  const contributionMargin = netSales - parity.cogs - affiliateCommission;
  const contributionMarginRate =
    parity.grossSales > 0 ? contributionMargin / parity.grossSales : 0;

  const notes = buildQualityNotes({
    productsMissingCost,
    ordersWithoutLineItemCost,
    confidence,
    costCoveragePct: Math.round(costCoverage * 100)
  });

  // Window labels as store-TZ calendar days. These strings reach the BI
  // analyst through get_profit_summary; formatted in UTC they read
  // "2026-08-24" for a window that starts Aug 25 in Israel, and the chat
  // introduced correct numbers with the wrong dates (H-15).
  const labelTimeZone = await getStoreTimeZone(input.storeId);
  return {
    windowStart: formatDateInTimeZone(input.start, labelTimeZone),
    windowEnd: formatDateInTimeZone(input.end, labelTimeZone),
    totals: {
      revenue: parity.grossSales,
      discounts: parity.discounts,
      // refunds reported here is the line-items-only amount, consistent
      // with how netSales/contributionMargin are computed above (they use
      // grossSales which excludes shipping + tax revenue).
      refunds: parity.returnsLineItems,
      cogs: parity.cogs,
      affiliateCommission,
      attributedAdSpend: 0, // Tier 2
      shippingNet: 0, // Tier 3
      contributionMargin,
      contributionMarginRate,
      ordersIncluded: parity.orders
    },
    quality: {
      accuracy: "estimated",
      productsMissingCost,
      ordersWithoutLineItemCost,
      costCoverage,
      confidence,
      notes
    }
  };
}

function buildQualityNotes(input: {
  productsMissingCost: number;
  ordersWithoutLineItemCost: number;
  confidence: "high" | "medium" | "low";
  costCoveragePct: number;
}): { he: string; en: string } {
  const pieces: { he: string[]; en: string[] } = { he: [], en: [] };
  pieces.he.push(
    `רמת דיוק: מוערך · ${input.costCoveragePct}% מההכנסה בחלון מגיעה ממוצרים עם עלות אמיתית.`
  );
  pieces.en.push(
    `Accuracy: estimated · ${input.costCoveragePct}% of window revenue comes from products with a real cost.`
  );
  if (input.productsMissingCost > 0) {
    pieces.he.push(
      `${input.productsMissingCost} מוצרים שנמכרו בחלון עדיין בלי עלות אמיתית (מחושבים לפי יחס ברירת מחדל).`
    );
    pieces.en.push(
      `${input.productsMissingCost} products sold in the window still lack a real cost (falling back to the default ratio).`
    );
  }
  if (input.ordersWithoutLineItemCost > 0) {
    pieces.he.push(`${input.ordersWithoutLineItemCost} הזמנות ללא עלות פריט.`);
    pieces.en.push(
      `${input.ordersWithoutLineItemCost} orders without line-item cost.`
    );
  }
  // A definition, not a claim of equality: the QA reconciled this figure
  // against Shopify at the same moment and found it short (orders still
  // syncing, cross-window refunds) while the UI asserted "matches". State
  // the formula and let the numbers speak.
  pieces.he.push("מכירות ברוטו מחושבות לפי הגדרת Shopify Gross sales — מחיר × כמות, לפני הנחות, ללא מע\"מ; 'סך מכירות' בכרטיס למטה מוסיף משלוח ומע\"מ כמו ב-Shopify. פער קטן מול Shopify נובע בדרך כלל מהזמנות שטרם סונכרנו.");
  pieces.en.push("Gross sales follows Shopify's Gross sales definition — price × quantity, pre-discount, ex-VAT; the 'Total sales' card below adds shipping + tax the way Shopify does. A small gap vs Shopify usually means orders still syncing.");
  return { he: pieces.he.join(" "), en: pieces.en.join(" ") };
}
