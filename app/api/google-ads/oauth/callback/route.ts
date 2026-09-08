import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";
import { requireSessionStoreId } from "@/lib/auth/require-store";
import { decodeGoogleAdsOAuthState, handleGoogleAdsOAuthCallback } from "@/lib/services/google-ads-service";
import { toErrorMessage } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

// GET /api/google-ads/oauth/callback?code=&state= — GA4-callback shape.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const fail = (message: string) => NextResponse.redirect(`${appUrl}/settings?googleads_error=${encodeURIComponent(message)}`);
  try {
    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const oauthError = url.searchParams.get("error");
    if (oauthError) return fail(url.searchParams.get("error_description") ?? oauthError);
    const code = url.searchParams.get("code");
    if (!code) return fail("Google did not return an authorization code.");
    const decoded = decodeGoogleAdsOAuthState(url.searchParams.get("state"));
    if (!decoded) return fail("Google Ads OAuth state was missing or invalid.");
    const session = await requireSessionStoreId(decoded.storeId);
    if (!session) return fail("Store not resolved for this session.");
    await handleGoogleAdsOAuthCallback(code, session.storeId);
    return NextResponse.redirect(`${appUrl}/settings?googleads_connected=true`);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
