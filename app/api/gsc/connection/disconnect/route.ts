import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { GSC_PLATFORM } from "@/lib/services/gsc-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * POST /api/gsc/connection/disconnect
 * Body: { storeId: string }
 *
 * Deletes the PlatformConnection row for Google Search Console, effectively
 * disconnecting the store. The encrypted refresh token is removed with it
 * (ON DELETE CASCADE does not apply here since it is in the config JSON, but
 * deleting the row removes the token).
 *
 * This does NOT delete SearchConsoleMetric / SearchConsolePage /
 * SearchConsoleQuery rows — historical data is preserved so reconnecting
 * resumes where it left off.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeId = typeof body?.storeId === "string" ? body.storeId.trim() : "";
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "storeId is required." }, { status: 400 });
    }

    await assertStoreInActiveOrg(storeId);

    const db = getDb();
    await db.platformConnection.deleteMany({
      where: { storeId, platform: GSC_PLATFORM }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
