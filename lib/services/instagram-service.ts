import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

function getInstagramOauthConfig() {
  // "Instagram API with Instagram Login" issues its OWN app id/secret (the
  // Instagram product inside the Meta app dashboard) — distinct from the
  // Meta app credentials. Prefer the dedicated vars; fall back to the Meta
  // ones for setups where they happen to match.
  const clientId = (process.env.INSTAGRAM_CLIENT_ID ?? process.env.META_ADS_CLIENT_ID)?.trim();
  const clientSecret = (
    process.env.INSTAGRAM_CLIENT_SECRET ?? process.env.META_ADS_CLIENT_SECRET
  )?.trim();
  const appUrl = process.env.APP_URL?.trim();

  if (!clientId || !clientSecret || !appUrl) {
    throw new AppError(
      "Missing INSTAGRAM_CLIENT_ID / INSTAGRAM_CLIENT_SECRET (or META_ADS_* fallbacks) or APP_URL for Instagram OAuth.",
      500
    );
  }

  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/creator/instagram/oauth/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function getInstagramOauthStartUrl() {
  const { clientId, redirectUri } = getInstagramOauthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    // Instagram API with Instagram Login (the post-Basic-Display platform;
    // Basic Display's user_profile/user_media scopes died Dec 2024).
    // Requires the IG account to be a professional (business/creator) one.
    scope: "instagram_business_basic",
    response_type: "code"
  });

  // Business Login authorizes on www.instagram.com — the old
  // api.instagram.com/oauth/authorize host belonged to Basic Display and
  // now returns "Sorry, this page isn't available." (The token exchange
  // below still lives on api.instagram.com — only authorize moved.)
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeInstagramCodeForToken(code: string) {
  const cleanCode = code.trim();
  if (!cleanCode) throw new AppError("Instagram OAuth code is missing.", 400);

  const { clientId, clientSecret, redirectUri } = getInstagramOauthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code: cleanCode
  });

  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new AppError(`Instagram OAuth exchange failed. ${await response.text()}`, response.status);
  }

  const payload = await response.json();
  if (!payload?.access_token) {
    throw new AppError("Instagram OAuth exchange did not return an access token.", 502, payload);
  }

  // The code exchange returns a SHORT-lived token (~1h). Upgrade to the
  // 60-day long-lived token so the background sync survives; fall back to
  // the short token if the upgrade fails (better a degraded connect than
  // none — the UI still shows the connection and the founder can retry).
  const shortToken = String(payload.access_token);
  let accessToken = shortToken;
  try {
    const { clientSecret } = getInstagramOauthConfig();
    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", clientSecret);
    longUrl.searchParams.set("access_token", shortToken);
    const longRes = await fetch(longUrl, { cache: "no-store" });
    const longPayload = await longRes.json().catch(() => ({}));
    if (longRes.ok && longPayload?.access_token) {
      accessToken = String(longPayload.access_token);
    }
  } catch {
    // keep the short-lived token
  }

  return {
    accessToken,
    userId: payload.user_id ? String(payload.user_id) : null
  };
}

async function fetchInstagramProfile(accessToken: string) {
  const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new AppError("Instagram connection failed. Verify the token and that it can access Instagram media.", response.status);
  }

  return response.json();
}

async function fetchInstagramMedia(accessToken: string) {
  const response = await fetch(
    `https://graph.instagram.com/me/media?fields=id,caption,comments_count,like_count,media_type,media_url,permalink,timestamp&access_token=${accessToken}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new AppError("Unable to fetch Instagram posts.", response.status);
  }

  return response.json();
}

export async function saveInstagramConnection(accessToken: string, storeId?: string | null) {
  const token = accessToken.trim();
  if (!token) throw new AppError("Instagram access token is required.");
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  // Multi-tenant: attach the connection to the SIGNED-IN merchant's store
  // (passed by the routes from the session). The base-store fallback only
  // remains for legacy single-tenant callers with no session store.
  const store = storeId?.trim()
    ? await db.store.findUnique({ where: { id: storeId.trim() }, select: { id: true } })
    : await resolveOrCreateBaseStore();
  if (!store) throw new AppError("Unable to resolve a store for Instagram settings.", 500);

  const profile = await fetchInstagramProfile(token);

  await db.instagramConnection.upsert({
    where: { storeId: store.id },
    update: {
      instagramUserId: String(profile.id),
      username: profile.username ?? null,
      accessTokenEnc: encryptSecret(token),
      tokenLastFour: token.slice(-4),
      syncStatus: "idle",
      lastSyncError: null
    },
    create: {
      storeId: store.id,
      instagramUserId: String(profile.id),
      username: profile.username ?? null,
      accessTokenEnc: encryptSecret(token),
      tokenLastFour: token.slice(-4)
    }
  });

  return {
    ok: true,
    username: profile.username ?? null,
    storeId: store.id
  };
}

/**
 * Sync Instagram posts for a specific store.
 *
 * Pass `storeId` to scope the sync to one store — this is the multi-tenant
 * path (e.g. the refresh-all cron iterating every connected store). When
 * `storeId` is omitted the legacy single-tenant behaviour is preserved: the
 * "base" store is resolved via `resolveOrCreateBaseStore()`.
 *
 * `InstagramConnection.storeId` is unique, so each store has at most one
 * connection and the lookup/upserts below are correctly scoped to it.
 */
export async function syncInstagramPosts(storeId?: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  let resolvedStoreId = storeId?.trim() || null;
  if (!resolvedStoreId) {
    const store = await resolveOrCreateBaseStore();
    if (!store) throw new AppError("Unable to resolve a store for Instagram sync.", 500);
    resolvedStoreId = store.id;
  }

  const connection = await db.instagramConnection.findUnique({ where: { storeId: resolvedStoreId } });
  if (!connection) throw new AppError("Connect an Instagram account first.", 400);

  const payload = await fetchInstagramMedia(decryptSecret(connection.accessTokenEnc));
  const posts = Array.isArray(payload?.data) ? payload.data : [];

  for (const post of posts) {
    await db.creatorPost.upsert({
      where: {
        storeId_externalPostId: {
          storeId: resolvedStoreId,
          externalPostId: String(post.id)
        }
      },
      update: {
        instagramConnectionId: connection.id,
        caption: post.caption ?? null,
        mediaType: post.media_type ?? null,
        mediaUrl: post.media_url ?? null,
        permalink: post.permalink ?? null,
        postedAt: post.timestamp ? new Date(post.timestamp) : new Date(),
        likeCount: Number(post.like_count ?? 0),
        commentsCount: Number(post.comments_count ?? 0)
      },
      create: {
        storeId: resolvedStoreId,
        instagramConnectionId: connection.id,
        externalPostId: String(post.id),
        caption: post.caption ?? null,
        mediaType: post.media_type ?? null,
        mediaUrl: post.media_url ?? null,
        permalink: post.permalink ?? null,
        postedAt: post.timestamp ? new Date(post.timestamp) : new Date(),
        likeCount: Number(post.like_count ?? 0),
        commentsCount: Number(post.comments_count ?? 0),
        viewCount: 0
      }
    });
  }

  await db.instagramConnection.update({
    where: { storeId: resolvedStoreId },
    data: {
      syncStatus: "success",
      lastSyncAt: new Date(),
      lastSyncError: null
    }
  });

  return {
    ok: true,
    count: posts.length
  };
}

/**
 * storeId-scoped variant of {@link syncInstagramPosts}. Use this from any
 * multi-tenant context (cron fan-out, admin tooling) where the target store
 * is known explicitly and must NOT be inferred from cookie/session context.
 */
export async function syncInstagramPostsForStore(storeId: string) {
  const id = storeId?.trim();
  if (!id) throw new AppError("storeId is required for Instagram sync.", 400);
  return syncInstagramPosts(id);
}

export async function getInstagramConnectionSummary() {
  const db = getDb();
  if (!db) return null;
  const store = await resolveOrCreateBaseStore();
  if (!store) return null;
  return db.instagramConnection.findUnique({ where: { storeId: store.id } });
}
