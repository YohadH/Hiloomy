import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { syncGscData, getGscSelectedSiteUrl } from "@/lib/services/gsc-service";

// POST /api/gsc/sync  { storeId }
//
// Manual "Sync now" for Search Console — same resolution the 2h cron
// uses: the explicitly-selected property first, sc-domain:<domain> as
// the fallback for connections that never picked one.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required.", 400);
    }
    await assertStoreInActiveOrg(body.storeId);

    const db = getDb();
    const store = await db.store.findUnique({
      where: { id: body.storeId },
      select: { domain: true }
    });
    if (!store) throw new AppError("Store not found.", 404);

    const selectedSite = await getGscSelectedSiteUrl(body.storeId).catch(() => null);
    const siteUrl = selectedSite ?? `sc-domain:${store.domain}`;
    const result = await syncGscData(body.storeId, siteUrl);
    return NextResponse.json({
      ok: true,
      siteUrl,
      pagesUpserted: result.pagesUpserted,
      queriesUpserted: result.queriesUpserted
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
