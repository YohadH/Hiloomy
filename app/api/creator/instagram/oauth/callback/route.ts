import { NextResponse } from "next/server";
import { exchangeInstagramCodeForToken, saveInstagramConnection } from "@/lib/services/instagram-service";
import { toErrorMessage } from "@/lib/server/errors";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  if (!code) {
    const error = encodeURIComponent(url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Instagram did not return an authorization code.");
    return NextResponse.redirect(`${appUrl}/settings?instagram_error=${error}`);
  }

  try {
    const token = await exchangeInstagramCodeForToken(code);
    await saveInstagramConnection(token.accessToken);
    return NextResponse.redirect(`${appUrl}/settings?instagram=connected`);
  } catch (error) {
    return NextResponse.redirect(`${appUrl}/settings?instagram_error=${encodeURIComponent(toErrorMessage(error))}`);
  }
}
