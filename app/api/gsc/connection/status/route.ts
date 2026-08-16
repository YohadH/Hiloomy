import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { GSC_PLATFORM } from "@/lib/services/gsc-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/gsc/connection/status?storeId=<id>
 *
 * Returns the Google Search Console PlatformConnection status for the store
 * (without exposing the encrypted refresh token). Used by the settings page
 * to render the connection card state.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId")?.trim();
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "storeId is required." }, { status: 400 });
    }

    await assertStoreInActiveOrg(storeId);

    const db = getDb();
    const conn = await db.platformConnection.findUnique({
      where: { storeId_platform: { storeId, platform: GSC_PLATFORM } },
      select: {
        status: true,
        tokenLastFour: true,
        healthMessage: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      ok: true,
      connection: conn
        ? {
            status: conn.status,
            tokenLastFour: conn.tokenLastFour,
            healthMessage: conn.healthMessage,
            lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
            connectedAt: conn.createdAt.toISOString(),
            updatedAt: conn.updatedAt.toISOString()
          }
        : null
    });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
