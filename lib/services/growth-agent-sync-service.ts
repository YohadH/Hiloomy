import { getAnalyticsRepository } from "@/lib/repositories";
import type { Order, Product, ProductStockRow } from "@/lib/domain/types";
import { ensureGrowthAgentDefaults, createGrowthMetricSnapshot, getGrowthAgentStoreContext, getGrowthPlatformConnections, saveGrowthPlatformConnection } from "@/lib/services/growth-agent-service";
import { getAttributionCoverageSignals } from "@/lib/services/affiliate-link-tracking-service";

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function estimateSessions(orders: number, revenue: number) {
  return Math.max(orders * 42 + Math.round(revenue / 12), 120);
}

function fallbackInventory(product: Product) {
  return Math.max(4, Math.round((product.price / Math.max(product.estimatedCost, 1)) * 3));
}

function buildTopProductsSnapshot(orders: Order[], products: Product[], stockRows: ProductStockRow[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const stockByProductId = new Map(stockRows.map((row) => [row.productId, row.inventoryQuantity]));
  const productPerformance = new Map<string, number>();

  for (const order of orders) {
    for (const item of order.lineItems) {
      if (!item.productId || !productsById.has(item.productId)) continue;
      const revenue = item.unitPrice * item.quantity;
      productPerformance.set(item.productId, (productPerformance.get(item.productId) ?? 0) + revenue);
    }
  }

  const rankedProducts = productPerformance.size
    ? Array.from(productPerformance.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([productId]) => productsById.get(productId))
        .filter((product): product is Product => Boolean(product))
    : products;

  return rankedProducts.slice(0, 5).map((product) => ({
    productId: product.id,
    title: product.title,
    estimatedInventory: stockByProductId.get(product.id) ?? fallbackInventory(product),
    collection: product.collection
  }));
}

export async function runGrowthAgentManualSync(storeId?: string) {
  const { db, store } = await getGrowthAgentStoreContext(storeId);
  await ensureGrowthAgentDefaults(store.id);
  const repository = await getAnalyticsRepository();
  const [dailyMetrics, orders, products, stockRows, connections, attributionSignals] = await Promise.all([
    repository.getDailyMetrics(store.id),
    repository.getOrders(store.id),
    repository.getProducts(store.id),
    repository.getProductStock(store.id),
    getGrowthPlatformConnections(store.id),
    getAttributionCoverageSignals(store.id)
  ]);

  const currentMetric = dailyMetrics[dailyMetrics.length - 1] ?? dailyMetrics[0];
  const yesterdayMetric = dailyMetrics[dailyMetrics.length - 2] ?? currentMetric;
  const priorSeven = dailyMetrics.slice(-8, -1);
  // Per-day metrics like revenue/orders/sessions can be averaged across
  // days (they have a meaningful "per-day" interpretation). Rates can't —
  // average-of-daily-rates skews toward off-days. Compute AOV and
  // returningCustomerRate as sum(numerator) / sum(denominator) instead.
  const priorTotalOrders = priorSeven.reduce((sum, m) => sum + m.orders, 0);
  const priorTotalRevenue = priorSeven.reduce((sum, m) => sum + m.revenue, 0);
  // Daily metrics only carry the rate, not the raw returning-orders
  // count — reconstruct it from rate × orders for the weighted sum.
  const priorReturningOrders = priorSeven.reduce(
    (sum, m) => sum + Math.round(m.orders * (m.returningCustomerRate / 100)),
    0
  );
  const last7Days = {
    revenue: avg(priorSeven.map((metric) => metric.revenue)),
    orders: avg(priorSeven.map((metric) => metric.orders)),
    averageOrderValue: priorTotalOrders ? priorTotalRevenue / priorTotalOrders : 0,
    returningCustomerRate: priorTotalOrders ? (priorReturningOrders / priorTotalOrders) * 100 : 0,
    conversionRate: avg(priorSeven.map((metric) => metric.orders / Math.max(estimateSessions(metric.orders, metric.revenue), 1))),
    sessions: avg(priorSeven.map((metric) => estimateSessions(metric.orders, metric.revenue)))
  };
  const sameWeekdayMetric = dailyMetrics[dailyMetrics.length - 8] ?? yesterdayMetric;

  const recentOrders = orders.slice(-20);
  const orderSourceCounts = recentOrders.reduce<Record<string, { orders: number; revenue: number }>>((acc, order) => {
    const key = order.discountCode ? "Discount / Affiliate" : "Shopify";
    if (!acc[key]) acc[key] = { orders: 0, revenue: 0 };
    acc[key].orders += 1;
    acc[key].revenue += Number(order.totalPrice ?? order.lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
    return acc;
  }, {});

  const trafficByChannel = Object.keys(orderSourceCounts).length
    ? Object.entries(orderSourceCounts).map(([channel, values]) => ({ channel, sessions: estimateSessions(values.orders, values.revenue), revenue: values.revenue, delta: channel.includes("Affiliate") ? 12 : -8, confidence: channel === "Shopify" ? 0.58 : 0.74, status: channel.includes("Affiliate") ? "normal" : "warning" }))
    : [];

  const topProducts = buildTopProductsSnapshot(orders, products, stockRows);
  const connectedSignals = connections.filter((item) => item.status === "connected").length;
  const connectorConfidence = connectedSignals >= 2 ? 0.86 : connectedSignals === 1 ? 0.68 : 0.52;
  const trackingConfidence = Math.min(0.97, Math.max(0.35, connectorConfidence * 0.65 + attributionSignals.overallConfidence * 0.35));
  const currentConversionRate = currentMetric ? currentMetric.orders / Math.max(estimateSessions(currentMetric.orders, currentMetric.revenue), 1) : 0;
  const yesterdayConversionRate = yesterdayMetric ? yesterdayMetric.orders / Math.max(estimateSessions(yesterdayMetric.orders, yesterdayMetric.revenue), 1) : currentConversionRate;
  const sameWeekdayConversionRate = sameWeekdayMetric ? sameWeekdayMetric.orders / Math.max(estimateSessions(sameWeekdayMetric.orders, sameWeekdayMetric.revenue), 1) : currentConversionRate;

  const snapshotMetrics = {
    current: {
      sessions: currentMetric ? estimateSessions(currentMetric.orders, currentMetric.revenue) : 0,
      orders: currentMetric?.orders ?? 0,
      conversionRate: currentConversionRate,
      averageOrderValue: currentMetric?.averageOrderValue ?? 0,
      revenue: currentMetric?.revenue ?? 0,
      returningCustomers: currentMetric?.returningCustomerRate ?? 0,
      trafficByChannel,
      trackingConfidence,
      attributionCoverage: attributionSignals,
      topProducts,
      inventoryHighlights: topProducts.filter((item) => item.estimatedInventory <= 8)
    },
    yesterday: {
      sessions: yesterdayMetric ? estimateSessions(yesterdayMetric.orders, yesterdayMetric.revenue) : 0,
      orders: yesterdayMetric?.orders ?? 0,
      conversionRate: yesterdayConversionRate,
      averageOrderValue: yesterdayMetric?.averageOrderValue ?? 0,
      revenue: yesterdayMetric?.revenue ?? 0,
      returningCustomers: yesterdayMetric?.returningCustomerRate ?? 0
    },
    last7Days,
    sameWeekdayLastWeek: {
      sessions: sameWeekdayMetric ? estimateSessions(sameWeekdayMetric.orders, sameWeekdayMetric.revenue) : 0,
      orders: sameWeekdayMetric?.orders ?? 0,
      conversionRate: sameWeekdayConversionRate,
      averageOrderValue: sameWeekdayMetric?.averageOrderValue ?? 0,
      revenue: sameWeekdayMetric?.revenue ?? 0,
      returningCustomers: sameWeekdayMetric?.returningCustomerRate ?? 0
    }
  };

  await createGrowthMetricSnapshot({ source: "shopify_monitoring_sync", bucketedAt: new Date().toISOString(), metrics: snapshotMetrics, confidenceScore: trackingConfidence }, store.id);

  if (db?.platformConnection) {
    await saveGrowthPlatformConnection({ platform: "shopify", status: store.connected ? "connected" : "not_connected", healthMessage: store.connected ? "Shopify sync is healthy and metrics were refreshed." : "Shopify is not connected yet.", lastSyncAt: new Date().toISOString(), config: { source: "growth_agent_manual_sync" } }, store.id);
    const instagramConnection = db?.instagramConnection ? await db.instagramConnection.findUnique({ where: { storeId: store.id } }).catch(() => null) : null;
    if (instagramConnection) {
      await saveGrowthPlatformConnection({ platform: "instagram", status: "connected", healthMessage: "Instagram creator signals are available.", lastSyncAt: instagramConnection.lastSyncAt?.toISOString() ?? new Date().toISOString(), tokenLastFour: instagramConnection.tokenLastFour ?? null, config: { username: instagramConnection.username ?? null } }, store.id);
    }
  }

  return {
    ok: true,
    bucketedAt: new Date().toISOString(),
    trackingConfidence,
    sourceCount: connectedSignals,
    attributionCoverage: attributionSignals,
    topInventoryRisks: topProducts.filter((item) => item.estimatedInventory <= 8).length
  };
}

export async function runGrowthAgentManualHealthCheck(storeId?: string) {
  const { store } = await getGrowthAgentStoreContext(storeId);
  const connections = await getGrowthPlatformConnections(store.id);
  const healthy = connections.filter((item) => item.status === "connected").length;
  return {
    ok: true,
    storeId: store.id,
    healthyConnections: healthy,
    degradedConnections: connections.filter((item) => item.status === "degraded").length,
    stubConnections: connections.filter((item) => item.status === "stub" || item.status === "not_connected").length,
    checkedAt: new Date().toISOString()
  };
}
