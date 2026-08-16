import type { GrowthPlatform, GrowthPlatformConnection } from "@/lib/domain/growth-agent-types";

export interface GrowthConnector {
  platform: GrowthPlatform;
  displayName: string;
  requiresOAuth: boolean;
  supportsSync: boolean;
  supportsExecution: boolean;
}

export const growthConnectorRegistry: GrowthConnector[] = [
  { platform: "shopify", displayName: "Shopify", requiresOAuth: false, supportsSync: true, supportsExecution: false },
  { platform: "productCrawler", displayName: "Product Crawler", requiresOAuth: false, supportsSync: true, supportsExecution: false },
  { platform: "amazon", displayName: "Amazon Supplier Orders", requiresOAuth: false, supportsSync: false, supportsExecution: false },
  { platform: "metaAds", displayName: "Meta Ads", requiresOAuth: true, supportsSync: true, supportsExecution: true },
  { platform: "instagram", displayName: "Instagram", requiresOAuth: true, supportsSync: true, supportsExecution: true },
  { platform: "facebook", displayName: "Facebook", requiresOAuth: true, supportsSync: true, supportsExecution: true },
  { platform: "tiktok", displayName: "TikTok Ads", requiresOAuth: true, supportsSync: true, supportsExecution: true },
  { platform: "googleAnalytics", displayName: "Google Analytics", requiresOAuth: true, supportsSync: true, supportsExecution: false },
  // Google Search Console (DATA-01). OAuth-gated, read-only sync of Search
  // Analytics (impressions/clicks/ctr/position). Runtime connection status
  // defaults to "stub" / "Google OAuth not yet connected" until the merchant
  // completes /api/gsc/oauth/start — see lib/services/gsc-service.ts.
  { platform: "googleSearchConsole", displayName: "Google Search Console", requiresOAuth: true, supportsSync: true, supportsExecution: false }
];

export function getConnectorDefinition(platform: GrowthPlatform) {
  return growthConnectorRegistry.find((connector) => connector.platform === platform);
}

export function platformNeedsStubLabel(connection: GrowthPlatformConnection) {
  return connection.status === "stub"
    || connection.status === "not_connected"
    || connection.status === "needs_oauth";
}

