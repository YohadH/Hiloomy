import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { ACTIVE_ORG_COOKIE, getAuthContext } from "@/lib/auth/session";
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
 * After a successful install: where should the signed-in installer land?
 *
 *  - Not signed in (partner clicked the install link cold): nothing to do.
 *  - Member of the store's org: make it their active org.
 *  - Holds a pending invitation to that org (the design-partner case — the
 *    invite email may never have arrived): accept it now, then as above.
 *  - Neither: flag the mismatch so /settings can explain instead of showing
 *    "connected" and "not connected" at once.
 */
async function resolveInstallerLanding(
  storeId: string
): Promise<{ activeOrgId: string | null; orgMismatch: boolean }> {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return { activeOrgId: null, orgMismatch: false };
    const db = getDb();
    const store = (await db.store.findUnique({ where: { id: storeId }, select: { orgId: true } })) as {
      orgId: string | null;
    } | null;
    if (!store?.orgId) return { activeOrgId: null, orgMismatch: false };

    const member = await db.membership.findFirst({
      where: { userId: auth.userId, orgId: store.orgId },
      select: { id: true }
    });
    if (member) return { activeOrgId: store.orgId, orgMismatch: false };

    const invitation = auth.email
      ? ((await db.invitation.findFirst({
          where: {
            orgId: store.orgId,
            email: { equals: auth.email, mode: "insensitive" },
            expiresAt: { gt: new Date() }
          },
          select: { id: true, role: true }
        })) as { id: string; role: string } | null)
      : null;
    if (invitation) {
      await db.$transaction([
        db.membership.create({ data: { userId: auth.userId, orgId: store.orgId, role: invitation.role } }),
        db.invitation.delete({ where: { id: invitation.id } })
      ]);
      return { activeOrgId: store.orgId, orgMismatch: false };
    }
    return { activeOrgId: null, orgMismatch: true };
  } catch (error) {
    console.warn("[shopify-oauth] installer landing resolution failed:", error instanceof Error ? error.message : error);
    return { activeOrgId: null, orgMismatch: false };
  }
}

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

    // 6. Land the installer INSIDE the org the store was bound to.
    //
    // Design-partner installs bind the store to the org registered under
    // Settings → Design partners — which is usually NOT the installer's
    // current org (a partner who just signed up sits in an empty personal
    // org). Redirecting them to /settings of that empty org showed
    // "connected successfully" and "not connected" on the same screen
    // (Take a Nap, 1 Sep 2026). So: if the installer holds a pending
    // invitation to the store's org, accept it here; if they are (now) a
    // member, switch their active org; otherwise say where the store went.
    const landing = await resolveInstallerLanding(result.storeId);

    const params = new URLSearchParams({ shopify: "connected", shop: result.shopDomain });
    if (landing.orgMismatch) params.set("org_mismatch", "1");
    const response = NextResponse.redirect(`${appUrl}/settings?${params.toString()}`);
    response.cookies.delete(SHOPIFY_OAUTH_STATE_COOKIE);
    if (landing.activeOrgId) {
      response.cookies.set(ACTIVE_ORG_COOKIE, landing.activeOrgId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30
      });
    }
    return response;
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return fail(toErrorMessage(error), status);
  }
}
