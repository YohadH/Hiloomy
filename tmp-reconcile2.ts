// Per-order residual + duplicate-line diagnostics (read-only).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.PROD_DB_URL! } } });
const STORE = "cmofolt410000wkzw93wecvf7";
const START = new Date("2026-05-22T21:00:00.000Z");
const END = new Date("2026-08-20T20:59:59.999Z");

async function main() {
  // Duplicate lines: same order + same shopifyLineItemId appearing twice,
  // or lines with NULL shopifyLineItemId (unique constraint doesn't bind).
  const dupes: any = await db.$queryRaw`
    SELECT COUNT(*)::int AS dup_groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows,
           COALESCE(SUM(extra_value), 0)::float AS extra_value
    FROM (
      SELECT li."orderId", li."shopifyLineItemId", COUNT(*) AS cnt,
             SUM(li."lineSubtotal") - MAX(li."lineSubtotal") AS extra_value
      FROM "OrderLineItem" li
      JOIN "Order" o ON o.id = li."orderId"
      WHERE li."storeId" = ${STORE}
        AND o."createdAt" >= ${START} AND o."createdAt" <= ${END}
        AND o."cancelledAt" IS NULL AND o.test = false
        AND li."shopifyLineItemId" IS NOT NULL
      GROUP BY 1, 2 HAVING COUNT(*) > 1
    ) d
  `;
  console.log("dup same-lineItemId:", JSON.stringify(dupes[0]));

  const nullIds: any = await db.$queryRaw`
    SELECT COUNT(*)::int AS null_id_lines, COALESCE(SUM(li."lineSubtotal"), 0)::float AS null_id_value
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    WHERE li."storeId" = ${STORE}
      AND o."createdAt" >= ${START} AND o."createdAt" <= ${END}
      AND o."cancelledAt" IS NULL AND o.test = false
      AND li."shopifyLineItemId" IS NULL
  `;
  console.log("null lineItemId:", JSON.stringify(nullIds[0]));

  // Per-order residual: (net line revenue + line tax) should equal
  // Shopify's tax-inclusive discounted subtotal (subtotalPrice).
  const residuals: any = await db.$queryRaw`
    WITH per_order AS (
      SELECT o.id, o."orderNumber", o."subtotalPrice"::float AS sub,
             o."totalDiscounts"::float AS order_disc,
             SUM(li."lineSubtotal" - li."lineDiscountAmount" + li."taxAmount")::float AS line_incl
      FROM "Order" o
      JOIN "OrderLineItem" li ON li."orderId" = o.id
      WHERE o."storeId" = ${STORE}
        AND o."createdAt" >= ${START} AND o."createdAt" <= ${END}
        AND o."cancelledAt" IS NULL AND o.test = false
      GROUP BY o.id
    )
    SELECT COUNT(*) FILTER (WHERE ABS(line_incl - sub) > 1)::int AS mismatched_orders,
           SUM(line_incl - sub) FILTER (WHERE ABS(line_incl - sub) > 1)::float AS total_residual
    FROM per_order
  `;
  console.log("residual (line_incl vs subtotalPrice):", JSON.stringify(residuals[0]));

  const topOffenders: any = await db.$queryRaw`
    WITH per_order AS (
      SELECT o.id, o."orderNumber", o."subtotalPrice"::float AS sub, o."financialStatus",
             SUM(li."lineSubtotal" - li."lineDiscountAmount" + li."taxAmount")::float AS line_incl,
             COUNT(*)::int AS lines
      FROM "Order" o
      JOIN "OrderLineItem" li ON li."orderId" = o.id
      WHERE o."storeId" = ${STORE}
        AND o."createdAt" >= ${START} AND o."createdAt" <= ${END}
        AND o."cancelledAt" IS NULL AND o.test = false
      GROUP BY o.id
    )
    SELECT "orderNumber", sub, line_incl, (line_incl - sub)::numeric(12,2) AS residual, lines, "financialStatus"
    FROM per_order WHERE ABS(line_incl - sub) > 1
    ORDER BY ABS(line_incl - sub) DESC LIMIT 12
  `;
  console.log("top offenders:");
  for (const r of topOffenders) console.log(" ", JSON.stringify(r));

  // Gross per Shopify's own order fields as cross-check:
  // gross(shopify-ish) = subtotalPrice + totalDiscounts (both tax-incl) → /1.18 → net-of-VAT gross
  const orderLevel: any = await db.$queryRaw`
    SELECT SUM("subtotalPrice" + "totalDiscounts")::float AS gross_incl,
           SUM("totalDiscounts")::float AS disc_incl
    FROM "Order"
    WHERE "storeId" = ${STORE}
      AND "createdAt" >= ${START} AND "createdAt" <= ${END}
      AND "cancelledAt" IS NULL AND test = false
  `;
  const gi = orderLevel[0];
  console.log("order-level: gross_incl:", Math.round(gi.gross_incl), "→ net-of-VAT:", Math.round(gi.gross_incl / 1.18), "| disc_incl:", Math.round(gi.disc_incl), "→", Math.round(gi.disc_incl / 1.18));
  console.log("Shopify says: gross 1554496, discounts 413699");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
