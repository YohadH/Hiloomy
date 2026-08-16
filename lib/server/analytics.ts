import type { DailyMetric, DiscountUsage, Order, ProductPerformanceRow, RetentionSnapshot } from "@/lib/domain/types";

export interface DateRange {
  start: Date;
  end: Date;
}

export function getDefaultDateRange(now = new Date()): DateRange {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export function getPreviousDateRange(range: DateRange): DateRange {
  const diff = range.end.getTime() - range.start.getTime();
  const end = new Date(range.start.getTime() - 1);
  const start = new Date(end.getTime() - diff);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export function toDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toIsoDay(date: Date): string {
  // UTC components so the iso key matches the daily-trend-context-service
  // and works the same on Render (UTC) and local dev (Asia/Jerusalem).
  // The display label (`toDayLabel`) stays local — that's only for axis
  // text. The iso key is for joins with context data.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildDailyMetrics(
  orders: Order[],
  customerOrderHistory: Map<string, string[]>
): DailyMetric[] {
  // Track both the human-readable label and the ISO key per day so
  // downstream code (the enriched chart) can look up context by ISO date.
  const grouped = new Map<string, { isoDate: string; revenue: number; profit: number; returningOrders: number; orders: number; totalPrice: number; discounts: number; refunds: number }>();

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    const key = toDayLabel(orderDate);
    const iso = toIsoDay(orderDate);
    const current = grouped.get(key) ?? {
      isoDate: iso,
      revenue: 0,
      profit: 0,
      returningOrders: 0,
      orders: 0,
      totalPrice: 0,
      discounts: 0,
      refunds: 0
    };
    const estimatedCost = order.lineItems.reduce((total, item) => total + item.estimatedCost, 0);
    const revenue = order.totalPrice ?? order.lineItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
    const discounts = order.totalDiscounts ?? order.lineItems.reduce((total, item) => total + item.discountAmount, 0);
    const refunds = order.refundAmount;
    const profit = revenue - discounts - refunds - estimatedCost;
    const history = order.customerId ? customerOrderHistory.get(order.customerId) ?? [] : [];
    const isReturningOrder = history.indexOf(order.id) > 0;

    current.revenue += revenue;
    current.totalPrice += revenue;
    current.discounts += discounts;
    current.refunds += refunds;
    current.profit += profit;
    current.orders += 1;
    if (isReturningOrder) current.returningOrders += 1;

    grouped.set(key, current);
  }

  return Array.from(grouped.entries()).map(([date, value]) => ({
    date,
    isoDate: value.isoDate,
    revenue: value.revenue,
    estimatedProfit: value.profit,
    returningCustomerRate: value.orders ? (value.returningOrders / value.orders) * 100 : 0,
    averageOrderValue: value.orders ? value.totalPrice / value.orders : 0,
    discountRate: value.revenue ? (value.discounts / value.revenue) * 100 : 0,
    refundRate: value.revenue ? (value.refunds / value.revenue) * 100 : 0,
    orders: value.orders
  }));
}

export function buildRetentionSnapshot(
  orders: Order[],
  customerOrderHistory: Map<string, string[]>,
  // Lifetime order lookup (id -> Order). Needed so we can read the date
  // of a customer's SECOND lifetime order even when it falls OUTSIDE
  // the reporting window — otherwise the avg-days-to-second metric
  // collapses to "fast repeaters only" (see comment below).
  allOrdersById: Map<string, Order>
): RetentionSnapshot {
  const ordersInWindow = new Set<string>(orders.map((o) => o.id));
  const customersInPeriod = new Set<string>();
  let returningCustomers = 0;
  let totalDaysToSecondOrder = 0;
  let customersWithSecondOrder = 0;
  let firstTimeBuyersInWindow = 0;
  let firstTimeBuyersWhoCameBack = 0;

  for (const [customerId, history] of customerOrderHistory.entries()) {
    // Did this customer order at all during the window? (Used for the
    // headline customer-mix and lifetime repeat-rate.)
    const orderedInWindow = history.some((orderId) => ordersInWindow.has(orderId));
    if (!orderedInWindow) continue;
    customersInPeriod.add(customerId);
    if (history.length > 1) returningCustomers += 1;

    // ─── secondOrderRate denominator ──────────────────────────────
    // Of customers whose FIRST EVER order landed in the window, how
    // many went on to a 2nd order (ever). Different question than
    // avg-days-to-second below.
    if (ordersInWindow.has(history[0])) {
      firstTimeBuyersInWindow += 1;
      if (history.length >= 2) firstTimeBuyersWhoCameBack += 1;
    }

    // ─── avg-days-to-second-order ──────────────────────────────────
    // GATE by "this customer's 2nd lifetime order is in the window".
    // i.e. the people coming back RIGHT NOW — regardless of when
    // their first order was. This is the question a founder actually
    // wants ("how long does it take customers to come back?") and
    // produces the real cadence (~60 days for a perfume brand)
    // instead of selection-biasing to fast repeaters.
    //
    // The earlier attempt gated by "first order in window" which
    // looked unbiased on paper but in practice only counted customers
    // who came back FAST (since slower repeaters haven't reached
    // their 2nd order yet by "now"). That kept the perfume brand
    // reading ~5 days instead of the real ~60.
    if (history.length < 2) continue;
    if (!ordersInWindow.has(history[1])) continue;
    const first = allOrdersById.get(history[0]);
    const second = allOrdersById.get(history[1]);
    if (!first || !second) continue;
    totalDaysToSecondOrder +=
      (new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()) /
      (1000 * 60 * 60 * 24);
    customersWithSecondOrder += 1;
  }

  const totalCustomers = customersInPeriod.size;
  const newCustomers = Math.max(totalCustomers - returningCustomers, 0);

  return {
    newCustomers,
    returningCustomers,
    repeatPurchaseRate: totalCustomers ? (returningCustomers / totalCustomers) * 100 : 0,
    // secondOrderRate now matches its UI tooltip ("first-time buyers
    // who came back") — % of customers whose FIRST lifetime order
    // landed in the window who went on to make a 2nd lifetime order
    // (regardless of when that 2nd order happened).
    secondOrderRate: firstTimeBuyersInWindow
      ? (firstTimeBuyersWhoCameBack / firstTimeBuyersInWindow) * 100
      : 0,
    averageDaysToSecondOrder: customersWithSecondOrder ? totalDaysToSecondOrder / customersWithSecondOrder : 0
  };
}

export function buildDiscountUsage(orders: Order[]): DiscountUsage[] {
  const grouped = new Map<string, DiscountUsage>();

  for (const order of orders) {
    if (!order.discountCode) continue;
    const current = grouped.get(order.discountCode) ?? {
      code: order.discountCode,
      orderCount: 0,
      revenueInfluenced: 0,
      discountAmount: 0
    };
    current.orderCount += 1;
    current.revenueInfluenced += order.totalPrice ?? 0;
    current.discountAmount += order.totalDiscounts ?? order.lineItems.reduce((total, item) => total + item.discountAmount, 0);
    grouped.set(order.discountCode, current);
  }

  return Array.from(grouped.values()).sort((a, b) => b.discountAmount - a.discountAmount);
}

export function buildProductPerformance(
  orders: Order[],
  productLookup: Map<
    string,
    {
      title: string;
      collection: string;
      inventoryQuantity?: number | null;
      collections?: string[];
    }
  >
): ProductPerformanceRow[] {
  const grouped = new Map<string, ProductPerformanceRow>();

  for (const order of orders) {
    for (const lineItem of order.lineItems) {
      const productId = lineItem.productId;
      if (!productId) continue;
      const product = productLookup.get(productId);
      if (!product) continue;

      const lineRevenue = lineItem.unitPrice * lineItem.quantity;
      // Shopify's "Net items sold" = items sold − items returned. We track
      // refunds at the line item level (see mapOrderNode), so the math here
      // is exact instead of a pro-rated approximation.
      const netUnits = Math.max(0, lineItem.quantity - lineItem.refundedQuantity);
      const refundImpact = lineItem.refundedSubtotal;
      const current = grouped.get(productId) ?? {
        productId,
        productTitle: product.title,
        collection: product.collection,
        collections: product.collections ?? [],
        unitsSold: 0,
        revenue: 0,
        estimatedProfit: 0,
        discountImpact: 0,
        refundImpact: 0,
        inventoryQuantity: product.inventoryQuantity ?? null
      };

      current.unitsSold += netUnits;
      current.revenue += lineRevenue;
      current.discountImpact += lineItem.discountAmount;
      current.refundImpact += refundImpact;
      current.estimatedProfit += lineRevenue - lineItem.discountAmount - refundImpact - lineItem.estimatedCost;
      grouped.set(productId, current);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
}
