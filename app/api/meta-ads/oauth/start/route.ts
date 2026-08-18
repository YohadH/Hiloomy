import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuthContext } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/server/errors";
import { META_OAUTH_STATE_COOKIE, META_OAUTH_STORE_COOKIE } from "@/lib/meta-oauth";

// One-click Meta Ads connect — step 1: redirect to Facebook's OAuth dialog.
//
//   GET /api/meta-ads/oauth/start?storeId=<id>
//
// Requires META_ADS_CLIENT_ID / META_ADS_CLIENT_SECRET (a Meta app with
// Facebook Login + Marketing API, and <APP_URL>/api/meta-ads/oauth/callback
// registered as a Valid OAuth Redirect URI). A signed state nonce and the
// target store id ride in short-lived httpOnly cookies.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = (process.env.APP_URL ?? url.origin).replace(/\/$/, "");

  try {
    const auth = await getAuthContext();
    if (!auth.userId) {
      return NextResponse.redirect(`${appUrl}/login?next=${encodeURIComponent("/settings")}`);
    }

    const clientId = process.env.META_ADS_CLIENT_ID?.trim();
    if (!clientId || !process.env.META_ADS_CLIENT_SECRET?.trim()) {
      const msg = encodeURIComponent(
        "META_ADS_CLIENT_ID / META_ADS_CLIENT_SECRET are not configured on the server."
      );
      return NextResponse.redirect(`${appUrl}/settings?meta_error=${msg}`);
    }

    const storeId = url.searchParams.get("storeId") ?? "";
    const state = randomBytes(16).toString("hex");
    const redirectUri = `${appUrl}/api/meta-ads/oauth/callback`;

    const dialog = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    dialog.searchParams.set("client_id", clientId);
    dialog.searchParams.set("redirect_uri", redirectUri);
    dialog.searchParams.set("state", state);
    dialog.searchParams.set("scope", "ads_read,business_management");
    dialog.searchParams.set("response_type", "code");

    const response = NextResponse.redirect(dialog);
    const cookie = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 600
    };
    response.cookies.set(META_OAUTH_STATE_COOKIE, state, cookie);
    response.cookies.set(META_OAUTH_STORE_COOKIE, storeId, cookie);
    return response;
  } catch (error) {
    const msg = encodeURIComponent(toErrorMessage(error));
    return NextResponse.redirect(`${appUrl}/settings?meta_error=${msg}`);
  }
}
