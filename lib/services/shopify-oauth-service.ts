import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { encryptSecret } from "@/lib/security/encryption";
import { getAuthContext, ACTIVE_STORE_COOKIE } from "@/lib/auth/session";
import { createShopifyClient } from "@/lib/shopify/client";
import { SHOP_QUERY } from "@/lib/shopify/queries/shop";
import { mapShopMetadata } from "@/lib/shopify/mappers/shopify-mappers";

/**
 * Shopify OAuth (authorization-code grant) for multi-merchant onboarding.
 *
 * Flow:
 *   1. /api/shopify/oauth/install  -> redirect merchant to Shopify's authorize URL.
 *   2. Shopify redirects back to /api/shopify/oauth/callback with code+hmac+state+shop.
 *   3. We verify the HMAC + the state nonce, exchange the code for a permanent
 *      Admin API access token, and persist it (encrypted) on ShopifyConnection.
 *
 * Reuses existing env vars (SHOPIFY_CLIENTID / SHOPIFY_CLIENT_SECRET / APP_URL),
 * the existing encryption helpers, and the existing Store / ShopifyConnection
 * model + Shopify GraphQL client. No new dependencies, no schema changes.
 *
 * Validated against the documented Shopify Admin OAuth authorization-code grant
 * (authorize endpoint, hmac signing rules, /admin/oauth/access_token exchange),
 * which is stable across Admin API versions. The same /admin/oauth/access_token
 * host is already used by lib/shopify/client.ts for the client-credentials grant.
 */

// Default scopes for the analytics app. Override via SHOPIFY_OAUTH_SCOPES (comma-separated).
//
// read_all_orders is deliberately NOT in the default set. It is a
// PROTECTED scope: requesting it without Partner-dashboard approval makes
// Shopify reject the ENTIRE authorize screen with "invalid_request: Your
// account does not have permission to grant the requested access" — the
// install dies before the merchant even sees a consent page (observed in
// production 2026-07-12). Without it, plain read_orders returns only the
// last 60 days of order history, so once the app IS approved for
// "Read all orders" (Partner dashboard → App → API access → request
// access) set:
//   SHOPIFY_OAUTH_SCOPES=read_products,read_orders,read_all_orders,read_customers,read_inventory
// and reinstall as the STORE OWNER account (protected scopes cannot be
// granted by staff members).
//
// read_inventory backs the restock-hero alerts (variant inventory levels)
// and is not protected.
//
// write_discounts backs the affiliate portal's coupon creation
// (discountCodeBasicCreate). Not a protected scope. Stores installed
// before it was added must re-run the OAuth install to grant it.
const DEFAULT_SCOPES = [
  "read_products",
  "read_orders",
  "read_customers",
  "read_inventory",
  "write_discounts"
];

// Strict shop-domain guard for OAuth: only `<store>.myshopify.com`. Prevents the
// authorize redirect / token exchange from being pointed at an attacker host.
const OAUTH_SHOP_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export const SHOPIFY_OAUTH_STATE_COOKIE = "shopify_oauth_state";

interface ShopifyOauthConfig {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  scopes: string;
  redirectUri: string;
}

// Cache: hold the resolved config for the lifetime of the process so we
// don't hit the DB on every OAuth request. The TTL is small (1 min) so
// rotating credentials via the Settings UI takes effect quickly.
let configCache: { value: ShopifyOauthConfig; loadedAt: number } | null = null;
const CONFIG_CACHE_TTL_MS = 60 * 1000;

/**
 * Resolve the Shopify Partner app credentials. Priority order:
 *   1. SystemConfig rows in the DB (set via /api/settings/shopify-app-config)
 *   2. Environment variables (SHOPIFY_CLIENTID / SHOPIFY_CLIENT_SECRET)
 *
 * This gives the operator two paths: paste the credentials into the
 * Settings UI (writes to DB) or set them as Render env vars. Either
 * works; DB wins if both are set.
 */
function resolveScopes(): string {
  const configuredScopes = process.env.SHOPIFY_OAUTH_SCOPES?.trim();
  return configuredScopes && configuredScopes.length
    ? configuredScopes.split(",").map((scope) => scope.trim()).filter(Boolean).join(",")
    : DEFAULT_SCOPES.join(",");
}

/**
 * Per-SHOP OAuth config — for stores registered via admin-managed onboarding
 * (design partners / multi-brand). Each such store carries its OWN
 * custom-distribution app's Client ID/Secret in StoreOnboarding, so the
 * authorize URL, HMAC check, and token exchange all use that app's creds
 * rather than the single global public app. Returns null when the shop has
 * no onboarding record (→ caller falls back to the global config).
 */
async function getPerShopOauthConfig(shopDomain: string): Promise<ShopifyOauthConfig | null> {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) return null;
  try {
    const { getDb } = await import("@/lib/server/db");
    const { decryptSecret } = await import("@/lib/security/encryption");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getDb() as any;
    if (!db?.storeOnboarding) return null;
    const row = (await db.storeOnboarding.findUnique({
      where: { shopDomain },
      select: { appClientId: true, appClientSecretEnc: true }
    })) as { appClientId: string; appClientSecretEnc: string } | null;
    if (!row?.appClientId || !row?.appClientSecretEnc) return null;
    const base = appUrl.replace(/\/$/, "");
    return {
      clientId: row.appClientId.trim(),
      clientSecret: decryptSecret(row.appClientSecretEnc).trim(),
      appUrl: base,
      scopes: resolveScopes(),
      redirectUri: `${base}/api/shopify/oauth/callback`
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the OAuth config for a given shop: the shop's own registered app
 * credentials if it was set up via managed onboarding, otherwise the global
 * public app. Every OAuth step (authorize, state, HMAC, token exchange)
 * MUST resolve through here with the shop in hand so a multi-app deployment
 * signs/verifies with the correct app secret.
 */
async function getOauthConfigForShop(shopDomain?: string | null): Promise<ShopifyOauthConfig> {
  if (shopDomain) {
    const perShop = await getPerShopOauthConfig(shopDomain);
    if (perShop) return perShop;
  }
  return getGlobalOauthConfig();
}

async function getGlobalOauthConfig(): Promise<ShopifyOauthConfig> {
  if (configCache && Date.now() - configCache.loadedAt < CONFIG_CACHE_TTL_MS) {
    return configCache.value;
  }

  let clientId: string | undefined;
  let clientSecret: string | undefined;

  // DB lookup — best effort. If the table doesn't exist yet (legacy) or
  // any row is missing, we fall through to env vars.
  try {
    const { getDb } = await import("@/lib/server/db");
    const { decryptSecret } = await import("@/lib/security/encryption");
    const db = getDb();
    const rows = (await db.systemConfig.findMany({
      where: {
        key: { in: ["shopify_partner_client_id", "shopify_partner_client_secret"] }
      },
      select: { key: true, value: true, encrypted: true }
    })) as Array<{ key: string; value: string; encrypted: boolean }>;
    for (const row of rows) {
      const raw = row.encrypted ? decryptSecret(row.value) : row.value;
      if (row.key === "shopify_partner_client_id") clientId = raw.trim();
      if (row.key === "shopify_partner_client_secret") clientSecret = raw.trim();
    }
  } catch {
    // DB unavailable / table missing — fall through to env
  }

  // Env-var fallback
  if (!clientId) clientId = process.env.SHOPIFY_CLIENTID?.trim();
  if (!clientSecret) clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();

  const appUrl = process.env.APP_URL?.trim();

  if (!clientId || !clientSecret || !appUrl) {
    throw new AppError(
      "Missing Shopify Partner app credentials. Either paste them in Settings → Shopify connection, or set SHOPIFY_CLIENTID + SHOPIFY_CLIENT_SECRET (and APP_URL) as environment variables.",
      500
    );
  }

  const configuredScopes = process.env.SHOPIFY_OAUTH_SCOPES?.trim();
  const scopes = configuredScopes && configuredScopes.length
    ? configuredScopes.split(",").map((scope) => scope.trim()).filter(Boolean).join(",")
    : DEFAULT_SCOPES.join(",");

  const resolved: ShopifyOauthConfig = {
    clientId,
    clientSecret,
    appUrl: appUrl.replace(/\/$/, ""),
    scopes,
    redirectUri: `${appUrl.replace(/\/$/, "")}/api/shopify/oauth/callback`
  };
  configCache = { value: resolved, loadedAt: Date.now() };
  return resolved;
}

// Invalidate the cache — called by /api/settings/shopify-app-config when
// the operator saves new credentials.
export function invalidateShopifyOauthConfigCache(): void {
  configCache = null;
}

/**
 * Validate + normalize the `shop` param Shopify hands us (or the merchant types).
 * Accepts `store.myshopify.com` or a bare `store` handle; rejects anything else.
 */
export function normalizeOauthShopDomain(input: string | null | undefined): string {
  const raw = (input ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!raw) {
    throw new AppError("A shop domain is required to start the Shopify install.", 400);
  }

  const candidate = raw.includes(".") ? raw : `${raw}.myshopify.com`;
  if (!OAUTH_SHOP_PATTERN.test(candidate)) {
    throw new AppError("Enter a valid Shopify store like example.myshopify.com.", 400);
  }

  return candidate;
}

/** Cryptographically random nonce used as the OAuth `state`. */
export function generateOauthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Build the Shopify authorize URL and the signed state cookie value.
 * The cookie binds the nonce to the shop and is signed with the client secret so
 * the callback can validate state without any server-side session store.
 */
export async function buildInstallRedirect(shopInput: string | null | undefined): Promise<{
  authorizeUrl: string;
  shopDomain: string;
  state: string;
  signedState: string;
}> {
  const shopDomain = normalizeOauthShopDomain(shopInput);
  const { clientId, clientSecret, scopes, redirectUri } = await getOauthConfigForShop(shopDomain);
  const state = generateOauthState();

  // OFFLINE (permanent) token grant — REQUIRED for background sync.
  //
  // Shopify's authorize endpoint issues an OFFLINE access token by DEFAULT (i.e.
  // when no `grant_options[]` is present). An OFFLINE token persists until the
  // app is uninstalled. Adding `grant_options[]=per-user` would instead request
  // an ONLINE token, which Shopify expires in ~24h and which then fails every
  // background/cron sync with "Error validating access token: Session has expired".
  //
  // We therefore DELIBERATELY omit `grant_options[]` here. Do NOT add it: the
  // /api/cron/* sync jobs rely on the resulting token being permanent (offline).
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state
    // intentionally NO `grant_options[]` → offline (permanent) access token
  });

  const authorizeUrl = `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
  const signedState = signState(shopDomain, state, clientSecret);

  return { authorizeUrl, shopDomain, state, signedState };
}

function signState(shopDomain: string, state: string, clientSecret: string): string {
  const signature = crypto
    .createHmac("sha256", clientSecret)
    .update(`${shopDomain}:${state}`)
    .digest("hex");
  // cookie value = "<state>.<signature>"
  return `${state}.${signature}`;
}

/** Constant-time check that the returned state matches the signed cookie. */
export async function verifyOauthState(input: {
  shopDomain: string;
  returnedState: string | null;
  signedStateCookie: string | null;
}): Promise<boolean> {
  const { clientSecret } = await getOauthConfigForShop(input.shopDomain);
  const returnedState = input.returnedState?.trim();
  const cookie = input.signedStateCookie?.trim();
  if (!returnedState || !cookie) return false;

  const [cookieState] = cookie.split(".");
  if (!cookieState) return false;

  // The state echoed back by Shopify must equal the one we put in the cookie...
  if (!timingSafeEqualStrings(returnedState, cookieState)) return false;

  // ...and the cookie itself must carry our signature for this shop+state.
  const expected = signState(input.shopDomain, cookieState, clientSecret);
  return timingSafeEqualStrings(cookie, expected);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Verify the HMAC Shopify appends to the OAuth callback query string.
 * Spec: remove `hmac` and `signature`, sort the remaining params, join as
 * `key=value` pairs with `&`, HMAC-SHA256 with the app's client secret, hex.
 */
export async function verifyOauthHmac(searchParams: URLSearchParams): Promise<boolean> {
  // Resolve the app secret for THIS shop — a managed-onboarding store signs
  // with its own custom-distribution app, not the global public app.
  const { clientSecret } = await getOauthConfigForShop(searchParams.get("shop"));
  const providedHmac = searchParams.get("hmac");
  if (!providedHmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const digest = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");
  return timingSafeEqualStrings(digest, providedHmac);
}

interface TokenExchangeResult {
  accessToken: string;
  scope: string;
}

// Order webhook topics we subscribe to so order data arrives in real time
// (polling/sync remains the fallback if registration fails).
const ORDER_WEBHOOK_TOPICS = ["orders/create", "orders/updated", "orders/cancelled"] as const;

// Admin REST API version for the Webhooks endpoint. Override via
// SHOPIFY_ADMIN_API_VERSION (the same env var the GraphQL client reads).
const WEBHOOK_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2024-10";

interface RegisterOrderWebhooksResult {
  webhookIds: string[];
  registered: number;
  failed: number;
}

/**
 * Register the order webhooks (create / updated / cancelled) for a freshly
 * connected shop via the Shopify REST Webhooks API:
 *   POST https://{shop}/admin/api/{version}/webhooks.json
 *   { "webhook": { "topic": "orders/create", "address": "...", "format": "json" } }
 *
 * Failure is non-fatal by design: every error is logged and swallowed so the
 * OAuth flow still completes — polling (the existing sync) covers us until the
 * webhooks are (re)registered. Returns the IDs of the webhooks that registered
 * successfully so the caller can persist them on ShopifyConnection.
 *
 * A 422 from Shopify when the identical subscription already exists is treated
 * as "already registered" rather than a failure (re-running install is safe).
 */
export async function registerOrderWebhooks(input: {
  shopDomain: string;
  accessToken: string;
}): Promise<RegisterOrderWebhooksResult> {
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (!appUrl) {
    console.error("[shopify-oauth] Cannot register webhooks: APP_URL is not set.");
    return { webhookIds: [], registered: 0, failed: ORDER_WEBHOOK_TOPICS.length };
  }

  const address = `${appUrl}/api/webhooks/shopify/orders`;
  const endpoint = `https://${input.shopDomain}/admin/api/${WEBHOOK_API_VERSION}/webhooks.json`;
  const webhookIds: string[] = [];
  let registered = 0;
  let failed = 0;

  for (const topic of ORDER_WEBHOOK_TOPICS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Shopify-Access-Token": input.accessToken
        },
        body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
        cache: "no-store"
      });

      if (response.status === 201) {
        const payload = (await response.json().catch(() => null)) as { webhook?: { id?: number | string } } | null;
        const id = payload?.webhook?.id;
        if (id !== undefined && id !== null) {
          webhookIds.push(String(id));
        }
        registered += 1;
        continue;
      }

      // 422 = subscription already exists for this topic+address (idempotent re-install).
      // Not a failure: the webhook is present, we just don't learn its id here.
      if (response.status === 422) {
        const text = await response.text().catch(() => "");
        console.warn(`[shopify-oauth] Webhook ${topic} already registered for ${input.shopDomain} (422). ${text}`);
        registered += 1;
        continue;
      }

      const text = await response.text().catch(() => "");
      console.error(`[shopify-oauth] Webhook ${topic} registration failed (${response.status}) for ${input.shopDomain}. ${text}`);
      failed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[shopify-oauth] Webhook ${topic} registration threw for ${input.shopDomain}: ${message}`);
      failed += 1;
    }
  }

  return { webhookIds, registered, failed };
}

/**
 * Exchange the temporary authorization code for a permanent Admin API access token.
 * POST https://{shop}/admin/oauth/access_token  { client_id, client_secret, code }
 */
export async function exchangeShopifyCode(shopDomain: string, code: string): Promise<TokenExchangeResult> {
  const { clientId, clientSecret } = await getOauthConfigForShop(shopDomain);
  const cleanCode = code.trim();
  if (!cleanCode) {
    throw new AppError("Shopify did not return an authorization code.", 400);
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: cleanCode
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(`Shopify OAuth token exchange failed with status ${response.status}. ${text}`, response.status);
  }

  const payload = (await response.json()) as { access_token?: string; scope?: string };
  if (!payload.access_token) {
    throw new AppError("Shopify OAuth exchange did not return an access token.", 502, payload);
  }

  return {
    accessToken: payload.access_token,
    scope: payload.scope ?? ""
  };
}

/**
 * Persist a freshly granted OAuth token: fetch shop metadata with the new token,
 * then upsert Store + ShopifyConnection (token encrypted at rest). Mirrors
 * saveShopifyCredentials but keyed off an OAuth-granted token instead of a
 * manually pasted one.
 */
export async function persistOauthConnection(input: {
  shopDomain: string;
  accessToken: string;
  scope: string;
}): Promise<{ storeId: string; shopDomain: string }> {
  const db = getDb();
  if (!db) {
    throw new AppError("Database client is not available. Generate the Prisma client and try again.", 500);
  }

  // Visibility: without read_all_orders the token only reaches the last 60
  // days of orders — sync will succeed but silently under-report history.
  // Log it so "why is older data missing?" has an answer in the logs.
  if (!input.scope.split(",").map((s) => s.trim()).includes("read_all_orders")) {
    console.warn(
      `[shopify-oauth] ${input.shopDomain} connected WITHOUT read_all_orders — order history is limited to the last 60 days. Request "Read all orders" in the Partner dashboard, set SHOPIFY_OAUTH_SCOPES to include it, and reinstall as the store owner for full history.`
    );
  }

  const client = createShopifyClient({ shopDomain: input.shopDomain, adminAccessToken: input.accessToken });
  const data = await client.request<{ shop: any }>(SHOP_QUERY);
  const meta = mapShopMetadata(data.shop);

  const encryptedToken = encryptSecret(input.accessToken);
  const tokenLastFour = input.accessToken.slice(-4);

  // Where does this store land?
  //   1. A managed-onboarding record (design partner / multi-brand) pins the
  //      TARGET org up front — so the store binds to the RIGHT org even when
  //      the person clicking "Install" is the merchant, not signed into
  //      Hiloomy at all. This is what makes admin-driven onboarding work.
  //   2. Otherwise (self-serve install by a signed-in operator) fall back to
  //      the installer's active org.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;
  const onboarding = dbAny.storeOnboarding
    ? ((await dbAny.storeOnboarding
        .findUnique({
          where: { shopDomain: input.shopDomain },
          select: { id: true, targetOrgId: true }
        })
        .catch(() => null)) as { id: string; targetOrgId: string } | null)
    : null;

  let orgId: string | null = onboarding?.targetOrgId ?? null;
  if (!orgId) {
    try {
      const auth = await getAuthContext();
      orgId = auth.orgId ?? null;
    } catch {
      orgId = null;
    }
  }
  if (!orgId) {
    throw new AppError(
      "No active organization for this store. Register the store under Settings → Design partners, or sign in and re-install.",
      401
    );
  }

  const store = await db.store.upsert({
    where: { domain: input.shopDomain },
    update: {
      org: { connect: { id: orgId } },
      name: meta.name,
      shopifyShopId: meta.shopifyShopId,
      currency: meta.currency,
      timezone: meta.timezone,
      planName: meta.planName,
      connected: true
    },
    create: {
      orgId,
      domain: input.shopDomain,
      name: meta.name,
      shopifyShopId: meta.shopifyShopId,
      currency: meta.currency,
      timezone: meta.timezone,
      planName: meta.planName,
      connected: true
    }
  });

  const connection = await db.shopifyConnection.upsert({
    where: { storeId: store.id },
    update: {
      shopDomain: input.shopDomain,
      adminAccessTokenEnc: encryptedToken,
      tokenLastFour,
      syncStatus: "idle",
      lastSyncError: null
    },
    create: {
      storeId: store.id,
      shopDomain: input.shopDomain,
      adminAccessTokenEnc: encryptedToken,
      tokenLastFour
    }
  });

  // Register order webhooks so order data arrives in real time. This is
  // best-effort: registerOrderWebhooks never throws, and we additionally guard
  // the persistence so a webhook/DB hiccup can never fail the OAuth flow
  // (polling/sync remains the fallback).
  try {
    const result = await registerOrderWebhooks({
      shopDomain: input.shopDomain,
      accessToken: input.accessToken
    });

    if (result.webhookIds.length > 0) {
      await db.shopifyConnection.update({
        where: { id: connection.id },
        data: { webhookIds: result.webhookIds, webhooksRegisteredAt: new Date() }
      });
    } else if (result.registered > 0) {
      // All topics already existed (422s) — record the registration timestamp
      // even though we didn't capture new ids this time.
      await db.shopifyConnection.update({
        where: { id: connection.id },
        data: { webhooksRegisteredAt: new Date() }
      });
    }

    if (result.failed > 0) {
      console.warn(
        `[shopify-oauth] ${result.failed}/${ORDER_WEBHOOK_TOPICS.length} order webhooks failed to register for ${input.shopDomain}; polling will backfill until they are retried.`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[shopify-oauth] Webhook registration/persist step failed for ${input.shopDomain}: ${message}`);
  }

  // Mark the managed-onboarding record connected so the operator's
  // "Design partners" list flips from pending → connected.
  if (onboarding) {
    await dbAny.storeOnboarding
      .update({ where: { id: onboarding.id }, data: { status: "connected" } })
      .catch(() => null);
  }

  // Land the founder on the brand they just connected.
  try {
    const jar = await cookies();
    jar.set(ACTIVE_STORE_COOKIE, store.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
  } catch {
    // cookies() is unavailable in some non-route contexts — non-fatal.
  }

  return { storeId: store.id, shopDomain: input.shopDomain };
}
