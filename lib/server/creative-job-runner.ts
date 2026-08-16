import pLimit from "p-limit";
import { getDb } from "@/lib/server/db";
import {
  bumpJobCounters,
  claimNextJob,
  heartbeatJob,
  markJobFailed,
  markJobSucceeded
} from "@/lib/services/creative-job-service";
import { buildPrompt } from "@/lib/services/creative-prompt-templates";
import { generateImage, generateVideo } from "@/lib/services/creative-ai-image-service";
import {
  isCreativeVideoEnabled,
  isVideoCreativeType,
  maxVideoBatchSize
} from "@/lib/services/creative-video-config";
import {
  buildStorageKey,
  putObject,
  readObject,
  suggestFilename
} from "@/lib/services/creative-storage-service";
import type {
  CreativeAspectRatio,
  CreativeBrief,
  CreativeProvider,
  CreativeType
} from "@/lib/domain/creative-types";

// The single worker tick. Called by `app/api/creative/jobs/worker/route.ts`
// which is pinged every few seconds by the cron in instrumentation.ts.
//
// One tick = one job (so we don't hold an HTTP connection open across many
// batch generations). The cron pings frequently; if there's more work the
// next tick picks it up. For a "100 IG posts" job the worker still fans out
// internally with bounded concurrency.

// Lazy import so we don't pay the p-limit cost in the Next instrumentation
// bundle. p-limit is tiny but the principle holds for heavier deps.
const concurrencyLimit = Number(process.env.CREATIVE_PROVIDER_CONCURRENCY) || 3;

// Per-org daily spending cap on creative generation (SA-MED-05). Every
// creative provider (Replicate, OpenAI image gen, Higgsfield, Gemini/Nano
// Banana) costs real money per call, and a runaway batch could rack up a
// large bill. We cap the number of CreativeGenerationJob rows an org may run
// per UTC day. Enforced HERE in the runner/coordinator (not in any single
// provider service) so the cap is uniform across all providers.
const DEFAULT_MAX_JOBS_PER_DAY = 10;
function maxJobsPerDay(): number {
  const parsed = Number(process.env.CREATIVE_MAX_JOBS_PER_DAY);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_JOBS_PER_DAY;
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Enforce the per-org daily creative-job quota. Resolves the org that owns the
 * just-claimed job (via its store), counts the OTHER jobs that org has already
 * created today (UTC, excluding this one), and throws a user-facing error when
 * that org has reached its limit — so this job is the (limit+1)th and must be
 * rejected. Stores not yet assigned to an org (orgId null during the Phase 1
 * migration) are scoped by storeId so the cap still applies per store.
 *
 * Throwing from runOneJob's try block marks the job failed with this message,
 * which surfaces on the project page — no provider API call is made.
 */
async function assertOrgDailyQuota(jobId: string): Promise<void> {
  const db = getDb();
  const job = await db.creativeGenerationJob.findUnique({
    where: { id: jobId },
    select: { id: true, createdAt: true, store: { select: { id: true, orgId: true } } }
  });
  if (!job) throw new Error(`Job ${jobId} disappeared before quota check.`);

  const limit = maxJobsPerDay();
  const since = startOfUtcDay();
  const orgId = job.store?.orgId ?? null;

  // Count jobs for this org (or this store, if unassigned) created today,
  // excluding the job we just claimed so the org can run exactly `limit`/day.
  const usedToday = await db.creativeGenerationJob.count({
    where: {
      id: { not: jobId },
      createdAt: { gte: since },
      ...(orgId ? { store: { orgId } } : { storeId: job.store?.id })
    }
  });

  if (usedToday >= limit) {
    // X = jobs already counted toward today's quota including this one.
    throw new Error(
      `Daily creative job limit reached (${usedToday + 1}/${limit}). Resets at midnight UTC.`
    );
  }
}

export interface RunOneJobResult {
  ranJob: boolean;
  jobId?: string;
}

/**
 * Claim the next runnable job and run it to completion. Returns whether a
 * job was actually picked up — the cron uses this to decide if it should
 * tick again immediately (more work available) or wait for the next beat.
 */
export async function runOneJob(): Promise<RunOneJobResult> {
  const claim = await claimNextJob();
  if (!claim) return { ranJob: false };
  const jobId = claim.id;
  try {
    // Enforce the per-org daily quota BEFORE any provider API call. If the
    // org is over its cap this throws and the job is marked failed below with
    // the user-facing limit message — no Replicate/OpenAI/Higgsfield call fires.
    await assertOrgDailyQuota(jobId);
    await dispatch(jobId);
    await markJobSucceeded(jobId);
    return { ranJob: true, jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error.";
    await markJobFailed(jobId, message);
    return { ranJob: true, jobId };
  }
}

async function dispatch(jobId: string): Promise<void> {
  const db = getDb();
  const job = await db.creativeGenerationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} disappeared after claim.`);
  if (job.jobType === "GENERATE_BATCH") {
    await runGenerateBatch(job);
    return;
  }
  throw new Error(`Unsupported job type: ${job.jobType}`);
}

async function runGenerateBatch(job: any): Promise<void> {
  const db = getDb();
  const project = await db.creativeProject.findUnique({
    where: { id: job.projectId },
    include: { sources: true }
  });
  if (!project) throw new Error(`Project ${job.projectId} not found.`);
  if (project.sources.length === 0) {
    throw new Error("Project has no source images.");
  }

  const payload = (job.payloadJson ?? {}) as { provider?: CreativeProvider; primarySourceId?: string };
  const provider: CreativeProvider = payload.provider ?? (project.provider as CreativeProvider) ?? "replicate";

  // Bucket sources: the one marked "product" in briefJson.sourceRoles is the
  // subject; everything else is an inspiration reference. Falls back to the
  // payload's primarySourceId, then to the oldest upload, so legacy jobs
  // created before roles existed still resolve correctly.
  const brief = (project.briefJson as CreativeBrief | null) ?? null;
  const roleMap = brief?.sourceRoles ?? {};
  const sortedSources = [...project.sources].sort(
    (a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const productSource =
    sortedSources.find((s: any) => roleMap[s.id]?.role === "product") ??
    sortedSources.find((s: any) => s.id === payload.primarySourceId) ??
    sortedSources[0];
  const referenceSources = sortedSources.filter((s: any) => s.id !== productSource.id);
  const referenceLabels = referenceSources.map(
    (s: any) => roleMap[s.id]?.label?.trim() || "reference image"
  );

  const reference = await readObject(productSource.storageKey);
  const additionalReferenceImages = await Promise.all(
    referenceSources.map(async (s: any, i: number) => {
      const blob = await readObject(s.storageKey);
      return {
        buffer: blob.body,
        contentType: blob.contentType,
        label: referenceLabels[i]
      };
    })
  );

  // Decide image-vs-video for the whole batch. Video projects need the
  // CREATIVE_VIDEO_ENABLED flag and respect CREATIVE_MAX_VIDEO_BATCH.
  const wantsVideo = isVideoCreativeType(project.creativeType) && isCreativeVideoEnabled();
  if (isVideoCreativeType(project.creativeType) && !isCreativeVideoEnabled()) {
    throw new Error(
      "Video generation is disabled. Set CREATIVE_VIDEO_ENABLED=1 in .env to enable UGC_VIDEO batches."
    );
  }
  const effectiveTargetCount = wantsVideo
    ? Math.min(job.targetCount, maxVideoBatchSize())
    : job.targetCount;
  const assetType = wantsVideo ? "VIDEO" : "IMAGE";

  // Resume-safe pre-create. If the worker re-claimed a stale-locked job
  // (e.g. an earlier tick crashed) it must reuse the existing asset rows
  // instead of stacking another N rows on top of them. We:
  //   1) reuse any rows that haven't reached a terminal state yet
  //   2) top up to `effectiveTargetCount` if we're short
  const existingRows = await db.creativeAsset.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true }
  });
  // Only resume rows that haven't reached a terminal state. "failed" rows
  // already counted toward `failedCount`; the user can retry those one-by-one
  // from the project page if they want — re-running them here would
  // double-count.
  const reusableIds = existingRows
    .filter((r: any) => r.status === "pending" || r.status === "rendering")
    .map((r: any) => r.id);
  const needed = Math.max(0, effectiveTargetCount - existingRows.length);
  const assetRowIds: string[] = [...reusableIds];
  for (let i = 0; i < needed; i += 1) {
    const row = await db.creativeAsset.create({
      data: {
        projectId: project.id,
        jobId: job.id,
        assetType,
        status: "pending",
        providerName: provider
      }
    });
    assetRowIds.push(row.id);
  }

  await db.creativeProject.update({
    where: { id: project.id },
    data: { status: "generating" }
  });

  // Keep lockedAt fresh while we work so a slow batch (e.g. gpt-image-1 with
  // multi-image refs) doesn't look like a crashed worker to `claimNextJob`.
  // Heartbeat at ~1/3 of the stale-lock window so we always stay well inside.
  const heartbeat = setInterval(() => {
    heartbeatJob(job.id).catch(() => {
      /* worker keeps going; next tick will retry */
    });
  }, 90_000);

  // Video providers are async and slow — drop concurrency to 2 by default
  // so we don't slam the provider with 10 simultaneous Veo calls.
  const effectiveConcurrency = wantsVideo
    ? Math.max(1, Math.min(2, concurrencyLimit))
    : concurrencyLimit;
  const limit = pLimit(effectiveConcurrency);
  try {
    await Promise.all(
      assetRowIds.map((assetId, index) =>
        limit(() =>
          runOneAsset({
            assetId,
            jobId: job.id,
            projectId: project.id,
            storeId: job.storeId,
            provider,
            creativeType: project.creativeType as CreativeType,
            aspectRatio: project.aspectRatio as CreativeAspectRatio,
            brief,
            referenceBuffer: { buffer: reference.body, contentType: reference.contentType },
            additionalReferenceImages,
            referenceLabels,
            index,
            generateAs: wantsVideo ? "VIDEO" : "IMAGE"
          })
        )
      )
    );
  } finally {
    clearInterval(heartbeat);
  }

  // Refresh aggregate counts and flip the project to "ready" (or back to
  // "draft" if literally nothing succeeded — the user will see error
  // messages on the per-asset cards either way).
  const fresh = await db.creativeGenerationJob.findUnique({ where: { id: job.id } });
  await db.creativeProject.update({
    where: { id: project.id },
    data: { status: fresh?.succeededCount > 0 ? "ready" : "draft" }
  });
}

interface OneAssetInput {
  assetId: string;
  jobId: string;
  projectId: string;
  storeId: string;
  provider: CreativeProvider;
  creativeType: CreativeType;
  aspectRatio: CreativeAspectRatio;
  brief: CreativeBrief | null;
  referenceBuffer: { buffer: Buffer; contentType: string };
  additionalReferenceImages: Array<{ buffer: Buffer; contentType: string; label: string }>;
  referenceLabels: string[];
  index: number;
  generateAs: "IMAGE" | "VIDEO";
}

async function runOneAsset(input: OneAssetInput): Promise<void> {
  const db = getDb();
  await db.creativeAsset.update({
    where: { id: input.assetId },
    data: { status: "rendering" }
  });

  const prompt = buildPrompt({
    creativeType: input.creativeType,
    aspectRatio: input.aspectRatio,
    brief: input.brief,
    index: input.index,
    referenceLabels: input.referenceLabels
  });

  try {
    if (input.generateAs === "VIDEO") {
      const result = await generateVideo({
        provider: input.provider,
        prompt,
        aspectRatio: input.aspectRatio,
        referenceImageBuffer: input.referenceBuffer
      });
      const finalKey = buildStorageKey({
        storeId: input.storeId,
        scope: "assets",
        segments: [input.projectId, input.assetId],
        filename: suggestFilename(null, extFromContentType(result.contentType))
      });
      await putObject({ key: finalKey, body: result.buffer, contentType: result.contentType });
      // Video assets get a placeholder thumbnail (the source frame the user
      // uploaded) until we ship server-side ffmpeg thumbnail extraction.
      const thumbKey = buildStorageKey({
        storeId: input.storeId,
        scope: "thumbs",
        segments: [input.projectId, input.assetId],
        filename: suggestFilename(null, extFromContentType(input.referenceBuffer.contentType))
      });
      await putObject({
        key: thumbKey,
        body: input.referenceBuffer.buffer,
        contentType: input.referenceBuffer.contentType
      });
      await db.creativeAsset.update({
        where: { id: input.assetId },
        data: {
          status: "ready",
          storageKey: finalKey,
          rawStorageKey: finalKey,
          thumbStorageKey: thumbKey,
          providerName: result.providerName,
          promptUsed: result.promptUsed,
          durationMs: result.durationMs ?? null,
          metaJson: {
            model: result.modelUsed,
            seed: result.seedUsed,
            aspectRatio: input.aspectRatio
          }
        }
      });
      await bumpJobCounters(input.jobId, { succeeded: 1 });
      return;
    }

    const result = await generateImage({
      provider: input.provider,
      prompt,
      aspectRatio: input.aspectRatio,
      // Default to "pro" — product photography needs sharp output (legible
      // labels, real skin). Users who want cheap previews can set
      // CREATIVE_BATCH_QUALITY=fast in .env (Replicate falls back to Flux
      // Schnell, OpenAI drops to "medium" quality).
      quality: (process.env.CREATIVE_BATCH_QUALITY as "fast" | "pro") || "pro",
      referenceImageBuffer: { ...input.referenceBuffer, label: "product" },
      additionalReferenceImages: input.additionalReferenceImages
    });
    const finalKey = buildStorageKey({
      storeId: input.storeId,
      scope: "assets",
      segments: [input.projectId, input.assetId],
      filename: suggestFilename(null, extFromContentType(result.contentType))
    });
    await putObject({ key: finalKey, body: result.buffer, contentType: result.contentType });
    await db.creativeAsset.update({
      where: { id: input.assetId },
      data: {
        status: "ready",
        storageKey: finalKey,
        rawStorageKey: finalKey,
        thumbStorageKey: finalKey,
        providerName: result.providerName,
        promptUsed: result.promptUsed,
        metaJson: {
          model: result.modelUsed,
          seed: result.seedUsed,
          aspectRatio: input.aspectRatio
        }
      }
    });
    await bumpJobCounters(input.jobId, { succeeded: 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation error.";
    await db.creativeAsset.update({
      where: { id: input.assetId },
      data: { status: "failed", errorMessage: message }
    });
    await bumpJobCounters(input.jobId, { failed: 1 });
  }
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
