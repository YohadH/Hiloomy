// Creative Quick Batch — ask the Creative agent for N visual prompts on
// a theme, then generate N real images through Higgsfield, and persist
// them as ONE CreativeProject with N CreativeAssets so they appear in
// the existing /creative history list.
//
// This is the "show me 5 images for X campaign" flow — smaller than the
// full Sprint feature (no Meta publishing, no cascade, no approval gates),
// but uses the same underlying clients.

import { Prisma } from "@prisma/client";
import {
  createHiggsfieldJob,
  downloadHiggsfieldAsset,
  pollHiggsfieldUntilDone
} from "@/lib/clients/higgsfield-client";
import { openaiGenerateImage } from "@/lib/services/creative-ai-openai-service";
import { askCreativeAgentJson } from "@/lib/clients/bi-agent-client";
import { buildStorageKey, putObject, suggestFilename } from "@/lib/services/creative-storage-service";
import { getDb } from "@/lib/server/db";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { AppError } from "@/lib/server/errors";

export interface QuickBatchInput {
  storeId: string;
  // Operator-supplied theme, e.g. "summer perfume campaign".
  theme: string;
  // 1-10. Default 5.
  count?: number;
  // Aspect ratio for ad creative. Default 9:16.
  aspectRatio?: "9:16" | "1:1" | "4:5" | "16:9";
  // Optional product context if the operator wants to ground the agent.
  productName?: string;
  // Brand voice notes — passed verbatim into the agent prompt.
  brandNotes?: string;
  // Product reference images. Already uploaded to R2 by the API layer —
  // we pass the public URLs to Higgsfield via image_reference so the
  // generated ads actually feature the real product, not a generic stand-in.
  // When multiple URLs are given we round-robin them across slots so each
  // reference image gets used. The Creative agent ALSO sees a hint that
  // references exist so its prompts stay consistent with "the product."
  referenceImageUrls?: string[];
}

export interface QuickBatchResult {
  projectId: string;
  succeeded: number;
  failed: number;
  // The visual prompts the Creative agent generated, in slot order.
  prompts: string[];
}

interface AgentPromptDraft {
  // Short label for the matrix, e.g. "golden-hour-girl".
  label?: string;
  // The visual description fed straight to Higgsfield (English; image models
  // tend to underperform on Hebrew prompts).
  visualPrompt: string;
  // Optional headline + body the agent might also draft for our records.
  headline?: string;
  body?: string;
}

function buildCreativePrompt(input: Required<Pick<QuickBatchInput, "theme" | "count">> & QuickBatchInput): string {
  const hasReferences = (input.referenceImageUrls?.length ?? 0) > 0;
  return [
    `You are a senior performance-marketing art director.`,
    "",
    `Campaign theme: ${input.theme}`,
    input.productName ? `Product: ${input.productName}` : null,
    input.brandNotes ? `Brand voice notes: ${input.brandNotes}` : null,
    `Aspect ratio target: ${input.aspectRatio ?? "9:16"} vertical (Meta-feed format)`,
    hasReferences
      ? `IMPORTANT: ${input.referenceImageUrls!.length} reference image(s) of the actual product will be passed to the image generator.`
      : null,
    hasReferences
      ? `Your visualPrompts should describe the SCENE / CONTEXT / STYLING around the product — NOT the product itself (the reference image handles that).`
      : null,
    hasReferences
      ? `Example: instead of "a red apple on a table", write "soft morning light from the left, white marble surface, a few water droplets on the surface, single shadow."`
      : null,
    "",
    `Produce exactly ${input.count} DISTINCT visual concepts for this campaign.`,
    `Each concept should feel meaningfully different — different lighting, framing, mood, surface, props.`,
    `Avoid repetition: don't generate "the same scene with different colors."`,
    "",
    `For each concept, write a "visualPrompt": a 2-3 sentence directive an image model can render directly.`,
    hasReferences
      ? `Mention: lighting direction + mood, surface/background, props, atmosphere. Do NOT describe the product itself.`
      : `Mention: subject, framing, lighting, mood, surface/background, any props.`,
    `Photography style preferred (luxury editorial, not illustration).`,
    `English only for visualPrompt (image models work better in English).`,
    "",
    `Output JSON array of length ${input.count}:`,
    `[{ "label": "<short tag>", "visualPrompt": "...", "headline": "<optional ad headline>", "body": "<optional 1-line body>" }, ...]`
  ]
    .filter(Boolean)
    .join("\n");
}

// Download an arbitrary public URL into a Buffer + content type. Used to
// pull operator-uploaded reference images (already on R2) and product
// images (Shopify CDN) into bytes for the OpenAI multipart edits call.
async function downloadAsBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const arr = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { buffer: Buffer.from(arr), contentType };
}

async function generateOneAsset(input: {
  prompt: string;
  storeId: string;
  projectId: string;
  slotIndex: number;
  aspectRatio: "9:16" | "1:1" | "4:5" | "16:9";
  agentDraft: AgentPromptDraft;
  // Optional: which reference image URL to condition this slot's gen on.
  // Picked by the parent loop via round-robin across the operator's uploads.
  referenceImageUrl?: string | null;
  // Additional refs (vibe / mood-board) the operator uploaded alongside
  // the product. OpenAI gpt-image-1 supports up to 16 reference images.
  extraReferenceUrls?: string[];
}): Promise<{ assetId: string }> {
  const db = getDb();

  // ── Provider selection ─────────────────────────────────────────────
  // CRITICAL: Higgsfield Soul's `image_reference` is a STYLE hint, not
  // an identity preserver. If the operator gave a reference image (the
  // product they want featured), Higgsfield will produce "in the style
  // of" — not "featuring" — which is useless for product ads.
  //
  // OpenAI gpt-image-1 with /v1/images/edits genuinely preserves the
  // product in the reference. So:
  //   - referenceImageUrl present + OPENAI_API_KEY set → OpenAI
  //   - otherwise → Higgsfield (great for scenes without a fixed subject)
  const hasReference = Boolean(input.referenceImageUrl);
  const openaiAvailable = Boolean(process.env.OPENAI_API_KEY?.trim());
  const useOpenAi = hasReference && openaiAvailable;

  const asset = await db.creativeAsset.create({
    data: {
      projectId: input.projectId,
      assetType: "IMAGE",
      status: "rendering",
      promptUsed: input.prompt,
      providerName: useOpenAi ? "openai" : "higgsfield"
    }
  });

  try {
    let bytes: Buffer;
    let mimeType: string;
    let width: number | null = null;
    let height: number | null = null;
    let providerJobId: string | null = null;
    let providerAssetUrl: string | null = null;
    let providerThumbnailUrl: string | null = null;

    if (useOpenAi) {
      // OpenAI path — download reference(s), call image-edits, get bytes back.
      const referenceImageBuffer = await downloadAsBuffer(input.referenceImageUrl!);
      const additionalReferenceImages = await Promise.all(
        (input.extraReferenceUrls ?? [])
          .filter((u) => u !== input.referenceImageUrl) // dedupe
          .slice(0, 5) // gpt-image-1 caps multi-image generously; keep cost sane
          .map(async (url) => {
            const dl = await downloadAsBuffer(url);
            return { buffer: dl.buffer, contentType: dl.contentType, label: "vibe reference" };
          })
      );

      const result = await openaiGenerateImage({
        prompt: {
          // gpt-image-1 takes a single prompt string + structured style notes.
          // For preservation we lead with a "preserve the product exactly"
          // directive so the model doesn't redesign the bottle/box.
          prompt: `${input.prompt}\n\nIMPORTANT: the uploaded product image is the canonical reference. Keep every bottle/box/package, all labels, all colors, all proportions, all branding EXACTLY identical to the source image. Do NOT redesign, recolor, resize, or relabel the product. Only the surrounding scene, lighting, composition, and props may change.`,
          negativePrompt: "",
          styleNotes: []
        },
        aspectRatio: input.aspectRatio,
        referenceImageBuffer: {
          buffer: referenceImageBuffer.buffer,
          contentType: referenceImageBuffer.contentType,
          label: "product (preserve identity)"
        },
        additionalReferenceImages,
        quality: "high"
      });
      bytes = result.buffer;
      mimeType = result.contentType || "image/png";
      providerJobId = "openai-edits";
    } else {
      // Higgsfield path — no reference OR OpenAI not configured. Higgsfield
      // does great pure-scene generation when there's no product to preserve.
      const job = await createHiggsfieldJob({
        assetType: "image",
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        referenceImageUrl: input.referenceImageUrl ?? null,
        idempotencyKey: asset.id
      });
      const completed = job.status === "completed" ? job : await pollHiggsfieldUntilDone(job.id);
      if (completed.status !== "completed" || !completed.assetUrl) {
        throw new Error(completed.errorMessage || `Higgsfield ended in status=${completed.status}`);
      }
      bytes = await downloadHiggsfieldAsset(completed.assetUrl);
      mimeType = completed.assetMimeType || "image/png";
      width = completed.width ?? null;
      height = completed.height ?? null;
      providerJobId = completed.id;
      providerAssetUrl = completed.assetUrl;
      providerThumbnailUrl = completed.thumbnailUrl ?? null;
    }

    const ext = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : "webp";
    const filename = suggestFilename(`quick-${input.slotIndex}.${ext}`);
    const storageKey = buildStorageKey({
      storeId: input.storeId,
      scope: "assets",
      segments: ["quick-batch", input.projectId],
      filename
    });
    await putObject({ key: storageKey, body: bytes, contentType: mimeType });

    await db.creativeAsset.update({
      where: { id: asset.id },
      data: {
        storageKey,
        rawStorageKey: storageKey,
        status: "ready",
        width,
        height,
        providerJobId,
        metaJson: {
          providerUsed: useOpenAi ? "openai-gpt-image-edits" : "higgsfield-soul",
          providerAssetUrl,
          providerThumbnailUrl,
          referenceImageUrl: input.referenceImageUrl ?? null,
          extraReferenceCount: input.extraReferenceUrls?.length ?? 0,
          agentLabel: input.agentDraft.label,
          agentHeadline: input.agentDraft.headline,
          agentBody: input.agentDraft.body
        } as unknown as Prisma.InputJsonValue
      }
    });
    return { assetId: asset.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.creativeAsset
      .update({
        where: { id: asset.id },
        data: { status: "failed", errorMessage: message.slice(0, 500) }
      })
      .catch(() => {
        // best-effort
      });
    throw err;
  }
}

export async function runCreativeQuickBatch(input: QuickBatchInput): Promise<QuickBatchResult> {
  await assertStoreInActiveOrg(input.storeId);

  const count = Math.max(1, Math.min(10, input.count ?? 5));
  const aspectRatio = input.aspectRatio ?? "9:16";

  // Step 1 — ask the Creative agent for N visual prompts.
  const drafts = await askCreativeAgentJson<AgentPromptDraft[]>({
    question: buildCreativePrompt({ ...input, count }),
    jsonHint: `array of ${count} concept objects`,
    timeoutMs: 90_000
  });
  if (!Array.isArray(drafts) || drafts.length === 0) {
    throw new AppError("Creative agent returned no concepts.", 502);
  }
  const usedDrafts = drafts.slice(0, count);
  // Pad with safe fallbacks if the agent under-delivered.
  while (usedDrafts.length < count) {
    usedDrafts.push({
      label: `fallback-${usedDrafts.length + 1}`,
      visualPrompt: `Clean vertical 9:16 product hero shot for ${input.theme}, soft studio lighting, premium feel.`
    });
  }

  // Step 2 — create the parent CreativeProject so all N assets share a
  // container and appear as a single entry in /creative history.
  const db = getDb();
  const project = await db.creativeProject.create({
    data: {
      storeId: input.storeId,
      name: input.theme.slice(0, 80),
      creativeType: "META_AD",
      aspectRatio,
      provider: "higgsfield",
      status: "generating",
      targetCount: count,
      briefJson: {
        source: "creative-quick-batch",
        theme: input.theme,
        productName: input.productName ?? null,
        brandNotes: input.brandNotes ?? null,
        agentDrafts: usedDrafts
      } as unknown as Prisma.InputJsonValue
    }
  });

  // Step 3 — fan out N gens in parallel (bounded 3). Each slot:
  //   - Picks a primary reference image via round-robin across all the
  //     operator's references (product image + uploaded vibe files)
  //   - The OTHER references travel along as "extra" for providers that
  //     support multi-image conditioning (OpenAI gpt-image-1)
  // Failures are per-asset.
  const allRefs = (input.referenceImageUrls ?? []).filter(Boolean);
  let succeeded = 0;
  let failed = 0;
  const concurrency = 3;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, usedDrafts.length) }, async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= usedDrafts.length) return;
      const draft = usedDrafts[i];
      // Round-robin: slot 1 → ref 0, slot 2 → ref 1, ... wraps when out.
      const primaryRef = allRefs.length > 0 ? allRefs[i % allRefs.length] : null;
      // Pass the OTHER refs as extras so the model sees full context.
      const extraRefs = allRefs.filter((u) => u !== primaryRef);
      try {
        await generateOneAsset({
          prompt: draft.visualPrompt,
          storeId: input.storeId,
          projectId: project.id,
          slotIndex: i + 1,
          aspectRatio,
          agentDraft: draft,
          referenceImageUrl: primaryRef,
          extraReferenceUrls: extraRefs
        });
        succeeded += 1;
      } catch (err) {
        failed += 1;
        console.error(`[quick-batch] slot ${i + 1} failed:`, err);
      }
    }
  });
  await Promise.all(workers);

  // Step 4 — finalize project status. "ready" if any succeeded, "archived"
  // if all failed (so it doesn't clog the list but is still inspectable).
  await db.creativeProject.update({
    where: { id: project.id },
    data: {
      status: succeeded > 0 ? "ready" : "archived"
    }
  });

  return {
    projectId: project.id,
    succeeded,
    failed,
    prompts: usedDrafts.map((d) => d.visualPrompt)
  };
}
