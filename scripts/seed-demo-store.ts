// Demo store seeder — creates/refreshes the "Hiloomy Demo" store with
// deterministic synthetic commerce data so prospects (and local dev) see a
// living dashboard instead of an empty state.
//
// Usage: npx tsx scripts/seed-demo-store.ts
//
// Idempotent by regeneration: wipes the demo store's commerce rows and
// recreates them. Only ever touches the store whose domain is
// DEMO_DOMAIN — it cannot touch a real store.
//
// What it seeds (60 days, ending today):
//   - 8 products (1 deliberate hero with ~35% of sales, 1 low-stock to
//     trigger the stockout-imminent engine)
//   - ~120 customers with returning-buyer behavior
//   - ~550-700 orders with line items, discounts, shipping and UTM/referrer
//     signals (so channel attribution + setup-health UTM check have data)

import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const DEMO_DOMAIN = "hiloomy-demo.myshopify.com";
const DAYS = 60;

// Deterministic PRNG (mulberry32) — same data on every run.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260812);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const PRODUCTS = [
  { title: "Midnight Oud — Eau de Parfum 50ml", price: 289, weight: 35, inventory: 84 },
  { title: "Citrus Neroli — Eau de Parfum 50ml", price: 249, weight: 14, inventory: 62 },
  { title: "Velvet Rose — Eau de Parfum 50ml", price: 259, weight: 12, inventory: 51 },
  { title: "Amber Santal — Eau de Parfum 50ml", price: 279, weight: 11, inventory: 5 }, // low stock → stockout alert
  { title: "Ocean Vetiver — Eau de Parfum 50ml", price: 239, weight: 9, inventory: 47 },
  { title: "Discovery Set — 5 × 2ml", price: 99, weight: 9, inventory: 210 },
  { title: "Solid Perfume — Midnight Oud 12g", price: 129, weight: 6, inventory: 93 },
  { title: "Gift Box — Duo 2 × 50ml", price: 449, weight: 4, inventory: 28 }
];

const FIRST_NAMES = ["נועה", "יעל", "מאיה", "תמר", "שירה", "עדי", "רוני", "דנה", "ליאור", "אור"];
const LAST_NAMES = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "דהן", "אברהם", "פרידמן"];

// Attribution signals — mix that lands ~70% coverage (setup-health "pass").
const TRAFFIC = [
  { landingSiteRef: "/?utm_source=facebook&utm_medium=paid&utm_campaign=demo-prospecting", referringSite: "facebook.com", weight: 30 },
  { landingSiteRef: "/?utm_source=instagram&utm_medium=social", referringSite: "instagram.com", weight: 18 },
  { landingSiteRef: "/?utm_source=google&utm_medium=cpc&utm_campaign=demo-brand", referringSite: "google.com", weight: 14 },
  { landingSiteRef: null, referringSite: "google.com", weight: 10 },
  { landingSiteRef: null, referringSite: null, weight: 28 }
] as const;

function weighted<T extends { weight: number }>(options: readonly T[]): T {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let roll = rand() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option;
  }
  return options[options.length - 1];
}

async function main() {
  // ── Store ───────────────────────────────────────────────────────────
  const anyOrg = await p.organization.findFirst({ select: { id: true } });
  const store = await p.store.upsert({
    where: { domain: DEMO_DOMAIN },
    update: { isDemo: true, connected: true, ...(anyOrg ? { orgId: anyOrg.id } : {}) },
    create: {
      name: "Hiloomy Demo",
      domain: DEMO_DOMAIN,
      currency: "ILS",
      timezone: "Asia/Jerusalem",
      connected: true,
      isDemo: true,
      ...(anyOrg ? { orgId: anyOrg.id } : {})
    }
  });
  console.log(`Demo store: ${store.id} (org: ${store.orgId ?? "none"})`);

  // ── Wipe previous demo commerce data (store-scoped only) ────────────
  await p.order.deleteMany({ where: { storeId: store.id } }); // line items cascade
  await p.customer.deleteMany({ where: { storeId: store.id } });
  await p.product.deleteMany({ where: { storeId: store.id } }); // variants cascade
  await p.competitorSnapshot.deleteMany({ where: { storeId: store.id } });
  await p.competitor.deleteMany({ where: { storeId: store.id } });

  // ── Products + variants ─────────────────────────────────────────────
  const now = new Date();
  const products: Array<{ id: string; variantId: string; price: number; weight: number; title: string }> = [];
  for (let i = 0; i < PRODUCTS.length; i++) {
    const spec = PRODUCTS[i];
    const product = await p.product.create({
      data: {
        storeId: store.id,
        shopifyProductId: `demo-product-${i + 1}`,
        title: spec.title,
        handle: `demo-product-${i + 1}`,
        vendor: "Hiloomy Demo",
        productType: "Fragrance",
        status: "active",
        collection: "Demo Collection",
        price: spec.price,
        estimatedCost: Math.round(spec.price * 0.32),
        createdAt: new Date(now.getTime() - 200 * 86_400_000),
        updatedAt: now
      }
    });
    const variant = await p.productVariant.create({
      data: {
        storeId: store.id,
        productId: product.id,
        shopifyVariantId: `demo-variant-${i + 1}`,
        sku: `DEMO-${i + 1}`,
        title: "Default",
        price: spec.price,
        inventoryQuantity: spec.inventory
      }
    });
    products.push({ id: product.id, variantId: variant.id, price: spec.price, weight: spec.weight, title: spec.title });
  }
  console.log(`Seeded ${products.length} products.`);

  // ── Customers ───────────────────────────────────────────────────────
  const customers: Array<{ id: string; orders: number; spend: number; firstOrderAt: Date | null }> = [];
  for (let i = 0; i < 120; i++) {
    const first = pick([...FIRST_NAMES]);
    const last = pick([...LAST_NAMES]);
    const created = new Date(now.getTime() - Math.floor(rand() * 180 + 10) * 86_400_000);
    const customer = await p.customer.create({
      data: {
        storeId: store.id,
        shopifyCustomerId: `demo-customer-${i + 1}`,
        email: `demo.customer${i + 1}@example.com`,
        firstName: first,
        lastName: last,
        name: `${first} ${last}`,
        createdAt: created,
        updatedAt: created
      }
    });
    customers.push({ id: customer.id, orders: 0, spend: 0, firstOrderAt: null });
  }
  console.log(`Seeded ${customers.length} customers.`);

  // ── Orders (60 days, weekend-weighted, hero-product-skewed) ─────────
  let orderCount = 0;
  let orderSeq = 1000;
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    const day = new Date(now.getTime() - daysAgo * 86_400_000);
    const dow = day.getUTCDay();
    // Thu-Sat run hotter (Israeli weekend shopping), gentle growth trend.
    const base = 6 + (dow === 4 || dow === 5 || dow === 6 ? 4 : 0);
    const trend = Math.round(((DAYS - daysAgo) / DAYS) * 4);
    const ordersToday = base + trend + Math.floor(rand() * 4);

    for (let n = 0; n < ordersToday; n++) {
      orderSeq++;
      const customer = customers[Math.floor(rand() * customers.length)];
      const itemCount = rand() < 0.65 ? 1 : rand() < 0.8 ? 2 : 3;
      const chosen = new Set<number>();
      const items: Array<{ product: (typeof products)[number]; qty: number }> = [];
      for (let k = 0; k < itemCount; k++) {
        const spec = weighted(PRODUCTS.map((s, idx) => ({ ...s, idx })));
        if (chosen.has(spec.idx)) continue;
        chosen.add(spec.idx);
        items.push({ product: products[spec.idx], qty: rand() < 0.9 ? 1 : 2 });
      }

      const subtotal = items.reduce((s, it) => s + it.product.price * it.qty, 0);
      const discount = rand() < 0.22 ? Math.round(subtotal * 0.1) : 0;
      const shipping = subtotal - discount >= 199 ? 0 : 25;
      const total = subtotal - discount + shipping;
      const traffic = weighted(TRAFFIC);
      const placedAt = new Date(day.getTime() + Math.floor(rand() * 86_400_000 * 0.7) + 86_400_000 * 0.25);

      const order = await p.order.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          shopifyOrderId: `demo-order-${orderSeq}`,
          orderNumber: `#D${orderSeq}`,
          displayName: `#D${orderSeq}`,
          createdAt: placedAt,
          processedAt: placedAt,
          updatedAt: placedAt,
          currency: "ILS",
          subtotalPrice: subtotal,
          totalDiscounts: discount,
          totalShipping: shipping,
          totalPrice: total,
          financialStatus: "paid",
          fulfillmentStatus: daysAgo <= 2 ? "unfulfilled" : "fulfilled",
          sourceName: "web",
          landingSiteRef: traffic.landingSiteRef,
          referringSite: traffic.referringSite
        }
      });

      for (let li = 0; li < items.length; li++) {
        const it = items[li];
        const lineSubtotal = it.product.price * it.qty;
        const lineDiscount = discount > 0 ? Math.round((lineSubtotal / subtotal) * discount) : 0;
        await p.orderLineItem.create({
          data: {
            storeId: store.id,
            orderId: order.id,
            productId: it.product.id,
            variantId: it.product.variantId,
            shopifyLineItemId: `demo-line-${orderSeq}-${li}`,
            title: it.product.title,
            quantity: it.qty,
            originalUnitPrice: it.product.price,
            discountedUnitPrice: it.product.price - Math.round(lineDiscount / it.qty),
            lineSubtotal,
            lineDiscountAmount: lineDiscount,
            estimatedCostAmount: Math.round(it.product.price * 0.32) * it.qty
          }
        });
      }

      customer.orders++;
      customer.spend += total;
      if (!customer.firstOrderAt || placedAt < customer.firstOrderAt) customer.firstOrderAt = placedAt;
      orderCount++;
    }
  }
  console.log(`Seeded ${orderCount} orders.`);

  // ── Customer rollups (returning-buyer flags for retention views) ────
  for (const c of customers) {
    if (c.orders === 0) continue;
    await p.customer.update({
      where: { id: c.id },
      data: {
        totalOrders: c.orders,
        lifetimeValue: c.spend,
        firstOrderDate: c.firstOrderAt,
        isReturning: c.orders > 1
      }
    });
  }

  // ── Competitor set + 15 days of snapshots ───────────────────────────
  // Feeds the weekly report's "what competitors did" section and the
  // competitor-response alert engine — the current week runs hotter than
  // the prior week so change arrows and alerts have something to show.
  const COMPETITOR_SPECS = [
    { name: "Scent Boutique (demo)", domain: "scent-boutique-demo.co.il" },
    { name: "Parfum Bar (demo)", domain: "parfumbar-demo.co.il" },
    { name: "Aroma House (demo)", domain: "aromahouse-demo.co.il" }
  ];
  let snapshotCount = 0;
  for (let c = 0; c < COMPETITOR_SPECS.length; c++) {
    const spec = COMPETITOR_SPECS[c];
    const competitor = await p.competitor.create({
      data: { storeId: store.id, name: spec.name, domain: spec.domain }
    });
    for (let daysAgo = 14; daysAgo >= 0; daysAgo--) {
      const day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo)
      );
      const recent = daysAgo <= 7;
      const promoCount = (c + daysAgo) % 3 === 0 ? (recent ? 2 : 1) : recent ? 1 : 0;
      const maxDiscountPct = promoCount > 0 ? (recent ? 25 + c * 5 : 15 + c * 5) : null;
      await p.competitorSnapshot.create({
        data: {
          storeId: store.id,
          competitorId: competitor.id,
          snapshotDate: day,
          source: "mock",
          activePromoCount: promoCount,
          maxDiscountPct,
          freeShippingThreshold: c === 1 ? 199 : recent && c === 0 ? 249 : null,
          homepageMessage:
            promoCount > 1 ? (recent ? "SUMMER SALE — up to 30% off" : "Weekend deal 15%") : null
        }
      });
      snapshotCount++;
    }
  }
  console.log(`Seeded ${COMPETITOR_SPECS.length} competitors, ${snapshotCount} snapshots.`);

  console.log("Demo store seeded. Switch to 'Hiloomy Demo' in the store switcher to see it.");
}

main()
  .catch((e) => {
    console.error("SEED FAILED:", e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
