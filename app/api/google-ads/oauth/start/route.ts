import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";
import { requireSessionStoreId } from "@/lib/auth/require-store";
import { getGoogleAdsOAuthUrl } from "@/lib/services/google-ads-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

// GET /api/google-ads/oauth/start?storeId=<id> — same shape as the GA4 start route.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  try {
    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await requireSessionStoreId(url.searchParams.get("storeId"));
    if (!session) return NextResponse.json({ error: "Store not resolved for this session." }, { status: 403 });
    return NextResponse.redirect(getGoogleAdsOAuthUrl(session.storeId));
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.redirect(`${appUrl}/settings?googleads_error=${encodeURIComponent(toErrorMessage(error))}`, {
      status: status >= 300 && status < 400 ? status : 302
    });
  }
}
