import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const store = await db.store.findFirst({
  where: { connected: true, connection: { isNot: null } },
  orderBy: { updatedAt: 'desc' }
});

if (!store) {
  console.error('No connected store found.');
  process.exit(1);
}

console.log(`Triggering full orders re-sync for store: ${store.name} (${store.domain})`);
console.log(`Store ID: ${store.id}`);

await db.$disconnect();

const response = await fetch('http://localhost:3001/api/shopify/sync/initial', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ storeId: store.id })
});

const body = await response.json();
console.log(`HTTP ${response.status}`);
console.log(JSON.stringify(body, null, 2));
