// Discount campaign scorecards (Insight Engine 2).
//
// "Is this discount making me money right now, or burning margin?"
//
// One scorecard per discount code used in the window, with the money walk
// the merchant actually needs mid-sale:
//
//   revenue (net product revenue of orders under the code, after the
//            discount — Σ lineSubtotal − Σ lineDiscountAmount)
// − cogs    (Σ OrderLineItem.estimatedCostAmount)
// = margin after discount
//
// plus AOV vs the same-window non-discounted baseline, the share of NEW
// customers the code brought in, a daily usage trend, and a verdict:
//
//   expand — profitable AND pulling new customers at meaningful volume
//   keep   — profitable (or not enough data to say more)
//   stop   — orders under the code net NEGATIVE contribution margin
//
// The "stop" condition also powers the underwater-discount alert that
// fires from the 2h cron mid-sale — the whole point of this engine is
// catching a margin-burning code DURING the sale, not in a monthly recap.
//
// Scope notes:
// - An order carrying two codes counts toward both scorecards (rare, and
//   splitting the margin between codes would be arbitrary).
// - Cancelled + test orders are excluded everywhere.
// - BXGY structure sync (gift COGS attach) is phase 2 — not here yet.

import { getDb } from "@/lib/server/db";
import {
  upsertAlert,
  resolveStaleAlerts
} from "@/lib/services/alert-writer-service";

export type DiscountVerdict = "expand" | "keep" | "stop";

export interface DiscountScorecard {
  code: string;
  uses: number; // distinct orders under the code
  revenue: number; // net product revenue after discount
  discountCost: number; // Σ DiscountUsage.amount
  cogs: number;
  marginAfterDiscount: number;
  marginRate: number; // margin / revenue
  aov: number; // avg order totalPrice under the code
  baselineAov: number | null; // AOV of non-discounted orders, same window
  newCustomerShare: number | null; // null when no linked customers
  hasCostData: boolean; // false → margin is revenue-only (COGS missing)
  // The code belongs to an affiliate (BixGrow/portal coupon). Its real
  // economics are discount + commission on the same order, and "stop the
  // code" means renegotiating with a person — the UI labels these so the
  // merchant reads the verdict in the right context.
  affiliateName: string | null;
  firstUsedAt: string;
  lastUsedAt: string;
  active: boolean; // used within the trailing 7 days of the window end
  trend: Array<{ date: string; uses: number; discountCost: number }>;
  verdict: DiscountVerdict;
  verdictReason: { he: string; en: string };
}

export interface DiscountScorecardReport {
  windowStart: string;
  windowEnd: string;
  baselineAov: number | null;
  totalDiscountCost: number;
  totalRevenue: number;
  totalMargin: number;
  discountedOrderShare: number | null; // discounted orders / all orders
  cards: DiscountScorecard[];
}

const MAX_CODES = 40;
const ACTIVE_WINDOW_MS = 7 * 86_400_000;

// Verdict thresholds. Deliberately conservative — "expand" is a real
// recommendation the weekly report repeats, so it needs volume behind it.
const EXPAND_MIN_USES = 5;
const EXPAND_MIN_MARGIN_RATE = 0.2;
const EXPAND_MIN_NEW_SHARE = 0.4;
const STOP_MIN_USES = 3;

export async function buildDiscountScorecards(input: {
  storeId: string;
  start: Date;
  end: Date;
}): Promise<DiscountScorecardReport> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const empty: DiscountScorecardReport = {
    windowStart: input.start.toISOString(),
    windowEnd: input.end.toISOString(),
    baselineAov: null,
    totalDiscountCost: 0,
    totalRevenue: 0,
    totalMargin: 0,
    discountedOrderShare: null,
    cards: []
  };
  if (!db?.discountUsage) return empty;

  const orderScope = {
    createdAt: { gte: input.start, lte: input.end },
    cancelledAt: null,
    test: false
  };

  const usages: Array<{ code: string; amount: unknown; orderId: string }> =
    await db.discountUsage.findMany({
      where: { storeId: input.storeId, order: orderScope },
      select: { code: true, amount: true, orderId: true }
    });
  if (usages.length === 0) return empty;

  // Affiliate-owned coupon codes (BixGrow / portal), uppercased for the
  // same normalization the per-code grouping below uses.
  const affiliateByCode = new Map<string, string>();
  if (db.affiliateMember) {
    const members: Array<{ firstName: string; lastName: string; couponCode: string | null }> =
      await db.affiliateMember.findMany({
        where: { storeId: input.storeId, couponCode: { not: null } },
        select: { firstName: true, lastName: true, couponCode: true }
      }).catch(() => []);
    for (const m of members) {
      if (m.couponCode) affiliateByCode.set(m.couponCode.trim().toUpperCase(), `${m.firstName} ${m.lastName}`.trim());
    }
    const assignments: Array<{ couponCode: string; affiliateMember: { firstName: string; lastName: string } }> =
      await db.affiliateCouponAssignment.findMany({
        where: { storeId: input.storeId },
        select: { couponCode: true, affiliateMember: { select: { firstName: true, lastName: true } } }
      }).catch(() => []);
    for (const a of assignments) {
      const key = a.couponCode.trim().toUpperCase();
      if (!affiliateByCode.has(key)) {
        affiliateByCode.set(key, `${a.affiliateMember.firstName} ${a.affiliateMember.lastName}`.trim());
      }
    }
  }

  const orderIds = Array.from(new Set(usages.map((u) => u.orderId)));
  const orders: Array<{
    id: string;
    createdAt: Date;
    totalPrice: unknown;
    customerId: string | null;
    lineItems: Array<{
      lineSubtotal: unknown;
      lineDiscountAmount: unknown;
      estimatedCostAmount: unknown;
    }>;
  }> = await db.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      createdAt: true,
      totalPrice: true,
      customerId: true,
      lineItems: {
        select: {
          lineSubtotal: true,
          lineDiscountAmount: true,
          estimatedCostAmount: true
        }
      }
    }
  });
  const orderById = new Map(orders.map((o) => [o.id, o]));

  // New-vs-returning per ORDER, from actual order history (same LATERAL
  // pattern as the commission-leakage classifier). Deliberately NOT
  // Customer.firstOrderDate / isReturning — those denormalized fields are
  // not reliably backfilled on every sync path.
  const firstOrderRows: Array<{ id: string; is_first: boolean }> = await db.$queryRaw`
    SELECT o.id, (prev.prev_at IS NULL) AS is_first
    FROM "Order" o
    LEFT JOIN LATERAL (
      SELECT MAX(o2."createdAt") AS prev_at
      FROM "Order" o2
      WHERE o2."storeId" = o."storeId"
        AND o2."customerId" = o."customerId"
        AND o2."createdAt" < o."createdAt"
    ) prev ON true
    WHERE o."storeId" = ${input.storeId}
      AND o."customerId" IS NOT NULL
      AND o."createdAt" >= ${input.start}
      AND o."createdAt" <= ${input.end}
  `.catch(() => [] as Array<{ id: string; is_first: boolean }>);
  const isFirstOrder = new Map(firstOrderRows.map((r) => [r.id, r.is_first]));

  // Baseline: the same window WITHOUT any discount code — what a "normal"
  // order looks like, for the AOV-vs-baseline comparison.
  const baseline = await db.order.aggregate({
    where: {
      storeId: input.storeId,
      ...orderScope,
      discountUsages: { none: {} }
    },
    _avg: { totalPrice: true },
    _count: { _all: true }
  });
  const baselineAov = baseline?._avg?.totalPrice != null ? Number(baseline._avg.totalPrice) : null;
  const baselineCount = Number(baseline?._count?._all ?? 0);

  const num = (v: unknown) => (v == null ? 0 : Number(v));

  interface Acc {
    orderIds: Set<string>;
    discountCost: number;
    revenue: number;
    cogs: number;
    totalPriceSum: number;
    newCustomers: number;
    knownCustomers: number;
    costLines: number;
    lines: number;
    firstUsedAt: Date;
    lastUsedAt: Date;
    byDay: Map<string, { uses: number; discountCost: number }>;
  }
  const byCode = new Map<string, Acc>();

  for (const usage of usages) {
    const order = orderById.get(usage.orderId);
    if (!order) continue;
    const code = usage.code.trim().toUpperCase();
    const acc: Acc = byCode.get(code) ?? {
      orderIds: new Set(),
      discountCost: 0,
      revenue: 0,
      cogs: 0,
      totalPriceSum: 0,
      newCustomers: 0,
      knownCustomers: 0,
      costLines: 0,
      lines: 0,
      firstUsedAt: order.createdAt,
      lastUsedAt: order.createdAt,
      byDay: new Map()
    };

    acc.discountCost += num(usage.amount);
    const day = order.createdAt.toISOString().slice(0, 10);
    const dayBucket = acc.byDay.get(day) ?? { uses: 0, discountCost: 0 };
    dayBucket.discountCost += num(usage.amount);

    // Per-ORDER metrics only once per order per code (an order can carry
    // several DiscountUsage rows for the same code across re-syncs).
    if (!acc.orderIds.has(order.id)) {
      acc.orderIds.add(order.id);
      dayBucket.uses += 1;
      acc.totalPriceSum += num(order.totalPrice);
      for (const line of order.lineItems) {
        acc.revenue += num(line.lineSubtotal) - num(line.lineDiscountAmount);
        acc.cogs += num(line.estimatedCostAmount);
        acc.lines += 1;
        if (num(line.estimatedCostAmount) > 0) acc.costLines += 1;
      }
      if (order.customerId && isFirstOrder.has(order.id)) {
        acc.knownCustomers += 1;
        if (isFirstOrder.get(order.id)) acc.newCustomers += 1;
      }
      if (order.createdAt < acc.firstUsedAt) acc.firstUsedAt = order.createdAt;
      if (order.createdAt > acc.lastUsedAt) acc.lastUsedAt = order.createdAt;
    }
    acc.byDay.set(day, dayBucket);
    byCode.set(code, acc);
  }

  const cards: DiscountScorecard[] = [];
  for (const [code, acc] of byCode) {
    const uses = acc.orderIds.size;
    if (uses === 0) continue;
    const margin = acc.revenue - acc.cogs;
    const hasCostData = acc.costLines > 0;
    const newShare = acc.knownCustomers > 0 ? acc.newCustomers / acc.knownCustomers : null;
    const marginRate = acc.revenue > 0 ? margin / acc.revenue : 0;
    const affiliateName = affiliateByCode.get(code) ?? null;

    let verdict: DiscountVerdict = "keep";
    let reason: { he: string; en: string };
    if (hasCostData && margin < 0 && uses >= STOP_MIN_USES) {
      verdict = "stop";
      reason = affiliateName
        ? {
            he: `קוד השותפה של ${affiliateName} מפסיד כסף עוד לפני העמלה — שקלו להקטין את ההנחה או לעדכן את תנאי השותפות.`,
            en: `${affiliateName}'s affiliate code loses money even before commission — shrink the discount or renegotiate the partnership terms.`
          }
        : {
            he: "ההזמנות תחת הקוד מפסידות כסף — שולי התרומה שליליים אחרי ההנחה ועלות המוצר.",
            en: "Orders under this code lose money — contribution margin is negative after the discount and COGS."
          };
    } else if (
      hasCostData &&
      margin > 0 &&
      marginRate >= EXPAND_MIN_MARGIN_RATE &&
      uses >= EXPAND_MIN_USES &&
      newShare != null &&
      newShare >= EXPAND_MIN_NEW_SHARE
    ) {
      verdict = "expand";
      reason = {
        he: `רווחי (${Math.round(marginRate * 100)}% שולי תרומה) ומביא לקוחות חדשים (${Math.round((newShare ?? 0) * 100)}%) — שווה להגביר חשיפה.`,
        en: `Profitable (${Math.round(marginRate * 100)}% margin) and pulling new customers (${Math.round((newShare ?? 0) * 100)}%) — worth pushing harder.`
      };
    } else if (!hasCostData) {
      reason = {
        he: "אין נתוני עלות למוצרים בהזמנות — הגדירו עלויות כדי לקבל פסיקה אמינה.",
        en: "No product cost data on these orders — set costs to get a reliable verdict."
      };
    } else if (margin < 0) {
      reason = {
        he: "שולי תרומה שליליים אך על מעט הזמנות — מעקב.",
        en: "Negative margin but on very few orders — monitoring."
      };
    } else {
      reason = {
        he: "רווחי אך לא בולט מספיק להרחבה — להשאיר ולעקוב.",
        en: "Profitable but not standout enough to expand — keep and watch."
      };
    }

    cards.push({
      code,
      uses,
      revenue: round2(acc.revenue),
      discountCost: round2(acc.discountCost),
      cogs: round2(acc.cogs),
      marginAfterDiscount: round2(margin),
      marginRate: acc.revenue > 0 ? margin / acc.revenue : 0,
      aov: uses > 0 ? round2(acc.totalPriceSum / uses) : 0,
      baselineAov,
      newCustomerShare: newShare,
      hasCostData,
      affiliateName,
      firstUsedAt: acc.firstUsedAt.toISOString(),
      lastUsedAt: acc.lastUsedAt.toISOString(),
      active: input.end.getTime() - acc.lastUsedAt.getTime() <= ACTIVE_WINDOW_MS,
      trend: Array.from(acc.byDay.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, v]) => ({ date, uses: v.uses, discountCost: round2(v.discountCost) })),
      verdict,
      verdictReason: reason
    });
  }

  cards.sort((a, b) => b.discountCost - a.discountCost);
  const kept = cards.slice(0, MAX_CODES);

  const discountedOrders = new Set(usages.map((u) => u.orderId)).size;
  const allOrders = discountedOrders + baselineCount;

  return {
    windowStart: input.start.toISOString(),
    windowEnd: input.end.toISOString(),
    baselineAov,
    totalDiscountCost: round2(kept.reduce((s, c) => s + c.discountCost, 0)),
    totalRevenue: round2(kept.reduce((s, c) => s + c.revenue, 0)),
    totalMargin: round2(kept.reduce((s, c) => s + c.marginAfterDiscount, 0)),
    discountedOrderShare: allOrders > 0 ? discountedOrders / allOrders : null,
    cards: kept
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────
// Underwater-discount alert — fires MID-SALE from the 2h cron when a code
// used in the last 7 days nets negative contribution margin on real cost
// data. High priority: every additional order under the code loses money
// right now. Sweep-resolves codes that recovered or went quiet.
// ─────────────────────────────────────────────────────────────────────────

const UNDERWATER_DETECTOR = "discount-scorecard-service";
const UNDERWATER_TYPE = "underwater_discount";

export interface UnderwaterAlertResult {
  fired: number;
  resolved: number;
}

export async function upsertUnderwaterDiscountAlerts(storeId: string): Promise<UnderwaterAlertResult> {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86_400_000);
  const report = await buildDiscountScorecards({ storeId, start, end });

  const underwater = report.cards.filter(
    (c) => c.verdict === "stop" && c.hasCostData && c.uses >= STOP_MIN_USES
  );

  const keepFingerprints: string[] = [];
  for (const card of underwater) {
    const fingerprint = `${UNDERWATER_TYPE}:${card.code}`;
    keepFingerprints.push(fingerprint);
    const loss = Math.abs(Math.round(card.marginAfterDiscount));
    await upsertAlert({
      storeId,
      type: UNDERWATER_TYPE,
      fingerprint,
      // A code bleeding four figures a week is a drop-everything problem.
      severity: loss >= 1000 ? "critical" : "high",
      source: "Calculated",
      detectedBy: UNDERWATER_DETECTOR,
      title: `הקוד ${card.code} מוכר בהפסד — ₪${loss.toLocaleString("en-US")} שוליים שליליים בשבוע האחרון`,
      description:
        `${card.uses} הזמנות תחת ${card.code} בשבעת הימים האחרונים: הכנסה נטו ₪${Math.round(card.revenue).toLocaleString("en-US")}, ` +
        `עלות מוצרים ₪${Math.round(card.cogs).toLocaleString("en-US")}, הנחה ₪${Math.round(card.discountCost).toLocaleString("en-US")} — ` +
        `כל הזמנה נוספת תחת הקוד מפסידה כסף כרגע.`,
      recommendedAction: `עצרו או הקטינו את הקוד ${card.code} בShopify עכשיו, או העלו מחיר מינימום לשימוש בו.`,
      metricName: "margin_after_discount",
      currentValue: card.marginAfterDiscount,
      payloadJson: {
        code: card.code,
        uses: card.uses,
        revenue: card.revenue,
        cogs: card.cogs,
        discountCost: card.discountCost,
        marginAfterDiscount: card.marginAfterDiscount,
        windowStart: report.windowStart,
        windowEnd: report.windowEnd
      },
      periodLabel: "7 ימים אחרונים"
    });
  }

  const swept = await resolveStaleAlerts({
    storeId,
    detectedBy: UNDERWATER_DETECTOR,
    type: UNDERWATER_TYPE,
    keepFingerprints
  });

  return { fired: underwater.length, resolved: swept.resolved };
}
