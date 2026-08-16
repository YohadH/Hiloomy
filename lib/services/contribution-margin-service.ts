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
import { getShopifySalesSummaryForWindow } from "@/lib/data/prisma-analytics-repository";

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
  const affRows = await db.affiliateAttribution.findMany({
    where: {
      storeId: input.storeId,
      occurredAt: { gte: input.start, lte: input.end }
    },
    select: {
      commissionAmount: true,
      order: { select: { totalPrice: true, totalRefunds: true } }
    }
  });
  const affiliateCommission = affRows.reduce((sum: number, row: { commissionAmount: unknown; order: { totalPrice?: unknown; totalRefunds?: unknown } | null }) => {
    const commission = Number(row.commissionAmount ?? 0);
    const total = Number(row.order?.totalPrice ?? 0);
    const refunds = Number(row.order?.totalRefunds ?? 0);
    const refundFraction = total > 0 && refunds > 0 ? Math.min(refunds / total, 1) : 0;
    return sum + commission * (1 - refundFraction);
  }, 0);

  // ── Quality assessment ────────────────────────────────────────────
  // Same as v1 — count products that sold in the window but have no cost
  // configured. Coverage is share of line revenue with non-zero estimated
  // cost. The parity layer doesn't surface this directly, so we re-query
  // just the diagnostic; the financial number stays anchored to parity.
  const lineCoverage = (await db.orderLineItem.aggregate({
    where: {
      storeId: input.storeId,
      order: {
        storeId: input.storeId,
        createdAt: { gte: input.start, lte: input.end },
        cancelledAt: null,
        test: false
      },
      estimatedCostAmount: { gt: 0 }
    },
    _sum: { lineSubtotal: true }
  })) as { _sum: { lineSubtotal: any } };
  const revenueWithCost = Number(lineCoverage._sum.lineSubtotal ?? 0);
  const costCoverage = parity.grossSales > 0 ? revenueWithCost / parity.grossSales : 0;

  // Distinct products that sold but had at least one zero-cost line item.
  // Best-effort — counts product ids appearing on line items with cost <= 0.
  // (estimatedCostAmount is a non-nullable Decimal that defaults to 0 when
  // unset, so checking <= 0 catches both "explicitly zero" and "unset".)
  const missingCostRows = (await db.orderLineItem.findMany({
    where: {
      storeId: input.storeId,
      order: {
        storeId: input.storeId,
        createdAt: { gte: input.start, lte: input.end },
        cancelledAt: null,
        test: false
      },
      estimatedCostAmount: { lte: 0 },
      productId: { not: null }
    },
    select: { productId: true },
    distinct: ["productId"]
  })) as Array<{ productId: string | null }>;
  const productsMissingCost = new Set<string>(
    missingCostRows.map((r) => r.productId).filter((p): p is string => p != null)
  ).size;

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

  return {
    windowStart: input.start.toISOString().slice(0, 10),
    windowEnd: input.end.toISOString().slice(0, 10),
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
  pieces.he.push(`רמת דיוק: מוערך · כיסוי עלות מוצרים (COGS) ${input.costCoveragePct}%.`);
  pieces.en.push(
    `Accuracy: estimated · ${input.costCoveragePct}% of revenue has concrete COGS.`
  );
  if (input.productsMissingCost > 0) {
    pieces.he.push(`חסר עלות ל-${input.productsMissingCost} מוצרים.`);
    pieces.en.push(`Missing exact COGS for ${input.productsMissingCost} products.`);
  }
  if (input.ordersWithoutLineItemCost > 0) {
    pieces.he.push(`${input.ordersWithoutLineItemCost} הזמנות ללא עלות פריט.`);
    pieces.en.push(
      `${input.ordersWithoutLineItemCost} orders without line-item cost.`
    );
  }
  pieces.he.push("הכנסה לפי Shopify Gross sales (תואם תפריט סקירה).");
  pieces.en.push("Revenue uses Shopify Gross sales (reconciles to Overview).");
  return { he: pieces.he.join(" "), en: pieces.en.join(" ") };
}
