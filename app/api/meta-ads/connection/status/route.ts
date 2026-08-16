import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getMetaAdsConnectionSummary } from "@/lib/services/meta-ads-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId");
    if (storeId) await assertStoreInActiveOrg(storeId);
    const connection = await getMetaAdsConnectionSummary(storeId);
    return NextResponse.json({ ok: true, connection });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
