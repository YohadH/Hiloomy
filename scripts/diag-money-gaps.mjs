// Diagnostic for the Phase-3 "money gaps" (QA run 3: R-02 dropped orders,
// R-03 +₪518 refund offset). READ-ONLY — only SELECTs.
//
// Usage (PowerShell, against production):
//   $env:DATABASE_URL = "postgresql://postgres.<project>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require"
//   node scripts/diag-money-gaps.mjs <storeId> [startISO] [endISO]
//
// Defaults: Incense store, window = Aug 25 00:00 → Aug 31 23:59 Asia/Jerusalem.
// Prints, for the window:
//   1. every Refund row (refund date, full vs line-item amount, order status)
//      → the line-item sum is what the dashboard shows; compare to Shopify's
//        "Returns" for the same window. Rows whose line_amt ≈ full_amt on a
//        tax-inclusive store were stored VAT-inclusive (fixed in the mapper;
//        run "Backfill historical refunds" on /profit/returns to repair).
//   2. orders in the window that are cancelled / test / ₪0 total / fully
//      discounted → candidates for the 3 orders Shopify counts and we don't.
//   3. discount codes in the window with order counts and totals.

import { PrismaClient } from "@prisma/client";

const STORE = process.argv[2] || "cmofolt410000wkzw93wecvf7";
const start = new Date(process.argv[3] || "2026-08-24T21:00:00Z");
const end = new Date(process.argv[4] || "2026-08-31T20:59:59.999Z");

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the database you want to inspect.");
  process.exit(1);
}

const p = new PrismaClient({ log: [] });
const row = (r) => console.log(JSON.stringify(r));

try {
  console.log(`# store ${STORE} · window ${start.toISOString()} → ${end.toISOString()}`);

  console.log("\n## 1. Refunds by REFUND date (what the dashboard sums)");
  const refunds = await p.$queryRaw`
    SELECT r."shopifyRefundId", r."createdAt" AS refund_at,
           r."refundedAmount"::float AS full_amt, r."refundedLineItemsAmount"::float AS line_amt,
           o."displayName" AS order_name, o."createdAt" AS order_at, o."cancelledAt", o.test,
           o."financialStatus", o."taxesIncluded", o."totalPrice"::float AS order_total
    FROM "Refund" r JOIN "Order" o ON o.id = r."orderId"
    WHERE r."storeId" = ${STORE} AND r."createdAt" >= ${start} AND r."createdAt" <= ${end}
    ORDER BY r."createdAt"`;
  refunds.forEach(row);
  const sums = refunds.reduce(
    (a, r) => ({ full: a.full + r.full_amt, line: a.line + r.line_amt }),
    { full: 0, line: 0 }
  );
  console.log(`refunds=${refunds.length} Σfull=${sums.full.toFixed(2)} Σline=${sums.line.toFixed(2)} Σline/1.18=${(sums.line / 1.18).toFixed(2)}`);

  console.log("\n## 1b. Orders with more than one Refund row in the window");
  (await p.$queryRaw`
    SELECT o."displayName", COUNT(*)::int AS refund_rows, SUM(r."refundedLineItemsAmount")::float AS line_amt
    FROM "Refund" r JOIN "Order" o ON o.id = r."orderId"
    WHERE r."storeId" = ${STORE} AND r."createdAt" >= ${start} AND r."createdAt" <= ${end}
    GROUP BY o."displayName" HAVING COUNT(*) > 1`).forEach(row);

  console.log("\n## 2. Orders in window: totals and exclusions");
  (await p.$queryRaw`
    SELECT COUNT(*)::int AS all_rows,
           SUM(CASE WHEN "cancelledAt" IS NULL AND test = false THEN 1 ELSE 0 END)::int AS counted_by_dashboard,
           SUM(CASE WHEN "cancelledAt" IS NOT NULL THEN 1 ELSE 0 END)::int AS cancelled,
           SUM(CASE WHEN test THEN 1 ELSE 0 END)::int AS test_orders,
           SUM(CASE WHEN "totalPrice" <= 1 THEN 1 ELSE 0 END)::int AS zero_total
    FROM "Order" WHERE "storeId" = ${STORE} AND "createdAt" >= ${start} AND "createdAt" <= ${end}`).forEach(row);

  console.log("\n## 2b. Zero-total / cancelled / test orders in window (R-02 candidates)");
  (await p.$queryRaw`
    SELECT "displayName", "createdAt", "totalPrice"::float AS total, "subtotalPrice"::float AS subtotal,
           "totalDiscounts"::float AS discounts, "financialStatus", "cancelledAt", test, "sourceName"
    FROM "Order"
    WHERE "storeId" = ${STORE} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
      AND ("totalPrice" <= 1 OR "cancelledAt" IS NOT NULL OR test)
    ORDER BY "createdAt"`).forEach(row);

  console.log("\n## 2c. Highest-numbered orders we hold vs the window (gap = orders Shopify has that we don't)");
  (await p.$queryRaw`
    SELECT "displayName", "createdAt", "totalPrice"::float AS total
    FROM "Order" WHERE "storeId" = ${STORE} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    ORDER BY "orderNumber" DESC LIMIT 5`).forEach(row);

  console.log("\n## 2c-bis. Order-number GAPS inside the window (R-02: orders Shopify has that we never stored)");
  // Shopify numbers orders sequentially. Any number between the window's
  // lowest and highest that has no row here is an order that never reached
  // the database — regardless of status. Numbers that exist but are
  // cancelled/test are listed in 2b instead. Decisive for "ingest drops"
  // vs "aggregate excludes".
  (await p.$queryRaw`
    WITH nums AS (
      SELECT NULLIF(regexp_replace("orderNumber", '\D', '', 'g'), '')::bigint AS n
      FROM "Order" WHERE "storeId" = ${STORE} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    ),
    bounds AS (SELECT MIN(n) AS lo, MAX(n) AS hi FROM nums WHERE n IS NOT NULL),
    expected AS (SELECT generate_series(lo, hi) AS n FROM bounds),
    all_nums AS (
      SELECT NULLIF(regexp_replace("orderNumber", '\D', '', 'g'), '')::bigint AS n
      FROM "Order" WHERE "storeId" = ${STORE}
    )
    SELECT e.n AS missing_order_number
    FROM expected e LEFT JOIN all_nums a ON a.n = e.n
    WHERE a.n IS NULL ORDER BY e.n LIMIT 50`).forEach(row);

  console.log("\n## 2d. Discount basis split (H-14): orders whose DiscountUsage total ≠ Σ line discounts");
  // The dashboard sums OrderLineItem.lineDiscountAmount; /discounts sums
  // DiscountUsage.amount. Orders synced before per-line discountAllocations
  // were captured carry lineDiscountAmount = 0 for cart-level codes while the
  // usage row still holds the amount — the dashboard reads low by exactly
  // that. Re-syncing these orders (not the ingest) closes the gap.
  (await p.$queryRaw`
    SELECT COUNT(*)::int AS orders_split,
           SUM(u.usage_amt - l.line_disc)::float AS dashboard_short_by,
           SUM(CASE WHEN l.line_disc = 0 THEN 1 ELSE 0 END)::int AS orders_with_no_line_discount
    FROM "Order" o
    JOIN (SELECT "orderId", SUM(amount)::float AS usage_amt FROM "DiscountUsage" WHERE "storeId" = ${STORE} GROUP BY "orderId") u ON u."orderId" = o.id
    JOIN (SELECT "orderId", SUM("lineDiscountAmount")::float AS line_disc FROM "OrderLineItem" WHERE "storeId" = ${STORE} GROUP BY "orderId") l ON l."orderId" = o.id
    WHERE o."storeId" = ${STORE} AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
      AND o."cancelledAt" IS NULL AND o.test = false
      AND ABS(u.usage_amt - l.line_disc) > 1`).forEach(row);
  (await p.$queryRaw`
    SELECT o."displayName", o."totalDiscounts"::float AS order_disc, u.usage_amt, l.line_disc, o."updatedAt"
    FROM "Order" o
    JOIN (SELECT "orderId", SUM(amount)::float AS usage_amt FROM "DiscountUsage" WHERE "storeId" = ${STORE} GROUP BY "orderId") u ON u."orderId" = o.id
    JOIN (SELECT "orderId", SUM("lineDiscountAmount")::float AS line_disc FROM "OrderLineItem" WHERE "storeId" = ${STORE} GROUP BY "orderId") l ON l."orderId" = o.id
    WHERE o."storeId" = ${STORE} AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
      AND o."cancelledAt" IS NULL AND o.test = false
      AND ABS(u.usage_amt - l.line_disc) > 1
    ORDER BY ABS(u.usage_amt - l.line_disc) DESC LIMIT 10`).forEach(row);

  console.log("\n## 3. Discount codes in window");
  (await p.$queryRaw`
    SELECT du.code, du."applicationType", du."valueType",
           COUNT(DISTINCT du."orderId")::int AS orders, SUM(du.amount)::float AS discount_amt,
           MIN(o."totalPrice")::float AS min_total, MAX(o."totalPrice")::float AS max_total
    FROM "DiscountUsage" du JOIN "Order" o ON o.id = du."orderId"
    WHERE du."storeId" = ${STORE} AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
    GROUP BY du.code, du."applicationType", du."valueType"
    ORDER BY discount_amt DESC LIMIT 15`).forEach(row);

  const lastSync = await p.syncRun
    .findFirst({ where: { storeId: STORE }, orderBy: { startedAt: "desc" }, select: { startedAt: true, finishedAt: true, status: true, mode: true } })
    .catch(() => null);
  console.log("\n## last sync", JSON.stringify(lastSync));
} finally {
  await p.$disconnect();
}
