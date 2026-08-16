import { getDb, withOptionalDb } from "@/lib/server/db";
import {
  buildStorageKey,
  deleteObject,
  getReadableUrl,
  putObject,
  readObject,
  suggestFilename
} from "@/lib/services/creative-storage-service";
import { buildPrompt } from "@/lib/services/creative-prompt-templates";
import { craftPromptWithCreativeAgent } from "@/lib/services/creative-prompt-agent-service";
import { generateImage, generateVideo } from "@/lib/services/creative-ai-image-service";
import { isCreativeVideoEnabled, isVideoCreativeType } from "@/lib/services/creative-video-config";
import {
  DEFAULT_ASPECT_RATIO,
  isCreativeAspectRatio,
  isCreativeProvider,
  isCreativeType,
  type CreativeAspectRatio,
  type CreativeAssetSummary,
  type CreativeBrief,
  type CreativeProjectDetail,
  type CreativeProjectStatus,
  type CreativeProjectSummary,
  type CreativeProvider,
  type CreativeType,
  type CanvasOverlay
} from "@/lib/domain/creative-types";

// All Creative DB I/O lives here. Routes are thin wrappers — they parse the
// request, call into this module, and JSON-encode the result.

export interface SaveSourceUploadInput {
  storeId: string;
  projectId: string;
  originalName: string | null;
  contentType: string;
  buffer: Buffer;
  width?: number | null;
  height?: number | null;
}

export interface SaveSourceUploadResult {
  id: string;
  storageKey: string;
  fileUrl: string;
}

export async function saveSourceUpload(input: SaveSourceUploadInput): Promise<SaveSourceUploadResult> {
  const db = getDb();
  const filename = suggestFilename(input.originalName, extFromContentType(input.contentType));
  const storageKey = buildStorageKey({
    storeId: input.storeId,
    scope: "sources",
    segments: [input.projectId],
    filename
  });
  await putObject({
    key: storageKey,
    body: input.buffer,
    contentType: input.contentType
  });
  const record = await db.creativeSource.create({
    data: {
      storeId: input.storeId,
      projectId: input.projectId,
      kind: "USER_UPLOAD",
      storageKey,
      mimeType: input.contentType,
      width: input.width ?? null,
      height: input.height ?? null,
      bytes: input.buffer.length
    }
  });
  const fileUrl = await getReadableUrl(storageKey);
  return { id: record.id, storageKey, fileUrl };
}

export interface CreateProjectInput {
  storeId: string;
  name: string;
  creativeType: CreativeType;
  aspectRatio?: CreativeAspectRatio;
  brief?: CreativeBrief | null;
  productId?: string | null;
  provider?: CreativeProvider;
}

export async function createProject(input: CreateProjectInput): Promise<{ id: string }> {
  const db = getDb();
  const aspect = input.aspectRatio ?? DEFAULT_ASPECT_RATIO[input.creativeType];
  if (!isCreativeType(input.creativeType)) {
    throw new Error(`Unknown creative type: ${input.creativeType}`);
  }
  if (!isCreativeAspectRatio(aspect)) {
    throw new Error(`Unknown aspect ratio: ${aspect}`);
  }
  const provider: CreativeProvider = input.provider && isCreativeProvider(input.provider)
    ? input.provider
    : "replicate";
  const project = await db.creativeProject.create({
    data: {
      storeId: input.storeId,
      name: input.name,
      productId: input.productId ?? null,
      creativeType: input.creativeType,
      aspectRatio: aspect,
      status: "draft",
      provider,
      targetCount: 1,
      briefJson: input.brief ?? null
    }
  });
  return { id: project.id };
}

/**
 * M1 sync generation: produces one image for the project right now.
 *
 * Flips project status to "generating" while running, then "ready" on success
 * or back to "draft" with an asset row in "failed" status on error. The route
 * caller awaits the whole thing — fine for one image, will be replaced by the
 * job queue in M2.
 */
export async function generatePackshotSync(
  projectId: string,
  storeId: string
): Promise<CreativeAssetSummary> {
  const db = getDb();
  // Multi-tenant safety: lookup must be scoped to the caller's store.
  // findFirst (not findUnique) so the storeId filter actually applies.
  const project = await db.creativeProject.findFirst({
    where: { id: projectId, storeId },
    include: { sources: true }
  });
  if (!project) throw new Error(`Project ${projectId} not found.`);
  if (project.sources.length === 0) {
    throw new Error("Upload at least one product image before generating.");
  }

  await db.creativeProject.update({
    where: { id: projectId },
    data: { status: "generating" satisfies CreativeProjectStatus }
  });

  // Pick the source marked as "product" (the actual subject) from the brief's
  // role map; fall back to the first upload. The other uploads stay as
  // descriptive reference hints in the text prompt.
  const briefForGen = (project.briefJson as CreativeBrief | null) ?? null;
  const { product, references, referenceLabels } = pickProductSource(
    project.sources,
    briefForGen
  );
  const referenceImageBuffer = await readObject(product.storageKey);
  const additionalReferenceImages = await loadAdditionalReferences(references);

  // Creative agent prompt refinement — default ON. When the agent
  // succeeds we use its prompt as a "customPrompt" override so the
  // existing template still wraps it with the consistent style notes
  // (aspect ratio hints, lighting language, "no AI artifacts" rules).
  // When the agent fails OR is disabled, we fall through to the
  // template's mechanical concatenation — never worse than today.
  const wantsAgentPrompt = briefForGen?.useAgentPrompt !== false;
  let briefForBuild: CreativeBrief | null = briefForGen;
  if (wantsAgentPrompt && briefForGen) {
    // Pass the full per-image role breakdown so the agent can write
    // explicit "preserve THIS, take inspiration from THAT" instructions
    // for the image model. Generic "hasReferenceImage: true" wasn't
    // enough — the agent had no way to distinguish product vs lighting
    // vs model references.
    const agentPrompt = await craftPromptWithCreativeAgent({
      creativeType: project.creativeType,
      aspectRatio: project.aspectRatio,
      brief: briefForGen,
      images: [
        { role: "product", label: "Product" },
        ...references.map((_, i) => ({
          role: "reference" as const,
          label: referenceLabels[i] ?? null
        }))
      ],
      // Legacy fields kept for safety — `images` takes precedence.
      referenceLabels,
      hasReferenceImage: true
    });
    if (agentPrompt) {
      briefForBuild = { ...briefForGen, customPrompt: agentPrompt };
    }
  }
  const prompt = buildPrompt({
    creativeType: project.creativeType,
    aspectRatio: project.aspectRatio,
    brief: briefForBuild,
    index: 0,
    referenceLabels
  });

  // Image or video? Video requires CREATIVE_VIDEO_ENABLED — guarded here so
  // a project created before the flag was flipped doesn't silently produce
  // an image instead of the video the user asked for.
  const wantsVideo = isVideoCreativeType(project.creativeType);
  if (wantsVideo && !isCreativeVideoEnabled()) {
    throw new GenerationFailedError(
      "Video generation is disabled. Set CREATIVE_VIDEO_ENABLED=1 in .env to enable UGC_VIDEO projects.",
      // Synthetic asset summary so the UI can show the failure card.
      {
        id: "synthetic",
        projectId,
        assetType: "VIDEO",
        status: "failed",
        fileUrl: null,
        thumbUrl: null,
        width: null,
        height: null,
        durationMs: null,
        promptUsed: prompt.prompt,
        overlays: [],
        errorMessage: "CREATIVE_VIDEO_ENABLED is off.",
        createdAt: new Date().toISOString()
      }
    );
  }

  const assetType = wantsVideo ? "VIDEO" : "IMAGE";

  // Create the asset row up-front so the UI can render a placeholder.
  const assetRow = await db.creativeAsset.create({
    data: {
      projectId,
      assetType,
      status: "rendering",
      promptUsed: prompt.prompt
    }
  });

  try {
    const provider: CreativeProvider = (project.provider as CreativeProvider) ?? "replicate";
    if (wantsVideo) {
      const result = await generateVideo({
        provider,
        prompt,
        aspectRatio: project.aspectRatio,
        referenceImageBuffer: {
          buffer: referenceImageBuffer.body,
          contentType: referenceImageBuffer.contentType
        }
      });
      const finalKey = buildStorageKey({
        storeId: project.storeId,
        scope: "assets",
        segments: [projectId, assetRow.id],
        filename: suggestFilename(null, extFromContentType(result.contentType))
      });
      await putObject({ key: finalKey, body: result.buffer, contentType: result.contentType });
      const thumbKey = buildStorageKey({
        storeId: project.storeId,
        scope: "thumbs",
        segments: [projectId, assetRow.id],
        filename: suggestFilename(null, extFromContentType(referenceImageBuffer.contentType))
      });
      await putObject({
        key: thumbKey,
        body: referenceImageBuffer.body,
        contentType: referenceImageBuffer.contentType
      });
      const updated = await db.creativeAsset.update({
        where: { id: assetRow.id },
        data: {
          status: "ready",
          storageKey: finalKey,
          rawStorageKey: finalKey,
          thumbStorageKey: thumbKey,
          providerName: result.providerName,
          durationMs: result.durationMs ?? null,
          metaJson: {
            model: result.modelUsed,
            seed: result.seedUsed,
            aspectRatio: project.aspectRatio
          }
        }
      });
      await db.creativeProject.update({ where: { id: projectId }, data: { status: "ready" } });
      return await assetToSummary(updated);
    }

    // Hand Higgsfield (and any other URL-aware provider) the already-hosted
    // R2/local URL of the product source. Saves an upload round-trip and
    // works correctly with backends where re-uploading would collide on
    // the same key. `getReadableUrl()` returns a presigned R2 URL when
    // CREATIVE_STORAGE_BACKEND=s3 — Higgsfield can fetch it directly.
    const referenceImageUrl = await getReadableUrl(product.storageKey).catch(() => null);

    const result = await generateImage({
      provider,
      prompt,
      aspectRatio: project.aspectRatio,
      quality: "pro",
      referenceImageBuffer: {
        buffer: referenceImageBuffer.body,
        contentType: referenceImageBuffer.contentType,
        label: "product"
      },
      referenceImageUrl,
      additionalReferenceImages
    });

    const finalKey = buildStorageKey({
      storeId: project.storeId,
      scope: "assets",
      segments: [projectId, assetRow.id],
      filename: suggestFilename(null, extFromContentType(result.contentType))
    });
    await putObject({ key: finalKey, body: result.buffer, contentType: result.contentType });

    const updated = await db.creativeAsset.update({
      where: { id: assetRow.id },
      data: {
        status: "ready",
        storageKey: finalKey,
        rawStorageKey: finalKey,
        thumbStorageKey: finalKey,
        providerName: result.providerName,
        metaJson: {
          model: result.modelUsed,
          seed: result.seedUsed,
          aspectRatio: project.aspectRatio
        }
      }
    });
    await db.creativeProject.update({
      where: { id: projectId },
      data: { status: "ready" }
    });
    return await assetToSummary(updated);
  } catch (error) {
    if (error instanceof GenerationFailedError) throw error;
    const message = error instanceof Error ? error.message : "Unknown generation error.";
    const failed = await db.creativeAsset.update({
      where: { id: assetRow.id },
      data: { status: "failed", errorMessage: message }
    });
    await db.creativeProject.update({
      where: { id: projectId },
      data: { status: "draft" }
    });
    throw new GenerationFailedError(message, await assetToSummary(failed));
  }
}

export class GenerationFailedError extends Error {
  asset: CreativeAssetSummary;
  constructor(message: string, asset: CreativeAssetSummary) {
    super(message);
    this.name = "GenerationFailedError";
    this.asset = asset;
  }
}

/**
 * Re-run generation for an existing asset row (typically a failed one).
 * Keeps the same asset id and history, but updates status / errorMessage /
 * stored file. Throws GenerationFailedError on provider failure with the
 * (now-updated) asset summary attached for the UI.
 */
export async function retryAssetGeneration(
  storeId: string,
  assetId: string
): Promise<CreativeAssetSummary> {
  const db = getDb();
  const asset = await db.creativeAsset.findFirst({
    where: { id: assetId, project: { storeId } },
    include: { project: { include: { sources: true } } }
  });
  if (!asset) throw new Error("Asset not found.");
  const project = asset.project;
  if (!project || project.sources.length === 0) {
    throw new Error("Project has no source images to retry against.");
  }

  // Reset the row before re-running so polling clients see a clean state.
  await db.creativeAsset.update({
    where: { id: assetId },
    data: { status: "rendering", errorMessage: null }
  });

  const briefForRetry = (project.briefJson as CreativeBrief | null) ?? null;
  const {
    product: retryProduct,
    references: retryRefs,
    referenceLabels: retryRefLabels
  } = pickProductSource(project.sources, briefForRetry);
  const referenceImageBuffer = await readObject(retryProduct.storageKey);
  const retryAdditionalReferences = await loadAdditionalReferences(retryRefs);

  // Same agent refinement as the sync path — keeps regen consistent
  // with the original generation behavior.
  const wantsAgentPromptRetry = briefForRetry?.useAgentPrompt !== false;
  let briefForRetryBuild: CreativeBrief | null = briefForRetry;
  if (wantsAgentPromptRetry && briefForRetry) {
    const agentPrompt = await craftPromptWithCreativeAgent({
      creativeType: project.creativeType,
      aspectRatio: project.aspectRatio,
      brief: briefForRetry,
      images: [
        { role: "product", label: "Product" },
        ...retryRefs.map((_, i) => ({
          role: "reference" as const,
          label: retryRefLabels[i] ?? null
        }))
      ],
      referenceLabels: retryRefLabels,
      hasReferenceImage: true
    });
    if (agentPrompt) {
      briefForRetryBuild = { ...briefForRetry, customPrompt: agentPrompt };
    }
  }
  const prompt = buildPrompt({
    creativeType: project.creativeType,
    aspectRatio: project.aspectRatio,
    brief: briefForRetryBuild,
    index: 0,
    referenceLabels: retryRefLabels
  });

  const wantsVideo = isVideoCreativeType(project.creativeType);
  if (wantsVideo && !isCreativeVideoEnabled()) {
    const updated = await db.creativeAsset.update({
      where: { id: assetId },
      data: { status: "failed", errorMessage: "Video generation is disabled (CREATIVE_VIDEO_ENABLED is off)." }
    });
    throw new GenerationFailedError("CREATIVE_VIDEO_ENABLED is off.", await assetToSummary(updated));
  }

  const provider: CreativeProvider = (project.provider as CreativeProvider) ?? "replicate";

  try {
    if (wantsVideo) {
      const result = await generateVideo({
        provider,
        prompt,
        aspectRatio: project.aspectRatio,
        referenceImageBuffer: {
          buffer: referenceImageBuffer.body,
          contentType: referenceImageBuffer.contentType
        }
      });
      const finalKey = buildStorageKey({
        storeId,
        scope: "assets",
        segments: [project.id, assetId],
        filename: suggestFilename(null, extFromContentType(result.contentType))
      });
      await putObject({ key: finalKey, body: result.buffer, contentType: result.contentType });
      const thumbKey = buildStorageKey({
        storeId,
        scope: "thumbs",
        segments: [project.id, assetId],
        filename: suggestFilename(null, extFromContentType(referenceImageBuffer.contentType))
      });
      await putObject({
        key: thumbKey,
        body: referenceImageBuffer.body,
        contentType: referenceImageBuffer.contentType
      });
      const updated = await db.creativeAsset.update({
        where: { id: assetId },
        data: {
          status: "ready",
          storageKey: finalKey,
          rawStorageKey: finalKey,
          thumbStorageKey: thumbKey,
          providerName: result.providerName,
          promptUsed: result.promptUsed,
          durationMs: result.durationMs ?? null,
          errorMessage: null,
          metaJson: {
            model: result.modelUsed,
            seed: result.seedUsed,
            aspectRatio: project.aspectRatio
          }
        }
      });
      await db.creativeProject.update({ where: { id: project.id }, data: { status: "ready" } });
      return await assetToSummary(updated);
    }

    const retryReferenceImageUrl = await getReadableUrl(retryProduct.storageKey).catch(() => null);
    const result = await generateImage({
      provider,
      prompt,
      aspectRatio: project.aspectRatio,
      quality: "pro",
      referenceImageBuffer: {
        buffer: referenceImageBuffer.body,
        contentType: referenceImageBuffer.contentType,
        label: "product"
      },
      referenceImageUrl: retryReferenceImageUrl,
      additionalReferenceImages: retryAdditionalReferences
    });
    const finalKey = buildStorageKey({
      storeId,
      scope: "assets",
      segments: [project.id, assetId],
      filename: suggestFilename(null, extFromContentType(result.contentType))
    });
    await putObject({ key: finalKey, body: result.buffer, contentType: result.contentType });
    const updated = await db.creativeAsset.update({
      where: { id: assetId },
      data: {
        status: "ready",
        storageKey: finalKey,
        rawStorageKey: finalKey,
        thumbStorageKey: finalKey,
        providerName: result.providerName,
        promptUsed: result.promptUsed,
        errorMessage: null,
        metaJson: {
          model: result.modelUsed,
          seed: result.seedUsed,
          aspectRatio: project.aspectRatio
        }
      }
    });
    await db.creativeProject.update({ where: { id: project.id }, data: { status: "ready" } });
    return await assetToSummary(updated);
  } catch (error) {
    if (error instanceof GenerationFailedError) throw error;
    const message = error instanceof Error ? error.message : "Unknown generation error.";
    const failed = await db.creativeAsset.update({
      where: { id: assetId },
      data: { status: "failed", errorMessage: message }
    });
    throw new GenerationFailedError(message, await assetToSummary(failed));
  }
}

export async function updateProjectBrief(projectId: string, brief: CreativeBrief): Promise<void> {
  const db = getDb();
  await db.creativeProject.update({
    where: { id: projectId },
    data: { briefJson: brief as unknown as object }
  });
}

// Picks the source row whose brief.sourceRoles entry says "product", falling
// back to the oldest upload. Returns the product plus the ordered list of
// reference sources (with their labels) so the caller can both:
//   • build a text prompt that names each role
//   • upload all images to providers that support multi-image conditioning
function pickProductSource(
  sources: Array<{ id: string; storageKey: string; createdAt: Date }>,
  brief: CreativeBrief | null
): {
  product: { id: string; storageKey: string };
  references: Array<{ id: string; storageKey: string; label: string }>;
  referenceLabels: string[];
} {
  const roleMap = brief?.sourceRoles ?? {};
  const sortedByDate = [...sources].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const productSource =
    sortedByDate.find((s) => roleMap[s.id]?.role === "product") ?? sortedByDate[0];
  const references = sortedByDate
    .filter((s) => s.id !== productSource.id)
    .map((s) => ({
      id: s.id,
      storageKey: s.storageKey,
      label: roleMap[s.id]?.label?.trim() || "reference image"
    }));
  return {
    product: { id: productSource.id, storageKey: productSource.storageKey },
    references,
    referenceLabels: references.map((r) => r.label)
  };
}

// Read every reference source's bytes in parallel and shape them for the AI
// service's `additionalReferenceImages` field.
async function loadAdditionalReferences(
  references: Array<{ storageKey: string; label: string }>
): Promise<Array<{ buffer: Buffer; contentType: string; label: string }>> {
  return Promise.all(
    references.map(async (ref) => {
      const blob = await readObject(ref.storageKey);
      return { buffer: blob.body, contentType: blob.contentType, label: ref.label };
    })
  );
}

export async function setProjectTargetCount(projectId: string, targetCount: number): Promise<void> {
  const db = getDb();
  await db.creativeProject.update({
    where: { id: projectId },
    data: { targetCount: Math.max(1, Math.floor(targetCount)) }
  });
}

export async function listProjectsForStore(storeId: string): Promise<CreativeProjectSummary[]> {
  return withOptionalDb(async (db) => {
    const records = await db.creativeProject.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: {
        assets: {
          select: { id: true, status: true, thumbStorageKey: true, storageKey: true }
        }
      }
    });
    const out: CreativeProjectSummary[] = [];
    for (const record of records) {
      out.push(await projectToSummary(record));
    }
    return out;
  }, []);
}

/**
 * Hard-delete a creative project — removes the DB row (sources + assets
 * cascade via the schema), then best-effort cleans up the R2/local
 * storage objects so we don't leave orphans behind. Storage cleanup is
 * non-fatal: a failed object delete logs and continues so a transient
 * R2 hiccup doesn't block the user from clearing a stuck project.
 */
export async function deleteProject(storeId: string, projectId: string): Promise<void> {
  const db = getDb();
  // Pull the project (scoped to storeId — prevents tenant-crossing) +
  // every storage key in one query, BEFORE the delete cascade, so we
  // can clean up storage afterwards.
  const project = await db.creativeProject.findFirst({
    where: { id: projectId, storeId },
    include: {
      sources: { select: { storageKey: true } },
      assets: { select: { storageKey: true, thumbStorageKey: true } }
    }
  });
  if (!project) {
    throw new Error("Project not found.");
  }

  const storageKeys = new Set<string>();
  for (const s of project.sources) {
    if (s.storageKey) storageKeys.add(s.storageKey);
  }
  for (const a of project.assets) {
    if (a.storageKey) storageKeys.add(a.storageKey);
    if (a.thumbStorageKey) storageKeys.add(a.thumbStorageKey);
  }

  // Cascade-delete the project. Schema-level onDelete: Cascade on
  // sources/assets handles the children; this single call wipes them all.
  await db.creativeProject.delete({ where: { id: projectId } });

  // Best-effort storage cleanup. Don't throw — orphaned objects are a
  // cost issue, not a correctness one, and the user has already seen
  // the project disappear from the UI.
  for (const key of storageKeys) {
    try {
      await deleteObject(key);
    } catch (err) {
      console.error("[creative] failed to delete storage object", key, err);
    }
  }
}

export async function getProjectDetail(
  storeId: string,
  projectId: string
): Promise<CreativeProjectDetail | null> {
  const db = getDb();
  const record = await db.creativeProject.findFirst({
    where: { id: projectId, storeId },
    include: {
      sources: { orderBy: { createdAt: "asc" } },
      assets: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!record) return null;
  const baseSummary = await projectToSummary({ ...record, assets: record.assets });
  const sources = await Promise.all(
    record.sources.map(async (s: any) => ({
      id: s.id,
      mimeType: s.mimeType,
      fileUrl: s.storageKey ? await getReadableUrl(s.storageKey) : null
    }))
  );
  const assets = await Promise.all(record.assets.map(assetToSummary));
  return {
    ...baseSummary,
    brief: (record.briefJson as CreativeBrief | null) ?? null,
    sources,
    assets
  };
}

async function projectToSummary(record: any): Promise<CreativeProjectSummary> {
  const assets = record.assets ?? [];
  // Cover thumbnail priority:
  //   1. A "ready" asset with a thumbnail or full storage key (ideal)
  //   2. ANY asset with a storage key, even if still "rendering" or
  //      "failed" — so the project card shows SOMETHING instead of a
  //      blank ghost card. Mostly catches partial-failure projects where
  //      a few assets succeeded but never flipped to status="ready" in
  //      the DB (e.g. older Quick Batch runs).
  const cover =
    assets.find((a: any) => a.status === "ready" && (a.thumbStorageKey || a.storageKey)) ??
    assets.find((a: any) => a.thumbStorageKey || a.storageKey);
  const coverThumbUrl = cover
    ? await getReadableUrl(cover.thumbStorageKey ?? cover.storageKey).catch(() => null)
    : null;
  return {
    id: record.id,
    name: record.name,
    creativeType: record.creativeType,
    aspectRatio: record.aspectRatio,
    status: record.status,
    provider: (record.provider as CreativeProvider) ?? "replicate",
    targetCount: record.targetCount,
    assetCount: assets.length,
    readyCount: assets.filter((a: any) => a.status === "ready").length,
    failedCount: assets.filter((a: any) => a.status === "failed").length,
    coverThumbUrl,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

async function assetToSummary(record: any): Promise<CreativeAssetSummary> {
  return {
    id: record.id,
    projectId: record.projectId,
    assetType: record.assetType,
    status: record.status,
    fileUrl: record.storageKey ? await getReadableUrl(record.storageKey) : null,
    thumbUrl: record.thumbStorageKey
      ? await getReadableUrl(record.thumbStorageKey)
      : record.storageKey
        ? await getReadableUrl(record.storageKey)
        : null,
    width: record.width ?? null,
    height: record.height ?? null,
    durationMs: record.durationMs ?? null,
    promptUsed: record.promptUsed ?? null,
    overlays: ((record.overlaysJson as CanvasOverlay[] | null) ?? []) as CanvasOverlay[],
    errorMessage: record.errorMessage ?? null,
    createdAt: record.createdAt.toISOString()
  };
}

function extFromContentType(contentType: string): string {
  const lower = contentType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("webm")) return "webm";
  return "bin";
}
