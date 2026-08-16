// Asset pipeline — Higgsfield job → poll → download → R2 mirror →
// SprintAd row update.
//
// One function per SprintAd. Called by the sprint-service in a bounded-
// concurrency loop (default 5 at a time so we don't slam Higgsfield's
// rate limits with 100 simultaneous gens).
//
// Failure handling: any throw is caught by the caller and recorded on the
// SprintAd as status="failed" + errorMessage. The cascade can still
// proceed without failed slots — they just don't get published.

import path from "node:path";
import {
  createHiggsfieldJob,
  downloadHiggsfieldAsset,
  pollHiggsfieldUntilDone,
  type HiggsfieldAssetType
} from "@/lib/clients/higgsfield-client";
import { openaiGenerateImage } from "@/lib/services/creative-ai-openai-service";
import { buildStorageKey, putObject, suggestFilename } from "@/lib/services/creative-storage-service";
import { getDb } from "@/lib/server/db";
import type { SprintBrief } from "./brief-generator";

async function downloadAsBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const arr = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { buffer: Buffer.from(arr), contentType };
}

export interface GenerateAssetInput {
  sprintAdId: string;
  storeId: string;
  sprintId: string;
  slotIndex: number;
  brief: SprintBrief;
  // Optional product image — passed to Higgsfield as a reference so the
  // gen stays on-brand for the product, not generic.
  referenceImageUrl?: string | null;
  // Override the asset type (image/video). Defaults to brief.assetType.
  assetTypeOverride?: HiggsfieldAssetType;
}

export interface GenerateAssetOutput {
  storageKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  higgsfieldJobId: string;
  higgsfieldAssetUrl: string | null;
  costUsd: number | null;
}

export async function generateSprintAsset(input: GenerateAssetInput): Promise<GenerateAssetOutput> {
  const db = getDb();
  const assetType: HiggsfieldAssetType = input.assetTypeOverride ?? input.brief.assetType;

  // 1. Mark the row as generating so the matrix board reflects state.
  await db.sprintAd.update({
    where: { id: input.sprintAdId },
    data: { status: "generating" }
  });

  // ── Provider selection ──────────────────────────────────────────────
  // Same rationale as in Quick Batch: Higgsfield Soul's image_reference
  // is STYLE-only — it can't preserve a product's identity. For ad
  // creative we MUST keep the bottle/box/label intact, so when a
  // reference image is given AND OPENAI_API_KEY is configured, route
  // through OpenAI gpt-image-1 /images/edits (the proper preservation
  // endpoint). Without a reference, Higgsfield Soul is excellent for
  // scene generation — keep using it.
  const hasReference = Boolean(input.referenceImageUrl);
  const openaiAvailable = Boolean(process.env.OPENAI_API_KEY?.trim());
  const useOpenAi = hasReference && openaiAvailable && assetType === "image";

  let bytes: Buffer;
  let mimeType: string;
  let widthFromGen: number | null = null;
  let heightFromGen: number | null = null;
  let durationMs: number | null = null;
  let providerJobId: string = "openai-edits";
  let providerAssetUrl: string | null = null;
  let providerCost: number | null = null;

  if (useOpenAi) {
    const ref = await downloadAsBuffer(input.referenceImageUrl!);
    const result = await openaiGenerateImage({
      prompt: {
        prompt: `${input.brief.visualPrompt}\n\nIMPORTANT: the uploaded product image is the canonical reference. Keep every bottle/box/package, all labels, all colors, all proportions, all branding EXACTLY identical to the source image. Do NOT redesign, recolor, resize, or relabel the product. Only the surrounding scene, lighting, composition, and props may change.`,
        negativePrompt: "",
        styleNotes: []
      },
      aspectRatio: "9:16",
      referenceImageBuffer: {
        buffer: ref.buffer,
        contentType: ref.contentType,
        label: "product (preserve identity)"
      },
      quality: "high"
    });
    bytes = result.buffer;
    mimeType = result.contentType || "image/png";
  } else {
    // Higgsfield path (no reference OR video).
    const job = await createHiggsfieldJob({
      assetType,
      prompt: input.brief.visualPrompt,
      referenceImageUrl: input.referenceImageUrl ?? null,
      aspectRatio: "9:16",
      idempotencyKey: input.sprintAdId
    });
    await db.sprintAd.update({
      where: { id: input.sprintAdId },
      data: { higgsfieldJobId: job.id }
    });
    const completed = job.status === "completed" ? job : await pollHiggsfieldUntilDone(job.id);
    if (completed.status !== "completed" || !completed.assetUrl) {
      const err = completed.errorMessage || `Higgsfield job ended in status=${completed.status}`;
      throw new Error(err);
    }
    bytes = await downloadHiggsfieldAsset(completed.assetUrl);
    mimeType = completed.assetMimeType || (assetType === "video" ? "video/mp4" : "image/png");
    widthFromGen = completed.width ?? null;
    heightFromGen = completed.height ?? null;
    durationMs = completed.durationMs ?? null;
    providerJobId = completed.id;
    providerAssetUrl = completed.assetUrl;
    providerCost = completed.costUsd ?? null;
  }

  const extFromUrl = providerAssetUrl
    ? path.extname(new URL(providerAssetUrl, "https://placeholder.local").pathname).replace(".", "")
    : "";
  const ext = extFromUrl || (mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : assetType === "video" ? "mp4" : "webp");
  const filename = suggestFilename(`sprint-${input.slotIndex}.${ext}`);
  const storageKey = buildStorageKey({
    storeId: input.storeId,
    scope: "assets",
    segments: ["sprints", input.sprintId],
    filename
  });
  await putObject({ key: storageKey, body: bytes, contentType: mimeType });

  // 6. Update the SprintAd row with the final asset state. Note the
  // higgsfield* columns are repurposed as "provider*" labels — we keep
  // the column names for back-compat; values may come from OpenAI now.
  await db.sprintAd.update({
    where: { id: input.sprintAdId },
    data: {
      assetStorageKey: storageKey,
      assetMimeType: mimeType,
      assetWidth: widthFromGen,
      assetHeight: heightFromGen,
      assetDurationMs: durationMs,
      higgsfieldAssetUrl: providerAssetUrl,
      higgsfieldCostUsd: providerCost,
      status: "asset_ready"
    }
  });

  return {
    storageKey,
    mimeType,
    width: widthFromGen,
    height: heightFromGen,
    durationMs,
    higgsfieldJobId: providerJobId,
    higgsfieldAssetUrl: providerAssetUrl,
    costUsd: providerCost
  };
}

// Convenience: run the asset pipeline for every SprintAd in a sprint that
// is in "brief_ready" status. Bounded concurrency so we don't hammer
// Higgsfield. Failures are isolated per-ad so one failing brief doesn't
// stop the sprint.
export async function generateAllSprintAssets(sprintId: string, concurrency = 5): Promise<{ succeeded: number; failed: number }> {
  const db = getDb();
  const ads = (await db.sprintAd.findMany({
    where: { sprintId, status: "brief_ready" },
    orderBy: { slotIndex: "asc" }
  })) as Array<{ id: string; storeId: string; slotIndex: number; briefJson: unknown }>;

  let succeeded = 0;
  let failed = 0;

  // Simple semaphore: keep a pool of `concurrency` workers chewing through
  // the queue. Each worker picks the next index it hasn't taken yet.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, ads.length) }, async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= ads.length) return;
      const ad = ads[i];
      try {
        const brief = ad.briefJson as SprintBrief;
        await generateSprintAsset({
          sprintAdId: ad.id,
          storeId: ad.storeId,
          sprintId,
          slotIndex: ad.slotIndex,
          brief
        });
        succeeded += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        await db.sprintAd
          .update({
            where: { id: ad.id },
            data: { status: "failed", errorMessage: message.slice(0, 500) }
          })
          .catch(() => {
            // best-effort — if even the failure update fails, just continue
          });
      }
    }
  });
  await Promise.all(workers);

  return { succeeded, failed };
}
