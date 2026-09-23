import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth/session";
import { saveMetaAdsConnection } from "@/lib/services/meta-ads-service";
import { toErrorMessage } from "@/lib/server/errors";
import { META_OAUTH_STATE_COOKIE, META_OAUTH_STORE_COOKIE } from "@/lib/meta-oauth";
import { getMetaAdAccountPin, normalizeMetaAdAccountId } from "@/lib/services/meta-ads-account-pin";
import { listMetaAdAccounts } from "@/lib/services/meta-ads-accounts";
import { clearMetaPendingConnection, setMetaPendingConnection } from "@/lib/services/meta-ads-pending-connection";

// One-click Meta Ads connect — step 2: Facebook redirects back here with a
// code. Exchange it for a long-lived user token, then:
//
//   • Store LOCKED to an ad account → token renewal. Keep that account (refuse
//     if the new login cannot see it) and save. Lands with ?meta_connected=true&meta_kept=1.
//   • Store NOT locked (first connection, or unlocked on purpose) → park the
//     token (meta-ads-pending-connection) and land with ?meta_pick=1 so the
//     owner picks the business + ad account explicitly. Nothing is chosen
//     here and nothing syncs until that choice locks the store.
//
// The old "auto-pick the first active account" is gone: it is how Bumpers
// and hbosem ended up on aftershower's account (Sep 2026).

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v19.0";

async function graphGet(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.error) {
    throw new Error(payload?.error?.message ?? `Meta Graph request failed (${res.status}).`);
  }
  return payload;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = (process.env.APP_URL ?? url.origin).replace(/\/$/, "");
  const back = (query: string) => NextResponse.redirect(`${appUrl}/settings?${query}`);

  try {
    const auth = await getAuthContext();
    if (!auth.userId) {
      return NextResponse.redirect(`${appUrl}/login?next=${encodeURIComponent("/settings")}`);
    }

    const jar = await cookies();
    const expectedState = jar.get(META_OAUTH_STATE_COOKIE)?.value;
    // Multi-tenant: the cookie must agree with the session's active store —
    // the connection is written to the session store, never a foreign one.
    const cookieStoreId = jar.get(META_OAUTH_STORE_COOKIE)?.value || null;
    if (!auth.storeId || (cookieStoreId && cookieStoreId !== auth.storeId)) {
      return back(`meta_error=${encodeURIComponent("Store not resolved for this session.")}`);
    }
    const storeId = auth.storeId;
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");

    // User pressed Cancel on the dialog.
    if (url.searchParams.get("error")) {
      return back(`meta_error=${encodeURIComponent(url.searchParams.get("error_description") ?? "Connection canceled.")}`);
    }
    if (!code) return back(`meta_error=${encodeURIComponent("Missing OAuth code from Meta.")}`);
    if (!expectedState || !state || state !== expectedState) {
      return back(`meta_error=${encodeURIComponent("OAuth state mismatch — please try connecting again.")}`);
    }

    const clientId = process.env.META_ADS_CLIENT_ID?.trim();
    const clientSecret = process.env.META_ADS_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return back(`meta_error=${encodeURIComponent("META_ADS_CLIENT_ID / META_ADS_CLIENT_SECRET are not configured.")}`);
    }
    const redirectUri = `${appUrl}/api/meta-ads/oauth/callback`;

    // code → short-lived token → long-lived token.
    const shortTok = await graphGet("/oauth/access_token", {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code
    });
    const longTok = await graphGet("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: String(shortTok.access_token)
    });
    const accessToken = String(longTok.access_token ?? shortTok.access_token);

    const accounts = await listMetaAdAccounts(accessToken);
    if (accounts.length === 0) {
      return back(`meta_error=${encodeURIComponent("This Facebook user has no ad accounts. Ask for access to the ad account and try again.")}`);
    }

    const pinned = await getMetaAdAccountPin(storeId);
    let response: NextResponse;

    if (pinned) {
      // Renewal: a locked store keeps its account, full stop. If this login
      // cannot see it, nothing changes.
      const kept = accounts.find((a) => normalizeMetaAdAccountId(a.id) === pinned) ?? null;
      if (!kept) {
        return back(
          `meta_error=${encodeURIComponent(
            `The Facebook login you used has no access to this store's locked ad account (${pinned}). The connection was not changed.`
          )}`
        );
      }
      await saveMetaAdsConnection({
        storeId,
        accessToken,
        adAccountId: kept.id,
        appId: clientId,
        appSecret: clientSecret,
        // Already long-lived — the save service must not try another exchange.
        exchangeToken: false
      });
      await clearMetaPendingConnection(storeId).catch(() => null);
      response = back(`meta_connected=true&meta_kept=1&meta_account=${encodeURIComponent(kept.name ?? kept.id)}`);
    } else {
      // Not locked: park the login and let the owner choose. No account is
      // picked on their behalf, so no data can be pulled yet.
      await setMetaPendingConnection(storeId, { accessToken, appId: clientId });
      response = back(`meta_pick=1&meta_accounts=${accounts.length}`);
    }

    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_OAUTH_STORE_COOKIE);
    return response;
  } catch (error) {
    return back(`meta_error=${encodeURIComponent(toErrorMessage(error))}`);
  }
}
