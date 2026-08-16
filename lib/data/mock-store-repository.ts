import {
  alerts,
  collectionPerformance,
  customers,
  dailyMetrics,
  discountUsage,
  orders,
  previousPeriodMetrics,
  products,
  store,
  summaries
} from "@/lib/data/mock-store";
import type { AnalyticsRepository } from "@/lib/domain/repository";

export const mockStoreRepository: AnalyticsRepository = {
  async getStore() {
    return store;
  },
  async getProducts() {
    return products;
  },
  async getCustomers() {
    return customers;
  },
  async getOrders() {
    return orders;
  },
  async getDailyMetrics() {
    return dailyMetrics;
  },
  async getPreviousPeriodMetrics() {
    return previousPeriodMetrics;
  },
  async getDiscountUsage() {
    return discountUsage;
  },
  async getCollectionPerformance() {
    return collectionPerformance;
  },
  async getProductStock() {
    return [];
  },
  async getAlerts() {
    return alerts;
  },
  async getSummaries() {
    return summaries;
  }
};
