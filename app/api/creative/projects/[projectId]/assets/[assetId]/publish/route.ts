import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { publishAssetToShopify } from "@/lib/services/creative-shopify-publish-service";

// POST /api/creative/projects/[projectId]/assets/[assetId]/publish
// Pushes a ready asset into the gallery of the Shopify product whose id is
// provided in the body. Accepts numeric id, GID, or admin URL.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; assetId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { projectId, assetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store. Connect Shopify first.", 400);

    const body = (await request.json().catch(() => ({}))) as {
      productId?: string;
      altText?: string;
    };
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId) {
      throw new AppError("productId is required.", 400);
    }

    const result = await publishAssetToShopify({
      storeId,
      assetId,
      targetProductId: productId,
      altText: body.altText
    });

    return NextResponse.json({ ok: true, ...result, projectId });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
