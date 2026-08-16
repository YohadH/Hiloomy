// Manual attribution entry — for orders that came in outside our sync
// paths (BixGrow webhook missed one, phone-order the merchant knows was
// affiliate-driven, backfill from a spreadsheet). Deliberately narrow: we
// only support single-row entry; bulk import stays on the CSV path.
//
// Contract:
//   • The affiliate is identified by email OR affiliateCode. If neither
//     matches an existing member we return 404 rather than auto-create —
//     manual entry is an audit-sensitive action and a typo shouldn't
//     silently spawn a phantom affiliate.
//   • Commission is computed from the member's per-affiliate override, or
//     the program's rate, or a caller-supplied override (in that order of
//     precedence).
//   • Rows are marked `manualEntry: true` so the UI + audit trail can
//     distinguish them from synced conversions.

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";

export interface ManualConversionInput {
  storeId: string;
  // Identify the affiliate. Provide one — email preferred (more unique).
  affiliateEmail?: string | null;
  affiliateCode?: string | null;
  // Order identifier as the operator entered it. Normalized to `#N`.
  orderNumber: string;
  // Sale amount ex-VAT, in the store's currency.
  salesAmount: number;
  // Commission overrides. When null we compute from member override →
  // program rate → 10% default.
  commissionAmount?: number | null;
  // Optional context.
  couponCode?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  contentTitle?: string | null;
  // Timestamp of the sale. Defaults to now when null.
  occurredAt?: Date | null;
  // Free-form audit note.
  note?: string | null;
}

function normalizeOrderNumber(input: string): string {
  const stripped = input.trim().replace(/^#+/, "");
  if (!stripped) throw new AppError("Order number is required.", 400);
  return `#${stripped}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeCommission(db: any, memberId: string, salesAmount: number, override?: number | null): Promise<number> {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) return override;
  const member = await db.affiliateMember.findUnique({
    where: { id: memberId },
    select: {
      commissionRateOverride: true,
      program: { select: { commissionRate: true } }
    }
  });
  const rate = member?.commissionRateOverride ?? member?.program?.commissionRate ?? 0.10;
  const numericRate = Number(rate);
  return Number((salesAmount * (Number.isFinite(numericRate) ? numericRate : 0.10)).toFixed(2));
}

export interface ManualConversionResult {
  attributionId: string;
  affiliateMemberId: string;
  commissionAmount: number;
  linkedOrderId: string | null;
  createdNew: boolean;
}

export async function createManualConversion(
  input: ManualConversionInput
): Promise<ManualConversionResult> {
  if (!input.affiliateEmail && !input.affiliateCode) {
    throw new AppError("Provide either affiliateEmail or affiliateCode.", 400);
  }
  if (!Number.isFinite(input.salesAmount) || input.salesAmount < 0) {
    throw new AppError("salesAmount must be a positive number.", 400);
  }
  const orderNumber = normalizeOrderNumber(input.orderNumber);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;

  // Resolve the affiliate — email first (safer), then affiliateCode.
  const member = await db.affiliateMember.findFirst({
    where: {
      storeId: input.storeId,
      OR: [
        input.affiliateEmail ? { email: input.affiliateEmail.toLowerCase().trim() } : undefined,
        input.affiliateCode ? { affiliateCode: input.affiliateCode.trim() } : undefined
      ].filter(Boolean) as object[]
    },
    select: { id: true }
  });
  if (!member) {
    throw new AppError(
      "No affiliate found matching that email or code. Create the affiliate first, then add the conversion.",
      404
    );
  }

  // Try to link to a Shopify order — same lookup shape the BixGrow webhook
  // uses. If the order isn't synced yet, we still record the row with
  // externalOrderNumber set; the reconciler will fill orderId later.
  const orderRow = await db.order.findFirst({
    where: {
      storeId: input.storeId,
      OR: [{ orderNumber }, { orderNumber: orderNumber.replace(/^#/, "") }]
    },
    select: { id: true }
  });

  const commissionAmount = await computeCommission(
    db,
    member.id,
    input.salesAmount,
    input.commissionAmount
  );

  const occurredAt = input.occurredAt ?? new Date();
  const sourceType = input.sourceType ?? (input.couponCode ? "coupon" : "manual");

  // Prevent silent duplicates on the same order + affiliate — the unique
  // constraint on (affiliateMemberId, orderId) handles matched rows;
  // for unmatched rows we dedupe by (member, externalOrderNumber, amount).
  if (orderRow) {
    const existing = await db.affiliateAttribution.findFirst({
      where: { affiliateMemberId: member.id, orderId: orderRow.id },
      select: { id: true }
    });
    if (existing) {
      throw new AppError(
        `A conversion for this order + affiliate already exists (id ${existing.id}).`,
        409
      );
    }
  } else {
    const existing = await db.affiliateAttribution.findFirst({
      where: {
        storeId: input.storeId,
        affiliateMemberId: member.id,
        orderId: null,
        externalOrderNumber: orderNumber,
        salesAmount: input.salesAmount
      },
      select: { id: true }
    });
    if (existing) {
      throw new AppError(
        `An unmatched conversion for this order + affiliate + amount already exists (id ${existing.id}).`,
        409
      );
    }
  }

  const created = await db.affiliateAttribution.create({
    data: {
      storeId: input.storeId,
      affiliateMemberId: member.id,
      orderId: orderRow?.id ?? null,
      externalOrderNumber: orderNumber,
      couponCode: input.couponCode?.trim() || null,
      sourceType,
      trackingMethod: input.sourceType ?? null,
      sourceUrl: input.sourceUrl?.trim() || null,
      contentTitle: input.contentTitle?.trim() || null,
      salesAmount: input.salesAmount,
      commissionAmount,
      ordersCount: 1,
      occurredAt,
      manualEntry: true,
      payoutStatus: "unpaid",
      payoutNote: input.note?.trim() || null
    },
    select: { id: true, affiliateMemberId: true, commissionAmount: true, orderId: true }
  });

  return {
    attributionId: created.id,
    affiliateMemberId: created.affiliateMemberId,
    commissionAmount: Number(created.commissionAmount),
    linkedOrderId: created.orderId ?? null,
    createdNew: true
  };
}
