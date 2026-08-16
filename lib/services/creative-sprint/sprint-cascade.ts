// Cascade evaluator — the kill engine.
//
// For a sprint at cascade stage N:
//   1. Pull Meta insights for every ALIVE adset (since publishedAt → now).
//   2. Compute the stage's metric (CTR / CPC / CPA / ROAS) per ad.
//   3. Exempt ads below the stage's minImpressions threshold (no signal
//      → no kill — protects against false negatives when an ad just
//      didn't get served much yet).
//   4. Rank the eligible ads and pick the bottom killBottomPct%.
//   5. Pause those adsets via the Meta API and stamp SprintAd rows with
//      finalStatus="killed", append a decision log entry to decisionsJson.
//   6. Mark kept ads with an entry too (decision="kept") so the audit log
//      tells the full story.
//   7. Bump sprint.currentStage. If this was the last stage, flip
//      sprint.status to "complete" and mark survivors as finalStatus="winner".
//
// Honest CPA-at-6h caveat: with ₪10 daily budget paced over 24h, each ad
// has spent ~₪2.50 in 6h. At ₪50 CPA, you need ~20 ads' combined spend to
// see ONE conversion. CTR/CPC at 6h is meaningful; CPA at 6h is not. The
// default cascade plan reflects that (6h=CTR, 24h=CPC, 72h=CPA), but a
// caller who overrides to CPA-at-6h will mostly get "exempt" decisions
// because of the minImpressions guard — and that's the right behavior.

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/encryption";
import {
  getMetaAdSetInsights,
  pauseMetaAdSet,
  type MetaAuth
} from "@/lib/clients/meta-marketing-client";
import { sendTelegramMessage } from "@/lib/server/telegram";

// Metric the cascade uses to rank ads at a given stage.
//   ctr            — cheap signal (works on tiny budgets, video or image)
//   cpc            — pure cost-per-click
//   cpc_plus_atc   — composite: ranks by CPC but boosts ads with strong
//                     add-to-cart rate. Used at stage 2 as "intent signal"
//                     because raw CPC misses ads that drive cart additions
//                     even at higher click cost.
//   atc_rate       — pure add-to-cart per click rate
//   cpa            — money signal (only meaningful at higher spend)
//   roas           — revenue / spend
export type CascadeMetric = "ctr" | "cpc" | "cpc_plus_atc" | "atc_rate" | "cpa" | "roas";

export interface CascadeStage {
  stage: number;
  hoursAfterLaunch: number;
  metric: CascadeMetric;
  killBottomPct: number; // 0-100
  minImpressions: number;
}

// Default waterfall — designed so 100 ads narrow to ~3 evergreen winners:
//   stage 1 (6h):   CTR-only          → 100 × 0.30 = 30 alive
//   stage 2 (24h):  CPC + ATC blend   → 30 × 0.50  = 15 alive
//   stage 3 (72h):  CPA               → 15 × 0.20  = 3 winners
// The 80% stage-3 cull is intentional: we want the few real money-makers,
// not the median. If you want 5-7 evergreen instead, drop stage 3 to 70%.
export const DEFAULT_CASCADE: CascadeStage[] = [
  { stage: 1, hoursAfterLaunch: 6, metric: "ctr", killBottomPct: 70, minImpressions: 500 },
  { stage: 2, hoursAfterLaunch: 24, metric: "cpc_plus_atc", killBottomPct: 50, minImpressions: 1500 },
  { stage: 3, hoursAfterLaunch: 72, metric: "cpa", killBottomPct: 80, minImpressions: 4000 }
];

export interface CascadeEvaluationResult {
  sprintId: string;
  stage: number;
  metric: CascadeMetric;
  killedCount: number;
  keptCount: number;
  exemptCount: number;
  failedToEvalCount: number;
  // Survivors after this stage (alive ads); UI can show "X of Y still in play".
  aliveCount: number;
  isFinalStage: boolean;
}

interface AdWithMetrics {
  sprintAdId: string;
  metaAdsetId: string;
  slotIndex: number;
  impressions: number;
  clicks: number;
  spend: number;
  // Add-to-cart event count. Used by the stage-2 composite metric so an
  // ad with higher click cost but stronger purchase-intent still survives.
  addToCarts: number;
  // ATC per click — primary intent signal at stage 2.
  atcRate: number;
  purchases: number;
  purchaseValue: number;
  ctr: number;
  cpc: number;
  cpa: number | null; // null when no purchases (we can't divide by zero)
  roas: number | null;
}

async function resolveMetaAuth(storeId: string): Promise<MetaAuth> {
  const db = getDb();
  const conn = await db.metaAdsConnection.findUnique({ where: { storeId } });
  if (!conn) {
    throw new Error("Store is not connected to Meta Ads.");
  }
  return {
    accessToken: decryptSecret(conn.accessTokenEnc),
    adAccountId: conn.adAccountId,
    appSecret: conn.appSecretEnc ? decryptSecret(conn.appSecretEnc) : null
  };
}

function metricValue(metric: CascadeMetric, m: AdWithMetrics): number | null {
  switch (metric) {
    case "ctr":
      return m.ctr;
    case "cpc":
      return m.cpc > 0 ? m.cpc : null;
    case "atc_rate":
      return m.clicks > 0 ? m.atcRate : null;
    case "cpc_plus_atc": {
      // Composite "intent" score, higher = better. We multiply the
      // ATC rate by 100 to put it on a comparable scale to CPC inversion
      // (1/cpc is typically 0.05-0.5 in ILS, atcRate is typically 0.01-0.10).
      // Then a 60/40 blend favors ATC since that's the harder signal to fake.
      if (m.cpc <= 0 || m.clicks === 0) return null;
      const cpcScore = 1 / m.cpc; // higher = cheaper click = better
      const atcScore = m.atcRate * 10; // scale to similar magnitude
      return 0.4 * cpcScore + 0.6 * atcScore;
    }
    case "cpa":
      return m.cpa;
    case "roas":
      return m.roas;
  }
}

// Lower-is-better metrics (cost-based) → kill the HIGH ones.
// Higher-is-better metrics (effectiveness-based) → kill the LOW ones.
// Note cpc_plus_atc is HIGHER better (we invert CPC inside the score).
function isLowerBetter(metric: CascadeMetric): boolean {
  return metric === "cpc" || metric === "cpa";
}

export async function evaluateCascadeStage(sprintId: string, stage: number): Promise<CascadeEvaluationResult> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new Error(`Sprint ${sprintId} not found`);
  if (!sprint.publishedAt) throw new Error(`Sprint ${sprintId} hasn't been published yet`);

  const cascade = (sprint.cascadeJson as unknown as CascadeStage[]) ?? DEFAULT_CASCADE;
  const stageConfig = cascade.find((s) => s.stage === stage);
  if (!stageConfig) throw new Error(`Sprint ${sprintId} has no cascade stage ${stage}`);

  const aliveAds = (await db.sprintAd.findMany({
    where: {
      sprintId,
      finalStatus: "alive",
      metaAdsetId: { not: null }
    },
    select: { id: true, metaAdsetId: true, slotIndex: true, decisionsJson: true }
  })) as Array<{ id: string; metaAdsetId: string; slotIndex: number; decisionsJson: unknown }>;

  if (aliveAds.length === 0) {
    await advanceSprintStage(sprintId, stage, cascade);
    return {
      sprintId,
      stage,
      metric: stageConfig.metric,
      killedCount: 0,
      keptCount: 0,
      exemptCount: 0,
      failedToEvalCount: 0,
      aliveCount: 0,
      isFinalStage: stage === cascade[cascade.length - 1].stage
    };
  }

  // ── Pull insights in parallel (bounded) ──────────────────────────────
  const auth = await resolveMetaAuth(sprint.storeId);
  const sinceIso = sprint.publishedAt.toISOString();
  const untilIso = new Date().toISOString();

  const fetched = await Promise.allSettled(
    aliveAds.map((ad) => getMetaAdSetInsights(auth, ad.metaAdsetId, { sinceIso, untilIso }))
  );
  const metricsByAd: Map<string, AdWithMetrics> = new Map();
  const failedAdIds: Set<string> = new Set();
  fetched.forEach((res, i) => {
    const ad = aliveAds[i];
    if (res.status === "rejected") {
      failedAdIds.add(ad.id);
      return;
    }
    const row = res.value;
    const cpa = row.purchases > 0 ? row.spend / row.purchases : null;
    const atcRate = row.clicks > 0 ? row.addToCarts / row.clicks : 0;
    metricsByAd.set(ad.id, {
      sprintAdId: ad.id,
      metaAdsetId: ad.metaAdsetId,
      slotIndex: ad.slotIndex,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      addToCarts: row.addToCarts,
      atcRate,
      purchases: row.purchases,
      purchaseValue: row.purchaseValue,
      ctr: row.ctr,
      cpc: row.cpc,
      cpa,
      roas: row.roas
    });
  });

  // ── Partition: eligible vs exempt ────────────────────────────────────
  // Exempt = not enough impressions to make a confident decision, OR the
  // metric came back null (e.g. CPA when there are zero purchases).
  const eligible: AdWithMetrics[] = [];
  const exempt: AdWithMetrics[] = [];
  for (const m of metricsByAd.values()) {
    if (m.impressions < stageConfig.minImpressions) {
      exempt.push(m);
      continue;
    }
    const v = metricValue(stageConfig.metric, m);
    if (v == null || !Number.isFinite(v)) {
      exempt.push(m);
      continue;
    }
    eligible.push(m);
  }

  // ── Rank + pick bottom X% to kill ────────────────────────────────────
  const lowerBetter = isLowerBetter(stageConfig.metric);
  eligible.sort((a, b) => {
    const av = metricValue(stageConfig.metric, a) ?? 0;
    const bv = metricValue(stageConfig.metric, b) ?? 0;
    // Sort so the BEST is first (we kill the tail).
    return lowerBetter ? av - bv : bv - av;
  });
  const killCount = Math.floor((eligible.length * stageConfig.killBottomPct) / 100);
  const toKill = eligible.slice(eligible.length - killCount);
  const toKeep = eligible.slice(0, eligible.length - killCount);

  // ── Execute kills + record decisions ─────────────────────────────────
  const evaluatedAt = new Date().toISOString();

  // 1. Kill (pause Meta adset + stamp DB)
  for (const m of toKill) {
    try {
      await pauseMetaAdSet(auth, m.metaAdsetId);
    } catch (err) {
      console.error(`[cascade] pause failed for ${m.metaAdsetId}:`, err);
      // Even if the Meta call fails we still mark it killed in our DB —
      // the operator will see the discrepancy on the report and can retry.
    }
    await appendDecisionAndUpdate(m.sprintAdId, {
      stage,
      evaluatedAt,
      metric: stageConfig.metric,
      metricValue: metricValue(stageConfig.metric, m),
      impressions: m.impressions,
      clicks: m.clicks,
      spend: m.spend,
      purchases: m.purchases,
      purchaseValue: m.purchaseValue,
      decision: "killed",
      reason: `bottom ${stageConfig.killBottomPct}% of ${stageConfig.metric} at stage ${stage}`
    }, m, { finalize: "killed" });
  }

  // 2. Keep (just log the decision; no Meta call)
  for (const m of toKeep) {
    await appendDecisionAndUpdate(m.sprintAdId, {
      stage,
      evaluatedAt,
      metric: stageConfig.metric,
      metricValue: metricValue(stageConfig.metric, m),
      impressions: m.impressions,
      clicks: m.clicks,
      spend: m.spend,
      purchases: m.purchases,
      purchaseValue: m.purchaseValue,
      decision: "kept",
      reason: `survived ${stageConfig.metric} cull at stage ${stage}`
    }, m, { finalize: null });
  }

  // 3. Exempt (mark them exempt but keep running)
  for (const m of exempt) {
    await appendDecisionAndUpdate(m.sprintAdId, {
      stage,
      evaluatedAt,
      metric: stageConfig.metric,
      metricValue: metricValue(stageConfig.metric, m),
      impressions: m.impressions,
      clicks: m.clicks,
      spend: m.spend,
      purchases: m.purchases,
      purchaseValue: m.purchaseValue,
      decision: "exempt",
      reason:
        m.impressions < stageConfig.minImpressions
          ? `only ${m.impressions} imps (< ${stageConfig.minImpressions} min)`
          : `${stageConfig.metric} not computable yet`
    }, m, { finalize: null });
  }

  // 4. Advance sprint stage / finalize survivors if last stage.
  const isFinalStage = stage === cascade[cascade.length - 1].stage;
  await advanceSprintStage(sprintId, stage, cascade);

  const aliveAfter = await db.sprintAd.count({
    where: { sprintId, finalStatus: "alive" }
  });

  const result = {
    sprintId,
    stage,
    metric: stageConfig.metric,
    killedCount: toKill.length,
    keptCount: toKeep.length,
    exemptCount: exempt.length,
    failedToEvalCount: failedAdIds.size,
    aliveCount: aliveAfter,
    isFinalStage
  };

  // Notify the owner (best-effort, no-op if Telegram env not configured).
  const sprintName = sprint.name ?? sprintId.slice(-6);
  const headline = isFinalStage
    ? `*Sprint complete: ${sprintName}*`
    : `*Sprint stage ${stage} done: ${sprintName}*`;
  await sendTelegramMessage(
    [
      headline,
      `Metric: ${stageConfig.metric.toUpperCase()}`,
      `Killed: ${result.killedCount} · Kept: ${result.keptCount} · Exempt: ${result.exemptCount}`,
      `Alive after: ${result.aliveCount}`,
      isFinalStage ? "Survivors marked as winners." : "Next stage scheduled."
    ].join("\n")
  );

  return result;
}

// Append a decision entry to SprintAd.decisionsJson + update the cached
// KPI snapshot in one transaction. Optionally finalize the row's
// finalStatus (used when this stage's decision is "killed").
async function appendDecisionAndUpdate(
  sprintAdId: string,
  decision: Record<string, unknown>,
  metrics: AdWithMetrics,
  options: { finalize: "killed" | null }
): Promise<void> {
  const db = getDb();
  const row = (await db.sprintAd.findUnique({
    where: { id: sprintAdId },
    select: { decisionsJson: true }
  })) as { decisionsJson: unknown } | null;
  const existing = Array.isArray(row?.decisionsJson) ? (row!.decisionsJson as unknown[]) : [];
  existing.push(decision);

  const data: Record<string, unknown> = {
    decisionsJson: existing,
    lastImpressions: metrics.impressions,
    lastClicks: metrics.clicks,
    lastSpend: new Prisma.Decimal(metrics.spend),
    lastPurchases: metrics.purchases,
    lastPurchaseValue: new Prisma.Decimal(metrics.purchaseValue),
    lastCtr: new Prisma.Decimal(metrics.ctr),
    lastCpc: metrics.cpc > 0 ? new Prisma.Decimal(metrics.cpc) : null,
    lastCpa: metrics.cpa != null ? new Prisma.Decimal(metrics.cpa) : null,
    lastRoas: metrics.roas != null ? new Prisma.Decimal(metrics.roas) : null,
    lastSyncedAt: new Date()
  };
  if (options.finalize === "killed") {
    data.finalStatus = "killed";
    data.killedReason = String(decision.reason ?? "");
    data.killedAt = new Date();
    data.status = "killed";
  }
  await db.sprintAd.update({ where: { id: sprintAdId }, data });
}

async function advanceSprintStage(sprintId: string, evaluatedStage: number, cascade: CascadeStage[]): Promise<void> {
  const db = getDb();
  const isFinal = evaluatedStage === cascade[cascade.length - 1].stage;
  await db.creativeSprint.update({
    where: { id: sprintId },
    data: {
      currentStage: evaluatedStage,
      status: isFinal ? "complete" : "measuring",
      completedAt: isFinal ? new Date() : null
    }
  });
  if (isFinal) {
    // Mark all survivors as winners.
    await db.sprintAd.updateMany({
      where: { sprintId, finalStatus: "alive" },
      data: { finalStatus: "winner", status: "winner" }
    });
  }
}

// Returns the wall-clock time when each stage of a sprint should fire,
// based on the sprint's publishedAt and the cascade plan. Used by the cron
// to decide which sprints are ready for which stages.
export function computeStageTriggers(publishedAt: Date, cascade: CascadeStage[]): Array<{ stage: number; firesAt: Date }> {
  return cascade.map((s) => ({
    stage: s.stage,
    firesAt: new Date(publishedAt.getTime() + s.hoursAfterLaunch * 60 * 60 * 1000)
  }));
}
