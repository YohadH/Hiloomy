/**
 * verify-daily-metrics.mjs
 * DATA-03 verification script.
 *
 * Runs aggregateDailyMetrics against the first connected store in the DB
 * and prints the resulting DailyMetric rows so the developer can confirm
 * the table is being populated.
 *
 * Usage (from the project root):
 *   npx tsx scripts/verify-daily-metrics.mjs
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "fs";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env manually (tsx doesn't auto-load it for plain .mjs scripts)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  // .env not found — rely on process environment
}

const prisma = new PrismaClient();

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  // Find the first connected store
  const store = await prisma.store.findFirst({
    where: { connected: true },
    select: { id: true, name: true, timezone: true }
  });

  if (!store) {
    console.error("No connected store found. Connect a Shopify store first.");
    process.exit(1);
  }

  console.log(`Store: ${store.name} (${store.id}), timezone: ${store.timezone}`);

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 90);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const timeZone = store.timezone ?? "UTC";
  const storeId = store.id;

  console.log(`Aggregating from ${start.toISOString()} to ${end.toISOString()} (tz: ${timeZone})`);

  const [sales, orderMeta, refunds] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(li."lineSubtotal") AS gross,
              SUM(li."lineDiscountAmount") AS disc,
              SUM(li."estimatedCostAmount") AS cogs
       FROM "Order" o
       JOIN "OrderLineItem" li ON li."orderId" = o."id"
       WHERE o."storeId" = $1
         AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId, start, end, timeZone
    ),
    prisma.$queryRawUnsafe(
      `WITH firsts AS (
         SELECT "customerId", MIN("createdAt") AS first_at
         FROM "Order"
         WHERE "storeId" = $1 AND "customerId" IS NOT NULL
           AND "cancelledAt" IS NULL AND "test" = false
         GROUP BY "customerId"
       )
       SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(o."totalShipping") AS ship, SUM(o."totalTax") AS tax,
              COUNT(*) AS orders,
              COUNT(*) FILTER (WHERE f."customerId" IS NOT NULL AND o."createdAt" > f.first_at) AS returning_orders,
              COUNT(*) FILTER (WHERE f."customerId" IS NULL OR o."createdAt" = f.first_at) AS new_customers
       FROM "Order" o
       LEFT JOIN firsts f ON f."customerId" = o."customerId"
       WHERE o."storeId" = $1 AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId, start, end, timeZone
    ),
    prisma.$queryRawUnsafe(
      `SELECT (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS d,
              SUM(r."refundedAmount") AS returns
       FROM "Refund" r JOIN "Order" o ON o."id" = r."orderId"
       WHERE r."storeId" = $1 AND o."createdAt" >= $2 AND o."createdAt" <= $3
         AND o."cancelledAt" IS NULL AND o."test" = false
       GROUP BY 1`,
      storeId, start, end, timeZone
    )
  ]);

  const byDay = new Map();
  const keyOf = (d) => new Date(d).toISOString().slice(0, 10);
  const getBucket = (k) => {
    if (!byDay.has(k)) byDay.set(k, { gross: 0, disc: 0, cogs: 0, ship: 0, tax: 0, orders: 0, returningOrders: 0, newCustomers: 0, returns: 0 });
    return byDay.get(k);
  };

  for (const r of sales) { const b = getBucket(keyOf(r.d)); b.gross += num(r.gross); b.disc += num(r.disc); b.cogs += num(r.cogs); }
  for (const r of orderMeta) { const b = getBucket(keyOf(r.d)); b.ship += num(r.ship); b.tax += num(r.tax); b.orders += num(r.orders); b.returningOrders += num(r.returning_orders); b.newCustomers += num(r.new_customers); }
  for (const r of refunds) { const b = getBucket(keyOf(r.d)); b.returns += num(r.returns); }

  if (byDay.size === 0) {
    console.log("No order data found in the last 90 days. Table cannot be populated without order data.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nFound ${byDay.size} day(s) with order data. Upserting into DailyMetric...`);

  let upserted = 0;
  for (const [isoDate, b] of byDay) {
    const net = b.gross - b.disc - b.returns;
    const revenue = net + b.ship + b.tax;
    const estimatedProfit = net - b.cogs;
    const returningCustomerRate = b.orders > 0 ? b.returningOrders / b.orders : 0;
    const averageOrderValue = b.orders > 0 ? revenue / b.orders : 0;
    const discountRate = b.gross > 0 ? b.disc / b.gross : 0;
    const refundRate = b.gross > 0 ? b.returns / b.gross : 0;
    const date = new Date(`${isoDate}T12:00:00.000Z`);

    await prisma.dailyMetric.upsert({
      where: { storeId_date: { storeId, date } },
      update: { revenue, estimatedProfit, returningCustomerRate, averageOrderValue, discountRate, refundRate, ordersCount: b.orders, newCustomers: b.newCustomers, returningCustomers: b.returningOrders },
      create: { storeId, date, revenue, estimatedProfit, returningCustomerRate, averageOrderValue, discountRate, refundRate, ordersCount: b.orders, newCustomers: b.newCustomers, returningCustomers: b.returningOrders }
    });
    upserted++;
  }

  console.log(`\nDone. Upserted ${upserted} DailyMetric rows.`);

  // Read back a sample to confirm the rows exist
  const sample = await prisma.dailyMetric.findMany({
    where: { storeId },
    orderBy: { date: "desc" },
    take: 5
  });

  console.log(`\nSample of DailyMetric rows (most recent 5):`);
  for (const row of sample) {
    console.log(
      `  ${row.date.toISOString().slice(0, 10)} | revenue=${Number(row.revenue).toFixed(2)} | orders=${row.ordersCount} | profit=${Number(row.estimatedProfit).toFixed(2)} | cvr(returning)=${(Number(row.returningCustomerRate) * 100).toFixed(1)}%`
    );
  }

  console.log(`\nTotal DailyMetric rows for store: ${await prisma.dailyMetric.count({ where: { storeId } })}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
