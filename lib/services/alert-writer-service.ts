// Alert writer protocol.
//
// Every detection engine in the app (restock-hero, stockout-imminent,
// roas-collapse, silent-affiliate, sync-failure, refund-spike, etc.) writes
// alerts through THIS service rather than touching the `Alert` table
// directly. Push model — see memory/project_north_star_command_center.md.
//
// Why a writer service:
//   1. Dedup — same condition shouldn't re-create a new open row every time
//      the engine runs. Engines emit a stable `fingerprint`; we upsert.
//   2. Mirror legacy columns — the existing Alerts page reads `explanation`,
//      `suggestedAction`, `periodLabel`, `timestamp` via the Alert domain
//      type. We mirror canonical fields into them on insert.
//   3. Lifecycle hooks — when an engine reruns and no longer detects a
//      condition, it can call `resolveStale()` to mark all the open alerts
//      it owns (by `detectedBy` + type) but didn't re-emit this run.
//   4. Multi-tenant safety — the API forces `storeId` in every write.
//
// Engines never decide severity vocabulary or status strings ad-hoc;
// they pick from the constants below.

import { getDb } from "@/lib/server/db";

export type AlertSeverity = "critical" | "high" | "medium" | "low";
export type AlertStatus = "open" | "acknowledged" | "resolved" | "ignored";
export type AlertSource = "Shopify" | "Meta" | "BixGrow" | "Instagram" | "Calculated";

export interface UpsertAlertInput {
  storeId: string;
  // Stable type slug — e.g. "restock_hero", "stockout_imminent",
  // "roas_collapse". Used by the UI to group and template renderers.
  type: string;
  // Stable dedup key. The engine decides what makes "the same alert".
  // Examples:
  //   restock-hero        → `restock_hero:${productId}`
  //   stockout-imminent   → `stockout_imminent:${variantId}`
  //   roas-collapse       → `roas_collapse:${campaignId}`
  //   silent-affiliate    → `silent_affiliate:${affiliateMemberId}`
  // The same fingerprint can re-fire after the previous one was resolved
  // (the unique index covers status too).
  fingerprint: string;
  severity: AlertSeverity;
  source: AlertSource;
  // Diagnostic — engine file name, e.g. "restock-hero-alert-service".
  detectedBy: string;
  title: string;
  description: string;
  recommendedAction: string;
  // Optional numeric context (e.g. ROAS dropped from 5.2x to 1.8x).
  metricName?: string;
  currentValue?: number;
  previousValue?: number;
  // Click-through target — UI uses these to deep-link the alert card.
  relatedEntityType?: "product" | "campaign" | "affiliate" | "order" | "variant" | "sync_run";
  relatedEntityId?: string;
  // Engine-specific blob. Renderer reads this when it needs more than the
  // common fields (e.g. restock-hero passes its full detail object).
  payloadJson?: Record<string, unknown>;
  // Optional context label, e.g. "Last 7 days".
  periodLabel?: string;
}

export interface UpsertAlertResult {
  id: string;
  created: boolean;
}

// Create or refresh an open alert with the given fingerprint. If an open
// alert already exists for (storeId, fingerprint), its mutable fields are
// updated in place (severity, copy, payload, metric snapshots) and a new
// `updatedAt` is stamped. If it doesn't exist (or only resolved/ignored
// rows exist), a new open row is created.
export async function upsertAlert(input: UpsertAlertInput): Promise<UpsertAlertResult> {
  const db = getDb();

  const existing = await db.alert.findFirst({
    where: {
      storeId: input.storeId,
      fingerprint: input.fingerprint,
      status: "open"
    },
    select: { id: true }
  });

  // We mirror canonical fields into the legacy columns so the existing
  // Alerts page (which reads `explanation` / `suggestedAction` / `timestamp`)
  // keeps showing alerts emitted by the new writers.
  const commonData = {
    type: input.type,
    severity: input.severity,
    source: input.source,
    detectedBy: input.detectedBy,
    title: input.title,
    description: input.description,
    recommendedAction: input.recommendedAction,
    metricName: input.metricName ?? null,
    currentValue: input.currentValue != null ? (input.currentValue as any) : null,
    previousValue: input.previousValue != null ? (input.previousValue as any) : null,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    payloadJson: (input.payloadJson ?? null) as any,
    explanation: input.description,
    suggestedAction: input.recommendedAction,
    periodLabel: input.periodLabel ?? null
  };

  if (existing) {
    await db.alert.update({
      where: { id: existing.id },
      data: commonData
    });
    return { id: existing.id, created: false };
  }

  const created = await db.alert.create({
    data: {
      storeId: input.storeId,
      fingerprint: input.fingerprint,
      status: "open",
      timestamp: new Date(),
      ...commonData
    },
    select: { id: true }
  });
  return { id: created.id, created: true };
}

// Mark a specific alert resolved by fingerprint. Used when the engine
// detects the condition has cleared (e.g. inventory replenished, ROAS
// recovered). No-op if there's no open row for that fingerprint.
export async function resolveAlertByFingerprint(input: {
  storeId: string;
  fingerprint: string;
  resolvedBy?: string;
}): Promise<{ resolved: number }> {
  const db = getDb();
  // Same P2002 fix as resolveStaleAlerts — clear any previously-resolved
  // row with this fingerprint before flipping the open one to resolved.
  await db.alert.deleteMany({
    where: {
      storeId: input.storeId,
      fingerprint: input.fingerprint,
      status: "resolved"
    }
  });
  const result = await db.alert.updateMany({
    where: {
      storeId: input.storeId,
      fingerprint: input.fingerprint,
      status: "open"
    },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy: input.resolvedBy ?? "system:auto"
    }
  });
  return { resolved: result.count };
}

// "Sweep" lifecycle helper. An engine that runs end-to-end and emits a
// COMPLETE set of currently-detected alerts each pass can call this AFTER
// it has emitted everything, to resolve any open alerts it had previously
// emitted but didn't re-emit this pass. Scoped by `detectedBy` so engines
// can't accidentally close each other's alerts.
//
// Usage:
//   const survivors = ["restock_hero:p1", "restock_hero:p2"];
//   await resolveStaleAlerts({ storeId, detectedBy: "restock-hero-alert-service",
//                              type: "restock_hero", keepFingerprints: survivors });
export async function resolveStaleAlerts(input: {
  storeId: string;
  detectedBy: string;
  type: string;
  keepFingerprints: string[];
  resolvedBy?: string;
}): Promise<{ resolved: number }> {
  const db = getDb();
  // The Alert model has @@unique([storeId, fingerprint, status]). A
  // simple updateMany(status: "resolved") fails with P2002 the second
  // time an alert with the same fingerprint cycles (open → resolved →
  // open again → resolved would collide with the earlier resolved row).
  // Pre-delete any existing "resolved" rows for these fingerprints
  // BEFORE bulk-updating the open ones so the unique key has no
  // duplicate to collide against.
  const openAlerts = await db.alert.findMany({
    where: {
      storeId: input.storeId,
      detectedBy: input.detectedBy,
      type: input.type,
      status: "open",
      ...(input.keepFingerprints.length > 0
        ? { fingerprint: { notIn: input.keepFingerprints } }
        : {})
    },
    select: { fingerprint: true }
  });
  const fingerprintsToResolve = Array.from(
    new Set((openAlerts as Array<{ fingerprint: string }>).map((a) => a.fingerprint))
  );
  if (fingerprintsToResolve.length > 0) {
    await db.alert.deleteMany({
      where: {
        storeId: input.storeId,
        detectedBy: input.detectedBy,
        type: input.type,
        status: "resolved",
        fingerprint: { in: fingerprintsToResolve }
      }
    });
  }
  const result = await db.alert.updateMany({
    where: {
      storeId: input.storeId,
      detectedBy: input.detectedBy,
      type: input.type,
      status: "open",
      ...(input.keepFingerprints.length > 0
        ? { fingerprint: { notIn: input.keepFingerprints } }
        : {})
    },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy: input.resolvedBy ?? "system:auto-sweep"
    }
  });
  return { resolved: result.count };
}

// Convenience query — used by the Command Center + Alerts page. Caller
// projects to whatever shape they need; we keep the API thin so we don't
// proliferate read shapes.
export async function listOpenAlerts(input: {
  storeId: string;
  type?: string;
  severity?: AlertSeverity | AlertSeverity[];
  limit?: number;
}) {
  const db = getDb();
  return db.alert.findMany({
    where: {
      storeId: input.storeId,
      status: "open",
      ...(input.type ? { type: input.type } : {}),
      ...(input.severity
        ? {
            severity: Array.isArray(input.severity)
              ? { in: input.severity }
              : input.severity
          }
        : {})
    },
    orderBy: [
      // critical first → low last
      { severity: "asc" },
      { createdAt: "desc" }
    ],
    take: input.limit ?? 100
  });
}
