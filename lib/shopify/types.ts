export interface ShopifyMoneyV2 {
  amount?: string | null;
  currencyCode?: string | null;
}

export interface ShopifyNodeEdge<T> {
  cursor: string;
  node: T;
}

export interface ShopifyPageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface ShopifyConnection<T> {
  edges: ShopifyNodeEdge<T>[];
  pageInfo: ShopifyPageInfo;
}

export interface ShopifyGraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

export interface ShopifyGraphQLThrottleStatus {
  maximumAvailable?: number;
  currentlyAvailable?: number;
  restoreRate?: number;
}

export interface ShopifyGraphQLCostExtension {
  requestedQueryCost?: number;
  actualQueryCost?: number;
  throttleStatus?: ShopifyGraphQLThrottleStatus;
}

export interface ShopifyGraphQLExtensions {
  cost?: ShopifyGraphQLCostExtension;
}

export interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: ShopifyGraphQLError[];
  extensions?: ShopifyGraphQLExtensions;
}

export interface ShopifyCredentialInput {
  shopDomain: string;
  adminAccessToken?: string | null;
}
