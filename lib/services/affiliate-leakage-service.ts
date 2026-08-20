import { getDb } from "@/lib/server/db";
import {
  upsertAlert,
  resolveAlertByFingerprint
} from "@/lib/services/alert-writer-service";

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

// ─────────────────────────────────────────────────────────────────────────
// Returning-customer commission policy ("plug the leak")
//
// Programs can declare what a returning customer's conversion is worth:
//   full    — base rate (default; nothing changes)
//   reduced — program.returningCommissionRate instead of the base rate
//   zero    — no commission
// plus an optional reactivation window: a returning customer whose
// previous order is ≥ N days old counts as genuinely re-acquired by the
// affiliate and earns the FULL base rate despite the policy.
//
// Enforcement is a set-based repricer rather than inline math at each of
// the three attribution-writing sites (webhook, sync backfill, import):
// at write time the row is usually not yet classified new/returning, so
// writers store the base-rate amount and the repricer — which runs right
// after every classification pass — settles the final amount long before
// payout approval. Only "unpaid", non-manual rows are ever touched;
// approved/paid/cancelled/refunded amounts are locked by definition.
// ─────────────────────────────────────────────────────────────────────────

export type ReturningCustomerPolicy = "full" | "reduced" | "zero";

export interface ApplyPolicyResult {
  repriced: number;
}

/**
 * Reprice unpaid returning-customer conversions per each program's policy.
 * Idempotent — recomputes deterministic values from current policy state,
 * including restoring base-rate amounts when a policy is switched back to
 * "full". Recomputes member commission totals afterwards so approved
 * balances stay consistent.
 */
export async function applyReturningCommissionPolicy(storeId: string): Promise<ApplyPolicyResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  if (!db?.affiliateProgram) return { repriced: 0 };

  const programs: Array<{
    id: string;
    status: string;
    commissionRate: unknown;
    returningCustomerPolicy: string;
    returningCommissionRate: unknown;
    reactivationWindowDays: number | null;
  }> = await db.affiliateProgram.findMany({
    where: { storeId },
    orderBy: { createdAt: "asc" }
  });
  if (programs.length === 0) return { repriced: 0 };

  // Members with no program row fall back to the store's oldest ACTIVE
  // program. (The policy API writes the same policy to every program of
  // the store, so which fallback wins only decides the base rate.)
  const activePrograms = programs.filter((p) => p.status === "active");
  const fallbackProgramId = activePrograms[0]?.id ?? programs[0].id;

  let repriced = 0;

  for (const program of programs) {
    const isFallback = program.id === fallbackProgramId;
    const policy = (program.returningCustomerPolicy ?? "full") as ReturningCustomerPolicy;
    const baseRate = Number(program.commissionRate ?? 0.1);
    const reducedRate = program.returningCommissionRate != null
      ? Number(program.returningCommissionRate)
      : baseRate;
    const reactivationDays = program.reactivationWindowDays ?? null;

    if (policy === "full") {
      // Restore pass only: rows a previous policy touched go back to the
      // member's base rate. Untouched rows are never rewritten so custom
      // imported amounts survive for merchants who never opted in.
      const restored = await db.$executeRaw`
        UPDATE "AffiliateAttribution" a
        SET "commissionAmount" = ROUND(a."salesAmount" * COALESCE(m."commissionRateOverride", ${baseRate}::numeric), 2),
            "appliedPolicy" = NULL
        FROM "AffiliateMember" m
        WHERE a."affiliateMemberId" = m.id
          AND a."storeId" = ${storeId}
          AND m."storeId" = ${storeId}
          AND (m."programId" = ${program.id} OR (${isFallback} AND m."programId" IS NULL))
          AND a."payoutStatus" = 'unpaid'
          AND a."manualEntry" = false
          AND a."appliedPolicy" IS NOT NULL
      `;
      repriced += Number(restored) || 0;
      continue;
    }

    const updated = await db.$executeRaw`
      UPDATE "AffiliateAttribution" a
      SET "commissionAmount" = ROUND(a."salesAmount" * (
            CASE
              WHEN ${reactivationDays}::int IS NOT NULL
                   AND a."daysSincePrevOrder" IS NOT NULL
                   AND a."daysSincePrevOrder" >= ${reactivationDays}::int
                THEN COALESCE(m."commissionRateOverride", ${baseRate}::numeric)
              WHEN ${policy} = 'zero' THEN 0
              ELSE ${reducedRate}::numeric
            END
          ), 2),
          "appliedPolicy" = (
            CASE
              WHEN ${reactivationDays}::int IS NOT NULL
                   AND a."daysSincePrevOrder" IS NOT NULL
                   AND a."daysSincePrevOrder" >= ${reactivationDays}::int
                THEN 'reactivated_full'
              WHEN ${policy} = 'zero' THEN 'returning_zero'
              ELSE 'returning_reduced'
            END
          )
      FROM "AffiliateMember" m
      WHERE a."affiliateMemberId" = m.id
        AND a."storeId" = ${storeId}
        AND m."storeId" = ${storeId}
        AND (m."programId" = ${program.id} OR (${isFallback} AND m."programId" IS NULL))
        AND a."customerType" = 'returning'
        AND a."payoutStatus" = 'unpaid'
        AND a."manualEntry" = false
    `;
    repriced += Number(updated) || 0;
  }

  if (repriced > 0) {
    await recomputeMemberCommissionTotals(storeId);
  }
  return { repriced };
}

// Commission repricing invalidates AffiliateMember.commissionTotal and
// approvedBalance. Recompute both from the attribution ledger (same
// definitions as the sync backfill: commissionTotal = lifetime accrual,
// approvedBalance = unpaid + approved rows still owed).
async function recomputeMemberCommissionTotals(storeId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const groups: Array<{
    affiliateMemberId: string;
    payoutStatus: string;
    _sum: { commissionAmount: unknown };
  }> = await db.affiliateAttribution.groupBy({
    by: ["affiliateMemberId", "payoutStatus"],
    where: { storeId },
    _sum: { commissionAmount: true }
  });

  const perMember = new Map<string, { lifetime: number; owed: number }>();
  for (const g of groups) {
    const bucket = perMember.get(g.affiliateMemberId) ?? { lifetime: 0, owed: 0 };
    const amount = g._sum.commissionAmount == null ? 0 : Number(g._sum.commissionAmount);
    bucket.lifetime += amount;
    if (g.payoutStatus === "unpaid" || g.payoutStatus === "approved") bucket.owed += amount;
    perMember.set(g.affiliateMemberId, bucket);
  }

  for (const [memberId, totals] of perMember) {
    await db.affiliateMember.update({
      where: { id: memberId },
      data: { commissionTotal: totals.lifetime, approvedBalance: totals.owed }
    }).catch(() => null);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Monthly leakage alert — "₪X of commissions went to returning customers,
// consider a returning-customer rate." Runs from the 2h refresh cron; the
// fingerprint rotates monthly so a fresh alert can fire each month while
// the writer's dedup keeps the current month to a single open row.
// ─────────────────────────────────────────────────────────────────────────

const LEAKAGE_ALERT_MIN_RATE = 0.15; // ≥15% of classified commission
const LEAKAGE_ALERT_MIN_AMOUNT = 100; // and at least ₪100 in the window

export interface LeakageAlertResult {
  fired: boolean;
  resolved: boolean;
}

export async function upsertCommissionLeakageAlert(storeId: string): Promise<LeakageAlertResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  if (!db?.affiliateAttribution) return { fired: false, resolved: false };

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  const fingerprint = `commission_leakage:${end.toISOString().slice(0, 7)}`;

  const summary = await getCommissionLeakageSummary({ storeId, start, end });

  // Merchants who already switched every active program off "full" have
  // acted on the insight — remaining returning commission is deliberate
  // (reduced rate / win-back carve-out), not leakage.
  const activePrograms: Array<{ returningCustomerPolicy: string }> = db.affiliateProgram
    ? await db.affiliateProgram.findMany({
        where: { storeId, status: "active" },
        select: { returningCustomerPolicy: true }
      })
    : [];
  const allProtected =
    activePrograms.length > 0 &&
    activePrograms.every((p) => (p.returningCustomerPolicy ?? "full") !== "full");

  const shouldFire =
    !allProtected &&
    summary.leakageRate >= LEAKAGE_ALERT_MIN_RATE &&
    summary.returningCustomer.commission >= LEAKAGE_ALERT_MIN_AMOUNT;

  if (!shouldFire) {
    const { resolved } = await resolveAlertByFingerprint({
      storeId,
      fingerprint,
      resolvedBy: "affiliate-leakage-service"
    });
    return { fired: false, resolved: resolved > 0 };
  }

  const amount = Math.round(summary.returningCustomer.commission);
  const pct = Math.round(summary.leakageRate * 100);
  const topNames = summary.topLeakyAffiliates.slice(0, 3).map((a) => a.name).filter((n) => n !== "—");

  await upsertAlert({
    storeId,
    type: "commission_leakage",
    fingerprint,
    severity: summary.leakageRate >= 0.3 ? "high" : "medium",
    source: "Calculated",
    detectedBy: "affiliate-leakage-service",
    title: `₪${amount.toLocaleString("en-US")} מהעמלות ב־30 הימים האחרונים שולמו על לקוחות חוזרים`,
    description:
      `${pct}% מעמלות השותפים בתקופה (₪${amount.toLocaleString("en-US")}) נזקפו ללקוחות שכבר קנו מהמותג בעבר` +
      (topNames.length > 0 ? `. המובילות: ${topNames.join(", ")}.` : "."),
    recommendedAction:
      "הגדירו מדיניות עמלה ללקוח חוזר (מופחתת או אפס) בפורטל השותפים ← תוכניות. אפשר להוסיף חלון win-back כדי להמשיך לתגמל החזרת לקוחות רדומים.",
    metricName: "leakage_rate_pct",
    currentValue: pct,
    periodLabel: "30 ימים אחרונים",
    payloadJson: {
      windowStart: summary.windowStart,
      windowEnd: summary.windowEnd,
      returningCommission: summary.returningCustomer.commission,
      returningConversions: summary.returningCustomer.conversions,
      newCommission: summary.newCustomer.commission,
      leakageRate: summary.leakageRate,
      topLeakyAffiliates: summary.topLeakyAffiliates
    }
  });
  return { fired: true, resolved: false };
}
