// Returns intelligence (Insight Engine 3).
//
// "Which products/variants are quietly bleeding margin through returns —
// and why?"
//
// Data source: OrderLineItem.refundedQuantity / refundedSubtotal, which
// the incremental Shopify sync attributes per line from each refund's
// refundLineItems (see lib/shopify/mappers/shopify-mappers.ts). No new
// sync needed — but note the initial BULK sync omits refund line items,
// so historical orders may carry order-level refund totals without the
// per-line split. `lineRefundCoverage` reports how much of the window's
// refunded money IS captured at line level, so every consumer can show
// an honest confidence note instead of a silently-low return rate.
//
// Three consumers:
//   • /profit/returns — best/worst returners + variant skew breakdown
//   • return_rate_high alerts from the 2h cron ("fix size chart",
//     "pull from ads")
//   • ROAS × returns cross-signal — the weekly report's "scale this
//     campaign" recommendation gets a caution when the advertised
//     product's return rate is above threshold (a 3.3x-ROAS product
//     with 15% returns is not a winner).

import { getDb } from "@/lib/server/db";
import {
  upsertAlert,
  resolveStaleAlerts
} from "@/lib/services/alert-writer-service";

export interface VariantReturnRow {
  variantId: string;
  title: string;
  unitsSold: number;
  unitsReturned: number;
  returnRate: number;
}

export interface ProductReturnRow {
  productId: string;
  title: string;
  unitsSold: number;
  unitsReturned: number;
  returnRate: number; // units returned / units sold
  refundedAmount: number;
  netRevenue: number; // net line revenue minus refunded subtotal
  vsStoreAvg: number; // returnRate − storeAvgReturnRate (percentage points as fraction)
  variants: VariantReturnRow[];
  // A variant returning ≥2× the product's own rate (with volume) — the
  // "one size keeps coming back" signal that points at a sizing issue.
  skewedVariant: VariantReturnRow | null;
}

export interface ReturnsIntelligenceReport {
  windowStart: string;
  windowEnd: string;
  storeAvgReturnRate: number;
  totalUnitsSold: number;
  totalUnitsReturned: number;
  totalRefundedAmount: number; // order-level Σ totalRefunds (ground truth)
  lineRefundCoverage: number | null; // line-level refunded ₪ / order-level refunded ₪
  worst: ProductReturnRow[];
  best: ProductReturnRow[];
  rows: ProductReturnRow[];
}

// Volume floors — a 1-of-2 return is noise, not a signal.
const MIN_UNITS_FOR_LISTS = 5;
const VARIANT_SKEW_MIN_RETURNS = 3;

export async function buildReturnsIntelligence(input: {
  storeId: string;
  start: Date;
  end: Date;
}): Promise<ReturnsIntelligenceReport> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const empty: ReturnsIntelligenceReport = {
    windowStart: input.start.toISOString(),
    windowEnd: input.end.toISOString(),
    storeAvgReturnRate: 0,
    totalUnitsSold: 0,
    totalUnitsReturned: 0,
    totalRefundedAmount: 0,
    lineRefundCoverage: null,
    worst: [],
    best: [],
    rows: []
  };
  if (!db?.orderLineItem) return empty;

  const lineScope = {
    storeId: input.storeId,
    productId: { not: null },
    order: {
      createdAt: { gte: input.start, lte: input.end },
      cancelledAt: null,
      test: false
    }
  };

  // Per-variant grouping gives both levels in one query — product rows are
  // the variant rows rolled up.
  const groups: Array<{
    productId: string;
    variantId: string | null;
    _sum: {
      quantity: unknown;
      refundedQuantity: unknown;
      refundedSubtotal: unknown;
      lineSubtotal: unknown;
      lineDiscountAmount: unknown;
    };
  }> = await db.orderLineItem.groupBy({
    by: ["productId", "variantId"],
    where: lineScope,
    _sum: {
      quantity: true,
      refundedQuantity: true,
      refundedSubtotal: true,
      lineSubtotal: true,
      lineDiscountAmount: true
    }
  });
  if (groups.length === 0) return empty;

  const num = (v: unknown) => (v == null ? 0 : Number(v));

  interface ProdAcc {
    unitsSold: number;
    unitsReturned: number;
    refundedAmount: number;
    netRevenue: number;
    variants: Map<string, { unitsSold: number; unitsReturned: number }>;
  }
  const byProduct = new Map<string, ProdAcc>();
  for (const g of groups) {
    if (!g.productId) continue;
    const acc: ProdAcc = byProduct.get(g.productId) ?? {
      unitsSold: 0,
      unitsReturned: 0,
      refundedAmount: 0,
      netRevenue: 0,
      variants: new Map()
    };
    const sold = num(g._sum.quantity);
    const returned = num(g._sum.refundedQuantity);
    acc.unitsSold += sold;
    acc.unitsReturned += returned;
    acc.refundedAmount += num(g._sum.refundedSubtotal);
    acc.netRevenue += num(g._sum.lineSubtotal) - num(g._sum.lineDiscountAmount) - num(g._sum.refundedSubtotal);
    if (g.variantId) {
      const v = acc.variants.get(g.variantId) ?? { unitsSold: 0, unitsReturned: 0 };
      v.unitsSold += sold;
      v.unitsReturned += returned;
      acc.variants.set(g.variantId, v);
    }
    byProduct.set(g.productId, acc);
  }

  // Names for products + variants in one pass each.
  const productIds = Array.from(byProduct.keys());
  const variantIds = Array.from(
    new Set(groups.map((g) => g.variantId).filter(Boolean) as string[])
  );
  const [products, variants] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, title: true }
    }),
    variantIds.length > 0
      ? db.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, title: true }
        })
      : Promise.resolve([])
  ]);
  const productTitle = new Map((products as Array<{ id: string; title: string }>).map((p) => [p.id, p.title]));
  const variantTitle = new Map((variants as Array<{ id: string; title: string }>).map((v) => [v.id, v.title]));

  // Order-level refund ground truth for the coverage metric.
  const orderAgg = await db.order.aggregate({
    where: {
      storeId: input.storeId,
      createdAt: { gte: input.start, lte: input.end },
      cancelledAt: null,
      test: false
    },
    _sum: { totalRefunds: true }
  });
  const orderRefunds = num(orderAgg?._sum?.totalRefunds);

  let totalSold = 0;
  let totalReturned = 0;
  let lineRefunded = 0;

  const rows: ProductReturnRow[] = [];
  for (const [productId, acc] of byProduct) {
    totalSold += acc.unitsSold;
    totalReturned += acc.unitsReturned;
    lineRefunded += acc.refundedAmount;
    if (acc.unitsSold === 0) continue;

    const productRate = acc.unitsReturned / acc.unitsSold;
    const variantRows: VariantReturnRow[] = Array.from(acc.variants.entries())
      .map(([variantId, v]) => ({
        variantId,
        title: variantTitle.get(variantId) ?? "—",
        unitsSold: v.unitsSold,
        unitsReturned: v.unitsReturned,
        returnRate: v.unitsSold > 0 ? v.unitsReturned / v.unitsSold : 0
      }))
      .sort((a, b) => b.returnRate - a.returnRate);

    const skewedVariant =
      variantRows.find(
        (v) =>
          v.unitsReturned >= VARIANT_SKEW_MIN_RETURNS &&
          productRate > 0 &&
          v.returnRate >= productRate * 2 &&
          // A product with a single variant can't "skew against itself".
          variantRows.length > 1
      ) ?? null;

    rows.push({
      productId,
      title: productTitle.get(productId) ?? "—",
      unitsSold: acc.unitsSold,
      unitsReturned: acc.unitsReturned,
      returnRate: productRate,
      refundedAmount: Math.round(acc.refundedAmount * 100) / 100,
      netRevenue: Math.round(acc.netRevenue * 100) / 100,
      vsStoreAvg: 0, // filled below once the store average is known
      variants: variantRows,
      skewedVariant
    });
  }

  const storeAvg = totalSold > 0 ? totalReturned / totalSold : 0;
  for (const row of rows) row.vsStoreAvg = row.returnRate - storeAvg;

  const eligible = rows.filter((r) => r.unitsSold >= MIN_UNITS_FOR_LISTS);
  const worst = [...eligible]
    .filter((r) => r.unitsReturned > 0)
    .sort((a, b) => b.returnRate - a.returnRate)
    .slice(0, 10);
  const best = [...eligible].sort((a, b) => a.returnRate - b.returnRate).slice(0, 10);

  rows.sort((a, b) => b.refundedAmount - a.refundedAmount);

  return {
    windowStart: input.start.toISOString(),
    windowEnd: input.end.toISOString(),
    storeAvgReturnRate: storeAvg,
    totalUnitsSold: totalSold,
    totalUnitsReturned: totalReturned,
    totalRefundedAmount: Math.round(orderRefunds * 100) / 100,
    lineRefundCoverage: orderRefunds > 0 ? Math.min(1, lineRefunded / orderRefunds) : null,
    worst,
    best,
    rows
  };
}

// ─────────────────────────────────────────────────────────────────────────
// ROAS × returns cross-signal helpers.
//
// The weekly report's "Scale campaign X by 20%" recommendation is built
// from Meta numbers alone. These helpers let the insights layer check
// whether the campaign's advertised product is a high-returner before
// repeating that advice. Matching is name-based (campaign/ad names almost
// always carry the product name) and deliberately conservative — no match
// beats a wrong match.
// ─────────────────────────────────────────────────────────────────────────

export interface ProductReturnRisk {
  title: string;
  returnRate: number;
  unitsSold: number;
}

export const RETURN_RISK_MIN_RATE = 0.12; // 12%+ return rate = not a scale winner
const RETURN_RISK_MIN_UNITS = 10;

/** The report window's products that would disqualify a "scale" verdict. */
export function extractReturnRisks(report: ReturnsIntelligenceReport): ProductReturnRisk[] {
  return report.rows
    .filter((r) => r.unitsSold >= RETURN_RISK_MIN_UNITS && r.returnRate >= RETURN_RISK_MIN_RATE)
    .map((r) => ({ title: r.title, returnRate: r.returnRate, unitsSold: r.unitsSold }));
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a campaign/ad name against the risk list. A risk matches when the
 * normalized product title appears whole in the name, or when most of its
 * significant tokens (≥3 chars) do. Returns the highest-return match.
 */
export function findReturnRiskForName(
  name: string | null | undefined,
  risks: ProductReturnRisk[]
): ProductReturnRisk | null {
  if (!name || risks.length === 0) return null;
  const haystack = ` ${normalizeForMatch(name)} `;
  let bestMatch: ProductReturnRisk | null = null;
  for (const risk of risks) {
    const title = normalizeForMatch(risk.title);
    if (!title) continue;
    let matched = false;
    if (haystack.includes(` ${title} `) || haystack.includes(title)) {
      matched = true;
    } else {
      const tokens = title.split(" ").filter((t) => t.length >= 3);
      if (tokens.length > 0) {
        const hits = tokens.filter((t) => haystack.includes(t)).length;
        matched = hits / tokens.length >= 0.6 && hits >= 1 && tokens.some((t) => t.length >= 4 && haystack.includes(t));
      }
    }
    if (matched && (!bestMatch || risk.returnRate > bestMatch.returnRate)) bestMatch = risk;
  }
  return bestMatch;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-product return-rate alerts — fired from the 2h cron over a rolling
// 60-day window (returns lag purchases by days-to-weeks; a 7-day window
// would whipsaw). Sweep-resolves products that drop back under threshold.
// ─────────────────────────────────────────────────────────────────────────

const ALERT_DETECTOR = "returns-intelligence-service";
const ALERT_TYPE = "return_rate_high";
const ALERT_WINDOW_DAYS = 60;
const ALERT_MIN_UNITS = 10;
const ALERT_MIN_RATE = 0.12;

export interface ReturnRateAlertResult {
  fired: number;
  resolved: number;
}

export async function upsertReturnRateAlerts(storeId: string): Promise<ReturnRateAlertResult> {
  const end = new Date();
  const start = new Date(end.getTime() - ALERT_WINDOW_DAYS * 86_400_000);
  const report = await buildReturnsIntelligence({ storeId, start, end });

  // Fire on products meaningfully worse than the store's own norm — an
  // absolute floor alone would spam apparel stores where 10% is routine.
  const threshold = Math.max(ALERT_MIN_RATE, report.storeAvgReturnRate * 2);
  const offenders = report.rows.filter(
    (r) => r.unitsSold >= ALERT_MIN_UNITS && r.returnRate >= threshold
  );

  const keepFingerprints: string[] = [];
  for (const product of offenders) {
    const fingerprint = `${ALERT_TYPE}:${product.productId}`;
    keepFingerprints.push(fingerprint);
    const pct = Math.round(product.returnRate * 100);
    const avgPct = Math.round(report.storeAvgReturnRate * 100);
    const skew = product.skewedVariant;
    await upsertAlert({
      storeId,
      type: ALERT_TYPE,
      fingerprint,
      severity: product.returnRate >= 0.25 ? "high" : "medium",
      source: "Shopify",
      detectedBy: ALERT_DETECTOR,
      title: `"${product.title}" חוזר בשיעור ${pct}% — פי ${avgPct > 0 ? Math.round(product.returnRate / report.storeAvgReturnRate) : "?"} מממוצע החנות`,
      description:
        `${product.unitsReturned} מתוך ${product.unitsSold} יחידות הוחזרו ב־${ALERT_WINDOW_DAYS} הימים האחרונים ` +
        `(₪${Math.round(product.refundedAmount).toLocaleString("en-US")} החזרים; ממוצע החנות ${avgPct}%).` +
        (skew
          ? ` הבעיה מרוכזת בוריאנט "${skew.title}" — ${Math.round(skew.returnRate * 100)}% חוזרים, ייתכן שמדובר בבעיית מידה.`
          : ""),
      recommendedAction: skew
        ? `בדקו את טבלת המידות/תיאור של הוריאנט "${skew.title}" — ואם המוצר רץ במודעות, שקלו להשהות עד לתיקון.`
        : `בדקו את תיאור המוצר, התמונות וטבלת המידות של "${product.title}" — ואם הוא רץ במודעות, שקלו להשהות עד לתיקון.`,
      metricName: "return_rate_pct",
      currentValue: pct,
      previousValue: avgPct,
      relatedEntityType: "product",
      relatedEntityId: product.productId,
      payloadJson: {
        productId: product.productId,
        title: product.title,
        unitsSold: product.unitsSold,
        unitsReturned: product.unitsReturned,
        returnRate: product.returnRate,
        refundedAmount: product.refundedAmount,
        storeAvgReturnRate: report.storeAvgReturnRate,
        skewedVariant: skew,
        windowDays: ALERT_WINDOW_DAYS
      },
      periodLabel: `${ALERT_WINDOW_DAYS} ימים אחרונים`
    });
  }

  const swept = await resolveStaleAlerts({
    storeId,
    detectedBy: ALERT_DETECTOR,
    type: ALERT_TYPE,
    keepFingerprints
  });

  return { fired: offenders.length, resolved: swept.resolved };
}
