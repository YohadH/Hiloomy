import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";
import { getGscOAuthUrl } from "@/lib/services/gsc-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/gsc/oauth/start?storeId=<id>
 *
 * Begins the Google Search Console OAuth flow: validate the session, build the
 * Google consent URL for the store, and redirect the browser to Google.
 *
 * Auth: the global middleware already gates everything outside the public
 * allowlist, but we re-check the Supabase session in-route (defence in depth)
 * so this endpoint is never reachable unauthenticated even if the allowlist
 * changes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  try {
    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storeId = url.searchParams.get("storeId")?.trim();
    if (!storeId) {
      return NextResponse.json({ error: "storeId query parameter is required." }, { status: 400 });
    }

    const consentUrl = getGscOAuthUrl(storeId);
    return NextResponse.redirect(consentUrl);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.redirect(
      `${appUrl}/settings?gsc_error=${encodeURIComponent(toErrorMessage(error))}`,
      { status: status >= 300 && status < 400 ? status : 302 }
    );
  }
}
