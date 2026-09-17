// One-off: re-sync recent orders so Order.shopifyLocationId / locationName
// (POS location or fulfillment location) are filled for orders that were
// synced before the columns existed. The nightly sync only pulls orders
// UPDATED since its last run, so history would otherwise stay unlocated.
//
//   $env:DATABASE_URL = "<prod pooler url>"; $env:DIRECT_URL = $env:DATABASE_URL
//   node --import tsx scripts/backfill-order-locations.ts <shop.myshopify.com | storeId> [days=90]
//
// Writes: order rows (upsert), line items, discounts, refunds — the same
// writes the regular sync performs. Read-only towards Shopify.

import { getDb } from "@/lib/server/db";
import { syncOrders } from "@/lib/services/shopify-sync-service";

const [, , target, daysArg] = process.argv;
if (!target) {
  console.error("usage: node --import tsx scripts/backfill-order-locations.ts <shop.myshopify.com | storeId> [days=90]");
  process.exit(1);
}
const days = Math.max(1, Math.min(365, Number(daysArg ?? 90) || 90));

async function main() {
  const db = getDb() as any;
  const store = await db.store.findFirst({ where: /\.myshopify\.com$/i.test(target) ? { domain: target } : { id: target }, select: { id: true, domain: true } });
  if (!store) throw new Error(`no store for ${target}`);
  const before = await db.order.count({ where: { storeId: store.id, shopifyLocationId: { not: null } } });
  const since = new Date(Date.now() - days * 86_400_000);
  console.log(`re-syncing orders of ${store.domain} updated since ${since.toISOString().slice(0, 10)} …`);
  const result = await syncOrders(store.id, since);
  const after = await db.order.count({ where: { storeId: store.id, shopifyLocationId: { not: null } } });
  const byLocation = await db.order.groupBy({ by: ["locationName"], where: { storeId: store.id, createdAt: { gte: since } }, _count: { _all: true } });
  console.log(JSON.stringify(result));
  console.log(`orders with a location: ${before} → ${after}`);
  for (const r of byLocation) console.log(`  ${r.locationName ?? "(none)"}: ${r._count._all}`);
  await db.$disconnect?.();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
