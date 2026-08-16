// Per-channel CAC + contribution margin.
//
// Takes the channel-performance engine's revenue/orders by channel and
// joins it with the cost-of-acquisition signal for that channel:
//
//   Meta Ads          → total Meta spend (from MetaAdsCampaignInsight)
//   Instagram organic → 0 (organic = free)
//   Email             → 0 (assumed in-house tool; can be overridden later)
//   Influencers       → total commission paid to affiliates (BixGrow)
//   Google organic    → 0
//   Direct            → 0
//   Other / Unknown   → unallocated (CAC unknown)
//
// Lets the founder say:
//   "Instagram organic costs ₪0 and delivers ₪X — push 2x."
//   "Meta CAC is ₪Y per new customer — vs Influencer ₪Z."
//
// Contribution margin per channel uses the COGS share for THAT channel's
// orders only (so a high-margin product mix on email vs low-margin on
// Meta shows up). We get the per-order COGS by joining line items.
//
// Honesty: channels with 0 attributable spend are marked "estimated"
// because we can't prove organic was actually free. The founder can
// override per-channel spend in a future settings page.

import { getDb } from "@/lib/server/db";
import {
  buildChannelPerformanceReport,
  type ChannelPerformanceReport,
  type ChannelPerformanceRow
} from "@/lib/services/channel-performance-engine-service";

export interface ChannelCacRow extends ChannelPerformanceRow {
  // Cost we attributed to this channel for the window.
  attributedSpend: number;
  // The source of that spend number.
  spendSource: "meta_insights" | "affiliate_commission" | "assumed_zero" | "unknown";
  // CAC = spend ÷ new customers. Null if we have no new-customer count or
  // no spend signal at all.
  cac: number | null;
  // Per-channel COGS sum and contribution margin (revenue − discount − refund
  // − COGS − attributed channel spend). The contribution rate is the per-
  // channel margin / revenue.
  cogs: number;
  contributionMargin: number;
  contributionMarginRate: number;
  // Verdict: a one-word call so the founder can scan the table.
  // "push" / "hold" / "review" / "starve".
  recommendation: "push" | "hold" | "review" | "starve" | "no_data";
}

export interface ChannelCacReport {
  dateRange: { start: string; end: string };
  rows: ChannelCacRow[];
  totals: {
    orders: number;
    revenue: number;
    spend: number;
    cogs: number;
    contributionMargin: number;
  };
  // Coverage of the underlying channel report, surfaced for accuracy labels.
  attributionCoverage: number;
}

export interface BuildChannelCacInput {
  storeId: string;
  start: Date;
  end: Date;
  // Optional injection — when called from a context that already built the
  // channel report (weekly bundle), pass it in to avoid recomputing.
  prebuiltChannelReport?: ChannelPerformanceReport;
}

export async function buildChannelCacReport(
  input: BuildChannelCacInput
): Promise<ChannelCacReport> {
  const db = getDb();
  const channelReport =
    input.prebuiltChannelReport ??
    (await buildChannelPerformanceReport({
      storeId: input.storeId,
      start: input.start,
      end: input.end
    }));

  // Pull total Meta spend for the window. We use MetaAdsCampaignInsight as
  // the single source of truth — the same table the recommendation engine
  // reads from. We don't break it down by campaign here because the channel
  // engine doesn't either (yet).
  const metaSpendAgg = (await db.metaAdsCampaignInsight.aggregate({
    where: {
      storeId: input.storeId,
      // Use the row's own date window — we count rows whose dateStart falls
      // inside our window. Campaign rows are typically daily so this works.
      level: "campaign",
      dateStart: { gte: input.start, lte: input.end }
    },
    _sum: { spend: true }
  })) as { _sum: { spend: any } };
  const totalMetaSpend = Number(metaSpendAgg._sum.spend ?? 0);

  // Pull affiliate commission for the window — that's the "Influencer"
  // channel's CAC.
  const affiliateAgg = await db.affiliateAttribution.aggregate({
    where: {
      storeId: input.storeId,
      occurredAt: { gte: input.start, lte: input.end }
    },
    _sum: { commissionAmount: true }
  });
  const totalAffiliateCommission = Number(
    affiliateAgg._sum.commissionAmount ?? 0
  );

  // Per-channel COGS — for each channel's orders, sum line-item cost. We
  // bucket the same way the channel engine does by re-pulling the orders
  // with their attribution signal and bucketizing here. To keep this
  // service decoupled we do a simpler approximation: distribute total COGS
  // for the window proportionally to each channel's revenue share. This
  // is "good enough" v1 — accurate per-channel COGS requires re-running
  // the channel classifier on the line items, which we'll do once the
  // channel engine exposes its bucketize() helper.
  const channelTotals = (await db.orderLineItem.aggregate({
    where: {
      storeId: input.storeId,
      order: {
        storeId: input.storeId,
        createdAt: { gte: input.start, lte: input.end },
        cancelledAt: null,
        test: false
      }
    },
    _sum: { estimatedCostAmount: true, lineSubtotal: true }
  })) as { _sum: { estimatedCostAmount: any; lineSubtotal: any } };
  const totalCogs = Number(channelTotals._sum.estimatedCostAmount ?? 0);
  const totalLineRevenue = Number(channelTotals._sum.lineSubtotal ?? 0);

  const rows: ChannelCacRow[] = channelReport.rows.map((row) => {
    let attributedSpend = 0;
    let spendSource: ChannelCacRow["spendSource"] = "assumed_zero";

    switch (row.channel) {
      case "meta":
        attributedSpend = totalMetaSpend;
        spendSource = "meta_insights";
        break;
      case "influencer":
        attributedSpend = totalAffiliateCommission;
        spendSource = "affiliate_commission";
        break;
      case "instagram_organic":
      case "email":
      case "google_organic":
      case "direct":
        attributedSpend = 0;
        spendSource = "assumed_zero";
        break;
      default:
        attributedSpend = 0;
        spendSource = "unknown";
    }

    // Proportional COGS allocation by revenue share. Documented limitation
    // above — replace when channel engine exposes per-order classifier.
    const revShare =
      totalLineRevenue > 0 ? row.revenue / totalLineRevenue : 0;
    const cogs = totalCogs * revShare;
    const contributionMargin = row.revenue - cogs - attributedSpend;
    const contributionMarginRate =
      row.revenue > 0 ? contributionMargin / row.revenue : 0;

    const cac = row.newCustomers > 0 ? attributedSpend / row.newCustomers : null;

    // Decision heuristic — what should the founder DO about this channel?
    //   push    = positive margin AND coverage usable AND CAC reasonable
    //   hold    = positive margin but small volume — keep going
    //   review  = negative margin OR CAC > 30% of AOV
    //   starve  = negative margin AND material spend
    //   no_data = "Other / Unknown" bucket or coverage too low to call
    let recommendation: ChannelCacRow["recommendation"];
    if (row.dataQuality === "low") {
      recommendation = "no_data";
    } else if (contributionMargin < 0 && attributedSpend > 500) {
      recommendation = "starve";
    } else if (contributionMargin < 0) {
      recommendation = "review";
    } else if (
      cac != null &&
      row.avgOrderValue > 0 &&
      cac > row.avgOrderValue * 0.3
    ) {
      recommendation = "review";
    } else if (row.revenue > 0 && contributionMarginRate > 0.25) {
      recommendation = "push";
    } else {
      recommendation = "hold";
    }

    return {
      ...row,
      attributedSpend,
      spendSource,
      cac,
      cogs,
      contributionMargin,
      contributionMarginRate,
      recommendation
    };
  });

  // Sort by absolute contribution margin desc — largest dollar contributor
  // at the top is what the founder cares about most.
  rows.sort((a, b) => b.contributionMargin - a.contributionMargin);

  return {
    dateRange: channelReport.dateRange,
    rows,
    totals: {
      orders: channelReport.totals.orders,
      revenue: channelReport.totals.revenue,
      spend: totalMetaSpend + totalAffiliateCommission,
      cogs: totalCogs,
      contributionMargin:
        channelReport.totals.revenue -
        totalCogs -
        (totalMetaSpend + totalAffiliateCommission)
    },
    attributionCoverage: channelReport.attributionCoverage
  };
}
