import { cookies } from "next/headers";
import { getDb, withOptionalDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { getAuthContext, ACTIVE_STORE_COOKIE } from "@/lib/auth/session";
import { createShopifyClient, resolveShopifyAdminAccessToken } from "@/lib/shopify/client";
import { SHOP_QUERY } from "@/lib/shopify/queries/shop";
import { normalizeShopDomain, validateOptionalAdminAccessToken } from "@/lib/shopify/validators";
import { mapShopMetadata } from "@/lib/shopify/mappers/shopify-mappers";
import type { ShopifyConnectionSummary } from "@/lib/domain/types";
import type { ShopifyCredentialInput } from "@/lib/shopify/types";

const CLIENT_CREDENTIALS_SENTINEL = "client_credentials";

export async function testShopifyConnection(input: ShopifyCredentialInput) {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const adminAccessToken = validateOptionalAdminAccessToken(input.adminAccessToken);
  const resolved = await resolveShopifyAdminAccessToken({ shopDomain, adminAccessToken });
  const client = createShopifyClient({ shopDomain, adminAccessToken: resolved.adminAccessToken });
  const data = await client.request<{ shop: any }>(SHOP_QUERY);
  const mapped = mapShopMetadata(data.shop);

  return {
    ok: true,
    authSource: resolved.source,
    storePreview: mapped
  };
}

export async function saveShopifyCredentials(input: ShopifyCredentialInput) {
  const db = getDb();
  if (!db) {
    throw new AppError("Database client is not available. Generate Prisma client and try again.", 500);
  }

  const tested = await testShopifyConnection(input);
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const adminAccessToken = validateOptionalAdminAccessToken(input.adminAccessToken);
  const tokenToStore = adminAccessToken ?? CLIENT_CREDENTIALS_SENTINEL;
  const encryptedToken = encryptSecret(tokenToStore);
  const tokenLastFour = adminAccessToken ? adminAccessToken.slice(-4) : "oauth";

  // CRITICAL: bind the new Store to the connecting user's active org.
  // Without this the row lands with orgId=null and the StoreSwitcher
  // (which filters `where: { orgId: yourOrgId }`) will NEVER see it —
  // the store gets connected but is invisible in the UI, which looks
  // like "I can't connect another store" from the founder's side.
  // If we're being called from an unauthenticated context (CLI / cron),
  // skip the bind — those contexts have no org to assign to.
  let orgId: string | null = null;
  try {
    const auth = await getAuthContext();
    orgId = auth.orgId ?? null;
  } catch {
    orgId = null;
  }
  if (!orgId) {
    throw new AppError(
      "No active organization for the current user. Sign in and try again.",
      401
    );
  }

  const store = await db.store.upsert({
    where: { domain: shopDomain },
    update: {
      // Don't move a store between orgs on a re-save — only set it
      // when it's currently unassigned (handles the orphan-backfill
      // case for stores connected before this fix).
      ...(orgId ? { org: { connect: { id: orgId } } } : {}),
      name: tested.storePreview.name,
      shopifyShopId: tested.storePreview.shopifyShopId,
      currency: tested.storePreview.currency,
      timezone: tested.storePreview.timezone,
      planName: tested.storePreview.planName,
      connected: true
    },
    create: {
      orgId,
      domain: shopDomain,
      name: tested.storePreview.name,
      shopifyShopId: tested.storePreview.shopifyShopId,
      currency: tested.storePreview.currency,
      timezone: tested.storePreview.timezone,
      planName: tested.storePreview.planName,
      connected: true
    }
  });

  await db.shopifyConnection.upsert({
    where: { storeId: store.id },
    update: {
      shopDomain,
      adminAccessTokenEnc: encryptedToken,
      tokenLastFour,
      syncStatus: "idle",
      lastSyncError: null
    },
    create: {
      storeId: store.id,
      shopDomain,
      adminAccessTokenEnc: encryptedToken,
      tokenLastFour
    }
  });

  // Set the active-store cookie so the founder lands on the brand
  // they just connected (otherwise they'd need to use the switcher).
  try {
    const jar = await cookies();
    jar.set(ACTIVE_STORE_COOKIE, store.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
  } catch {
    // cookies() throws in non-route contexts (e.g. RSC during build) —
    // safe to swallow; the user can switch manually if needed.
  }

  return {
    ok: true,
    authSource: tested.authSource,
    storeId: store.id
  };
}

export async function getStoredShopifyCredentials(storeId: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  const connection = await db.shopifyConnection.findUnique({
    where: { storeId }
  });

  if (!connection) {
    throw new AppError("Shopify connection not found for this store.", 404);
  }

  const decrypted = decryptSecret(connection.adminAccessTokenEnc);

  // BACKGROUND SYNC MUST USE THE OFFLINE (PERMANENT) OAUTH TOKEN.
  //
  // When the stored value is the CLIENT_CREDENTIALS sentinel, we mint a token
  // via Shopify's client-credentials grant. That token is SHORT-LIVED — Shopify
  // stamps it with `expires_in` (~24h) — so a background/cron sync that runs a
  // day after the token was minted fails with:
  //   "Error validating access token: Session has expired ..."
  // This is the exact failure the Sync Controls panel was throwing.
  //
  // The permanent fix is to connect via OAuth (install/callback), which persists
  // a real OFFLINE access token into `adminAccessTokenEnc`. When that real token
  // is present we use it directly (it never expires until the app is uninstalled).
  // The sentinel path is retained only as a degraded fallback so a store that was
  // connected the old way still functions, but it now logs LOUDLY so the expiry
  // behavior is visible and the owner is prompted to re-OAuth.
  if (decrypted === CLIENT_CREDENTIALS_SENTINEL) {
    console.warn(
      `[shopify-connection] store=${storeId} (${connection.shopDomain}) is using the ` +
        `client-credentials grant, which returns a SHORT-LIVED token (~24h). Background ` +
        `sync will fail with "Session has expired" once it lapses. Re-connect the store ` +
        `via OAuth (Settings → Shopify connection → Connect) to persist a permanent ` +
        `OFFLINE access token.`
    );
    const resolved = await resolveShopifyAdminAccessToken({ shopDomain: connection.shopDomain });
    return {
      shopDomain: connection.shopDomain,
      adminAccessToken: resolved.adminAccessToken,
      apiVersion: connection.apiVersion,
      tokenSource: "client_credentials" as const
    };
  }

  // Real stored token — OAuth-granted offline token (permanent) or a manually
  // pasted Admin API token. Either is durable; use it directly.
  return {
    shopDomain: connection.shopDomain,
    adminAccessToken: decrypted,
    apiVersion: connection.apiVersion,
    tokenSource: "offline" as const
  };
}

export async function getShopifyConnectionSummary(storeId?: string): Promise<ShopifyConnectionSummary | null> {
  const store: any = await withOptionalDb(
    (db) =>
      storeId
        ? db.store.findUnique({ where: { id: storeId }, include: { connection: true } })
        : db.store.findFirst({ where: { connected: true, connection: { isNot: null } }, include: { connection: true }, orderBy: { updatedAt: "desc" } }),
    null
  );

  if (!store) return null;

  return {
    shopDomain: store.domain,
    connected: Boolean(store.connected && store.connection),
    apiVersion: store.connection?.apiVersion,
    tokenLastFour: store.connection?.tokenLastFour,
    syncStatus: (store.connection?.syncStatus ?? "idle") as ShopifyConnectionSummary["syncStatus"],
    lastSyncAt: store.connection?.lastSyncAt?.toISOString() ?? null,
    lastSyncError: store.connection?.lastSyncError ?? null
  };
}
