import { getDb } from "@/lib/server/db";
import { classifySalesChannel, SALES_CHANNEL_ORDER, type SalesChannel } from "@/lib/domain/sales-channel";

/**
 * Sales by channel — online store vs Shopify POS vs manual — for a window.
 *
 * Everything here comes from orders Shopify already synced (Order.sourceName).
 * Nothing is estimated: if a store has no POS, the POS bucket is simply 0 and
 * `hasPos` is false. Revenue is net line revenue (line subtotal − line
 * discount), the same per-line number the offline comparison uses.
 */

export interface ChannelTotals {
  channel: SalesChannel;
  orders: number;
  units: number;
  netSales: number;
  share: number; // of netSales, 0..1
  // Raw Shopify source names folded into this bucket, with their order counts.
  sources: Array<{ sourceName: string; orders: number }>;
}

export interface SalesByChannel {
  start: Date;
  end: Date;
  totalOrders: number;
  totalNetSales: number;
  channels: ChannelTotals[];
  hasPos: boolean;
  hasManual: boolean;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getSalesByChannel(storeId: string, range: { start: Date; end: Date }): Promise<SalesByChannel> {
  const db = getDb();
  const rows = (await db.$queryRaw`
    SELECT COALESCE(o."sourceName", '') AS source,
           COUNT(DISTINCT o.id)::int AS orders,
           COALESCE(SUM(li.quantity), 0)::int AS units,
           COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount"), 0)::float AS net
    FROM "Order" o
    LEFT JOIN "OrderLineItem" li ON li."orderId" = o.id
    WHERE o."storeId" = ${storeId}
      AND o."createdAt" >= ${range.start} AND o."createdAt" <= ${range.end}
      AND o."cancelledAt" IS NULL AND o."test" = false
    GROUP BY 1`) as Array<{ source: string; orders: number; units: number; net: number }>;

  const buckets = new Map<SalesChannel, ChannelTotals>();
  for (const c of SALES_CHANNEL_ORDER) buckets.set(c, { channel: c, orders: 0, units: 0, netSales: 0, share: 0, sources: [] });
  let totalOrders = 0;
  let totalNet = 0;
  for (const r of rows) {
    const channel = classifySalesChannel(r.source);
    const b = buckets.get(channel)!;
    b.orders += num(r.orders);
    b.units += num(r.units);
    b.netSales += num(r.net);
    b.sources.push({ sourceName: r.source || "(none)", orders: num(r.orders) });
    totalOrders += num(r.orders);
    totalNet += num(r.net);
  }
  const channels = SALES_CHANNEL_ORDER.map((c) => {
    const b = buckets.get(c)!;
    b.share = totalNet > 0 ? b.netSales / totalNet : 0;
    b.sources.sort((a, z) => z.orders - a.orders);
    return b;
  });
  return {
    start: range.start,
    end: range.end,
    totalOrders,
    totalNetSales: totalNet,
    channels,
    hasPos: (buckets.get("pos")?.orders ?? 0) > 0,
    hasManual: (buckets.get("manual")?.orders ?? 0) > 0
  };
}

export interface ProductChannelRow {
  productId: string | null;
  productTitle: string;
  onlineUnits: number;
  onlineSales: number;
  posUnits: number;
  posSales: number;
  totalSales: number;
  posShare: number; // 0..1 of totalSales
}

// Per-product online vs POS for the same window. Only meaningful when the
// store takes POS orders; callers should check `hasPos` first.
export async function getProductsByChannel(storeId: string, range: { start: Date; end: Date }, limit = 50): Promise<ProductChannelRow[]> {
  const db = getDb();
  const rows = (await db.$queryRaw`
    SELECT li."productId" AS product_id,
           MAX(li.title) AS title,
           COALESCE(o."sourceName", '') AS source,
           COALESCE(SUM(li.quantity), 0)::int AS units,
           COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount"), 0)::float AS net
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    WHERE li."storeId" = ${storeId}
      AND o."createdAt" >= ${range.start} AND o."createdAt" <= ${range.end}
      AND o."cancelledAt" IS NULL AND o."test" = false
    GROUP BY 1, 3`) as Array<{ product_id: string | null; title: string; source: string; units: number; net: number }>;

  const byProduct = new Map<string, ProductChannelRow>();
  for (const r of rows) {
    const channel = classifySalesChannel(r.source);
    if (channel !== "online" && channel !== "pos") continue;
    const key = r.product_id ?? `title:${r.title}`;
    const row =
      byProduct.get(key) ??
      ({ productId: r.product_id, productTitle: r.title, onlineUnits: 0, onlineSales: 0, posUnits: 0, posSales: 0, totalSales: 0, posShare: 0 } as ProductChannelRow);
    if (channel === "pos") {
      row.posUnits += num(r.units);
      row.posSales += num(r.net);
    } else {
      row.onlineUnits += num(r.units);
      row.onlineSales += num(r.net);
    }
    byProduct.set(key, row);
  }
  return [...byProduct.values()]
    .map((r) => ({ ...r, totalSales: r.onlineSales + r.posSales, posShare: r.onlineSales + r.posSales > 0 ? r.posSales / (r.onlineSales + r.posSales) : 0 }))
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, limit);
}
