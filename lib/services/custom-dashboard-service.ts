// "My dashboard" — a board the merchant curates: the products THEY care
// about (hero SKUs, a new launch, a seasonal line), each with stock by the
// selected locations, sales velocity, days of cover, last sale, and an
// optional per-product threshold. Config lives in SystemConfig (no
// migration): `custom_dashboard:<storeId>`.

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { getInventoryByLocationForProducts } from "@/lib/services/inventory-locations-service";

export interface WatchedProductConfig {
  productId: string;
  // Alert when stock falls below this many units. null = no threshold.
  threshold: number | null;
  addedAt: string;
}

export interface CustomDashboardConfig {
  products: WatchedProductConfig[];
}

export interface WatchedVariant {
  variantId: string;
  title: string;
  sku: string | null;
  // Stock by the selected locations (or Shopify total); null = not tracked.
  inventoryQuantity: number | null;
  byLocation: Array<{ locationId: string; locationName: string; available: number }>;
}

export interface WatchedProduct {
  productId: string;
  title: string;
  vendor: string | null;
  threshold: number | null;
  addedAt: string;
  // Stock by the store's selected locations (or Shopify total); null = not tracked.
  inventory: number | null;
  byLocation: Array<{ locationId: string; locationName: string; available: number }>;
  variants: WatchedVariant[];
  units14: number;
  revenue14: number;
  dailyVelocity: number;
  daysCover: number | null;
  lastSaleAt: string | null;
  status: "ok" | "below_threshold" | "low_cover" | "not_tracked";
}

const KEY = (storeId: string) => `custom_dashboard:${storeId}`;
const DAY_MS = 86_400_000;
const MAX_PRODUCTS = 40;

export async function getCustomDashboardConfig(storeId: string): Promise<CustomDashboardConfig> {
  const db = getDb() as any;
  const row = await db.systemConfig.findUnique({ where: { key: KEY(storeId) }, select: { value: true } }).catch(() => null);
  if (!row?.value) return { products: [] };
  try {
    const parsed = JSON.parse(row.value) as Partial<CustomDashboardConfig>;
    const products = Array.isArray(parsed.products)
      ? parsed.products.filter((p): p is WatchedProductConfig => typeof p?.productId === "string")
      : [];
    return { products };
  } catch {
    return { products: [] };
  }
}

async function saveConfig(storeId: string, config: CustomDashboardConfig): Promise<void> {
  const db = getDb() as any;
  const value = JSON.stringify(config);
  await db.systemConfig.upsert({ where: { key: KEY(storeId) }, update: { value }, create: { key: KEY(storeId), value } });
}

export async function addWatchedProduct(storeId: string, productId: string): Promise<CustomDashboardConfig> {
  const db = getDb();
  const product = await db.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
  if (!product) throw new AppError("Product not found in this store.", 404);
  const config = await getCustomDashboardConfig(storeId);
  if (config.products.some((p) => p.productId === productId)) return config;
  if (config.products.length >= MAX_PRODUCTS) throw new AppError(`Up to ${MAX_PRODUCTS} products can be followed.`, 400);
  config.products.push({ productId, threshold: null, addedAt: new Date().toISOString() });
  await saveConfig(storeId, config);
  return config;
}

export async function removeWatchedProduct(storeId: string, productId: string): Promise<CustomDashboardConfig> {
  const config = await getCustomDashboardConfig(storeId);
  config.products = config.products.filter((p) => p.productId !== productId);
  await saveConfig(storeId, config);
  return config;
}

export async function setWatchedProductThreshold(storeId: string, productId: string, threshold: number | null): Promise<CustomDashboardConfig> {
  const config = await getCustomDashboardConfig(storeId);
  const entry = config.products.find((p) => p.productId === productId);
  if (!entry) throw new AppError("Product is not on the dashboard.", 404);
  entry.threshold = threshold === null ? null : Math.max(0, Math.round(threshold));
  await saveConfig(storeId, config);
  return config;
}

export async function buildCustomDashboard(storeId: string): Promise<{ products: WatchedProduct[]; updatedAt: string }> {
  const config = await getCustomDashboardConfig(storeId);
  const ids = config.products.map((p) => p.productId);
  const now = new Date();
  if (ids.length === 0) return { products: [], updatedAt: now.toISOString() };
  const db = getDb() as any;
  const d14 = new Date(now.getTime() - 14 * DAY_MS);

  const [rows, byLocation] = await Promise.all([
    db.$queryRaw`
      SELECT
        p.id AS product_id,
        p.title AS title,
        p.vendor AS vendor,
        (SELECT CASE WHEN COUNT(v."inventoryQuantity") = 0 THEN NULL ELSE SUM(v."inventoryQuantity")::int END
           FROM "ProductVariant" v WHERE v."productId" = p.id) AS inventory,
        COALESCE((SELECT SUM(li.quantity) FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
           WHERE li."productId" = p.id AND o."createdAt" >= ${d14} AND o."cancelledAt" IS NULL AND o.test = false), 0)::int AS units14,
        COALESCE((SELECT SUM(li."lineSubtotal" - li."lineDiscountAmount" - li."refundedSubtotal") FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
           WHERE li."productId" = p.id AND o."createdAt" >= ${d14} AND o."cancelledAt" IS NULL AND o.test = false), 0)::float AS revenue14,
        (SELECT MAX(o."createdAt") FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
           WHERE li."productId" = p.id AND o."cancelledAt" IS NULL AND o.test = false) AS last_sale_at
      FROM "Product" p
      WHERE p."storeId" = ${storeId} AND p.id IN (${Prisma.join(ids)})
    ` as Promise<Array<{ product_id: string; title: string; vendor: string | null; inventory: number | null; units14: number; revenue14: number; last_sale_at: Date | null }>>,
    getInventoryByLocationForProducts(storeId, ids)
  ]);

  const byId = new Map(rows.map((r) => [r.product_id, r]));

  // Variants + their per-location levels, grouped per product.
  const variantRows = (await db.productVariant
    .findMany({
      where: { storeId, productId: { in: ids } },
      select: { id: true, productId: true, shopifyVariantId: true, title: true, sku: true, inventoryQuantity: true },
      orderBy: { title: "asc" }
    })
    .catch(() => [])) as Array<{ id: string; productId: string; shopifyVariantId: string; title: string; sku: string | null; inventoryQuantity: number | null }>;
  const levelRows = variantRows.length
    ? ((await db.variantInventoryLevel
        .findMany({
          where: { storeId, shopifyVariantId: { in: variantRows.map((v) => v.shopifyVariantId) } },
          select: { shopifyVariantId: true, shopifyLocationId: true, locationName: true, available: true },
          orderBy: { locationName: "asc" }
        })
        .catch(() => [])) as Array<{ shopifyVariantId: string; shopifyLocationId: string; locationName: string; available: number }>)
    : [];
  const levelsByVariant = new Map<string, WatchedVariant["byLocation"]>();
  for (const l of levelRows) {
    const list = levelsByVariant.get(l.shopifyVariantId) ?? [];
    list.push({ locationId: l.shopifyLocationId, locationName: l.locationName, available: Number(l.available) });
    levelsByVariant.set(l.shopifyVariantId, list);
  }
  const variantsByProduct = new Map<string, WatchedVariant[]>();
  for (const v of variantRows) {
    const list = variantsByProduct.get(v.productId) ?? [];
    list.push({
      variantId: v.id,
      title: v.title,
      sku: v.sku,
      inventoryQuantity: v.inventoryQuantity === null ? null : Number(v.inventoryQuantity),
      byLocation: levelsByVariant.get(v.shopifyVariantId) ?? []
    });
    variantsByProduct.set(v.productId, list);
  }
  const products: WatchedProduct[] = config.products
    .map((cfg): WatchedProduct | null => {
      const r = byId.get(cfg.productId);
      if (!r) return null;
      const inventory = r.inventory === null ? null : Number(r.inventory);
      const units14 = Number(r.units14);
      const dailyVelocity = units14 / 14;
      const daysCover = inventory === null ? null : dailyVelocity > 0 ? inventory / dailyVelocity : null;
      const status: WatchedProduct["status"] =
        inventory === null
          ? "not_tracked"
          : cfg.threshold !== null && inventory < cfg.threshold
            ? "below_threshold"
            : daysCover !== null && daysCover <= 14
              ? "low_cover"
              : "ok";
      return {
        productId: cfg.productId,
        title: r.title,
        vendor: r.vendor,
        threshold: cfg.threshold,
        addedAt: cfg.addedAt,
        inventory,
        byLocation: byLocation.get(cfg.productId) ?? [],
        variants: variantsByProduct.get(cfg.productId) ?? [],
        units14,
        revenue14: Number(r.revenue14),
        dailyVelocity,
        daysCover,
        lastSaleAt: r.last_sale_at ? new Date(r.last_sale_at).toISOString() : null,
        status
      };
    })
    .filter((p): p is WatchedProduct => p !== null);

  return { products, updatedAt: now.toISOString() };
}
