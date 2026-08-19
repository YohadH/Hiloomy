import { getDb } from "@/lib/server/db";

// Commission-leakage engine (Insight Engine 1).
//
// Classifies every affiliate conversion by whether the attributed order
// came from a NEW customer (their first known order) or a RETURNING one
// (the brand already owned them — the commission is potential leakage),
// and aggregates the money split for the portal's leakage card.
//
// The classifier is set-based: one UPDATE joining Order history via a
// LATERAL max-lookup, scoped to unclassified rows, so it is idempotent
// and cheap to run after every attribution sync (20k rows ≈ instant).

export interface LeakageSummary {
  windowStart: string;
  windowEnd: string;
  newCustomer: { conversions: number; commission: number; sales: number };
  returningCustomer: { conversions: number; commission: number; sales: number };
  unclassified: { conversions: number; commission: number };
  /** Share of classified commission that went to returning customers (0..1). */
  leakageRate: number;
  topLeakyAffiliates: Array<{
    affiliateMemberId: string;
    name: string;
    returningCommission: number;
    returningConversions: number;
  }>;
}

/**
 * Classify all still-unclassified attributions that have a linked order.
 * Safe to call repeatedly; only touches rows where customerType IS NULL.
 * Returns the number of rows classified in this pass.
 */
export async function classifyUnclassifiedAttributions(storeId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  // Orders without a customer stay NULL (nothing to classify against).
  // EXTRACT(EPOCH)/86400 keeps day math timezone-stable in Postgres.
  const updated = await db.$executeRaw`
    UPDATE "AffiliateAttribution" a
    SET "customerType" = sub.customer_type,
        "daysSincePrevOrder" = sub.days_since_prev
    FROM (
      SELECT o.id AS order_id,
             CASE WHEN prev.prev_at IS NULL THEN 'new' ELSE 'returning' END AS customer_type,
             CASE WHEN prev.prev_at IS NULL THEN NULL
                  ELSE FLOOR(EXTRACT(EPOCH FROM (o."createdAt" - prev.prev_at)) / 86400)::int
             END AS days_since_prev
      FROM "Order" o
      LEFT JOIN LATERAL (
        SELECT MAX(o2."createdAt") AS prev_at
        FROM "Order" o2
        WHERE o2."storeId" = o."storeId"
          AND o2."customerId" = o."customerId"
          AND o2."createdAt" < o."createdAt"
      ) prev ON true
      WHERE o."storeId" = ${storeId}
        AND o."customerId" IS NOT NULL
    ) sub
    WHERE a."storeId" = ${storeId}
      AND a."customerType" IS NULL
      AND a."orderId" = sub.order_id
  `;
  return updated;
}

export async function getCommissionLeakageSummary(input: {
  storeId: string;
  start: Date;
  end: Date;
}): Promise<LeakageSummary> {
  const db = getDb();
  const empty: LeakageSummary = {
    windowStart: input.start.toISOString(),
    windowEnd: input.end.toISOString(),
    newCustomer: { conversions: 0, commission: 0, sales: 0 },
    returningCustomer: { conversions: 0, commission: 0, sales: 0 },
    unclassified: { conversions: 0, commission: 0 },
    leakageRate: 0,
    topLeakyAffiliates: []
  };
  if (!db?.affiliateAttribution) return empty;

  const where = {
    storeId: input.storeId,
    occurredAt: { gte: input.start, lte: input.end },
    // Cancelled/refunded conversions never pay out — excluding them keeps
    // the leakage number aligned with money actually leaving the account.
    payoutStatus: { notIn: ["cancelled", "refunded"] }
  };

  const groups = (await db.affiliateAttribution.groupBy({
    by: ["customerType"],
    where,
    _count: { _all: true },
    _sum: { commissionAmount: true, salesAmount: true }
  })) as Array<{
    customerType: string | null;
    _count: { _all: number };
    _sum: { commissionAmount: unknown; salesAmount: unknown };
  }>;

  const num = (v: unknown) => (v == null ? 0 : Number(v));
  const summary: LeakageSummary = { ...empty };
  for (const g of groups) {
    const bucket = {
      conversions: g._count._all,
      commission: num(g._sum.commissionAmount),
      sales: num(g._sum.salesAmount)
    };
    if (g.customerType === "new") summary.newCustomer = bucket;
    else if (g.customerType === "returning") summary.returningCustomer = bucket;
    else summary.unclassified = { conversions: bucket.conversions, commission: bucket.commission };
  }

  const classifiedCommission = summary.newCustomer.commission + summary.returningCustomer.commission;
  summary.leakageRate = classifiedCommission > 0 ? summary.returningCustomer.commission / classifiedCommission : 0;

  const leaky = (await db.affiliateAttribution.groupBy({
    by: ["affiliateMemberId"],
    where: { ...where, customerType: "returning" },
    _count: { _all: true },
    _sum: { commissionAmount: true },
    orderBy: { _sum: { commissionAmount: "desc" } },
    take: 5
  })) as Array<{
    affiliateMemberId: string;
    _count: { _all: number };
    _sum: { commissionAmount: unknown };
  }>;

  if (leaky.length > 0) {
    const members = (await db.affiliateMember.findMany({
      where: { id: { in: leaky.map((l) => l.affiliateMemberId) } },
      select: { id: true, firstName: true, lastName: true }
    })) as Array<{ id: string; firstName: string | null; lastName: string | null }>;
    const nameOf = new Map(members.map((m) => [m.id, `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || "—"]));
    summary.topLeakyAffiliates = leaky.map((l) => ({
      affiliateMemberId: l.affiliateMemberId,
      name: nameOf.get(l.affiliateMemberId) ?? "—",
      returningCommission: num(l._sum.commissionAmount),
      returningConversions: l._count._all
    }));
  }

  return summary;
}
