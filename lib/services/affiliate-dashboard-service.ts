// The affiliate's OWN dashboard data (HLA-12/B9): "כמה מכרתי ומה מגיע לי".
//
// Reads the same AffiliateAttribution rows the owner's portal reads — one
// source of truth, so the affiliate's numbers and the owner's numbers can
// never disagree. Strictly scoped to (memberId, storeId) from the session.
//
// Privacy rule: nothing customer-identifying leaves this service — order
// references and amounts only.

import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";

export type AffiliateRangeKey = "month" | "30d" | "all";

export interface AffiliateSelfDashboard {
  member: {
    firstName: string;
    lastName: string;
    affiliateCode: string;
    couponCode: string | null;
    referralLink: string | null;
    status: string;
  };
  rangeKey: AffiliateRangeKey;
  kpis: {
    orders: number;
    sales: number;
    commission: number;
    clicks: number;
    /** null when there are no clicks — never render a fake 0%. */
    conversionPct: number | null;
  };
  commissionByStatus: { unpaid: number; approved: number; paid: number };
  conversions: Array<{
    occurredAt: string;
    orderRef: string;
    salesAmount: number;
    commissionAmount: number;
    payoutStatus: string;
  }>;
}

function rangeStart(key: AffiliateRangeKey): Date | null {
  const now = new Date();
  if (key === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (key === "30d") return new Date(now.getTime() - 30 * 86_400_000);
  return null;
}

export async function buildAffiliateSelfDashboard(input: {
  memberId: string;
  storeId: string;
  rangeKey?: AffiliateRangeKey;
}): Promise<AffiliateSelfDashboard | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const rangeKey: AffiliateRangeKey =
    input.rangeKey === "month" || input.rangeKey === "all" ? input.rangeKey : "30d";
  const start = rangeStart(rangeKey);
  const occurredScope = start ? { occurredAt: { gte: start } } : {};
  const createdScope = start ? { createdAt: { gte: start } } : {};

  const member = await db.affiliateMember.findFirst({
    where: { id: input.memberId, storeId: input.storeId },
    select: {
      firstName: true,
      lastName: true,
      affiliateCode: true,
      couponCode: true,
      referralLink: true,
      status: true
    }
  });
  if (!member) return null;

  const [byStatus, clicks, conversions] = await Promise.all([
    db.affiliateAttribution.groupBy({
      by: ["payoutStatus"],
      where: { storeId: input.storeId, affiliateMemberId: input.memberId, ...occurredScope },
      _sum: { salesAmount: true, commissionAmount: true, ordersCount: true }
    }) as Promise<
      Array<{
        payoutStatus: string;
        _sum: { salesAmount: unknown; commissionAmount: unknown; ordersCount: number | null };
      }>
    >,
    db.attributionSession
      ? (db.attributionSession.count({
          where: { storeId: input.storeId, affiliateMemberId: input.memberId, ...createdScope }
        }) as Promise<number>)
      : Promise.resolve(0),
    db.affiliateAttribution.findMany({
      where: { storeId: input.storeId, affiliateMemberId: input.memberId, ...occurredScope },
      orderBy: { occurredAt: "desc" },
      take: 50,
      select: {
        occurredAt: true,
        externalOrderNumber: true,
        orderId: true,
        salesAmount: true,
        commissionAmount: true,
        payoutStatus: true
      }
    }) as Promise<
      Array<{
        occurredAt: Date;
        externalOrderNumber: string | null;
        orderId: string | null;
        salesAmount: unknown;
        commissionAmount: unknown;
        payoutStatus: string;
      }>
    >
  ]);

  let orders = 0;
  let sales = 0;
  let commission = 0;
  const commissionByStatus = { unpaid: 0, approved: 0, paid: 0 };
  for (const row of byStatus) {
    // Cancelled/refunded commission is excluded from "earned" — showing an
    // affiliate money that was clawed back as earned would be a lie.
    const rowCommission = toNumber(row._sum.commissionAmount);
    const rowSales = toNumber(row._sum.salesAmount);
    const rowOrders = Number(row._sum.ordersCount ?? 0);
    if (row.payoutStatus === "cancelled" || row.payoutStatus === "refunded") continue;
    orders += rowOrders;
    sales += rowSales;
    commission += rowCommission;
    if (row.payoutStatus === "unpaid") commissionByStatus.unpaid += rowCommission;
    else if (row.payoutStatus === "approved") commissionByStatus.approved += rowCommission;
    else if (row.payoutStatus === "paid") commissionByStatus.paid += rowCommission;
  }

  return {
    member: {
      firstName: member.firstName,
      lastName: member.lastName,
      affiliateCode: member.affiliateCode,
      couponCode: member.couponCode ?? null,
      referralLink: member.referralLink ?? null,
      status: member.status
    },
    rangeKey,
    kpis: {
      orders,
      sales: Math.round(sales * 100) / 100,
      commission: Math.round(commission * 100) / 100,
      clicks,
      conversionPct: clicks > 0 ? Math.round((orders / clicks) * 1000) / 10 : null
    },
    commissionByStatus: {
      unpaid: Math.round(commissionByStatus.unpaid * 100) / 100,
      approved: Math.round(commissionByStatus.approved * 100) / 100,
      paid: Math.round(commissionByStatus.paid * 100) / 100
    },
    conversions: conversions.map((c) => ({
      occurredAt: c.occurredAt.toISOString(),
      orderRef: c.externalOrderNumber ?? (c.orderId ? `#${c.orderId.slice(-6).toUpperCase()}` : "—"),
      salesAmount: toNumber(c.salesAmount),
      commissionAmount: toNumber(c.commissionAmount),
      payoutStatus: c.payoutStatus
    }))
  };
}
