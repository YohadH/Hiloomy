// One-shot repair for the tax-strip bug (SA reconciliation 2026-08-21).
//
// Buggy formula stored: lineSubtotal = originalInclusive − collectedTax,
// lineDiscount = discInclusive × lineSubtotal / originalInclusive.
// Both are exactly invertible from the stored columns:
//   O         = lineSubtotal + taxAmount            (original, tax-inclusive)
//   discIncl  = lineDiscount × O / lineSubtotal     (discount, tax-inclusive)
//   D         = O − discIncl                        (discounted, tax-inclusive)
//   rate      = taxAmount / (D − taxAmount)
//   correct lineSubtotal = O / (1 + rate),  correct discount = discIncl / (1 + rate)
//
// Scope: ONLY orders whose stored lines don't reconcile with the order's
// own Shopify subtotalPrice (residual > 1) — orders written by the fixed
// mapper reconcile to ~0 and are never touched, so the script is safe to
// re-run. Runs per-DB via TARGET_DB_URL.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.TARGET_DB_URL! } } });
const DRY = process.env.DRY === "1";

async function residualSummary(label: string) {
  const r: any = await db.$queryRaw`
    WITH per_order AS (
      SELECT o.id, o."subtotalPrice"::float AS sub,
             SUM(li."lineSubtotal" - li."lineDiscountAmount" + li."taxAmount")::float AS line_incl
      FROM "Order" o
      JOIN "OrderLineItem" li ON li."orderId" = o.id
      WHERE o."taxesIncluded" = true AND o."totalTax" > 0
      GROUP BY o.id
    )
    SELECT COUNT(*) FILTER (WHERE line_incl - sub > 1)::int AS bad_orders,
           COALESCE(SUM(line_incl - sub) FILTER (WHERE line_incl - sub > 1), 0)::float AS residual
    FROM per_order
  `;
  console.log(`${label}: bad_orders=${r[0].bad_orders} residual=₪${Math.round(r[0].residual)}`);
  return r[0];
}

async function main() {
  await residualSummary("BEFORE");
  if (DRY) return;

  // Line repair — one set-based UPDATE.
  const repaired: any = await db.$executeRaw`
    UPDATE "OrderLineItem" li
    SET "lineSubtotal" = calc.new_sub,
        "lineDiscountAmount" = calc.new_disc
    FROM (
      SELECT li2.id,
             ROUND((li2."lineSubtotal" + li2."taxAmount")
               / (1 + li2."taxAmount" / NULLIF(
                    (li2."lineSubtotal" + li2."taxAmount")
                    - (CASE WHEN li2."lineSubtotal" > 0
                            THEN li2."lineDiscountAmount" * (li2."lineSubtotal" + li2."taxAmount") / li2."lineSubtotal"
                            ELSE li2."lineDiscountAmount" END)
                    - li2."taxAmount", 0)), 2) AS new_sub,
             ROUND((CASE WHEN li2."lineSubtotal" > 0
                         THEN li2."lineDiscountAmount" * (li2."lineSubtotal" + li2."taxAmount") / li2."lineSubtotal"
                         ELSE li2."lineDiscountAmount" END)
               / (1 + li2."taxAmount" / NULLIF(
                    (li2."lineSubtotal" + li2."taxAmount")
                    - (CASE WHEN li2."lineSubtotal" > 0
                            THEN li2."lineDiscountAmount" * (li2."lineSubtotal" + li2."taxAmount") / li2."lineSubtotal"
                            ELSE li2."lineDiscountAmount" END)
                    - li2."taxAmount", 0)), 2) AS new_disc
      FROM "OrderLineItem" li2
      JOIN "Order" o ON o.id = li2."orderId"
      JOIN (
        -- residual orders only: stored line math ≠ order's own subtotal
        SELECT o2.id
        FROM "Order" o2
        JOIN "OrderLineItem" li3 ON li3."orderId" = o2.id
        WHERE o2."taxesIncluded" = true AND o2."totalTax" > 0
        GROUP BY o2.id, o2."subtotalPrice"
        HAVING SUM(li3."lineSubtotal" - li3."lineDiscountAmount" + li3."taxAmount") - o2."subtotalPrice"::float > 1
      ) bad ON bad.id = o.id
      WHERE li2."taxAmount" > 0
        AND li2."lineDiscountAmount" > 0
        AND (li2."lineSubtotal" + li2."taxAmount")
            - (CASE WHEN li2."lineSubtotal" > 0
                    THEN li2."lineDiscountAmount" * (li2."lineSubtotal" + li2."taxAmount") / li2."lineSubtotal"
                    ELSE li2."lineDiscountAmount" END)
            - li2."taxAmount" > 0.01
    ) calc
    WHERE li.id = calc.id AND calc.new_sub IS NOT NULL AND calc.new_disc IS NOT NULL
  `;
  console.log("lines repaired:", Number(repaired));

  // Shipping VAT repair — strip the unaccounted (non-product-line) tax from
  // totalShipping ONLY when it matches VAT embedded in the CURRENT value
  // (post-repair values fail the check → idempotent).
  const shipping: any = await db.$executeRaw`
    UPDATE "Order" o
    SET "totalShipping" = ROUND((o."totalShipping" - calc.ship_tax)::numeric, 2)
    FROM (
      SELECT o2.id,
             LEAST(GREATEST(o2."totalTax"::float - COALESCE(lt.line_tax, 0), 0), o2."totalShipping"::float) AS ship_tax,
             o2."totalShipping"::float AS ship
      FROM "Order" o2
      LEFT JOIN (
        SELECT "orderId", SUM("taxAmount")::float AS line_tax
        FROM "OrderLineItem" GROUP BY "orderId"
      ) lt ON lt."orderId" = o2.id
      WHERE o2."taxesIncluded" = true AND o2."totalTax" > 0 AND o2."totalShipping" > 0
    ) calc
    WHERE o.id = calc.id
      AND calc.ship_tax > 0.01
      -- plausibility gate: the unaccounted tax ≈ VAT share of the current
      -- (inclusive) shipping value. After repair this fails → no double strip.
      AND ABS(calc.ship - calc.ship_tax * (1 + 1 / 0.18)) < GREATEST(calc.ship * 0.03, 1)
  `;
  console.log("orders shipping-repaired:", Number(shipping));

  await residualSummary("AFTER ");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
