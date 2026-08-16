import { AppError } from "@/lib/server/errors";
import type { ShopifyCredentialInput, ShopifyConnection as ShopifyGraphConnection, ShopifyGraphQLResponse, ShopifyNodeEdge } from "@/lib/shopify/types";

const DEFAULT_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2025-01";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isThrottleGraphQLError(payload: ShopifyGraphQLResponse<unknown>) {
  return Boolean(
    payload.errors?.some((error) => {
      const message = error.message.toLowerCase();
      const code = String(error.extensions?.code ?? "").toLowerCase();
      return message.includes("throttled") || code === "throttled";
    })
  );
}

function getRetryAfterDelayMs(response: Response) {
  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }

  const parsed = Date.parse(retryAfter);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed - Date.now());
  }

  return null;
}

function getThrottleDelayMs(payload: ShopifyGraphQLResponse<unknown> | undefined, attempt: number, response?: Response) {
  const retryAfterDelay = response ? getRetryAfterDelayMs(response) : null;
  if (retryAfterDelay !== null) {
    return Math.max(retryAfterDelay, 1000);
  }

  const requestedCost =
    toFiniteNumber(payload?.extensions?.cost?.requestedQueryCost) ??
    toFiniteNumber(payload?.extensions?.cost?.actualQueryCost) ??
    100;
  const currentlyAvailable =
    toFiniteNumber(payload?.extensions?.cost?.throttleStatus?.currentlyAvailable) ??
    0;
  const restoreRate =
    toFiniteNumber(payload?.extensions?.cost?.throttleStatus?.restoreRate) ??
    50;
  const missingCapacity = Math.max(0, requestedCost - currentlyAvailable);
  const estimatedRecoveryMs = restoreRate > 0 ? Math.ceil((missingCapacity / restoreRate) * 1000) : 0;

  return Math.max(1000, estimatedRecoveryMs + 500 + attempt * 750);
}

export class ShopifyGraphQLClient {
  private shopDomain: string;
  private adminAccessToken: string;
  private apiVersion: string;

  constructor(input: ShopifyCredentialInput & { apiVersion?: string; adminAccessToken: string }) {
    this.shopDomain = input.shopDomain;
    this.adminAccessToken = input.adminAccessToken;
    this.apiVersion = input.apiVersion ?? DEFAULT_API_VERSION;
  }

  async request<T>(query: string, variables?: Record<string, unknown>, attempt = 0): Promise<T> {
    const response = await fetch(`https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.adminAccessToken
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store"
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await sleep(getThrottleDelayMs(undefined, attempt, response));
      return this.request<T>(query, variables, attempt + 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(`Shopify request failed with status ${response.status}. ${text}`, response.status);
    }

    const payload = (await response.json()) as ShopifyGraphQLResponse<T>;
    if (payload.errors?.length) {
      if (isThrottleGraphQLError(payload) && attempt < 5) {
        await sleep(getThrottleDelayMs(payload, attempt, response));
        return this.request<T>(query, variables, attempt + 1);
      }
      throw new AppError(payload.errors.map((error) => error.message).join("; "), 400, payload.errors);
    }

    if (!payload.data) {
      throw new AppError("Shopify returned an empty response.", 502);
    }

    return payload.data;
  }

  async paginateConnection<TNode, TData extends Record<string, ShopifyGraphConnection<TNode>>>(
    key: keyof TData,
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<TNode[]> {
    let cursor: string | null = null;
    const results: TNode[] = [];

    do {
      const page: TData = await this.request<TData>(query, { ...variables, cursor });
      const connection: ShopifyGraphConnection<TNode> | undefined = page[key];
      if (!connection) break;
      results.push(...connection.edges.map((edge: ShopifyNodeEdge<TNode>) => edge.node));
      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor ?? null : null;
      if (cursor) {
        await sleep(250);
      }
    } while (cursor);

    return results;
  }
}

export async function requestShopifyAccessTokenWithClientCredentials(shopDomain: string) {
  const clientId = process.env.SHOPIFY_CLIENTID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new AppError("Missing SHOPIFY_CLIENTID or SHOPIFY_CLIENT_SECRET. Add them to .env to use Shopify client-credentials auth.", 500);
  }

  // Shopify's client credentials grant requires form-urlencoded, not JSON.
  // https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    }).toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(
      `Shopify client-credentials token request failed with status ${response.status}. ${text} ` +
        `Note: the client-credentials grant returns a SHORT-LIVED token; for durable background ` +
        `sync, connect the store via OAuth to obtain a permanent OFFLINE access token.`,
      response.status
    );
  }

  const payload = await response.json() as { access_token?: string; scope?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new AppError("Shopify did not return an access token for the client credentials grant.", 502, payload);
  }

  // expiresIn is non-null here (Shopify stamps client-credentials tokens with a
  // TTL). Callers should NOT cache this across requests as if it were permanent —
  // the only permanent token is the OFFLINE token from the OAuth code grant.
  return {
    accessToken: payload.access_token,
    scope: payload.scope ?? "",
    expiresIn: payload.expires_in ?? null
  };
}

export async function resolveShopifyAdminAccessToken(input: ShopifyCredentialInput) {
  const explicitToken = input.adminAccessToken?.trim();
  if (explicitToken) {
    return {
      adminAccessToken: explicitToken,
      source: "manual" as const
    };
  }

  const granted = await requestShopifyAccessTokenWithClientCredentials(input.shopDomain);
  return {
    adminAccessToken: granted.accessToken,
    source: "client_credentials" as const,
    scope: granted.scope,
    expiresIn: granted.expiresIn
  };
}

export function createShopifyClient(input: ShopifyCredentialInput & { apiVersion?: string; adminAccessToken: string }) {
  return new ShopifyGraphQLClient(input);
}
