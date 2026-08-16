// POST /api/affiliate-portal/conversions/payout-status
//
// Update payout status for a batch of attributions. Called by the
// conversions table's "Approve / Mark paid / Cancel" bulk actions.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  updatePayoutStatus,
  type PayoutStatus
} from "@/lib/services/affiliate-payout-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED: PayoutStatus[] = ["unpaid", "approved", "paid", "cancelled", "refunded"];

interface Body {
  attributionIds?: string[];
  targetStatus?: string;
  note?: string;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const body = (await request.json().catch(() => ({}))) as Body;
    if (!Array.isArray(body.attributionIds) || body.attributionIds.length === 0) {
      throw new AppError("attributionIds must be a non-empty array.", 400);
    }
    if (!body.targetStatus || !ALLOWED.includes(body.targetStatus as PayoutStatus)) {
      throw new AppError(
        `targetStatus must be one of: ${ALLOWED.join(", ")}.`,
        400
      );
    }

    const result = await updatePayoutStatus({
      storeId,
      attributionIds: body.attributionIds,
      targetStatus: body.targetStatus as PayoutStatus,
      note: body.note ?? null
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
