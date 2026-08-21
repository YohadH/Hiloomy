import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";
import { getGa4OAuthUrl } from "@/lib/services/ga4-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/ga4/oauth/start?storeId=<id>
 *
 * Begins the Google Analytics OAuth flow — same shape as the GSC start
 * route: validate the session, build the consent URL, redirect to Google.
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

    return NextResponse.redirect(getGa4OAuthUrl(storeId));
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.redirect(
      `${appUrl}/settings?ga4_error=${encodeURIComponent(toErrorMessage(error))}`,
      { status: status >= 300 && status < 400 ? status : 302 }
    );
  }
}
