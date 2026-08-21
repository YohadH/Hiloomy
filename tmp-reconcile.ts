// Read-only reconciliation diagnostic vs Shopify Analytics (last 90 days).
// Shopify reference (store TZ Asia/Jerusalem, May 23 00:00 → Aug 20 23:59):
//   gross 1,554,496.46 · discounts 413,698.63 · reversals 31,638.76
//   net 1,109,159.07 · shipping 20,139.14 · taxes 202,752.70 · total 1,332,050.91
import { PrismaClient } from "@prisma/client";

const url = process.env.PROD_DB_URL!;
const db = new PrismaClient({ datasources: { db: { url } } });

// IL is UTC+3 in this window (IDT).
const START = new Date("2026-05-22T21:00:00.000Z");
const END = new Date("2026-08-20T20:59:59.999Z");

async function main() {
  const store: any = await db.$queryRaw`
    SELECT id, name, timezone FROM "Store" WHERE domain LIKE '%incense%' OR name ILIKE '%incense%' LIMIT 5
  `;
  console.log("stores:", JSON.stringify(store));
  const storeId = store[0]?.id;
  if (!storeId) return;

  const totals: any = await db.$queryRaw`
    SELECT COUNT(DISTINCT o.id)::int AS orders,
           SUM(li."lineSubtotal")::float AS gross,
           SUM(li."lineDiscountAmount")::float AS discounts,
           SUM(li."taxAmount")::float AS line_tax
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    WHERE li."storeId" = ${storeId}
      AND o."createdAt" >= ${START} AND o."createdAt" <= ${END}
      AND o."cancelledAt" IS NULL AND o.test = false
  `;
  console.log("\nHiloomy line totals:", JSON.stringify(totals[0]));

  // Split orders by whether their lines carry stripped tax (taxAmount > 0)
  // vs the suspect bucket: tax-inclusive store, order has tax, lines have none.
  const buckets: any = await db.$queryRaw`
    WITH per_order AS (
      SELECT o.id,
             o."taxesIncluded" AS ti,
             o."totalTax"::float AS order_tax,
             SUM(li."lineSubtotal")::float AS line_sum,
             SUM(li."lineDiscountAmount")::float AS disc_sum,
             SUM(li."taxAmount")::float AS line_tax
      FROM "Order" o
      JOIN "OrderLineItem" li ON li."orderId" = o.id
      WHERE o."storeId" = ${storeId}
        AND o."createdAt" >= ${START} AND o."createdAt" <= ${END}
        AND o."cancelledAt" IS NULL AND o.test = false
      GROUP BY o.id
    )
    SELECT CASE
             WHEN ti AND order_tax > 0 AND line_tax = 0 THEN 'SUSPECT_tax_not_stripped'
             WHEN ti THEN 'ok_tax_inclusive_stripped'
             ELSE 'tax_exclusive'
           END AS bucket,
           COUNT(*)::int AS orders,
           SUM(line_sum)::float AS gross,
           SUM(disc_sum)::float AS discounts,
           SUM(order_tax)::float AS order_tax
    FROM per_order
    GROUP BY 1 ORDER BY 1
  `;
  console.log("\nBuckets:");
  for (const b of buckets) console.log(" ", JSON.stringify(b));

  const refunds: any = await db.$queryRaw`
    SELECT COUNT(*)::int AS refunds,
           SUM(r."refundedAmount")::float AS refunded_full,
           SUM(r."refundedLineItemsAmount")::float AS refunded_lines
    FROM "Refund" r
    JOIN "Order" o ON o.id = r."orderId"
    WHERE r."storeId" = ${storeId}
      AND r."createdAt" >= ${START} AND r."createdAt" <= ${END}
      AND o."cancelledAt" IS NULL AND o.test = false
  `;
  console.log("\nRefunds (by refund date):", JSON.stringify(refunds[0]));

  const shipTax: any = await db.$queryRaw`
    SELECT SUM("totalShipping")::float AS shipping, SUM("totalTax")::float AS taxes,
           SUM("totalPrice")::float AS total_price
    FROM "Order"
    WHERE "storeId" = ${storeId}
      AND "createdAt" >= ${START} AND "createdAt" <= ${END}
      AND "cancelledAt" IS NULL AND test = false
  `;
  console.log("Order-level shipping/taxes:", JSON.stringify(shipTax[0]));

  // Reference deltas
  const t = totals[0];
  console.log("\n── vs Shopify ──");
  console.log("gross delta:    ", (t.gross - 1554496.46).toFixed(0));
  console.log("discount delta: ", (t.discounts - 413698.63).toFixed(0));
  const suspect = buckets.find((b: any) => b.bucket === "SUSPECT_tax_not_stripped");
  if (suspect) {
    const inflation = suspect.gross * (1 - 1 / 1.18);
    const discInflation = suspect.discounts * (1 - 1 / 1.18);
    console.log(`suspect bucket: ${suspect.orders} orders, gross ₪${Math.round(suspect.gross)}, implied VAT inflation ₪${Math.round(inflation)} (discounts ₪${Math.round(discInflation)})`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
