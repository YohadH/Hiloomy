// Cost coverage — ONE definition, shared by every surface that quotes it.
//
// The QA (M-10) found "cost coverage" quoted three ways at once: the settings
// health check said 49%, the dashboard's profit card said 40% and /profit's
// accuracy badge said 22% — for one brand, one window. Each was a different
// denominator (all-time product count / gross line revenue / net product
// revenue). A founder reading three numbers for one concept trusts none.
//
// Definition (revenue-weighted, window-scoped):
//   coverage = Σ lineSubtotal of lines whose PRODUCT has a real cost
//            ÷ Σ lineSubtotal of all lines in the window
// where "real cost" = a manual override OR a Shopify-provided estimatedCost
// > 0. The sync's ratio-guessed cost never counts — that is precisely the
// estimate coverage exists to measure. Lines whose product is unknown
// (deleted from Shopify, title-only) count as uncovered revenue.
//
// Consumers: contribution-margin-service (dashboard card + BI snapshot),
// product-cost-service.buildCogsOnboarding (/profit badge + onboarding card).
// The settings health check keeps its all-time product COUNT but says so in
// its label.

import { getDb } from "@/lib/server/db";

export interface CostCoverage {
  /** 0–1 share of window line revenue backed by a real product cost. */
  coverage: number;
  coveredRevenue: number;
  totalRevenue: number;
  /** Distinct products (or title-only lines) sold in the window without a real cost. */
  productsMissing: number;
}

export async function computeCostCoverage(
  storeId: string,
  start: Date,
  end: Date
): Promise<CostCoverage> {
  const db = getDb() as any;
  const rows = (await db.$queryRaw`
    SELECT
      COALESCE(SUM(CASE WHEN p."costOverrideAmount" IS NOT NULL OR p."estimatedCost" > 0
                        THEN li."lineSubtotal" ELSE 0 END), 0)::float AS covered_revenue,
      COALESCE(SUM(li."lineSubtotal"), 0)::float AS total_revenue,
      COUNT(DISTINCT CASE WHEN p.id IS NULL OR (p."costOverrideAmount" IS NULL AND (p."estimatedCost" IS NULL OR p."estimatedCost" <= 0))
                          THEN COALESCE(li."productId", li."title") END)::int AS products_missing
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    LEFT JOIN "Product" p ON p.id = li."productId"
    WHERE li."storeId" = ${storeId}
      AND o."createdAt" >= ${start}
      AND o."createdAt" <= ${end}
      AND o."cancelledAt" IS NULL
      AND o.test = false
  `.catch(() => [])) as Array<{ covered_revenue: number; total_revenue: number; products_missing: number }>;
  const row = rows[0];
  const totalRevenue = Number(row?.total_revenue ?? 0);
  const coveredRevenue = Number(row?.covered_revenue ?? 0);
  return {
    coverage: totalRevenue > 0 ? coveredRevenue / totalRevenue : 0,
    coveredRevenue,
    totalRevenue,
    productsMissing: Number(row?.products_missing ?? 0)
  };
}
