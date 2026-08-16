// Quick-batch endpoint — Creative agent picks N visual concepts on a theme,
// Higgsfield renders them, all stored under one CreativeProject so the
// /creative history list picks them up automatically.
//
// Accepts EITHER:
//   • application/json (no custom file uploads — legacy + product-picker-only path)
//   • multipart/form-data (with optional `files[]` for ad-hoc reference
//     uploads like mood-board / vibe images that aren't in the catalog)
//
// Reference image precedence:
//   1. URLs from the picked product (sent as `referenceImageUrls[]` text fields)
//   2. URLs from operator-uploaded files (we upload each to R2, get a
//      presigned URL, and append to the reference list)
// Higgsfield gets all of them via the round-robin per slot logic in
// creative-quick-batch-service.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { runCreativeQuickBatch } from "@/lib/services/creative-quick-batch-service";
import { buildStorageKey, getReadableUrl, putObject, suggestFilename } from "@/lib/services/creative-storage-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_FILE_BYTES = 12 * 1024 * 1024; // 12MB per file
const MAX_FILES_PER_BATCH = 10;

async function uploadReferenceFile(file: File, storeId: string, batchId: string): Promise<string> {
  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    throw new AppError(`Unsupported file type: ${file.type}. Use JPEG/PNG/WebP/HEIC.`, 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AppError(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 12MB).`, 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = suggestFilename(file.name || "reference.jpg");
  const storageKey = buildStorageKey({
    storeId,
    scope: "sources",
    segments: ["quick-batch-uploads", batchId],
    filename
  });
  await putObject({ key: storageKey, body: bytes, contentType: file.type });
  // Resolve to a presigned URL (R2) or local proxy path so Higgsfield can
  // fetch it from the public web. R2 presigned URLs are valid for 1h —
  // Higgsfield mirrors the image to its own CDN within seconds, so the
  // short TTL is fine.
  return await getReadableUrl(storageKey);
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("Connect a store before running a quick batch.", 400);

    // Detect content type — branch JSON vs multipart.
    const contentType = request.headers.get("content-type") ?? "";
    let theme: string | undefined;
    let count: number | undefined;
    let aspectRatio: "9:16" | "1:1" | "4:5" | "16:9" | undefined;
    let productName: string | undefined;
    let brandNotes: string | undefined;
    const referenceImageUrls: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      theme = (form.get("theme") as string | null)?.trim() || undefined;
      const countRaw = form.get("count");
      count = countRaw != null ? Math.max(1, Math.min(10, Number(countRaw) || 1)) : undefined;
      const ar = form.get("aspectRatio") as string | null;
      if (ar === "9:16" || ar === "1:1" || ar === "4:5" || ar === "16:9") aspectRatio = ar;
      productName = (form.get("productName") as string | null)?.trim() || undefined;
      brandNotes = (form.get("brandNotes") as string | null)?.trim() || undefined;
      // Existing reference URLs (from the product picker) come through
      // as repeated text fields.
      for (const v of form.getAll("referenceImageUrls")) {
        if (typeof v === "string" && v.trim()) referenceImageUrls.push(v.trim());
      }
      // File uploads — bounded by MAX_FILES_PER_BATCH.
      const files = form
        .getAll("files")
        .filter((v): v is File => v instanceof File && v.size > 0)
        .slice(0, MAX_FILES_PER_BATCH);
      if (files.length > 0) {
        const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const uploaded = await Promise.all(files.map((f) => uploadReferenceFile(f, storeId, batchId)));
        referenceImageUrls.push(...uploaded);
      }
    } else {
      const body = (await request.json()) as {
        theme?: string;
        count?: number;
        aspectRatio?: "9:16" | "1:1" | "4:5" | "16:9";
        productName?: string;
        brandNotes?: string;
        referenceImageUrls?: string[];
      };
      theme = body.theme?.trim();
      count = body.count;
      aspectRatio = body.aspectRatio;
      productName = body.productName?.trim();
      brandNotes = body.brandNotes?.trim();
      if (Array.isArray(body.referenceImageUrls)) {
        referenceImageUrls.push(...body.referenceImageUrls.filter((u) => typeof u === "string" && u.trim()));
      }
    }

    if (!theme) throw new AppError("theme is required.", 400);

    const result = await runCreativeQuickBatch({
      storeId,
      theme,
      count,
      aspectRatio,
      productName,
      brandNotes,
      referenceImageUrls
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
