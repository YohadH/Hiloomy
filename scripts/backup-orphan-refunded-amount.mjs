import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const db = new PrismaClient();

const rows = await db.$queryRawUnsafe(`
  SELECT
    "id",
    "storeId",
    "orderId",
    "productId",
    "variantId",
    "shopifyLineItemId",
    "title",
    "quantity",
    "lineSubtotal"::text  AS "lineSubtotal",
    "refundedAmount"::text AS "refundedAmount",
    "createdAt",
    "updatedAt"
  FROM "OrderLineItem"
  WHERE "refundedAmount" > 0
  ORDER BY "refundedAmount" DESC
`);

const outPath = resolve('scripts/refundedAmount-backup.json');
writeFileSync(
  outPath,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      column: 'OrderLineItem.refundedAmount (orphan, dropped on 2026-05-13)',
      rowCount: rows.length,
      rows
    },
    null,
    2
  )
);

console.log(`Backed up ${rows.length} rows to ${outPath}`);
await db.$disconnect();
