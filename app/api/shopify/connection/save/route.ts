import { NextResponse } from "next/server";
import { saveShopifyCredentials } from "@/lib/services/shopify-connection-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";

export async function POST(request: Request) {
  // SA-BUG-044: auth guard — caller is shopify-connection-manager.tsx (authenticated settings UI)
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    const result = await saveShopifyCredentials({
      shopDomain: body.shopDomain,
      adminAccessToken: body.adminAccessToken
    });

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
