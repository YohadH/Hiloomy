// GET /api/affiliate-portal/payouts/summary
//
// Grouped "who do I owe money to" view. Powers the payouts pane on the
// affiliate portal — each row shows one affiliate + how much is approved
// (payout-ready) + how much is unpaid (still in review window).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getPayoutSummary } from "@/lib/services/affiliate-payout-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const summary = await getPayoutSummary(storeId);
    const totals = summary.reduce(
      (acc, row) => {
        acc.approvedCommission += row.approvedCommission;
        acc.approvedCount += row.approvedCount;
        acc.unpaidCommission += row.unpaidCommission;
        acc.unpaidCount += row.unpaidCount;
        return acc;
      },
      { approvedCommission: 0, approvedCount: 0, unpaidCommission: 0, unpaidCount: 0 }
    );
    return NextResponse.json({ ok: true, summary, totals });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
