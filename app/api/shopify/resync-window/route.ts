import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resyncOrdersInWindow } from "@/lib/services/shopify-sync-service";

// POST /api/shopify/resync-window  { storeId, start, end }  (ISO instants)
//
// Re-fetches every order created in the window from Shopify and rewrites its
// lines / discount usages / refunds (see resyncOrdersInWindow). Triggered from
// the discounts page when the dashboard and /discounts disagree on discount
// totals, and it also recovers orders the incremental sync never stored.
// Idempotent; safe to rerun.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_WINDOW_DAYS = 92;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required.", 400);
    }
    const start = new Date(String(body.start ?? ""));
    const end = new Date(String(body.end ?? ""));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new AppError("A valid start/end window is required.", 400);
    }
    if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * 86_400_000) {
      throw new AppError(`Window too large — re-sync at most ${MAX_WINDOW_DAYS} days at a time.`, 400);
    }
    await assertStoreInActiveOrg(body.storeId);

    const result = await resyncOrdersInWindow(body.storeId, start, end);
    return NextResponse.json({ ok: true, fetched: result.fetched });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
