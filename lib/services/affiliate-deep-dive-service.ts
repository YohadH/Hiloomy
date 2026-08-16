// Affiliate deep-dive for the weekly report.
//
// Now that AffiliateAttribution has per-order records (from the CSV import),
// we can produce a much richer picture than the old "name + sales + clicks"
// summary. For each affiliate active in the report window we compute:
//   • Sales (gross, from attribution rows)
//   • Commission paid
//   • Net revenue to the brand (sales − commission)
//   • Orders + AOV
//   • New vs returning customer split (cross-ref Customer.isReturning)
//   • Tracking method split — coupon vs link
//   • Top 3 products by units sold (line items from the attributed orders)
//   • First and last conversion dates in the window
//
// Plus an aggregate footer:
//   • Total affiliate sales / orders / share of store revenue
//   • Active affiliate count
//   • Silent affiliates (configured creators with zero sales in the window)

import { getDb } from "@/lib/server/db";

export interface AffiliateDeepDiveRow {
  affiliateMemberId: string;
  affiliateName: string;
  email: string;
  couponCode: string | null;
  orders: number;
  sales: number;
  commission: number;
  netRevenue: number;
  aov: number;
  newCustomers: number;
  returningCustomers: number;
  guestOrders: number;
  couponOrders: number;
  linkOrders: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  topProducts: Array<{ title: string; units: number; revenue: number }>;
}

export interface AffiliateDeepDiveReport {
  dateRange: { start: string; end: string };
  affiliates: AffiliateDeepDiveRow[];
  totals: {
    sales: number;
    orders: number;
    commission: number;
    activeAffiliates: number;
    silentAffiliates: number;
    affiliateShareOfStoreRevenue: number | null; // ratio: 0..1
  };
}

export interface BuildAffiliateDeepDiveInput {
  storeId: string;
  start: Date;
  end: Date;
}

function toDateKey(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export async function buildAffiliateDeepDive(
  input: BuildAffiliateDeepDiveInput
): Promise<AffiliateDeepDiveReport> {
  const db = getDb();

  // Pull all attributions in the window with everything we need to compute
  // per-affiliate breakdowns. We include the order + its line items so
  // top-product aggregation happens in memory without a second round-trip.
  const attributions = await db.affiliateAttribution.findMany({
    where: {
      storeId: input.storeId,
      occurredAt: { gte: input.start, lte: input.end }
    },
    include: {
      affiliateMember: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          couponCode: true
        }
      },
      order: {
        select: {
          id: true,
          customerId: true,
          customer: { select: { isReturning: true } },
          // `discountedTotal` does not exist on OrderLineItem — fields are
          // lineSubtotal (gross) / lineDiscountAmount / refundedSubtotal.
          // Use net-of-discount-and-refunds as the per-line revenue figure
          // to match how affiliate KPIs are computed elsewhere.
          lineItems: {
            select: {
              title: true,
              quantity: true,
              lineSubtotal: true,
              lineDiscountAmount: true,
              refundedSubtotal: true
            }
          }
        }
      }
    }
  });

  // Build per-affiliate accumulators.
  interface Acc {
    affiliateMemberId: string;
    affiliateName: string;
    email: string;
    couponCode: string | null;
    orders: number;
    sales: number;
    commission: number;
    newCustomers: number;
    returningCustomers: number;
    guestOrders: number;
    couponOrders: number;
    linkOrders: number;
    firstSaleAt: Date | null;
    lastSaleAt: Date | null;
    productTotals: Map<string, { units: number; revenue: number }>;
  }

  const byAffiliate = new Map<string, Acc>();
  for (const a of attributions as any[]) {
    const m = a.affiliateMember;
    if (!m) continue;
    const fullName = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email;
    const acc =
      byAffiliate.get(m.id) ??
      ({
        affiliateMemberId: m.id,
        affiliateName: fullName,
        email: m.email,
        couponCode: m.couponCode ?? null,
        orders: 0,
        sales: 0,
        commission: 0,
        newCustomers: 0,
        returningCustomers: 0,
        guestOrders: 0,
        couponOrders: 0,
        linkOrders: 0,
        firstSaleAt: null,
        lastSaleAt: null,
        productTotals: new Map()
      } satisfies Acc);

    acc.orders += 1;
    acc.sales += Number(a.salesAmount ?? 0);
    acc.commission += Number(a.commissionAmount ?? 0);
    if (a.sourceType === "coupon") acc.couponOrders += 1;
    else acc.linkOrders += 1;

    // New vs returning split for this attribution's order.
    if (a.order?.customer) {
      if (a.order.customer.isReturning) acc.returningCustomers += 1;
      else acc.newCustomers += 1;
    } else if (a.order && !a.order.customer) {
      acc.guestOrders += 1;
    }

    // Date window — earliest + latest sale.
    if (!acc.firstSaleAt || a.occurredAt < acc.firstSaleAt) acc.firstSaleAt = a.occurredAt;
    if (!acc.lastSaleAt || a.occurredAt > acc.lastSaleAt) acc.lastSaleAt = a.occurredAt;

    // Top products — aggregate line items from the linked order.
    if (a.order?.lineItems) {
      for (const li of a.order.lineItems) {
        const title = String(li.title ?? "").trim() || "(untitled)";
        const cur = acc.productTotals.get(title) ?? { units: 0, revenue: 0 };
        cur.units += Number(li.quantity ?? 0);
        // Net revenue = lineSubtotal - lineDiscountAmount - refundedSubtotal.
        const net =
          Number(li.lineSubtotal ?? 0) -
          Number(li.lineDiscountAmount ?? 0) -
          Number(li.refundedSubtotal ?? 0);
        cur.revenue += Math.max(net, 0);
        acc.productTotals.set(title, cur);
      }
    }

    byAffiliate.set(m.id, acc);
  }

  // Materialise the per-affiliate rows. Sort by sales desc — the founder
  // wants their biggest contributors at the top.
  const rows: AffiliateDeepDiveRow[] = Array.from(byAffiliate.values())
    .map((acc) => {
      const topProducts = Array.from(acc.productTotals.entries())
        .map(([title, stats]) => ({ title, units: stats.units, revenue: stats.revenue }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 3);
      return {
        affiliateMemberId: acc.affiliateMemberId,
        affiliateName: acc.affiliateName,
        email: acc.email,
        couponCode: acc.couponCode,
        orders: acc.orders,
        sales: acc.sales,
        commission: acc.commission,
        netRevenue: acc.sales - acc.commission,
        aov: acc.orders > 0 ? acc.sales / acc.orders : 0,
        newCustomers: acc.newCustomers,
        returningCustomers: acc.returningCustomers,
        guestOrders: acc.guestOrders,
        couponOrders: acc.couponOrders,
        linkOrders: acc.linkOrders,
        firstSaleAt: toDateKey(acc.firstSaleAt),
        lastSaleAt: toDateKey(acc.lastSaleAt),
        topProducts
      };
    })
    .sort((a, b) => b.sales - a.sales);

  // Aggregate totals.
  const totalSales = rows.reduce((sum, r) => sum + r.sales, 0);
  const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0);
  const totalCommission = rows.reduce((sum, r) => sum + r.commission, 0);

  // Silent affiliates = configured members with zero sales in the window.
  const allMembers = await db.affiliateMember.count({
    where: { storeId: input.storeId, status: { not: "rejected" } }
  });
  const silentAffiliates = Math.max(0, allMembers - rows.length);

  // Store revenue for the same window — used to compute the affiliate share.
  // We pull a quick aggregate; the reconciliation engine has a richer
  // computation but this is fine for the percentage.
  const storeRevAgg = await db.order.aggregate({
    where: {
      storeId: input.storeId,
      createdAt: { gte: input.start, lte: input.end },
      test: false,
      cancelledAt: null
    },
    _sum: { totalPrice: true, totalRefunds: true }
  });
  const storeNetRevenue =
    Number(storeRevAgg._sum.totalPrice ?? 0) - Number(storeRevAgg._sum.totalRefunds ?? 0);
  const affiliateShareOfStoreRevenue = storeNetRevenue > 0 ? totalSales / storeNetRevenue : null;

  return {
    dateRange: {
      start: input.start.toISOString().slice(0, 10),
      end: input.end.toISOString().slice(0, 10)
    },
    affiliates: rows,
    totals: {
      sales: totalSales,
      orders: totalOrders,
      commission: totalCommission,
      activeAffiliates: rows.length,
      silentAffiliates,
      affiliateShareOfStoreRevenue
    }
  };
}
