import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  GenerationFailedError,
  retryAssetGeneration
} from "@/lib/services/creative-project-service";

// POST /api/creative/projects/[projectId]/assets/[assetId]/retry
// Re-runs the same provider+brief against the project's first source image
// and updates the existing asset row in place. Returns the refreshed asset
// summary (status=ready) on success, or a 502 with the failure attached.
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; assetId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { projectId, assetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    try {
      const asset = await retryAssetGeneration(storeId, assetId);
      return NextResponse.json({ ok: true, projectId, asset });
    } catch (error) {
      if (error instanceof GenerationFailedError) {
        return NextResponse.json(
          { ok: false, projectId, asset: error.asset, error: error.message },
          { status: 502 }
        );
      }
      throw error;
    }
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
