import { NextResponse } from "next/server";
import { Readable } from "node:stream";

// archiver is CommonJS (`export = archiver`) which trips Next's static
// "default export" check at any import site. We load it dynamically inside
// the handler so the bundler doesn't try to verify the shape statically.
type ArchiveFn = (
  format: "zip",
  options?: { zlib?: { level?: number } }
) => {
  append(input: Buffer | string, data: { name: string }): void;
  finalize(): void;
};
async function loadArchiver(): Promise<ArchiveFn> {
  const mod = (await import("archiver")) as unknown as { default?: ArchiveFn } & ArchiveFn;
  return (mod.default ?? mod) as ArchiveFn;
}
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";
import { readObject } from "@/lib/services/creative-storage-service";
import { toErrorMessage } from "@/lib/server/errors";

// GET /api/creative/projects/[projectId]/export
// Streams a ZIP archive of every "ready" asset on the project. Used by the
// "Download all" button. Each file is named:
//   <project-name>/<index>-<status>.<ext>
// so the user can drop the archive straight into a bulk-upload tool.
//
// We pipe Sharp/Replicate buffers straight into the archive via Readable
// streams — no temp files, no disk pressure even on 100-asset projects.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { projectId } = await context.params;
    const storeId = await resolveActiveStoreId();
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "No active store." }, { status: 400 });
    }
    const db = getDb();
    const project = await db.creativeProject.findFirst({
      where: { id: projectId, storeId },
      include: {
        assets: {
          where: { status: "ready", storageKey: { not: null } },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }
    if (project.assets.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No ready assets to export." },
        { status: 400 }
      );
    }

    const createArchive = await loadArchiver();
    const archive = createArchive("zip", { zlib: { level: 6 } });
    const folder = sanitizeFolderName(project.name) || "creative-export";

    // Append each asset as a stream. We resolve all bytes up front because
    // the local backend reads from disk and R2 reads from S3 — both are
    // fast enough to be in-memory at v1 batch sizes (≤ 100 assets).
    for (let i = 0; i < project.assets.length; i += 1) {
      const asset = project.assets[i];
      const key = asset.storageKey;
      if (!key) continue;
      try {
        const obj = await readObject(key);
        const ext = extFromContentType(obj.contentType);
        const filename = `${folder}/${String(i + 1).padStart(3, "0")}-${asset.id.slice(0, 8)}.${ext}`;
        archive.append(obj.body, { name: filename });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        archive.append(`Failed to read asset ${asset.id}: ${text}\n`, {
          name: `${folder}/_errors.txt`
        });
      }
    }

    archive.finalize();

    // Convert the archiver Node stream to a Web ReadableStream so Next can
    // ship it as the response body. The Readable.toWeb() helper is available
    // on Node 18+.
    const webStream = Readable.toWeb(archive as unknown as Readable) as ReadableStream;
    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${folder}.zip"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}

function sanitizeFolderName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\-. ]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
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
