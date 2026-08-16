// Affiliate payout state machine.
//
// State model — matches AffiliateAttribution.payoutStatus values:
//
//   unpaid    → approved   (merchant confirms sale is real)
//              → cancelled  (merchant rejects — fraud, chargeback)
//   approved  → paid        (included in a payout run; sets paidAt)
//              → unpaid     (revert — misclick recovery)
//              → cancelled  (rejected after approval)
//   paid      → refunded    (order refunded post-payout — claw-back)
//   cancelled → unpaid      (revert — misclick recovery)
//   refunded  → paid        (rare — refund reversed)
//
// Invalid transitions throw AppError with the reason.
//
// All mutations happen in bulk-safe form (a single UPDATE ... WHERE id IN ...)
// so the UI can send one "mark all as paid" click and get atomic behavior.

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";

export type PayoutStatus = "unpaid" | "approved" | "paid" | "cancelled" | "refunded";

const ALLOWED_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  unpaid: ["approved", "cancelled"],
  approved: ["paid", "unpaid", "cancelled"],
  paid: ["refunded"],
  cancelled: ["unpaid"],
  refunded: ["paid"]
};

function assertTransitionAllowed(from: PayoutStatus, to: PayoutStatus): void {
  if (from === to) return; // idempotent
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new AppError(
      `Invalid payout transition ${from} → ${to}. Allowed from ${from}: ${ALLOWED_TRANSITIONS[from]?.join(", ") || "(none)"}.`,
      409
    );
  }
}

export interface UpdatePayoutStatusInput {
  storeId: string;
  attributionIds: string[];
  targetStatus: PayoutStatus;
  // Optional note attached to every row (e.g. "Wise payout #12345").
  note?: string | null;
}

export interface UpdatePayoutStatusResult {
  updated: number;
  skippedInvalidTransitions: number;
  updatedIds: string[];
}

export async function updatePayoutStatus(
  input: UpdatePayoutStatusInput
): Promise<UpdatePayoutStatusResult> {
  if (input.attributionIds.length === 0) {
    return { updated: 0, skippedInvalidTransitions: 0, updatedIds: [] };
  }
  if (input.attributionIds.length > 1000) {
    throw new AppError("At most 1000 rows per payout update.", 400);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;

  // Fetch current state so we can enforce the transition table.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current: Array<{ id: string; payoutStatus: PayoutStatus }> = await db.affiliateAttribution.findMany({
    where: { storeId: input.storeId, id: { in: input.attributionIds } },
    select: { id: true, payoutStatus: true }
  });

  const idsToUpdate: string[] = [];
  let skipped = 0;
  for (const row of current) {
    try {
      assertTransitionAllowed(row.payoutStatus as PayoutStatus, input.targetStatus);
      if (row.payoutStatus !== input.targetStatus) idsToUpdate.push(row.id);
    } catch {
      skipped += 1;
    }
  }

  if (idsToUpdate.length === 0) {
    return { updated: 0, skippedInvalidTransitions: skipped, updatedIds: [] };
  }

  // `paidAt` is set on transition TO 'paid', cleared on transition AWAY
  // from 'paid'. Same pattern the BixGrow-style dashboards use.
  const now = new Date();
  await db.affiliateAttribution.updateMany({
    where: { storeId: input.storeId, id: { in: idsToUpdate } },
    data: {
      payoutStatus: input.targetStatus,
      paidAt: input.targetStatus === "paid" ? now : null,
      payoutNote: input.note ?? undefined
    }
  });

  return {
    updated: idsToUpdate.length,
    skippedInvalidTransitions: skipped,
    updatedIds: idsToUpdate
  };
}

// Summary numbers for the payouts pane. Grouped by affiliateMember so the
// UI can show "you owe X to affiliate Y".
export interface PayoutSummaryRow {
  affiliateMemberId: string;
  firstName: string;
  lastName: string;
  email: string;
  payoutMethod: string | null;
  payoutDetails: string | null;
  approvedCommission: number;
  approvedCount: number;
  unpaidCommission: number;
  unpaidCount: number;
}

export async function getPayoutSummary(storeId: string): Promise<PayoutSummaryRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;

  const rows = await db.affiliateAttribution.groupBy({
    by: ["affiliateMemberId", "payoutStatus"],
    where: {
      storeId,
      payoutStatus: { in: ["approved", "unpaid"] }
    },
    _sum: { commissionAmount: true },
    _count: { _all: true }
  });

  const byMember = new Map<string, { approved: { sum: number; count: number }; unpaid: { sum: number; count: number } }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of rows as any[]) {
    const bucket = byMember.get(r.affiliateMemberId) ?? {
      approved: { sum: 0, count: 0 },
      unpaid: { sum: 0, count: 0 }
    };
    const key = r.payoutStatus === "approved" ? "approved" : "unpaid";
    bucket[key].sum += Number(r._sum.commissionAmount ?? 0);
    bucket[key].count += Number(r._count._all ?? 0);
    byMember.set(r.affiliateMemberId, bucket);
  }

  if (byMember.size === 0) return [];

  const members = await db.affiliateMember.findMany({
    where: { storeId, id: { in: Array.from(byMember.keys()) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      payoutMethod: true,
      payoutDetails: true
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (members as any[])
    .map((m) => {
      const bucket = byMember.get(m.id)!;
      return {
        affiliateMemberId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        payoutMethod: m.payoutMethod ?? null,
        payoutDetails: m.payoutDetails ?? null,
        approvedCommission: bucket.approved.sum,
        approvedCount: bucket.approved.count,
        unpaidCommission: bucket.unpaid.sum,
        unpaidCount: bucket.unpaid.count
      };
    })
    .sort((a, b) => b.approvedCommission - a.approvedCommission);
}
