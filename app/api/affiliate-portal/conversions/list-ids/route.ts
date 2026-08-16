// GET /api/affiliate-portal/conversions/list-ids
// Query params:
//   payoutStatus       — one of unpaid | approved | paid | cancelled | refunded
//   affiliateMemberId  — optional, scopes to one affiliate
//
// Returns just an array of attribution IDs matching the filter. Used by
// the payouts view to fetch the id set for a bulk state transition
// (approve all pending / mark-paid for one affiliate). Kept separate
// from the paginated conversions list so we can return up to 1000 ids
// in one call without pagination bookkeeping.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";

const ALLOWED_STATUSES = new Set([
  "unpaid",
  "approved",
  "paid",
  "cancelled",
  "refunded"
]);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const url = new URL(request.url);
    const payoutStatus = url.searchParams.get("payoutStatus")?.trim() ?? "";
    if (!payoutStatus || !ALLOWED_STATUSES.has(payoutStatus)) {
      throw new AppError("payoutStatus query param required.", 400);
    }
    const affiliateMemberId = url.searchParams.get("affiliateMemberId")?.trim() || undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getDb() as any;
    const rows = await db.affiliateAttribution.findMany({
      where: {
        storeId,
        payoutStatus,
        ...(affiliateMemberId ? { affiliateMemberId } : {})
      },
      // Cap at 1000 to match the updatePayoutStatus limit.
      take: 1000,
      select: { id: true }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attributionIds = (rows as any[]).map((r) => r.id as string);
    return NextResponse.json({ ok: true, attributionIds, capped: rows.length === 1000 });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
