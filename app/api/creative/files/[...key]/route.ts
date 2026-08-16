import { NextResponse } from "next/server";
import { readObject } from "@/lib/services/creative-storage-service";

/**
 * Proxy route that streams an asset's bytes from whichever storage
 * backend is active (local FS or R2/S3). Browsers see the response as
 * same-origin, which sidesteps R2 CORS entirely for callers that need it
 * (notably the canvas-based asset editor, which sets `crossOrigin =
 * "anonymous"` and would otherwise blow up on un-CORS'd R2 URLs).
 *
 * The route is still safe-by-default — `readObject` requires the exact
 * storage key, which is non-guessable (cuid + scoped path under the
 * store id). Callers reach this URL only after we've handed them the
 * key via an authed API response that already checked store ownership.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  const { key } = await context.params;
  if (!key || key.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing key." }, { status: 400 });
  }
  const joined = key.map((segment) => decodeURIComponent(segment)).join("/");
  try {
    const { body, contentType } = await readObject(joined);
    return new NextResponse(body as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": contentType,
        // Short cache so the editor can revisit without re-fetching, but
        // not so long we serve stale bytes after a regen overwrites the
        // same key (rare but possible during retries).
        "cache-control": "private, max-age=300"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    // Local-FS ENOENT and R2 NoSuchKey both map to 404 for the caller.
    if (/ENOENT|NoSuchKey|NotFound|does not exist/i.test(message)) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
