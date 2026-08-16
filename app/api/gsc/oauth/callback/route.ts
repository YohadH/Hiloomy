import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";
import { decodeGscOAuthState, handleGscOAuthCallback } from "@/lib/services/gsc-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/gsc/oauth/callback?code=<code>&state=<state>
 *
 * Google redirects here after consent. We validate the session, recover the
 * storeId from the signed-in flow's `state`, exchange the code for tokens, and
 * persist the encrypted refresh token, then bounce back to /settings.
 *
 * Auth: re-checks the Supabase session in-route (the global middleware also
 * gates this path; this is defence in depth).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const fail = (message: string) =>
    NextResponse.redirect(`${appUrl}/settings?gsc_error=${encodeURIComponent(message)}`);

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
    if (!code) {
      return fail("Google did not return an authorization code.");
    }

    const decoded = decodeGscOAuthState(url.searchParams.get("state"));
    if (!decoded) {
      return fail("Google Search Console OAuth state was missing or invalid.");
    }

    await handleGscOAuthCallback(code, decoded.storeId);

    return NextResponse.redirect(`${appUrl}/settings?gsc_connected=true`);
  } catch (error) {
    // Surface a clear message; AppError carries an HTTP status but we always
    // redirect the browser back to settings with the message in the query.
    void (error instanceof AppError ? error.statusCode : 500);
    return fail(toErrorMessage(error));
  }
}
