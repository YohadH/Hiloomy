import type {
  Alert,
  CollectionPerformanceRow,
  Customer,
  DailyMetric,
  DiscountUsage,
  Order,
  Product,
  ProductStockRow,
  Store,
  Summary
} from "@/lib/domain/types";

export interface AnalyticsRepository {
  getStore(storeId?: string): Promise<Store>;
  getProducts(storeId?: string): Promise<Product[]>;
  getCustomers(storeId?: string): Promise<Customer[]>;
  getOrders(storeId?: string): Promise<Order[]>;
  getDailyMetrics(storeId?: string): Promise<DailyMetric[]>;
  getPreviousPeriodMetrics(storeId?: string): Promise<DailyMetric[]>;
  getDiscountUsage(storeId?: string): Promise<DiscountUsage[]>;
  getCollectionPerformance(storeId?: string): Promise<CollectionPerformanceRow[]>;
  getProductStock(storeId?: string): Promise<ProductStockRow[]>;
  getAlerts(storeId?: string): Promise<Alert[]>;
  getSummaries(storeId?: string): Promise<Summary[]>;
}
