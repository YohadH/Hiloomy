import type {
  Alert,
  CollectionPerformanceRow,
  DailyMetric,
  DiscountUsage,
  Order,
  Product,
  Store,
  Summary
} from "@/lib/domain/types";

const fallbackStoreName = process.env.SHOPIFY_STORE_NAME?.trim() || "Local Demo Workspace";
const fallbackStoreDomain = process.env.SHOPIFY_STORE_DOMAIN?.trim() || "demo.local";
const fallbackStoreCurrency = process.env.SHOPIFY_STORE_CURRENCY?.trim() || "USD";
const fallbackStoreTimezone = process.env.SHOPIFY_STORE_TIMEZONE?.trim() || "UTC";

export const store: Store = {
  id: "local-demo-store",
  name: fallbackStoreName,
  domain: fallbackStoreDomain,
  currency: fallbackStoreCurrency,
  connected: false,
  timezone: fallbackStoreTimezone,
  dateRangePreset: "30d",
  estimatedCostMode: "margin_profile"
};

export const products: Product[] = [
  { id: "p1", title: "Signature Recovery Hoodie", handle: "signature-recovery-hoodie", collection: "Best Sellers", price: 92, estimatedCost: 28, marginProfile: "premium" },
  { id: "p2", title: "Daily Electrolyte Pack", handle: "daily-electrolyte-pack", collection: "Repeat Drivers", price: 34, estimatedCost: 9, marginProfile: "core" },
  { id: "p3", title: "Performance Starter Bundle", handle: "performance-starter-bundle", collection: "Bundles", price: 128, estimatedCost: 46, marginProfile: "promo" },
  { id: "p4", title: "Recovery Shorts", handle: "recovery-shorts", collection: "Apparel", price: 68, estimatedCost: 22, marginProfile: "core" },
  { id: "p5", title: "Founder Capsule Tee", handle: "founder-capsule-tee", collection: "Apparel", price: 44, estimatedCost: 14, marginProfile: "core" },
  { id: "p6", title: "Night Routine Kit", handle: "night-routine-kit", collection: "Bundles", price: 146, estimatedCost: 58, marginProfile: "premium" }
];

export const customers = [
  { id: "c1", name: "Avery Cole", email: "avery@example.com", firstOrderDate: "2026-02-08", totalOrders: 2, lifetimeValue: 126, isReturning: true },
  { id: "c2", name: "Jordan Wright", email: "jordan@example.com", firstOrderDate: "2026-01-18", totalOrders: 3, lifetimeValue: 274, isReturning: true },
  { id: "c3", name: "Taylor James", email: "taylor@example.com", firstOrderDate: "2026-03-02", totalOrders: 1, lifetimeValue: 92, isReturning: false },
  { id: "c4", name: "Morgan Lee", email: "morgan@example.com", firstOrderDate: "2026-02-21", totalOrders: 2, lifetimeValue: 162, isReturning: true },
  { id: "c5", name: "Riley Scott", email: "riley@example.com", firstOrderDate: "2026-03-10", totalOrders: 1, lifetimeValue: 44, isReturning: false },
  { id: "c6", name: "Cameron Reed", email: "cameron@example.com", firstOrderDate: "2026-01-09", totalOrders: 4, lifetimeValue: 438, isReturning: true }
];

export const orders: Order[] = [
  {
    id: "o1",
    customerId: "c1",
    createdAt: "2026-03-01",
    orderNumber: "#4810",
    isRefunded: false,
    refundAmount: 0,
    discountCode: "SPRING10",
    lineItems: [{ productId: "p1", quantity: 1, unitPrice: 92, discountAmount: 9, estimatedCost: 28, refundedQuantity: 0, refundedSubtotal: 0 }]
  },
  {
    id: "o2",
    customerId: "c2",
    createdAt: "2026-03-03",
    orderNumber: "#4818",
    isRefunded: false,
    refundAmount: 0,
    discountCode: "BUNDLE15",
    lineItems: [{ productId: "p3", quantity: 1, unitPrice: 128, discountAmount: 19, estimatedCost: 46, refundedQuantity: 0, refundedSubtotal: 0 }]
  },
  {
    id: "o3",
    customerId: "c3",
    createdAt: "2026-03-05",
    orderNumber: "#4824",
    isRefunded: false,
    refundAmount: 0,
    lineItems: [
      { productId: "p1", quantity: 1, unitPrice: 92, discountAmount: 0, estimatedCost: 28, refundedQuantity: 0, refundedSubtotal: 0 },
      { productId: "p2", quantity: 1, unitPrice: 34, discountAmount: 0, estimatedCost: 9, refundedQuantity: 0, refundedSubtotal: 0 }
    ]
  },
  {
    id: "o4",
    customerId: "c4",
    createdAt: "2026-03-07",
    orderNumber: "#4829",
    isRefunded: true,
    refundAmount: 34,
    discountCode: "WELCOME10",
    lineItems: [{ productId: "p2", quantity: 2, unitPrice: 34, discountAmount: 7, estimatedCost: 18, refundedQuantity: 2, refundedSubtotal: 61 }]
  },
  {
    id: "o5",
    customerId: "c5",
    createdAt: "2026-03-12",
    orderNumber: "#4836",
    isRefunded: false,
    refundAmount: 0,
    lineItems: [{ productId: "p5", quantity: 1, unitPrice: 44, discountAmount: 0, estimatedCost: 14, refundedQuantity: 0, refundedSubtotal: 0 }]
  },
  {
    id: "o6",
    customerId: "c6",
    createdAt: "2026-03-13",
    orderNumber: "#4839",
    isRefunded: false,
    refundAmount: 0,
    discountCode: "VIP20",
    lineItems: [
      { productId: "p6", quantity: 1, unitPrice: 146, discountAmount: 29, estimatedCost: 58, refundedQuantity: 0, refundedSubtotal: 0 },
      { productId: "p2", quantity: 1, unitPrice: 34, discountAmount: 0, estimatedCost: 9, refundedQuantity: 0, refundedSubtotal: 0 }
    ]
  },
  {
    id: "o7",
    customerId: "c1",
    createdAt: "2026-03-15",
    orderNumber: "#4844",
    isRefunded: false,
    refundAmount: 0,
    lineItems: [{ productId: "p2", quantity: 2, unitPrice: 34, discountAmount: 0, estimatedCost: 18, refundedQuantity: 0, refundedSubtotal: 0 }]
  },
  {
    id: "o8",
    customerId: "c2",
    createdAt: "2026-03-17",
    orderNumber: "#4848",
    isRefunded: false,
    refundAmount: 0,
    lineItems: [
      { productId: "p4", quantity: 1, unitPrice: 68, discountAmount: 0, estimatedCost: 22, refundedQuantity: 0, refundedSubtotal: 0 },
      { productId: "p2", quantity: 1, unitPrice: 34, discountAmount: 0, estimatedCost: 9, refundedQuantity: 0, refundedSubtotal: 0 }
    ]
  },
  {
    id: "o9",
    customerId: "c4",
    createdAt: "2026-03-21",
    orderNumber: "#4859",
    isRefunded: false,
    refundAmount: 0,
    discountCode: "SPRING10",
    lineItems: [
      { productId: "p1", quantity: 1, unitPrice: 92, discountAmount: 9, estimatedCost: 28, refundedQuantity: 0, refundedSubtotal: 0 },
      { productId: "p5", quantity: 1, unitPrice: 44, discountAmount: 4, estimatedCost: 14, refundedQuantity: 0, refundedSubtotal: 0 }
    ]
  }
];

export const dailyMetrics: DailyMetric[] = [
  { date: "Mar 1", revenue: 9800, estimatedProfit: 4180, returningCustomerRate: 31, averageOrderValue: 82, discountRate: 6.1, refundRate: 1.2, orders: 119 },
  { date: "Mar 5", revenue: 11100, estimatedProfit: 4610, returningCustomerRate: 33, averageOrderValue: 84, discountRate: 6.9, refundRate: 1.8, orders: 132 },
  { date: "Mar 9", revenue: 10750, estimatedProfit: 4420, returningCustomerRate: 32.5, averageOrderValue: 81, discountRate: 7.4, refundRate: 2.4, orders: 128 },
  { date: "Mar 13", revenue: 12640, estimatedProfit: 5140, returningCustomerRate: 36.2, averageOrderValue: 87, discountRate: 7.8, refundRate: 2.1, orders: 145 },
  { date: "Mar 17", revenue: 12120, estimatedProfit: 4960, returningCustomerRate: 35.7, averageOrderValue: 86, discountRate: 8.3, refundRate: 2.5, orders: 141 },
  { date: "Mar 21", revenue: 11890, estimatedProfit: 4745, returningCustomerRate: 34.4, averageOrderValue: 83, discountRate: 8.8, refundRate: 3.1, orders: 143 },
  { date: "Mar 23", revenue: 13480, estimatedProfit: 5460, returningCustomerRate: 37.8, averageOrderValue: 89, discountRate: 8.2, refundRate: 2.7, orders: 152 }
];

export const previousPeriodMetrics: DailyMetric[] = [
  { date: "Feb 1", revenue: 9100, estimatedProfit: 4010, returningCustomerRate: 35.2, averageOrderValue: 80, discountRate: 5.8, refundRate: 1.4, orders: 114 },
  { date: "Feb 5", revenue: 10180, estimatedProfit: 4410, returningCustomerRate: 34.9, averageOrderValue: 81, discountRate: 6.0, refundRate: 1.5, orders: 126 },
  { date: "Feb 9", revenue: 9980, estimatedProfit: 4300, returningCustomerRate: 34.1, averageOrderValue: 80, discountRate: 6.4, refundRate: 1.7, orders: 125 },
  { date: "Feb 13", revenue: 11020, estimatedProfit: 4720, returningCustomerRate: 33.8, averageOrderValue: 82, discountRate: 6.7, refundRate: 1.8, orders: 134 },
  { date: "Feb 17", revenue: 11240, estimatedProfit: 4810, returningCustomerRate: 33.4, averageOrderValue: 83, discountRate: 7.1, refundRate: 1.9, orders: 135 },
  { date: "Feb 21", revenue: 10860, estimatedProfit: 4590, returningCustomerRate: 32.8, averageOrderValue: 81, discountRate: 7.3, refundRate: 2.1, orders: 132 },
  { date: "Feb 23", revenue: 11420, estimatedProfit: 4870, returningCustomerRate: 33.1, averageOrderValue: 82, discountRate: 7.4, refundRate: 2.0, orders: 138 }
];

export const discountUsage: DiscountUsage[] = [
  { code: "SPRING10", orderCount: 142, revenueInfluenced: 11280, discountAmount: 1140 },
  { code: "BUNDLE15", orderCount: 68, revenueInfluenced: 8720, discountAmount: 1310 },
  { code: "VIP20", orderCount: 29, revenueInfluenced: 4210, discountAmount: 820 },
  { code: "WELCOME10", orderCount: 51, revenueInfluenced: 3660, discountAmount: 390 }
];

export const collectionPerformance: CollectionPerformanceRow[] = [
  { collection: "Bundles", revenue: 18240, estimatedProfit: 6940 },
  { collection: "Best Sellers", revenue: 16480, estimatedProfit: 8180 },
  { collection: "Repeat Drivers", revenue: 11940, estimatedProfit: 7280 },
  { collection: "Apparel", revenue: 9860, estimatedProfit: 5030 }
];

export const alerts: Alert[] = [
  {
    id: "a1",
    severity: "high",
    title: "Refund rate climbed above recent baseline",
    explanation: "Refund rate reached 3.1% in the latest interval, driven mostly by two SKU-level issues in accessory orders.",
    suggestedAction: "Review refund reasons on Recovery Shorts and tighten post-purchase expectation setting this week.",
    periodLabel: "Last 7 days",
    timestamp: "2026-03-23T09:00:00Z"
  },
  {
    id: "a2",
    severity: "medium",
    title: "Discount usage is rising faster than profit",
    explanation: "Discount mix expanded 0.8 points period over period while profit only improved modestly.",
    suggestedAction: "Cap bundle discount exposure on lower-margin combinations and watch net contribution.",
    periodLabel: "Month to date",
    timestamp: "2026-03-22T16:15:00Z"
  },
  {
    id: "a3",
    severity: "medium",
    title: "Returning customer rate dipped mid-month before recovering",
    explanation: "Returning customer rate recovered to 37.8%, but the mid-period dip suggests second-order demand is uneven.",
    suggestedAction: "Launch a focused second-order email flow around Daily Electrolyte Pack within 10 days of first purchase.",
    periodLabel: "Last 30 days",
    timestamp: "2026-03-21T12:30:00Z"
  },
  {
    id: "a4",
    severity: "low",
    title: "Signature Recovery Hoodie is accelerating",
    explanation: "The hero SKU contributed 22% of revenue and kept contribution margin healthy despite promo activity.",
    suggestedAction: "Protect inventory depth and test a full-price merchandising slot on paid landing pages.",
    periodLabel: "Last 14 days",
    timestamp: "2026-03-20T08:15:00Z"
  }
];

export const summaries: Summary[] = [
  {
    id: "s1",
    headline: "Revenue expanded on stronger hero-SKU demand, but discount pressure is starting to outpace margin discipline.",
    generatedAt: "2026-03-23T08:00:00Z",
    sections: [
      { title: "Wins", items: ["Estimated profit improved with strong contribution from Signature Recovery Hoodie and Daily Electrolyte Pack.", "Returning customer rate closed the week at 37.8%, a positive signal after the mid-period softness."] },
      { title: "Risks", items: ["Discount rate remains elevated, especially in bundle-led promotions where margin compression is more pronounced.", "Refund rate is above prior-period trend and warrants SKU-level review."] },
      { title: "Key changes from previous period", items: ["Revenue is up 11.5% period over period while estimated profit is up 9.1%, indicating some tradeoff from discounting.", "AOV improved to $89 on the latest reading, supported by higher bundle mix."] },
      { title: "Product insights", items: ["Signature Recovery Hoodie remains the best mix of volume and contribution margin.", "Founder Capsule Tee conversion is steady, but its contribution is diluted when paired with promo-heavy orders."] },
      { title: "Discount and promotion insights", items: ["SPRING10 remains efficient on hero products, while BUNDLE15 appears too generous on lower-margin bundle combinations."] },
      { title: "Retention insights", items: ["Daily Electrolyte Pack is the strongest second-order product and should anchor retention messaging."] },
      { title: "Recommended next actions", items: ["Tighten discount rules on low-margin bundle combinations before the next promotional push.", "Prioritize a second-order retention sequence featuring Daily Electrolyte Pack inside the first 14 days."] }
    ]
  }
];



