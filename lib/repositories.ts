import { prismaAnalyticsRepository } from "@/lib/data/prisma-analytics-repository";
import type { AnalyticsRepository } from "@/lib/domain/repository";

export async function getAnalyticsRepository(): Promise<AnalyticsRepository> {
  return prismaAnalyticsRepository;
}
