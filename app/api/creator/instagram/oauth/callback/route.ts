import { NextResponse } from "next/server";
import { exchangeInstagramCodeForToken, saveInstagramConnection } from "@/lib/services/instagram-service";
import { toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  if (!code) {
    const error = encodeURIComponent(url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Instagram did not return an authorization code.");
    return NextResponse.redirect(`${appUrl}/settings?instagram_error=${error}`);
  }

  try {
    // Multi-tenant: the connection belongs to the store active in the
    // session that started the OAuth dance — never a global default.
    const auth = await getAuthContext();
    if (!auth.userId) {
      return NextResponse.redirect(`${appUrl}/login?next=${encodeURIComponent("/settings")}`);
    }
    const token = await exchangeInstagramCodeForToken(code);
    await saveInstagramConnection(token.accessToken, auth.storeId);
    return NextResponse.redirect(`${appUrl}/settings?instagram=connected`);
  } catch (error) {
    // Log the real reason: this path fails silently for the user (they land
    // back on /settings still "not connected"). The usual causes are a
    // redirect_uri not registered verbatim in the Meta app's Instagram
    // product, or an IG account that isn't a professional (business/creator)
    // account — both only visible here (2 Sep 2026).
    console.error("[instagram/oauth/callback] connect failed:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(`${appUrl}/settings?instagram_error=${encodeURIComponent(toErrorMessage(error))}`);
  }
}
