import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const rows = await db.$queryRawUnsafe(`
  SELECT
    COUNT(*)::int                                      AS total_rows,
    COUNT("refundedAmount")::int                       AS non_null_rows,
    COUNT(*) FILTER (WHERE "refundedAmount" > 0)::int  AS positive_rows,
    ROUND(SUM("refundedAmount")::numeric, 2)           AS sum_value,
    ROUND(MIN("refundedAmount")::numeric, 2)           AS min_value,
    ROUND(MAX("refundedAmount")::numeric, 2)           AS max_value
  FROM "OrderLineItem"
`);
console.log('Aggregate:', rows[0]);

const sample = await db.$queryRawUnsafe(`
  SELECT "id", "shopifyLineItemId", "quantity", "lineSubtotal", "refundedAmount"
  FROM "OrderLineItem"
  WHERE "refundedAmount" > 0
  ORDER BY "refundedAmount" DESC
  LIMIT 5
`);
console.log('\nTop 5 rows by refundedAmount:');
for (const r of sample) console.log(r);

await db.$disconnect();
