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
import { compositeImage } from "@/lib/server/creative-image-pipeline";
import type { CanvasOverlay } from "@/lib/domain/creative-types";

// PATCH /api/creative/projects/[projectId]/assets/[assetId]
// Save the in-browser editor state (overlays) and re-render the final image
// server-side via Sharp so the persisted file matches what the user sees.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; assetId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { projectId, assetId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const db = getDb();
    const asset = await db.creativeAsset.findFirst({
      where: { id: assetId, projectId, project: { storeId } }
    });
    if (!asset) throw new AppError("Asset not found.", 404);
    return NextResponse.json({
      ok: true,
      asset: {
        id: asset.id,
        projectId: asset.projectId,
        status: asset.status,
        fileUrl: asset.storageKey ? await getReadableUrl(asset.storageKey) : null,
        rawFileUrl: asset.rawStorageKey ? await getReadableUrl(asset.rawStorageKey) : null,
        overlays: (asset.overlaysJson as CanvasOverlay[] | null) ?? [],
        width: asset.width ?? null,
        height: asset.height ?? null
      }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
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

    const body = (await request.json()) as { overlays?: CanvasOverlay[] };
    const overlays: CanvasOverlay[] = Array.isArray(body.overlays)
      ? body.overlays.filter(isValidOverlay)
      : [];

    const db = getDb();
    const asset = await db.creativeAsset.findFirst({
      where: { id: assetId, projectId, project: { storeId } },
      include: { project: { select: { storeId: true } } }
    });
    if (!asset) throw new AppError("Asset not found.", 404);
    if (!asset.rawStorageKey && !asset.storageKey) {
      throw new AppError("Asset has no source image to edit.", 400);
    }

    // Always re-composite from rawStorageKey when we have one (so re-edits
    // don't burn overlays on top of overlays). Fall back to storageKey for
    // assets created before raw was populated.
    const sourceKey = asset.rawStorageKey ?? asset.storageKey;
    const source = await readObject(sourceKey!);
    const composited = await compositeImage({
      baseImage: source.body,
      overlays,
      outputFormat: "webp"
    });

    const finalKey = buildStorageKey({
      storeId,
      scope: "assets",
      segments: [projectId, assetId],
      filename: suggestFilename(null, "webp")
    });
    await putObject({ key: finalKey, body: composited.buffer, contentType: composited.contentType });

    const updated = await db.creativeAsset.update({
      where: { id: assetId },
      data: {
        storageKey: finalKey,
        thumbStorageKey: finalKey,
        overlaysJson: overlays as unknown as object,
        width: composited.width,
        height: composited.height,
        status: "ready"
      }
    });

    return NextResponse.json({
      ok: true,
      asset: {
        id: updated.id,
        fileUrl: updated.storageKey ? await getReadableUrl(updated.storageKey) : null,
        overlays
      }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

function isValidOverlay(value: unknown): value is CanvasOverlay {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string") return false;
  if (typeof o.xPct !== "number" || typeof o.yPct !== "number" || typeof o.widthPct !== "number") {
    return false;
  }
  if (o.type === "image") {
    return typeof o.dataUrl === "string" && o.dataUrl.startsWith("data:image/");
  }
  // Default to text — also covers legacy rows with no `type` field.
  return typeof o.text === "string" && typeof o.fontSizePx === "number";
}
