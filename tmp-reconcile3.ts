import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.PROD_DB_URL! } } });
const STORE = "cmofolt410000wkzw93wecvf7";

async function main() {
  const rows: any = await db.$queryRaw`
    SELECT o."orderNumber", o."subtotalPrice"::float AS order_sub, o."totalDiscounts"::float AS order_disc,
           o."totalTax"::float AS order_tax, o."totalPrice"::float AS order_total, o."totalShipping"::float AS order_ship,
           li.title, li.quantity, li."originalUnitPrice"::float AS unit, li."discountedUnitPrice"::float AS disc_unit,
           li."lineSubtotal"::float AS line_sub, li."lineDiscountAmount"::float AS line_disc, li."taxAmount"::float AS line_tax
    FROM "Order" o JOIN "OrderLineItem" li ON li."orderId" = o.id
    WHERE o."storeId" = ${STORE} AND o."orderNumber" IN ('#33566', '#33520', '#35228')
    ORDER BY o."orderNumber"
  `;
  for (const r of rows) console.log(JSON.stringify(r));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
