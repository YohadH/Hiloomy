import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  buildStorageKey,
  getReadableUrl,
  putObject,
  readObject,
  suggestFilename
} from "@/lib/services/creative-storage-service";
import { trimAndOverlay } from "@/lib/server/creative-video-pipeline";
import type { TextOverlay } from "@/lib/domain/creative-types";

// PATCH /api/creative/projects/[projectId]/assets/[assetId]/video-edit
// Save trim + overlay state, re-render via ffmpeg, replace the asset's
// storageKey / thumbStorageKey. Always re-renders from rawStorageKey so the
// edit is idempotent (re-edits don't stack overlays on overlays).
export const dynamic = "force-dynamic";
export const maxDuration = 180;

interface PatchBody {
  trim?: { startSec?: number; endSec?: number };
  overlays?: TextOverlay[];
  // Optional intrinsic dimensions from the client's <video> element. The
  // pipeline probes the source if missing, but using the client value when
  // available saves a probe and keeps the SVG layout consistent with what
  // the user saw in the Konva preview.
  width?: number;
  height?: number;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; assetId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { projectId, assetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const body = (await request.json().catch(() => ({}))) as PatchBody;
    const overlays: TextOverlay[] = Array.isArray(body.overlays)
      ? body.overlays.filter(isValidOverlay)
      : [];
    const startSec = Number(body.trim?.startSec ?? 0);
    const endSec = Number(body.trim?.endSec ?? 0);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      throw new AppError("Invalid trim range.", 400);
    }

    const db = getDb();
    const asset = await db.creativeAsset.findFirst({
      where: { id: assetId, projectId, project: { storeId } }
    });
    if (!asset) throw new AppError("Asset not found.", 404);
    if (asset.assetType !== "VIDEO") {
      throw new AppError("Only VIDEO assets can be video-edited.", 400);
    }
    const sourceKey = asset.rawStorageKey ?? asset.storageKey;
    if (!sourceKey) throw new AppError("Asset has no source video to edit.", 400);

    const source = await readObject(sourceKey);
    const result = await trimAndOverlay({
      baseVideo: source.body,
      trim: { startSec, endSec },
      overlays,
      width: typeof body.width === "number" ? Math.round(body.width) : undefined,
      height: typeof body.height === "number" ? Math.round(body.height) : undefined
    });

    const finalKey = buildStorageKey({
      storeId,
      scope: "assets",
      segments: [projectId, assetId],
      filename: suggestFilename(null, "mp4")
    });
    const thumbKey = buildStorageKey({
      storeId,
      scope: "thumbs",
      segments: [projectId, assetId],
      filename: suggestFilename(null, "jpg")
    });
    await Promise.all([
      putObject({ key: finalKey, body: result.video, contentType: "video/mp4" }),
      putObject({ key: thumbKey, body: result.thumbnail, contentType: "image/jpeg" })
    ]);

    const updated = await db.creativeAsset.update({
      where: { id: assetId },
      data: {
        storageKey: finalKey,
        thumbStorageKey: thumbKey,
        overlaysJson: overlays as unknown as object,
        durationMs: result.durationMs,
        width: result.width,
        height: result.height,
        status: "ready"
      }
    });

    return NextResponse.json({
      ok: true,
      asset: {
        id: updated.id,
        fileUrl: updated.storageKey ? await getReadableUrl(updated.storageKey) : null,
        thumbUrl: updated.thumbStorageKey ? await getReadableUrl(updated.thumbStorageKey) : null,
        durationMs: updated.durationMs,
        overlays
      }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

function isValidOverlay(value: unknown): value is TextOverlay {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.xPct === "number" &&
    typeof o.yPct === "number" &&
    typeof o.widthPct === "number" &&
    typeof o.fontSizePx === "number"
  );
}
