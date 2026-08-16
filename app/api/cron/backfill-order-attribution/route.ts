import { NextResponse } from "next/server";
import { toErrorMessage, AppError } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { syncOrders } from "@/lib/services/shopify-sync-service";

// One-shot backfill route — re-runs the Shopify order sync for the last
// `?days` days so historical orders get reprocessed through the updated
// mapper (which now captures landingSiteRef + referringSite).
//
// Usage:
//   POST /api/cron/backfill-order-attribution           → defaults to 60 days
//   POST /api/cron/backfill-order-attribution?days=14   → custom window
//
// Idempotent — Shopify's GraphQL `updated_at:>=…` query returns the same
// rows on re-run; upserts converge.
//
// Long-running: orders sync rate-limits at ~100/req. A 60-day window for a
// store with ~30 orders/day = ~1,800 orders ≈ 18 pages ≈ 60-90 seconds.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const days = Math.max(1, Math.min(180, Number(url.searchParams.get("days") ?? "60") || 60));
    const storeId = url.searchParams.get("storeId")?.trim() || (await resolveActiveStoreId());
    if (!storeId) throw new AppError("No active store.", 400);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const start = Date.now();
    const result = await syncOrders(storeId, since);
    const elapsed = Date.now() - start;

    return NextResponse.json({
      ok: true,
      storeId,
      days,
      since: since.toISOString(),
      elapsedMs: elapsed,
      result
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
