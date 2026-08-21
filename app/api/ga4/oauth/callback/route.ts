import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";
import { decodeGa4OAuthState, handleGa4OAuthCallback } from "@/lib/services/ga4-service";
import { toErrorMessage } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/ga4/oauth/callback?code=<code>&state=<state>
 *
 * Google redirects here after consent. Exchange the code, persist the
 * encrypted refresh token, bounce back to /settings — GSC-callback shape.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const fail = (message: string) =>
    NextResponse.redirect(`${appUrl}/settings?ga4_error=${encodeURIComponent(message)}`);

  try {
    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      return fail(url.searchParams.get("error_description") ?? oauthError);
    }

    const code = url.searchParams.get("code");
    if (!code) return fail("Google did not return an authorization code.");

    const decoded = decodeGa4OAuthState(url.searchParams.get("state"));
    if (!decoded) return fail("Google Analytics OAuth state was missing or invalid.");

    await handleGa4OAuthCallback(code, decoded.storeId);
    return NextResponse.redirect(`${appUrl}/settings?ga4_connected=true`);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
