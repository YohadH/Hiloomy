import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/server/db";
import type { CreativeJobStatus, CreativeJobType, CreativeProvider } from "@/lib/domain/creative-types";

// DB-backed job queue. Same shape the rest of the schema uses
// (string-typed status, JSON payload) so the worker can claim atomically via
// the lockedAt/lockedBy columns. Mirrors the `shopify-sync-cron` pattern —
// the worker is a single POST route pinged on a setInterval from
// instrumentation.ts.

const STALE_LOCK_MINUTES = 5;

export interface EnqueueGenerateBatchInput {
  storeId: string;
  projectId: string;
  targetCount: number;
  provider: CreativeProvider;
  // Where the first source image came from — required for image-to-image
  // generation. Stored in payloadJson so the worker is fully self-contained.
  primarySourceId: string;
}

/**
 * Enqueue a "generate N assets for this project" job. Returns the new job's
 * id; the worker (creative-job-runner) picks it up on its next tick.
 */
export async function enqueueGenerateBatch(input: EnqueueGenerateBatchInput): Promise<{ id: string }> {
  const db = getDb();
  const job = await db.creativeGenerationJob.create({
    data: {
      storeId: input.storeId,
      projectId: input.projectId,
      jobType: "GENERATE_BATCH" satisfies CreativeJobType,
      status: "queued" satisfies CreativeJobStatus,
      targetCount: input.targetCount,
      providerName: input.provider,
      payloadJson: {
        provider: input.provider,
        primarySourceId: input.primarySourceId
      }
    }
  });
  return { id: job.id };
}

export interface JobProgress {
  id: string;
  status: CreativeJobStatus;
  targetCount: number;
  succeededCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export async function listJobsForProject(
  projectId: string,
  storeId: string
): Promise<JobProgress[]> {
  const db = getDb();
  // Multi-tenant safety: filter via the project's storeId so an attacker
  // with a stale projectId from another store can't read its jobs.
  const rows = await db.creativeGenerationJob.findMany({
    where: { projectId, project: { storeId } },
    orderBy: { createdAt: "desc" }
  });
  return rows.map((r: any) => ({
    id: r.id,
    status: r.status,
    targetCount: r.targetCount,
    succeededCount: r.succeededCount,
    failedCount: r.failedCount,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    errorMessage: r.errorMessage ?? null
  }));
}

/**
 * Atomically claim the next runnable job. Picks "queued" jobs first; if none
 * are available it picks up "running" jobs that look stale (lockedAt older
 * than STALE_LOCK_MINUTES) so a crashed worker doesn't strand a batch.
 *
 * Uses a raw UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) so
 * two workers won't pick the same job. Postgres-only.
 */
export async function claimNextJob(workerId?: string): Promise<{ id: string } | null> {
  const db = getDb();
  const lockedBy = workerId ?? `worker-${randomUUID()}`;
  // Raw SQL because Prisma doesn't model SKIP LOCKED.
  const rows: Array<{ id: string }> = await db.$queryRaw`
    UPDATE "CreativeGenerationJob"
    SET status = 'running',
        "lockedAt" = NOW(),
        "lockedBy" = ${lockedBy},
        attempts = attempts + 1,
        "startedAt" = COALESCE("startedAt", NOW())
    WHERE id = (
      SELECT id FROM "CreativeGenerationJob"
      WHERE status = 'queued'
         OR (status = 'running' AND "lockedAt" < NOW() - (${STALE_LOCK_MINUTES} * INTERVAL '1 minute'))
      ORDER BY "createdAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id;
  `;
  return rows[0] ?? null;
}

/**
 * Refresh a running job's lockedAt so the stale-lock re-claim in
 * `claimNextJob` doesn't pick it up while it's legitimately still working.
 * The worker calls this on a setInterval for the duration of a batch.
 */
export async function heartbeatJob(jobId: string): Promise<void> {
  const db = getDb();
  await db.creativeGenerationJob.update({
    where: { id: jobId },
    data: { lockedAt: new Date() }
  });
}

export async function markJobSucceeded(jobId: string): Promise<void> {
  const db = getDb();
  await db.creativeGenerationJob.update({
    where: { id: jobId },
    data: {
      status: "succeeded" satisfies CreativeJobStatus,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null
    }
  });
}

export async function markJobFailed(jobId: string, errorMessage: string): Promise<void> {
  const db = getDb();
  await db.creativeGenerationJob.update({
    where: { id: jobId },
    data: {
      status: "failed" satisfies CreativeJobStatus,
      completedAt: new Date(),
      errorMessage,
      lockedAt: null,
      lockedBy: null
    }
  });
}

export async function bumpJobCounters(
  jobId: string,
  delta: { succeeded?: number; failed?: number }
): Promise<void> {
  const db = getDb();
  await db.creativeGenerationJob.update({
    where: { id: jobId },
    data: {
      succeededCount: { increment: delta.succeeded ?? 0 },
      failedCount: { increment: delta.failed ?? 0 }
    }
  });
}
