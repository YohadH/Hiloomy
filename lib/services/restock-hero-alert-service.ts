// Restock-hero alert engine for the weekly report.
//
// Goal: when a previously top-revenue product comes back from an out-of-stock
// gap, surface it as a red flag with a prescribed action ("push Meta budget,
// prior revenue ₪Xk over 90 days"). Without this the founder can read the
// PDF end-to-end and miss the single highest-leverage event of the week.
//
// v1 detection works on sales-history inference + current inventory snapshot.
// We do NOT yet have a ProductInventoryEvent table; until we add one (v2),
// the OOS gap is inferred from a sales drought rather than a precise zero
// timestamp. This is fine for the founder's use case — perfumes are sold
// often enough that a 7-day zero-orders gap on a hero is a reliable proxy
// for OOS, not just a weak week.
//
// Flag rule:
//   Hero      = top-N revenue in trailing 90 days (excluding the current
//               report window). N defaults to 15 to give some headroom past
//               the very top — restocks of "rank 12" heroes still matter.
//   OOS gap   = ≥ MIN_GAP_DAYS consecutive days with zero orders for that
//               product inside the 90-day window, AND the product had a
//               healthy historical pace before the gap.
//   Resumed   = ≥1 sale in the current report window OR variant inventory
//               currently > 0 (covers the "back in stock but not bought yet
//               this week" case — still worth flagging because demand is
//               about to land).

import { getDb } from "@/lib/server/db";
import {
  upsertAlert,
  resolveStaleAlerts
} from "@/lib/services/alert-writer-service";

export interface RestockHeroFlag {
  productId: string;
  shopifyProductId: string;
  title: string;
  sku: string | null;
  // Revenue this product produced in the trailing 90 days BEFORE the report
  // window. This is the "what's at stake" number we show on the alert.
  priorRevenue: number;
  priorOrders: number;
  priorRank: number; // 1-based rank within the same window
  // Length of the OOS gap (consecutive days of zero orders).
  gapDays: number;
  gapStart: string; // YYYY-MM-DD
  gapEnd: string; // YYYY-MM-DD
  // Current state at report time.
  currentInventory: number | null;
  ordersThisWindow: number;
  revenueThisWindow: number;
  // Severity score used to rank the flags when there are several.
  // Higher = more urgent. Derived from priorRevenue / rank / gap length.
  urgencyScore: number;
  // Suggested action — short, prescriptive, founder-facing.
  suggestedAction: { he: string; en: string };
}

export interface RestockHeroAlertReport {
  flags: RestockHeroFlag[];
  // Diagnostic counts so we can sanity-check why a known restock didn't
  // surface (e.g., "saw 23 heroes but none had a long enough gap").
  heroesConsidered: number;
  heroesWithGap: number;
}

export interface BuildRestockHeroInput {
  storeId: string;
  start: Date;
  end: Date;
}

const HERO_TOP_N = 15;
const HERO_LOOKBACK_DAYS = 90;
const MIN_GAP_DAYS = 7;
const MIN_HISTORICAL_PACE_ORDERS = 5; // need at least this many orders in the
//                                       pre-gap stretch to count as "heroic"

interface DailyCount {
  date: string; // YYYY-MM-DD UTC
  orders: number;
  revenue: number;
}

function toUtcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// Walk a contiguous daily series and return the longest run of zero-order
// days, with the historical pace BEFORE that run. We use the run's leading
// pace (not total) so a product that ramped, peaked, then died flags only
// when the peak was real.
function findLongestZeroGap(series: DailyCount[]): {
  gapDays: number;
  gapStart: string;
  gapEnd: string;
  preGapOrders: number;
} | null {
  let bestLen = 0;
  let bestStart = -1;
  let bestEnd = -1;
  let curStart = -1;
  for (let i = 0; i < series.length; i += 1) {
    if (series[i].orders === 0) {
      if (curStart === -1) curStart = i;
      const len = i - curStart + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = curStart;
        bestEnd = i;
      }
    } else {
      curStart = -1;
    }
  }
  if (bestLen < MIN_GAP_DAYS || bestStart < 0) return null;
  const preGapOrders = series
    .slice(0, bestStart)
    .reduce((sum, d) => sum + d.orders, 0);
  return {
    gapDays: bestLen,
    gapStart: series[bestStart].date,
    gapEnd: series[bestEnd].date,
    preGapOrders
  };
}

export async function buildRestockHeroAlerts(
  input: BuildRestockHeroInput
): Promise<RestockHeroAlertReport> {
  const db = getDb();

  const priorEnd = new Date(input.start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime());
  priorStart.setUTCDate(priorStart.getUTCDate() - HERO_LOOKBACK_DAYS);

  // Step 1 — rank products by revenue in the trailing 90 days. We aggregate
  // line items joined to non-cancelled, non-test orders. Refunds reduce
  // revenue (we use lineSubtotal - refundedSubtotal as net contribution).
  const heroAgg = (await db.orderLineItem.groupBy({
    by: ["productId"],
    where: {
      storeId: input.storeId,
      productId: { not: null },
      order: {
        storeId: input.storeId,
        createdAt: { gte: priorStart, lte: priorEnd },
        cancelledAt: null,
        test: false
      }
    },
    _sum: { lineSubtotal: true, refundedSubtotal: true, quantity: true },
    _count: { _all: true }
  })) as any[];

  const heroes = heroAgg
    .map((row: any) => ({
      productId: row.productId as string,
      revenue:
        Number(row._sum.lineSubtotal ?? 0) - Number(row._sum.refundedSubtotal ?? 0),
      lineItems: row._count._all as number
    }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, HERO_TOP_N)
    .map((r, idx) => ({ ...r, rank: idx + 1 }));

  if (heroes.length === 0) {
    return { flags: [], heroesConsidered: 0, heroesWithGap: 0 };
  }

  const heroIds = heroes.map((h) => h.productId);

  // Step 2 — pull the product metadata (title, variants for current
  // inventory + sku) for all heroes in one query.
  interface HeroProduct {
    id: string;
    shopifyProductId: string;
    title: string;
    variants: Array<{ sku: string | null; inventoryQuantity: number | null }>;
  }
  const products = (await db.product.findMany({
    where: { id: { in: heroIds } },
    select: {
      id: true,
      shopifyProductId: true,
      title: true,
      variants: { select: { sku: true, inventoryQuantity: true } }
    }
  })) as unknown as HeroProduct[];
  const productById = new Map<string, HeroProduct>(products.map((p) => [p.id, p]));

  // Step 3 — pull every line item × order pair within the lookback window
  // for the hero products. We need per-day order counts to detect the gap
  // and the in-window orders/revenue to know if it resumed.
  const lineItems = await db.orderLineItem.findMany({
    where: {
      storeId: input.storeId,
      productId: { in: heroIds },
      order: {
        storeId: input.storeId,
        createdAt: { gte: priorStart, lte: input.end },
        cancelledAt: null,
        test: false
      }
    },
    select: {
      productId: true,
      quantity: true,
      lineSubtotal: true,
      refundedSubtotal: true,
      order: { select: { createdAt: true } }
    }
  });

  // Build per-product daily series across the entire prior window. We need a
  // contiguous day-grid so consecutive zeros are detectable; sparse rows
  // would hide gaps as "missing data."
  const dayKeys: string[] = [];
  {
    const cur = new Date(priorStart);
    while (cur <= priorEnd) {
      dayKeys.push(toUtcDateKey(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const seriesByProduct = new Map<string, DailyCount[]>();
  const inWindowByProduct = new Map<string, { orders: number; revenue: number }>();
  for (const pid of heroIds) {
    seriesByProduct.set(
      pid,
      dayKeys.map((d) => ({ date: d, orders: 0, revenue: 0 }))
    );
    inWindowByProduct.set(pid, { orders: 0, revenue: 0 });
  }

  for (const li of lineItems as any[]) {
    const pid = li.productId as string;
    const created: Date = li.order.createdAt;
    const dayKey = toUtcDateKey(created);
    const rev =
      Number(li.lineSubtotal ?? 0) - Number(li.refundedSubtotal ?? 0);
    if (created >= input.start && created <= input.end) {
      const w = inWindowByProduct.get(pid)!;
      w.orders += 1;
      w.revenue += rev;
      continue; // current window doesn't participate in the prior-gap series
    }
    const series = seriesByProduct.get(pid);
    if (!series) continue;
    const dayRow = series.find((d) => d.date === dayKey);
    if (!dayRow) continue;
    dayRow.orders += 1;
    dayRow.revenue += rev;
  }

  // Step 4 — evaluate each hero. Flag when there's a long gap + heroic
  // pre-gap pace + resumption signal.
  const flags: RestockHeroFlag[] = [];
  let heroesWithGap = 0;

  for (const hero of heroes) {
    const product = productById.get(hero.productId);
    if (!product) continue;

    const series = seriesByProduct.get(hero.productId);
    if (!series) continue;

    const gap = findLongestZeroGap(series);
    if (!gap) continue;
    if (gap.preGapOrders < MIN_HISTORICAL_PACE_ORDERS) continue;
    heroesWithGap += 1;

    // Current inventory: sum of variant inventoryQuantity (nullable). If
    // every variant is null we treat it as "unknown" — the flag still fires
    // off the resumption-via-sales signal alone.
    let currentInventory: number | null = null;
    for (const v of product.variants ?? []) {
      if (v.inventoryQuantity != null) {
        currentInventory = (currentInventory ?? 0) + v.inventoryQuantity;
      }
    }

    const inWin = inWindowByProduct.get(hero.productId) ?? { orders: 0, revenue: 0 };
    const resumedBySales = inWin.orders > 0;
    const resumedByStock = currentInventory != null && currentInventory > 0;
    if (!resumedBySales && !resumedByStock) continue;

    // Pick the first variant's SKU as the display SKU. Storefront SKUs
    // collapse per-product in this store; if not, this is still the most
    // representative one.
    const sku = product.variants.find((v) => v.sku)?.sku ?? null;

    // Urgency: higher prior revenue + longer gap + currently restocked all
    // amplify each other. We keep this simple and explainable rather than
    // fancy — it's only used to sort the flag list.
    const urgencyScore =
      hero.revenue * 1 +
      gap.gapDays * 100 +
      (resumedByStock ? 500 : 0) +
      (HERO_TOP_N - hero.rank + 1) * 50;

    const fmtIls = (n: number) =>
      `₪${Math.round(n).toLocaleString("en-US")}`;
    const suggestedAction = {
      he: resumedBySales
        ? `כבר נרשמו ${inWin.orders} מכירות השבוע — תפעילי קמפיין Meta יעודי על המוצר תוך 48 שעות. הכנסה בעבר: ${fmtIls(hero.revenue)} ב90 ימים.`
        : `המלאי חזר (${currentInventory ?? "?"} יחידות) אך עדיין אין מכירות. תפעילי קמפיין Meta יעודי + פוסט אורגני מיידית. הכנסה בעבר: ${fmtIls(hero.revenue)} ב90 ימים.`,
      en: resumedBySales
        ? `${inWin.orders} sales already this week — launch a dedicated Meta campaign within 48h. Prior 90-day revenue: ${fmtIls(hero.revenue)}.`
        : `Stock is back (${currentInventory ?? "?"} units) but no sales yet — launch a dedicated Meta campaign + organic post now. Prior 90-day revenue: ${fmtIls(hero.revenue)}.`
    };

    flags.push({
      productId: product.id,
      shopifyProductId: product.shopifyProductId,
      title: product.title,
      sku,
      priorRevenue: hero.revenue,
      priorOrders: gap.preGapOrders + inWin.orders, // rough total in window
      priorRank: hero.rank,
      gapDays: gap.gapDays,
      gapStart: gap.gapStart,
      gapEnd: gap.gapEnd,
      currentInventory,
      ordersThisWindow: inWin.orders,
      revenueThisWindow: inWin.revenue,
      urgencyScore,
      suggestedAction
    });
  }

  flags.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Push model — write each flag through the alert-writer so it lands in
  // the normalized Alert table. The PDF still renders off the returned
  // `flags`, but the Command Center + Alerts page read off the DB rows.
  // We sweep stale alerts at the end so resolved restocks (product back to
  // healthy + sold-through, condition cleared on rerun) get auto-closed.
  const writtenFingerprints: string[] = [];
  for (const flag of flags) {
    const fp = `restock_hero:${flag.productId}`;
    writtenFingerprints.push(fp);
    // Severity: a hero in the top-5 with no sales yet is critical because
    // the lost-revenue clock is ticking. Sales already resumed = high
    // (good signal but still needs budget). Lower rank = high → medium.
    const severity =
      flag.priorRank <= 5 && flag.ordersThisWindow === 0
        ? "critical"
        : flag.priorRank <= 10
          ? "high"
          : "medium";
    await upsertAlert({
      storeId: input.storeId,
      type: "restock_hero",
      fingerprint: fp,
      severity,
      source: "Calculated",
      detectedBy: "restock-hero-alert-service",
      title: `${flag.title} חזר למלאי`,
      description: `מוצר בדירוג #${flag.priorRank} בהכנסות (90 ימים). יצא מהמלאי ${flag.gapDays} ימים. הכנסה בעבר: ₪${Math.round(flag.priorRevenue).toLocaleString("en-US")}.`,
      recommendedAction: flag.suggestedAction.he,
      metricName: "prior_revenue_ils",
      currentValue: flag.priorRevenue,
      relatedEntityType: "product",
      relatedEntityId: flag.productId,
      payloadJson: {
        shopifyProductId: flag.shopifyProductId,
        sku: flag.sku,
        priorRank: flag.priorRank,
        gapDays: flag.gapDays,
        gapStart: flag.gapStart,
        gapEnd: flag.gapEnd,
        currentInventory: flag.currentInventory,
        ordersThisWindow: flag.ordersThisWindow,
        revenueThisWindow: flag.revenueThisWindow,
        suggestedAction: flag.suggestedAction
      },
      periodLabel: `${input.start.toISOString().slice(0, 10)} → ${input.end.toISOString().slice(0, 10)}`
    }).catch((err) => {
      // Don't let a writer failure break the PDF render path. Log to
      // stderr; the engine has already returned its findings.
      console.error("[restock-hero] alert-writer upsert failed:", err);
    });
  }

  // Sweep — any open restock_hero alert this engine wrote previously that
  // didn't surface again this run gets auto-resolved.
  await resolveStaleAlerts({
    storeId: input.storeId,
    detectedBy: "restock-hero-alert-service",
    type: "restock_hero",
    keepFingerprints: writtenFingerprints
  }).catch((err) => {
    console.error("[restock-hero] alert-writer sweep failed:", err);
  });

  return { flags, heroesConsidered: heroes.length, heroesWithGap };
}
