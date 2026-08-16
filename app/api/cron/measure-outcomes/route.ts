import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { measureOutcomesForResolvedAlerts } from "@/lib/services/alert-outcome-service";

// Daily outcome-measurement pass. For every store with at least one
// resolved alert, runs `measureOutcomesForResolvedAlerts` so the next
// time the founder opens the app (or the weekly PDF is generated), the
// "what happened after you acted" closed-loop section already has fresh
// data. Without this cron, outcomes only get measured when something
// loads the Command Center or a PDF — which on a SaaS at scale means
// stores that aren't checked daily can miss the loop.
//
// Idempotent: skips alerts that already have an outcome in payloadJson.
// Per-store failures are logged but don't stop the run.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // measurement is fast; 5 minutes is plenty headroom

export async function POST() {
  const db = getDb();
  // Find every store that has at least one resolved alert without an outcome.
  // Cheap pre-filter so a store with no closed alerts isn't even visited.
  // We can't query inside Json columns portably, so we just pick stores with
  // resolved alerts in the last 30 days — the per-store call skips already
  // measured ones.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const stores = (await db.alert.groupBy({
    by: ["storeId"],
    where: {
      status: "resolved",
      resolvedAt: { gte: since }
    },
    _count: { _all: true }
  })) as Array<{ storeId: string; _count: { _all: number } }>;

  const results: Array<{ storeId: string; measured: number; skipped: number }> = [];
  const errors: Array<{ storeId: string; error: string }> = [];

  for (const { storeId } of stores) {
    try {
      const res = await measureOutcomesForResolvedAlerts({ storeId });
      results.push({ storeId, measured: res.measured, skipped: res.skipped });
    } catch (e) {
      errors.push({
        storeId,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    stores: stores.length,
    results,
    errors
  });
}
