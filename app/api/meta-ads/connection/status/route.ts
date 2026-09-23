import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getMetaAdsConnectionSummary } from "@/lib/services/meta-ads-service";
import { getMetaAdAccountPin } from "@/lib/services/meta-ads-account-pin";
import { hasMetaPendingConnection } from "@/lib/services/meta-ads-pending-connection";
import { resolveScopedStoreId } from "@/lib/auth/guards";

// GET /api/meta-ads/connection/status?storeId=…
//   connection → the saved connection summary (null when none)
//   pinned     → the ad account the store is locked to (null when unlocked)
//   pending    → true while a Facebook login is parked and no account chosen

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = await resolveScopedStoreId(url.searchParams.get("storeId"));
    const [connection, pinned, pending] = await Promise.all([
      getMetaAdsConnectionSummary(storeId),
      getMetaAdAccountPin(storeId).catch(() => null),
      hasMetaPendingConnection(storeId).catch(() => false)
    ]);
    return NextResponse.json({ ok: true, connection, pinned, pending });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
