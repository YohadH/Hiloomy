import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { saveMetaAdsConnection } from "@/lib/services/meta-ads-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId === "string" && body.storeId) {
      await assertStoreInActiveOrg(body.storeId);
    }
    const result = await saveMetaAdsConnection({
      storeId: typeof body.storeId === "string" ? body.storeId : null,
      accessToken: typeof body.accessToken === "string" ? body.accessToken : "",
      adAccountId: typeof body.adAccountId === "string" ? body.adAccountId : "",
      appId: typeof body.appId === "string" ? body.appId : null,
      appSecret: typeof body.appSecret === "string" ? body.appSecret : null,
      exchangeToken: typeof body.exchangeToken === "boolean" ? body.exchangeToken : true
    });

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
