import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth/session";
import { saveMetaAdsConnection } from "@/lib/services/meta-ads-service";
import { toErrorMessage } from "@/lib/server/errors";
import { META_OAUTH_STATE_COOKIE, META_OAUTH_STORE_COOKIE } from "@/lib/meta-oauth";

// One-click Meta Ads connect — step 2: Facebook redirects back here with a
// code. Exchange it for a long-lived user token, auto-pick the ad account
// (first active one), and persist through the existing save service (which
// encrypts the token + records token health). Lands back on /settings with
// ?meta_connected=true or ?meta_error=<message>.

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

    // Auto-pick the ad account: first ACTIVE (account_status=1), else first.
    const accounts = await graphGet("/me/adaccounts", {
      fields: "id,name,account_status,currency",
      limit: "25",
      access_token: accessToken
    });
    const list: Array<{ id: string; name?: string; account_status?: number }> = accounts?.data ?? [];
    if (list.length === 0) {
      return back(`meta_error=${encodeURIComponent("This Facebook user has no ad accounts. Ask for access to the ad account and try again.")}`);
    }
    const picked = list.find((a) => a.account_status === 1) ?? list[0];

    await saveMetaAdsConnection({
      storeId,
      accessToken,
      adAccountId: picked.id,
      appId: clientId,
      appSecret: clientSecret,
      // Already long-lived — the save service must not try another exchange.
      exchangeToken: false
    });

    const response = back(
      `meta_connected=true&meta_account=${encodeURIComponent(picked.name ?? picked.id)}${list.length > 1 ? "&meta_multi=1" : ""}`
    );
    response.cookies.delete(META_OAUTH_STATE_COOKIE);
    response.cookies.delete(META_OAUTH_STORE_COOKIE);
    return response;
  } catch (error) {
    return back(`meta_error=${encodeURIComponent(toErrorMessage(error))}`);
  }
}
