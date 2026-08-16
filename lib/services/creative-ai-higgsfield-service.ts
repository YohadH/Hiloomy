// Higgsfield AI provider client — thin wrapper around the modern
// higgsfield-client. The original implementation in this file talked to
// `/v1/assets` and `/v1/generations`, which DO NOT EXIST on Higgsfield's
// current API and were returning Cloudflare 521s. The correct surface lives
// in `lib/clients/higgsfield-client.ts`:
//
//   POST /v1/text2image/soul    (with `params` wrapper + enum width_and_height)
//   GET  /v1/job-sets/{id}      (note: hyphen, not underscore)
//
// We delegate here so the existing call sites (creative-ai-image-service.ts
// for the "/creative/new" wizard) keep their function signatures, but
// route to the working endpoints.
//
// Reference images: Higgsfield wants a URL it can fetch publicly. The caller
// either passes `referenceImageUrl` (preferred — already-hosted on R2 or our
// proxy) or `referenceImageBuffer` (legacy — we upload it to R2 under a
// `sources/_higgsfield-tmp/` scope and pass that URL). When the storage
// backend is `local`, the relative `/api/creative/files/...` path is NOT
// reachable from Higgsfield's data centres — so a buffer-only call with
// local backend is logged + sent without a reference (degrades to text-only).

import type { BuiltPrompt } from "@/lib/services/creative-prompt-templates";
import type { CreativeAspectRatio } from "@/lib/domain/creative-types";
import {
  createHiggsfieldJob,
  downloadHiggsfieldAsset,
  pollHiggsfieldUntilDone,
  type HiggsfieldCreateJobInput
} from "@/lib/clients/higgsfield-client";
import {
  buildStorageKey,
  getReadableUrl,
  putObject,
  suggestFilename
} from "@/lib/services/creative-storage-service";
import { randomUUID } from "node:crypto";

// Map our internal CreativeAspectRatio strings to the modern client's
// supported set. Falls back to 9:16 (Soul's default) for anything else.
function toClientAspect(ratio: CreativeAspectRatio): HiggsfieldCreateJobInput["aspectRatio"] {
  if (ratio === "1:1" || ratio === "4:5" || ratio === "9:16" || ratio === "16:9") return ratio;
  return "9:16";
}

function extFromContentType(ct: string | null | undefined): string {
  if (!ct) return "bin";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  return "bin";
}

// Upload a reference image buffer to R2 (or local FS) so Higgsfield has a URL
// to fetch from. Uses a synthetic "sources" scope under a sentinel storeId
// so we don't pollute any real store namespace.
async function hostReferenceImageBuffer(input: {
  buffer: Buffer;
  contentType: string;
}): Promise<{ url: string; backend: "s3" | "local" }> {
  const backend = (process.env.CREATIVE_STORAGE_BACKEND ?? "local").toLowerCase();
  const isS3 = backend === "s3" || backend === "r2";
  const key = buildStorageKey({
    storeId: "_system",
    scope: "sources",
    segments: ["higgsfield-tmp"],
    filename: suggestFilename(null, extFromContentType(input.contentType)) || `${randomUUID()}.${extFromContentType(input.contentType)}`
  });
  await putObject({ key, body: input.buffer, contentType: input.contentType });
  const url = await getReadableUrl(key);
  return { url, backend: isS3 ? "s3" : "local" };
}

export interface HiggsfieldGenerateImageInput {
  prompt: BuiltPrompt;
  aspectRatio: CreativeAspectRatio;
  // Preferred: a publicly-fetchable URL Higgsfield can pull. If absent and
  // a buffer is provided, we host the buffer first.
  referenceImageUrl?: string | null;
  referenceImageBuffer?: { buffer: Buffer; contentType: string } | null;
  seed?: number;
  model?: string;
}

export interface HiggsfieldGenerateImageOutput {
  buffer: Buffer;
  contentType: string;
  modelUsed: string;
  promptUsed: string;
  seedUsed: number | null;
}

export async function higgsfieldGenerateImage(
  input: HiggsfieldGenerateImageInput
): Promise<HiggsfieldGenerateImageOutput> {
  let referenceUrl = input.referenceImageUrl ?? null;
  if (!referenceUrl && input.referenceImageBuffer) {
    const hosted = await hostReferenceImageBuffer(input.referenceImageBuffer);
    if (hosted.backend === "local") {
      // Local backend yields a relative `/api/creative/files/...` path —
      // Higgsfield can't reach localhost. Drop the reference and proceed
      // text-only so we at least produce something instead of failing.
      console.warn(
        "[higgsfield-service] CREATIVE_STORAGE_BACKEND=local — Higgsfield cannot fetch local proxy URLs. Reference image dropped; generating text-only."
      );
      referenceUrl = null;
    } else {
      referenceUrl = hosted.url;
    }
  }

  const job = await createHiggsfieldJob({
    assetType: "image",
    prompt: input.prompt.prompt,
    aspectRatio: toClientAspect(input.aspectRatio),
    referenceImageUrl: referenceUrl
  });
  const completed = job.status === "completed" ? job : await pollHiggsfieldUntilDone(job.id);
  if (completed.status !== "completed" || !completed.assetUrl) {
    throw new Error(
      completed.errorMessage || `Higgsfield job ended in status=${completed.status}`
    );
  }
  const buffer = await downloadHiggsfieldAsset(completed.assetUrl);
  return {
    buffer,
    contentType: completed.assetMimeType || "image/png",
    modelUsed: `higgsfield/${input.model || process.env.HIGGSFIELD_IMAGE_MODEL || "soul"}`,
    promptUsed: input.prompt.prompt,
    seedUsed: typeof input.seed === "number" ? input.seed : null
  };
}

export interface HiggsfieldGenerateVideoInput {
  prompt: BuiltPrompt;
  aspectRatio: CreativeAspectRatio;
  // Higgsfield is image-to-video — a source frame is required.
  referenceImageBuffer?: { buffer: Buffer; contentType: string } | null;
  referenceImageUrl?: string | null;
  durationSeconds?: number;
  seed?: number;
  model?: string;
}

export interface HiggsfieldGenerateVideoOutput {
  buffer: Buffer;
  contentType: string;
  modelUsed: string;
  promptUsed: string;
  seedUsed: number | null;
  durationMs: number | null;
}

export async function higgsfieldGenerateVideo(
  input: HiggsfieldGenerateVideoInput
): Promise<HiggsfieldGenerateVideoOutput> {
  let referenceUrl = input.referenceImageUrl ?? null;
  if (!referenceUrl && input.referenceImageBuffer) {
    const hosted = await hostReferenceImageBuffer(input.referenceImageBuffer);
    if (hosted.backend === "local") {
      throw new Error(
        "Higgsfield video requires a publicly-fetchable reference image, but CREATIVE_STORAGE_BACKEND is set to 'local'. Set it to 'r2' or 's3' to enable Higgsfield video."
      );
    }
    referenceUrl = hosted.url;
  }
  if (!referenceUrl) {
    throw new Error("Higgsfield video requires a reference image (URL or buffer).");
  }

  const job = await createHiggsfieldJob({
    assetType: "video",
    prompt: input.prompt.prompt,
    aspectRatio: toClientAspect(input.aspectRatio),
    referenceImageUrl: referenceUrl,
    durationSec: input.durationSeconds ?? 6
  });
  const completed = job.status === "completed" ? job : await pollHiggsfieldUntilDone(job.id);
  if (completed.status !== "completed" || !completed.assetUrl) {
    throw new Error(
      completed.errorMessage || `Higgsfield video job ended in status=${completed.status}`
    );
  }
  const buffer = await downloadHiggsfieldAsset(completed.assetUrl);
  return {
    buffer,
    contentType: completed.assetMimeType || "video/mp4",
    modelUsed: `higgsfield/${input.model || process.env.HIGGSFIELD_VIDEO_MODEL || "dop"}`,
    promptUsed: input.prompt.prompt,
    seedUsed: typeof input.seed === "number" ? input.seed : null,
    durationMs: completed.durationMs ?? (input.durationSeconds ?? 6) * 1000
  };
}
