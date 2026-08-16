// Helper endpoint for the launcher UI — returns the Meta pages + pixels
// available for the active store, so the operator can pick which page
// runs the ads and which pixel tracks conversions before publishing.
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/encryption";
import { listMetaPages, listMetaPixels } from "@/lib/clients/meta-marketing-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const db = getDb();
    const conn = await db.metaAdsConnection.findUnique({ where: { storeId } });
    if (!conn) {
      return NextResponse.json({ ok: true, connected: false, pages: [], pixels: [] });
    }
    const auth = {
      accessToken: decryptSecret(conn.accessTokenEnc),
      adAccountId: conn.adAccountId,
      appSecret: conn.appSecretEnc ? decryptSecret(conn.appSecretEnc) : null
    };
    // Either of these may fail if the token lacks the `pages_show_list`
    // or `ads_management` scope. Surface the partial result rather than
    // 500ing — the UI can show a clearer "please re-auth" hint.
    const [pages, pixels] = await Promise.all([
      listMetaPages(auth).catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
      listMetaPixels(auth).catch((err) => ({ error: err instanceof Error ? err.message : String(err) }))
    ]);
    return NextResponse.json({
      ok: true,
      connected: true,
      pages: Array.isArray(pages) ? pages : [],
      pixels: Array.isArray(pixels) ? pixels : [],
      errors: {
        pages: Array.isArray(pages) ? null : (pages as { error: string }).error,
        pixels: Array.isArray(pixels) ? null : (pixels as { error: string }).error
      }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
