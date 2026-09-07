import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveScopedStoreId } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { getMetaAdAccountPin, setMetaAdAccountPin } from "@/lib/services/meta-ads-account-pin";

// POST /api/meta-ads/connection/pin  { storeId?, pinned: boolean }
//   pinned=true  → lock the store to its CURRENT ad account
//   pinned=false → unlock (the only way to switch accounts afterwards)
// GET  /api/meta-ads/connection/pin?storeId=… → { pinned: string | null }

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = await resolveScopedStoreId(url.searchParams.get("storeId"));
    return NextResponse.json({ ok: true, pinned: await getMetaAdAccountPin(storeId) });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { storeId?: string; pinned?: unknown };
    const storeId = await resolveScopedStoreId(body.storeId);
    if (typeof body.pinned !== "boolean") throw new AppError("pinned must be a boolean.", 400);
    if (!body.pinned) {
      await setMetaAdAccountPin(storeId, null);
      return NextResponse.json({ ok: true, pinned: null });
    }
    const connection = (await (getDb() as any).metaAdsConnection.findUnique({
      where: { storeId },
      select: { adAccountId: true }
    })) as { adAccountId: string } | null;
    if (!connection) throw new AppError("Meta Ads is not connected for this store.", 400);
    await setMetaAdAccountPin(storeId, connection.adAccountId);
    return NextResponse.json({ ok: true, pinned: await getMetaAdAccountPin(storeId) });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
