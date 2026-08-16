import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { readObject } from "@/lib/services/creative-storage-service";

// GET /api/creative/projects/[projectId]/assets/[assetId]/download
//
// Same-origin download proxy. The asset.fileUrl returned by the project
// detail endpoint is a presigned R2 URL — cross-origin. The HTML
// `<a download>` attribute is silently IGNORED for cross-origin URLs
// (browser spec), so clicking the existing download button just opened
// the image in a new tab. This endpoint streams the same bytes through
// our origin with `Content-Disposition: attachment`, which the browser
// always honors.

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
      where: { id: assetId, projectId, project: { storeId } },
      select: {
        id: true,
        storageKey: true,
        status: true,
        project: { select: { name: true } }
      }
    });
    if (!asset) throw new AppError("Asset not found.", 404);
    if (!asset.storageKey) {
      throw new AppError("Asset is not ready to download yet.", 400);
    }

    const obj = await readObject(asset.storageKey);
    const ext = extFromContentType(obj.contentType);
    const projectSlug = sanitizeFilename(asset.project?.name ?? "creative");
    const filename = `${projectSlug}-${asset.id.slice(0, 8)}.${ext}`;

    return new Response(new Uint8Array(obj.body), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(obj.body.length),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

function sanitizeFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      // Keep Hebrew/Latin letters + digits; replace everything else with -.
      .replace(/[^\p{Letter}\p{Number}\-_]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "creative"
  );
}

function extFromContentType(contentType: string): string {
  const lower = contentType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("quicktime") || lower.includes("mov")) return "mov";
  return "bin";
}
