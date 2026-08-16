import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import {
  exchangeShopifyCode,
  normalizeOauthShopDomain,
  persistOauthConnection,
  SHOPIFY_OAUTH_STATE_COOKIE,
  verifyOauthHmac,
  verifyOauthState
} from "@/lib/services/shopify-oauth-service";

export const dynamic = "force-dynamic";

/**
 * OAuth callback. Shopify redirects here with: code, hmac, host, shop, state, timestamp.
 *
 *   GET /api/shopify/oauth/callback
 *
 * Security order (fail closed): validate shop domain -> verify HMAC ->
 * verify signed state nonce -> exchange code -> persist encrypted token.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const fail = (message: string, status = 400) => {
    const response = NextResponse.redirect(`${appUrl}/settings?shopify_error=${encodeURIComponent(message)}`);
    response.cookies.delete(SHOPIFY_OAUTH_STATE_COOKIE);
    return response;
  };

  try {
    const code = url.searchParams.get("code");
    if (!code) {
      return fail(url.searchParams.get("error_description") ?? "Shopify did not return an authorization code.");
    }

    // 1. shop domain must be a real *.myshopify.com host (anti open-redirect / SSRF).
    const shopDomain = normalizeOauthShopDomain(url.searchParams.get("shop"));

    // 2. HMAC over the query string, signed with the app's client secret.
    if (!(await verifyOauthHmac(url.searchParams))) {
      return fail("Shopify OAuth HMAC validation failed.", 401);
    }

    // 3. CSRF: the returned state must match the signed nonce cookie we set on install.
    const stateCookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SHOPIFY_OAUTH_STATE_COOKIE}=`))
      ?.slice(SHOPIFY_OAUTH_STATE_COOKIE.length + 1);

    const stateValid = await verifyOauthState({
      shopDomain,
      returnedState: url.searchParams.get("state"),
      signedStateCookie: stateCookie ? decodeURIComponent(stateCookie) : null
    });
    if (!stateValid) {
      return fail("Shopify OAuth state validation failed.", 403);
    }

    // 4. Exchange the temporary code for a permanent Admin API access token.
    const token = await exchangeShopifyCode(shopDomain, code);

    // 5. Persist (token encrypted at rest) scoped to the shop.
    const result = await persistOauthConnection({
      shopDomain,
      accessToken: token.accessToken,
      scope: token.scope
    });

    const response = NextResponse.redirect(
      `${appUrl}/settings?shopify=connected&shop=${encodeURIComponent(result.shopDomain)}`
    );
    response.cookies.delete(SHOPIFY_OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return fail(toErrorMessage(error), status);
  }
}
