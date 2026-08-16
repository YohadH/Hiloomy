// Sprint orchestrator service — the public surface API routes call.
// Owns lifecycle transitions; delegates heavy lifting to brief-generator,
// asset-pipeline, sprint-publisher, and sprint-cascade.
//
// State machine:
//   draft
//     → (generate briefs) → generating_briefs
//     → awaiting_brief_approval  (if approvalMode includes briefs)
//     → (approve briefs) → ready to generate assets
//     → (generate assets) → generating_assets
//     → awaiting_asset_approval  (if approvalMode includes assets)
//     → (approve assets) → ready to publish
//     → (publish) → publishing → running
//     → (cron @ +6h / +24h / +72h) → measuring → complete
//
// Multi-tenant safety: every public function takes a storeId and calls
// assertStoreInActiveOrg. Sprint mutations are also scoped to the
// caller's org via the sprint's storeId.

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/server/db";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { AppError } from "@/lib/server/errors";
import { getReadableUrl } from "@/lib/services/creative-storage-service";
import {
  generateSprintBriefs,
  type SprintBrief,
  type SprintBriefProductContext,
  type SprintBriefStoreContext
} from "./brief-generator";
import { generateAllSprintAssets } from "./asset-pipeline";
import { publishSprint, type SprintTargetingConfig } from "./sprint-publisher";
import { DEFAULT_CASCADE, evaluateCascadeStage, type CascadeStage } from "./sprint-cascade";
import { estimateHiggsfieldCostUsd } from "@/lib/clients/higgsfield-client";

export type SprintApprovalMode = "full_auto" | "review_briefs" | "review_assets" | "review_both";

export interface CreateSprintInput {
  storeId: string;
  name: string;
  productId?: string | null;
  targetCount?: number;
  dailyBudgetPerAd: number;
  currency?: string;
  approvalMode?: SprintApprovalMode;
  cascade?: CascadeStage[];
  notes?: string | null;
}

export interface SprintSummary {
  id: string;
  name: string;
  status: string;
  targetCount: number;
  currentStage: number;
  aliveCount: number;
  killedCount: number;
  winnerCount: number;
  publishedAt: string | null;
  createdAt: string;
  metaCampaignId: string | null;
}

export interface SprintAdSummary {
  id: string;
  slotIndex: number;
  status: string;
  finalStatus: string;
  // Brief fields — exposed so the matrix tile's edit modal can show + edit
  // the full text without a second fetch. angle + variantLabel stay
  // read-only; headline/body/cta/visualPrompt are editable.
  angle: string;
  variantLabel: string;
  headline: string;
  body: string;
  cta: string;
  visualPrompt: string;
  assetType: "image" | "video";
  assetStorageKey: string | null;
  // Presigned URL resolved server-side. For R2 backend this is a short-
  // lived signed URL; for local backend it's a /api/creative/files/ path.
  // Either way the UI can drop this straight into <img src> or <video src>.
  assetUrl: string | null;
  assetMimeType: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
  lastImpressions: number;
  lastClicks: number;
  lastSpend: string;
  lastPurchases: number;
  lastPurchaseValue: string;
  lastCtr: string | null;
  lastCpc: string | null;
  lastCpa: string | null;
  lastRoas: string | null;
  killedAt: string | null;
  killedReason: string | null;
  errorMessage: string | null;
}

export interface SprintDetail {
  id: string;
  storeId: string;
  name: string;
  productId: string | null;
  targetCount: number;
  dailyBudgetPerAd: string;
  currency: string;
  approvalMode: SprintApprovalMode;
  cascade: CascadeStage[];
  currentStage: number;
  status: string;
  metaCampaignId: string | null;
  targetingJson: SprintTargetingConfig | null;
  notes: string | null;
  errorMessage: string | null;
  estimatedHiggsfieldUsd: string | null;
  actualHiggsfieldUsd: string | null;
  estimatedAdSpend: string | null;
  actualAdSpend: string | null;
  briefsGeneratedAt: string | null;
  briefsApprovedAt: string | null;
  assetsGeneratedAt: string | null;
  assetsApprovedAt: string | null;
  publishedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  ads: SprintAdSummary[];
}

function decimalToString(v: Prisma.Decimal | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
}

// ── Creation ────────────────────────────────────────────────────────────

export async function createSprint(input: CreateSprintInput): Promise<{ id: string }> {
  await assertStoreInActiveOrg(input.storeId);

  // Safety: don't allow a second running sprint on the same store.
  const db = getDb();
  const existing = await db.creativeSprint.findFirst({
    where: {
      storeId: input.storeId,
      status: { in: ["generating_briefs", "awaiting_brief_approval", "generating_assets", "awaiting_asset_approval", "publishing", "running", "measuring"] }
    },
    select: { id: true, name: true, status: true }
  });
  if (existing) {
    throw new AppError(
      `Another sprint ("${existing.name}", status=${existing.status}) is already in progress on this store. Cancel it before starting a new one.`,
      409
    );
  }

  const targetCount = input.targetCount ?? 100;
  const cascade = input.cascade ?? DEFAULT_CASCADE;
  // Cheap initial estimate — refined after briefs decide image vs video.
  const estHiggsfieldUsd = estimateHiggsfieldCostUsd({ assetType: "image", count: targetCount });
  const estAdSpend = Number(input.dailyBudgetPerAd) * targetCount * 3; // 3-day evaluation horizon

  const sprint = await db.creativeSprint.create({
    data: {
      storeId: input.storeId,
      name: input.name,
      productId: input.productId ?? null,
      targetCount,
      dailyBudgetPerAd: new Prisma.Decimal(input.dailyBudgetPerAd),
      currency: input.currency ?? "ILS",
      approvalMode: input.approvalMode ?? "review_both",
      cascadeJson: cascade as unknown as Prisma.InputJsonValue,
      status: "draft",
      notes: input.notes ?? null,
      estimatedHiggsfieldUsd: new Prisma.Decimal(estHiggsfieldUsd),
      estimatedAdSpend: new Prisma.Decimal(estAdSpend)
    }
  });
  return { id: sprint.id };
}

// ── List + Detail ───────────────────────────────────────────────────────

export async function listSprints(storeId: string): Promise<SprintSummary[]> {
  await assertStoreInActiveOrg(storeId);
  const db = getDb();
  const rows = await db.creativeSprint.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: {
      ads: { select: { finalStatus: true } }
    }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    let alive = 0,
      killed = 0,
      winner = 0;
    for (const a of r.ads as Array<{ finalStatus: string }>) {
      if (a.finalStatus === "alive") alive++;
      else if (a.finalStatus === "killed") killed++;
      else if (a.finalStatus === "winner") winner++;
    }
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      targetCount: r.targetCount,
      currentStage: r.currentStage,
      aliveCount: alive,
      killedCount: killed,
      winnerCount: winner,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      metaCampaignId: r.metaCampaignId
    };
  });
}

export async function getSprintDetail(sprintId: string): Promise<SprintDetail> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({
    where: { id: sprintId },
    include: { ads: { orderBy: { slotIndex: "asc" } } }
  });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);

  // Resolve presigned URLs for asset storage keys in parallel — R2 needs
  // signed URLs (short-lived), local backend returns /api/creative/files/.
  // Doing this server-side means the UI just drops the result into <img src>.
  const adsWithUrls = await Promise.all(
    sprint.ads.map(async (a: { id: string; assetStorageKey: string | null }) => {
      let url: string | null = null;
      if (a.assetStorageKey) {
        try {
          url = await getReadableUrl(a.assetStorageKey);
        } catch (err) {
          console.warn(`[sprint-service] failed to resolve URL for ${a.assetStorageKey}:`, err);
        }
      }
      return { id: a.id, assetUrl: url };
    })
  );
  const urlByAdId = new Map(adsWithUrls.map((r) => [r.id, r.assetUrl]));

  return {
    id: sprint.id,
    storeId: sprint.storeId,
    name: sprint.name,
    productId: sprint.productId,
    targetCount: sprint.targetCount,
    dailyBudgetPerAd: sprint.dailyBudgetPerAd.toString(),
    currency: sprint.currency,
    approvalMode: sprint.approvalMode as SprintApprovalMode,
    cascade: (sprint.cascadeJson as unknown as CascadeStage[]) ?? DEFAULT_CASCADE,
    currentStage: sprint.currentStage,
    status: sprint.status,
    metaCampaignId: sprint.metaCampaignId,
    targetingJson: (sprint.targetingJson as unknown as SprintTargetingConfig) ?? null,
    notes: sprint.notes,
    errorMessage: sprint.errorMessage,
    estimatedHiggsfieldUsd: decimalToString(sprint.estimatedHiggsfieldUsd),
    actualHiggsfieldUsd: decimalToString(sprint.actualHiggsfieldUsd),
    estimatedAdSpend: decimalToString(sprint.estimatedAdSpend),
    actualAdSpend: decimalToString(sprint.actualAdSpend),
    briefsGeneratedAt: sprint.briefsGeneratedAt?.toISOString() ?? null,
    briefsApprovedAt: sprint.briefsApprovedAt?.toISOString() ?? null,
    assetsGeneratedAt: sprint.assetsGeneratedAt?.toISOString() ?? null,
    assetsApprovedAt: sprint.assetsApprovedAt?.toISOString() ?? null,
    publishedAt: sprint.publishedAt?.toISOString() ?? null,
    completedAt: sprint.completedAt?.toISOString() ?? null,
    cancelledAt: sprint.cancelledAt?.toISOString() ?? null,
    createdAt: sprint.createdAt.toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ads: sprint.ads.map((a: any) => ({
      id: a.id,
      slotIndex: a.slotIndex,
      status: a.status,
      finalStatus: a.finalStatus,
      angle: (a.briefJson as { angle?: string } | null)?.angle ?? "",
      variantLabel: (a.briefJson as { variantLabel?: string } | null)?.variantLabel ?? "",
      headline: (a.briefJson as { headline?: string } | null)?.headline ?? "",
      body: (a.briefJson as { body?: string } | null)?.body ?? "",
      cta: (a.briefJson as { cta?: string } | null)?.cta ?? "",
      visualPrompt: (a.briefJson as { visualPrompt?: string } | null)?.visualPrompt ?? "",
      assetType: ((a.briefJson as { assetType?: "image" | "video" } | null)?.assetType ?? "image") as "image" | "video",
      assetUrl: urlByAdId.get(a.id) ?? null,
      assetStorageKey: a.assetStorageKey,
      assetMimeType: a.assetMimeType,
      metaAdsetId: a.metaAdsetId,
      metaAdId: a.metaAdId,
      lastImpressions: a.lastImpressions,
      lastClicks: a.lastClicks,
      lastSpend: a.lastSpend.toString(),
      lastPurchases: a.lastPurchases,
      lastPurchaseValue: a.lastPurchaseValue.toString(),
      lastCtr: decimalToString(a.lastCtr),
      lastCpc: decimalToString(a.lastCpc),
      lastCpa: decimalToString(a.lastCpa),
      lastRoas: decimalToString(a.lastRoas),
      killedAt: a.killedAt?.toISOString() ?? null,
      killedReason: a.killedReason,
      errorMessage: a.errorMessage
    }))
  };
}

// ── Phase 1: brief generation ───────────────────────────────────────────

export interface GenerateBriefsForSprintInput {
  sprintId: string;
  product: SprintBriefProductContext;
  store: SprintBriefStoreContext;
}

export async function generateBriefsForSprint(input: GenerateBriefsForSprintInput): Promise<{ count: number }> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: input.sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  if (sprint.status !== "draft" && sprint.status !== "generating_briefs") {
    throw new AppError(`Cannot generate briefs in status=${sprint.status}.`, 409);
  }

  await db.creativeSprint.update({
    where: { id: input.sprintId },
    data: { status: "generating_briefs" }
  });

  const briefs = await generateSprintBriefs({
    store: input.store,
    product: input.product,
    targetCount: sprint.targetCount
  });

  // Create SprintAd rows in one transaction so the matrix appears all at once.
  await db.$transaction(
    briefs.map((brief, i) =>
      db.sprintAd.create({
        data: {
          sprintId: input.sprintId,
          storeId: sprint.storeId,
          slotIndex: i + 1,
          briefJson: brief as unknown as Prisma.InputJsonValue,
          status: "brief_ready"
        }
      })
    )
  );

  const requiresApproval = sprint.approvalMode === "review_briefs" || sprint.approvalMode === "review_both";
  const nextStatus = requiresApproval ? "awaiting_brief_approval" : "generating_assets";
  await db.creativeSprint.update({
    where: { id: input.sprintId },
    data: { status: nextStatus, briefsGeneratedAt: new Date() }
  });

  return { count: briefs.length };
}

// ── Phase 1.5: brief approval (one-shot bulk approve) ──────────────────

export async function approveAllBriefs(sprintId: string): Promise<void> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  if (sprint.status !== "awaiting_brief_approval") {
    throw new AppError(`Cannot approve briefs in status=${sprint.status}.`, 409);
  }
  await db.sprintAd.updateMany({
    where: { sprintId, status: "brief_ready" },
    data: { briefApprovedAt: new Date() }
  });
  await db.creativeSprint.update({
    where: { id: sprintId },
    data: { status: "generating_assets", briefsApprovedAt: new Date() }
  });
}

export async function updateSprintBrief(sprintId: string, slotIndex: number, brief: Partial<SprintBrief>): Promise<void> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  const ad = await db.sprintAd.findUnique({ where: { sprintId_slotIndex: { sprintId, slotIndex } } });
  if (!ad) throw new AppError("Sprint ad not found.", 404);
  const current = (ad.briefJson as unknown as SprintBrief) ?? {};
  const merged = { ...current, ...brief };
  await db.sprintAd.update({
    where: { id: ad.id },
    data: { briefJson: merged as unknown as Prisma.InputJsonValue }
  });
}

// ── Phase 2: asset generation ──────────────────────────────────────────

export async function generateAssetsForSprintInline(sprintId: string): Promise<{ succeeded: number; failed: number }> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  if (sprint.status !== "generating_assets") {
    throw new AppError(`Cannot generate assets in status=${sprint.status}.`, 409);
  }
  const result = await generateAllSprintAssets(sprintId);
  const requiresApproval = sprint.approvalMode === "review_assets" || sprint.approvalMode === "review_both";
  const nextStatus = requiresApproval ? "awaiting_asset_approval" : "running"; // running flag will be flipped by publishSprint
  await db.creativeSprint.update({
    where: { id: sprintId },
    data: { status: nextStatus, assetsGeneratedAt: new Date() }
  });
  return result;
}

// ── Phase 2.5: asset approval ──────────────────────────────────────────

export async function approveAllAssets(sprintId: string): Promise<void> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  if (sprint.status !== "awaiting_asset_approval") {
    throw new AppError(`Cannot approve assets in status=${sprint.status}.`, 409);
  }
  await db.sprintAd.updateMany({
    where: { sprintId, status: "asset_ready" },
    data: { assetApprovedAt: new Date() }
  });
  await db.creativeSprint.update({
    where: { id: sprintId },
    data: { assetsApprovedAt: new Date() }
  });
}

// Reject a single asset → mark as failed → won't be published.
export async function rejectSprintAsset(sprintId: string, slotIndex: number): Promise<void> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  await db.sprintAd.update({
    where: { sprintId_slotIndex: { sprintId, slotIndex } },
    data: { assetRejectedAt: new Date(), status: "failed" }
  });
}

// ── Phase 3: publish to Meta ───────────────────────────────────────────

export interface PublishSprintInput {
  sprintId: string;
  targeting: SprintTargetingConfig;
}

export async function configureTargetingAndPublish(input: PublishSprintInput): Promise<{ campaignId: string; publishedAdCount: number; failedAdCount: number }> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: input.sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  if (!(sprint.status === "awaiting_asset_approval" || sprint.status === "generating_assets" || sprint.status === "running")) {
    throw new AppError(`Cannot publish in status=${sprint.status}.`, 409);
  }
  await db.creativeSprint.update({
    where: { id: input.sprintId },
    data: { targetingJson: input.targeting as unknown as Prisma.InputJsonValue }
  });
  const result = await publishSprint(input.sprintId);
  return result;
}

// ── Phase 4: cascade evaluation ────────────────────────────────────────

export async function evaluateSprintNow(sprintId: string, stage: number) {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  return evaluateCascadeStage(sprintId, stage);
}

// ── Cancel / kill switch ───────────────────────────────────────────────

export async function cancelSprint(sprintId: string): Promise<void> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found.", 404);
  await assertStoreInActiveOrg(sprint.storeId);
  if (sprint.status === "complete" || sprint.status === "cancelled") return;

  // If the sprint has live Meta entities, pause all alive adsets so we
  // stop spending immediately. Best-effort — DB-side cancel still happens.
  if (sprint.publishedAt) {
    try {
      const conn = await db.metaAdsConnection.findUnique({ where: { storeId: sprint.storeId } });
      if (conn) {
        const auth = {
          accessToken: (await import("@/lib/security/encryption")).decryptSecret(conn.accessTokenEnc),
          adAccountId: conn.adAccountId,
          appSecret: conn.appSecretEnc ? (await import("@/lib/security/encryption")).decryptSecret(conn.appSecretEnc) : null
        };
        const { pauseMetaAdSet } = await import("@/lib/clients/meta-marketing-client");
        const alive = await db.sprintAd.findMany({
          where: { sprintId, finalStatus: "alive", metaAdsetId: { not: null } },
          select: { metaAdsetId: true }
        });
        for (const a of alive) {
          if (!a.metaAdsetId) continue;
          try {
            await pauseMetaAdSet(auth, a.metaAdsetId);
          } catch (err) {
            console.warn(`[cancel-sprint] pause failed for ${a.metaAdsetId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[cancel-sprint] meta pause sweep failed:", err);
    }
  }

  await db.creativeSprint.update({
    where: { id: sprintId },
    data: { status: "cancelled", cancelledAt: new Date() }
  });
  await db.sprintAd.updateMany({
    where: { sprintId, finalStatus: "alive" },
    data: { finalStatus: "killed", killedReason: "Sprint cancelled by operator", killedAt: new Date(), status: "killed" }
  });
}
