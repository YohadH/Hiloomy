// Homepage merchandiser — the Idea Engine's first PRODUCT-LEVEL scorer.
//
// Increment 2 (2 Sep 2026): the doc's "Homepage Slot Score (HSS)" runbook,
// built against the data Hiloomy already holds. Recommend-only — it ranks the
// store's products for homepage placement and names the single strongest
// reason per product; it never writes to Shopify (the maker/write-back is a
// later increment, gated on a trusted executor, same as the rest of the
// Idea Engine).
//
// WHAT WE SCORE ON TODAY (all first-party, already in the DB):
//   margin_unit   price − effective unit cost          (product-cost-service)
//   demand        revenue in the window                (real sales, used in
//                                                        place of the doc's GA4
//                                                        per-product CVR — we
//                                                        have actual money, a
//                                                        stronger signal than a
//                                                        rate)
//   momentum      units this window vs the prior one
//   stock_cover   inventory ÷ avg daily units
//
// HELD OUT (the doc's 0.24 `edge` weight): rival price / OOS / ad-whitespace
// per SKU. Hiloomy tracks competitor DOMAINS, not per-SKU price matches, so
// the competitive-edge term is not computable until RivalSweeper delivers
// per-SKU matching (its `/signals/competitive-edge` endpoint, marked "new").
// The weights below are normalized over the signals we DO have, and the edge
// term slots in as a fifth signal the day that data exists — see WEIGHTS.

import { listProductCosts } from "@/lib/services/product-cost-service";
import { getDb } from "@/lib/server/db";

// Signals we can compute today, normalized to sum to 1. When the competitor
// edge lands, add `edge: 0.24` and rescale the rest to the doc's original mix
// (margin .28 / demand .22 / stock .12 / momentum .14 / edge .24).
const WEIGHTS = { margin: 0.3, demand: 0.3, momentum: 0.2, stock: 0.2 } as const;

// A product with less than this many days of stock cover can't be a hero — a
// homepage slot that sells out mid-week burns the traffic. Mirrors the doc's
// hard cap.
const MIN_HERO_STOCK_DAYS = 14;
const HSS_CAP_LOW_STOCK = 35;
// Below this a product doesn't belong on the homepage at all.
const REMOVE_BELOW_HSS = 30;

export interface MerchandiserCandidate {
  productId: string;
  title: string;
  handle: string;
  price: number;
  effectiveUnitCost: number;
  marginPct: number | null;
  unitsCurrent: number;
  unitsPrior: number;
  revenueCurrent: number;
  /** null = inventory not tracked/known for this product. */
  inventoryQuantity: number | null;
  /** Length of the current window in days, for avg-daily-units. */
  windowDays: number;
}

export type MerchandiserMove = "promote" | "hold" | "demote" | "remove";

export interface ScoredProduct {
  productId: string;
  title: string;
  handle: string;
  price: number;
  /** 0–100 Homepage Slot Score. */
  hss: number;
  marginUnit: number;
  marginPct: number | null;
  momentumUnits: number;
  revenueCurrent: number;
  /** null = inventory unknown. */
  stockCoverDays: number | null;
  move: MerchandiserMove;
  flags: { lowStock: boolean; outOfStock: boolean };
  /** The single strongest reason, in plain words. */
  reason: { he: string; en: string };
}

export interface HomepageMerchandiserReport {
  windowStart: string;
  windowEnd: string;
  windowDays: number;
  scored: ScoredProduct[];
  /** HSS < 30, out of stock, or under the stock-cover floor. */
  removeList: ScoredProduct[];
  /** True once the RivalSweeper per-SKU edge signal is wired in. */
  edgeSignalAvailable: boolean;
}

// ── Pure scorer ──────────────────────────────────────────────────────────
// Separated from all I/O so the math is unit-testable with fixed inputs.
export function computeHomepageScores(candidates: MerchandiserCandidate[]): ScoredProduct[] {
  if (candidates.length === 0) return [];

  const marginUnitOf = (c: MerchandiserCandidate) => Math.max(0, c.price - c.effectiveUnitCost);
  const momentumOf = (c: MerchandiserCandidate) => c.unitsCurrent - c.unitsPrior;
  const avgDailyUnits = (c: MerchandiserCandidate) =>
    c.windowDays > 0 ? c.unitsCurrent / c.windowDays : 0;
  const stockCoverOf = (c: MerchandiserCandidate): number | null => {
    if (c.inventoryQuantity == null) return null;
    const rate = avgDailyUnits(c);
    // No recent sales: cover is effectively unbounded if there's stock, 0 if not.
    if (rate <= 0) return c.inventoryQuantity > 0 ? Number.POSITIVE_INFINITY : 0;
    return c.inventoryQuantity / rate;
  };

  // Min-max normalization across the candidate set. A flat signal (all equal)
  // normalizes to 0.5 so it neither helps nor hurts anyone.
  const norm = (value: number, min: number, max: number) =>
    max > min ? (value - min) / (max - min) : 0.5;

  const margins = candidates.map(marginUnitOf);
  const demands = candidates.map((c) => c.revenueCurrent);
  // Momentum only rewards acceleration; a decline contributes 0, not a negative
  // that would drag the whole score below a steady seller.
  const momenta = candidates.map((c) => Math.max(0, momentumOf(c)));
  const marginMin = Math.min(...margins);
  const marginMax = Math.max(...margins);
  const demandMin = Math.min(...demands);
  const demandMax = Math.max(...demands);
  const momentumMin = Math.min(...momenta);
  const momentumMax = Math.max(...momenta);

  const scored = candidates.map((c) => {
    const marginUnit = marginUnitOf(c);
    const momentumUnits = momentumOf(c);
    const stockCoverDays = stockCoverOf(c);
    const outOfStock = c.inventoryQuantity != null && c.inventoryQuantity <= 0;
    const lowStock =
      stockCoverDays != null && Number.isFinite(stockCoverDays) && stockCoverDays < MIN_HERO_STOCK_DAYS;

    // Stock contributes a neutral 0.5 when unknown; a healthy cover (≥ the
    // hero floor) is a full 1; below the floor scales down toward 0.
    const stockScore =
      stockCoverDays == null
        ? 0.5
        : !Number.isFinite(stockCoverDays)
          ? 1
          : Math.min(1, stockCoverDays / (MIN_HERO_STOCK_DAYS * 2));

    const normMargin = norm(marginUnit, marginMin, marginMax);
    const normDemand = norm(c.revenueCurrent, demandMin, demandMax);
    const normMomentum = norm(Math.max(0, momentumUnits), momentumMin, momentumMax);

    let hss =
      100 *
      (WEIGHTS.margin * normMargin +
        WEIGHTS.demand * normDemand +
        WEIGHTS.momentum * normMomentum +
        WEIGHTS.stock * stockScore);

    // Hard cap: something that can't survive a week as a hero can't score like
    // one, no matter how strong its margin/demand.
    if (outOfStock) hss = Math.min(hss, 0);
    else if (lowStock) hss = Math.min(hss, HSS_CAP_LOW_STOCK);
    hss = Math.round(hss);

    // Strongest reason = the normalized signal contributing the most, with the
    // stock guards taking precedence because they override the score.
    const reason = pickReason({
      outOfStock,
      lowStock,
      stockCoverDays,
      marginUnit,
      marginPct: c.marginPct,
      revenueCurrent: c.revenueCurrent,
      momentumUnits,
      contributions: {
        margin: WEIGHTS.margin * normMargin,
        demand: WEIGHTS.demand * normDemand,
        momentum: WEIGHTS.momentum * normMomentum
      }
    });

    return {
      productId: c.productId,
      title: c.title,
      handle: c.handle,
      price: c.price,
      hss,
      marginUnit: Math.round(marginUnit * 100) / 100,
      marginPct: c.marginPct,
      momentumUnits,
      revenueCurrent: Math.round(c.revenueCurrent),
      stockCoverDays:
        stockCoverDays == null || !Number.isFinite(stockCoverDays)
          ? stockCoverDays === null
            ? null
            : Number.POSITIVE_INFINITY
          : Math.round(stockCoverDays),
      move: "hold" as MerchandiserMove,
      flags: { lowStock, outOfStock },
      reason
    } satisfies ScoredProduct;
  });

  scored.sort((a, b) => b.hss - a.hss);

  // Move is relative to the ranked set: strong + shippable → promote; the
  // weakest third → demote; a failing score or a stock guard → remove.
  const n = scored.length;
  scored.forEach((p, i) => {
    if (p.hss < REMOVE_BELOW_HSS || p.flags.outOfStock || p.flags.lowStock) {
      p.move = "remove";
    } else if (i < Math.ceil(n / 3)) {
      p.move = "promote";
    } else if (i >= Math.floor((2 * n) / 3)) {
      p.move = "demote";
    } else {
      p.move = "hold";
    }
  });

  return scored;
}

function pickReason(input: {
  outOfStock: boolean;
  lowStock: boolean;
  stockCoverDays: number | null;
  marginUnit: number;
  marginPct: number | null;
  revenueCurrent: number;
  momentumUnits: number;
  contributions: { margin: number; demand: number; momentum: number };
}): { he: string; en: string } {
  const nis = (v: number) => `₪${Math.round(v).toLocaleString()}`;
  if (input.outOfStock) {
    return { he: "אזל מהמלאי — לא יכול להיות באנר", en: "Out of stock — can't be a hero" };
  }
  if (input.lowStock && input.stockCoverDays != null && Number.isFinite(input.stockCoverDays)) {
    const d = Math.round(input.stockCoverDays);
    return {
      he: `מלאי נמוך — רק ${d} ימי כיסוי`,
      en: `Low stock — only ${d} days of cover`
    };
  }
  const top = (["margin", "demand", "momentum"] as const).reduce((best, k) =>
    input.contributions[k] > input.contributions[best] ? k : best
  );
  if (top === "margin") {
    const pct = input.marginPct != null ? ` (${Math.round(input.marginPct)}%)` : "";
    return {
      he: `הרווח הגבוה ביותר — ${nis(input.marginUnit)} ליחידה${pct}`,
      en: `Highest margin — ${nis(input.marginUnit)}/unit${pct}`
    };
  }
  if (top === "demand") {
    return {
      he: `מוביל בהכנסה בחלון — ${nis(input.revenueCurrent)}`,
      en: `Top revenue this window — ${nis(input.revenueCurrent)}`
    };
  }
  return {
    he: `בתאוצה — +${input.momentumUnits} יחידות מול התקופה הקודמת`,
    en: `Accelerating — +${input.momentumUnits} units vs the prior period`
  };
}

// ── Data-gathering wrapper ─────────────────────────────────────────────────
export async function buildHomepageMerchandiser(input: {
  storeId: string;
  /** Current window. Defaults to the last 28 days (the doc's window). */
  start?: Date;
  end?: Date;
}): Promise<HomepageMerchandiserReport> {
  const end = input.end ?? new Date();
  const start = input.start ?? new Date(end.getTime() - 28 * 86_400_000);
  const windowMs = end.getTime() - start.getTime();
  const windowDays = Math.max(1, Math.round(windowMs / 86_400_000));
  const priorStart = new Date(start.getTime() - windowMs);

  const db = getDb();
  const [current, prior, inventory] = await Promise.all([
    listProductCosts(input.storeId, { start, end }),
    listProductCosts(input.storeId, { start: priorStart, end: start }),
    // Inventory is product-level for scoring: sum the variants' quantities.
    // A product with no tracked variant quantity stays null (unknown), not 0.
    db.productVariant.groupBy({
      by: ["productId"],
      where: { product: { storeId: input.storeId } },
      _sum: { inventoryQuantity: true }
    }) as Promise<Array<{ productId: string; _sum: { inventoryQuantity: number | null } }>>
  ]);

  const priorUnits = new Map(prior.rows.map((r) => [r.productId, r.unitsSold]));
  const invByProduct = new Map(
    inventory.map((r) => [r.productId, r._sum.inventoryQuantity])
  );

  const candidates: MerchandiserCandidate[] = current.rows
    // A product with no sales in either window and no revenue isn't a homepage
    // candidate — the merchandiser ranks what could carry the homepage, not the
    // whole dormant catalogue (that's the silent-products leak's job).
    .filter((r) => r.unitsSold > 0 || (priorUnits.get(r.productId) ?? 0) > 0)
    .map((r) => ({
      productId: r.productId,
      title: r.title,
      handle: r.handle,
      price: r.price,
      effectiveUnitCost: r.effectiveUnitCost,
      marginPct: r.marginPct,
      unitsCurrent: r.unitsSold,
      unitsPrior: priorUnits.get(r.productId) ?? 0,
      revenueCurrent: r.revenue,
      inventoryQuantity: invByProduct.has(r.productId)
        ? invByProduct.get(r.productId) ?? null
        : null,
      windowDays
    }));

  const scored = computeHomepageScores(candidates);

  return {
    windowStart: start.toISOString().slice(0, 10),
    windowEnd: end.toISOString().slice(0, 10),
    windowDays,
    scored,
    removeList: scored.filter((p) => p.move === "remove"),
    edgeSignalAvailable: false
  };
}
