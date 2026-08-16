export type DateRangePreset = "7d" | "30d" | "90d";
export type Severity = "low" | "medium" | "high";
export type KpiFormat = "currency" | "percent" | "number";
export type SyncMode = "initial" | "incremental";
export type SyncStatus = "idle" | "running" | "success" | "error";

export interface Store {
  id: string;
  name: string;
  domain: string;
  currency: string;
  connected: boolean;
  timezone: string;
  planName?: string;
  dateRangePreset: DateRangePreset;
  estimatedCostMode: "margin_profile" | "fixed_cost_map";
  defaultCostRatio?: number;
  // Synthetic demo store — renders the "Demo data" badge in the chrome.
  isDemo?: boolean;
}

export interface ShopifyConnectionSummary {
  shopDomain: string;
  connected: boolean;
  apiVersion?: string;
  tokenLastFour?: string;
  syncStatus?: SyncStatus;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
}

export interface SyncRunSummary {
  id: string;
  mode: SyncMode;
  status: SyncStatus;
  startedAt: string;
  completedAt?: string | null;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errorMessage?: string | null;
}

export interface Product {
  id: string;
  title: string;
  handle: string;
  collection: string;
  vendor?: string;
  productType?: string;
  price: number;
  estimatedCost: number;
  costOverrideAmount?: number | null;
  marginProfile: "premium" | "core" | "promo" | string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string | null;
  firstOrderDate?: string | null;
  totalOrders: number;
  lifetimeValue: number;
  isReturning: boolean;
}

export interface OrderLineItem {
  id?: string;
  productId?: string | null;
  variantId?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  estimatedCost: number;
  refundedQuantity: number;
  refundedSubtotal: number;
}

export interface Order {
  id: string;
  customerId?: string | null;
  createdAt: string;
  orderNumber: string;
  isRefunded: boolean;
  refundAmount: number;
  discountCode?: string;
  totalPrice?: number;
  totalDiscounts?: number;
  lineItems: OrderLineItem[];
}

export interface DiscountUsage {
  code: string;
  orderCount: number;
  revenueInfluenced: number;
  discountAmount: number;
}

export interface DailyMetric {
  date: string;
  // ISO YYYY-MM-DD form of `date`. Used as a join key when overlaying
  // per-day context (top products, campaigns, posts, discounts) onto
  // the revenue chart. Optional for back-compat with existing builders.
  isoDate?: string;
  revenue: number;
  estimatedProfit: number;
  returningCustomerRate: number;
  averageOrderValue: number;
  discountRate: number;
  refundRate: number;
  orders: number;
}

export interface KPI {
  label: string;
  value: number;
  /** Period-over-period change. Undefined when no comparison is selected. */
  change?: number;
  format: KpiFormat;
}

export interface InsightItem {
  title: string;
  detail: string;
  emphasis?: string;
}

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  explanation: string;
  suggestedAction: string;
  periodLabel: string;
  timestamp: string;
}

export interface SummarySection {
  title: string;
  items: string[];
}

export interface Summary {
  id: string;
  headline: string;
  generatedAt: string;
  sections: SummarySection[];
}

export interface ProductPerformanceRow {
  productId: string;
  productTitle: string;
  /** Single canonical collection used for sorting/grouping (kept for backward compat). */
  collection: string;
  /** Every Shopify collection (smart + manual) the product belongs to. */
  collections: string[];
  unitsSold: number;
  revenue: number;
  estimatedProfit: number;
  discountImpact: number;
  refundImpact: number;
  /** Sum of inventoryQuantity across all variants. null = unknown / not tracked. */
  inventoryQuantity: number | null;
}

export type StockFlag = "critical" | "red" | "yellow" | "green" | "unknown";

export interface ProductStockRow {
  productId: string;
  productTitle: string;
  collection: string;
  /** Every Shopify collection the product belongs to. */
  collections: string[];
  vendor: string | null;
  inventoryQuantity: number | null;
  variantCount: number;
  flag: StockFlag;
  /** Calendar days since the product last appeared in any order. null = never sold or data unavailable. */
  daysSinceLastSale: number | null;
}

export interface CollectionPerformanceRow {
  collection: string;
  revenue: number;
  estimatedProfit: number;
}

export interface RetentionSnapshot {
  newCustomers: number;
  returningCustomers: number;
  repeatPurchaseRate: number;
  secondOrderRate: number;
  averageDaysToSecondOrder: number;
}

export interface ComparisonMetric {
  label: string;
  current: number;
  previous: number;
  change: number;
}

export interface OverviewPayload {
  store: Store;
  kpis: KPI[];
  dailyMetrics: DailyMetric[];
  insights: InsightItem[];
  actionPanel: SummarySection[];
  productPerformance: ProductPerformanceRow[];
  collectionPerformance: CollectionPerformanceRow[];
  discounts: DiscountUsage[];
  alerts: Alert[];
  comparisonMetrics: ComparisonMetric[];
  comparisonEnabled: boolean;
}

export interface ProfitAnalyticsPayload {
  productPerformance: ProductPerformanceRow[];
  collectionPerformance: CollectionPerformanceRow[];
  discountUsage: DiscountUsage[];
  topProducts: ProductPerformanceRow[];
  lowProducts: ProductPerformanceRow[];
  /** Percentage change in total estimated profit vs. the previous period.
   *  Positive = grew, negative = shrank. null when previous period has no data. */
  momProfitDelta: number | null;
  /** Top 5 products sorted by estimatedProfit descending (most profitable). */
  topProfitableProducts: ProductPerformanceRow[];
  /** Top 5 products sorted by estimatedProfit ascending (least profitable / biggest losses). */
  leastProfitableProducts: ProductPerformanceRow[];
}

export interface ProductOrderMix {
  title: string;
  orders: number;
}

export interface RetentionPayload {
  snapshot: RetentionSnapshot;
  dailyMetrics: DailyMetric[];
  /** Previous comparison period metrics — used to overlay a second line on the trend chart. */
  previousDailyMetrics?: DailyMetric[];
  firstOrderProducts: ProductOrderMix[];
  secondOrderProducts: ProductOrderMix[];
  cohortPlaceholder: string;
}

export interface FounderSummaryInputs {
  biggestRevenueMovers: string[];
  biggestProfitMovers: string[];
  discountSpikes: string[];
  repeatRateChanges: string[];
  refundSpikes: string[];
  bestProducts: string[];
  worstProducts: string[];
}
