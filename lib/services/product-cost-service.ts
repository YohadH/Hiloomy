// Product cost (COGS per SKU) ingestion service — SA-HIGH-03.
//
// Real profit needs a true cost of goods per product, not a flat
// `Store.defaultCostRatio` estimate. The schema already carries
// `Product.costOverrideAmount` (the manual COGS per unit) and the Shopify
// order sync ALREADY prefers it over the ratio estimate
// (lib/services/shopify-sync-service.ts → `overrideCost ?? estimatedCostAmount`).
// What was missing was a way for the founder to actually POPULATE that
// column. This service is that path: list products with their current cost +
// sales weight, set a per-product cost (manually or via CSV), and — crucially
// — re-cost the already-synced order line items so the Profit page reflects
// the new number immediately instead of only after the next full re-sync.
//
// Cost is stored per PRODUCT (the unit the profit engine reads). The CSV
// importer still accepts a `sku` column and resolves it to the owning product,
// so a founder who keeps a COGS sheet keyed by SKU can import it directly.

import { getDb } from "@/lib/server/db";
import { toNumber, roundCurrency } from "@/lib/server/numbers";
import { parseCsv } from "@/lib/services/affiliate-conversion-import-service";

export interface ProductCostRow {
  productId: string;
  title: string;
  handle: string;
  /** First variant SKU, shown so the founder can reconcile against a COGS sheet. */
  primarySku: string | null;
  /** How many distinct variants/SKUs the product has (cost is product-level). */
  variantCount: number;
  price: number;
  marginProfile: string;
  /** Ratio-based fallback cost (Product.estimatedCost). */
  estimatedCost: number;
  /** Manual COGS per unit. null = not set, still using the ratio estimate. */
  costOverrideAmount: number | null;
  /** What the profit engine effectively uses: override if set, else estimate. */
  effectiveUnitCost: number;
  hasOverride: boolean;
  unitsSold: number;
  revenue: number;
  /** Gross margin % at the effective cost (per-unit price vs per-unit cost). */
  marginPct: number | null;
}

export interface ProductCostSummary {
  totalProducts: number;
  productsWithOverride: number;
  soldProducts: number;
  soldProductsWithCost: number;
  /** Fraction (0–1) of sold products that have a real cost configured. */
  costCoverage: number;
  defaultCostRatio: number;
}

export interface SetProductCostResult {
  ok: true;
  productId: string;
  costOverrideAmount: number | null;
  lineItemsRecosted: number;
}

export interface ImportProductCostsResult {
  ok: boolean;
  totalRows: number;
  parsedRows: number;
  updated: number;
  cleared: number;
  skipped: number;
  lineItemsRecosted: number;
  warnings: string[];
}

function marginPct(price: number, unitCost: number): number | null {
  if (!(price > 0)) return null;
  return roundCurrency(((price - unitCost) / price) * 100);
}

/**
 * List every product for a store with its current cost and how much it has
 * sold, so the founder can prioritise the SKUs that actually move the profit
 * needle. Sorted by units sold desc (heaviest movers first), then by title.
 *
 * `range` scopes the units-sold / revenue / coverage figures to the
 * dashboard's selected window. Without it the figures are lifetime — which
 * is exactly the F-039 bug when the page shows a date picker — so every
 * page-facing caller should pass the selection.
 */
export async function listProductCosts(
  storeId: string,
  range?: { start: Date; end: Date }
): Promise<{
  rows: ProductCostRow[];
  summary: ProductCostSummary;
}> {
  const db = getDb();

  const [store, products, salesByProduct] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { defaultCostRatio: true } }),
    db.product.findMany({
      where: { storeId },
      select: {
        id: true,
        title: true,
        handle: true,
        price: true,
        marginProfile: true,
        estimatedCost: true,
        costOverrideAmount: true,
        variants: { select: { sku: true }, orderBy: { createdAt: "asc" } }
      }
    }),
    db.orderLineItem.groupBy({
      by: ["productId"],
      where: {
        storeId,
        productId: { not: null },
        // Same order scope as returns-intelligence-service — the working
        // reference for range-aware unit counts. Cancelled/test orders are
        // excluded even in lifetime mode; they were never real sales.
        order: {
          cancelledAt: null,
          test: false,
          ...(range ? { createdAt: { gte: range.start, lte: range.end } } : {})
        }
      },
      _sum: { quantity: true, lineSubtotal: true, lineDiscountAmount: true }
    })
  ]);

  const defaultCostRatio = store?.defaultCostRatio ? toNumber(store.defaultCostRatio) : 0.35;

  const salesMap = new Map<string, { units: number; revenue: number }>();
  for (const s of salesByProduct as Array<{
    productId: string | null;
    _sum: { quantity: number | null; lineSubtotal: unknown; lineDiscountAmount: unknown };
  }>) {
    if (!s.productId) continue;
    const revenue = roundCurrency(
      Math.max(0, toNumber(s._sum.lineSubtotal) - toNumber(s._sum.lineDiscountAmount))
    );
    salesMap.set(s.productId, { units: s._sum.quantity ?? 0, revenue });
  }

  const rows: ProductCostRow[] = (products as Array<{
    id: string;
    title: string;
    handle: string;
    price: unknown;
    marginProfile: string;
    estimatedCost: unknown;
    costOverrideAmount: unknown;
    variants: Array<{ sku: string | null }>;
  }>).map((p) => {
    const price = toNumber(p.price);
    const estimatedCost = toNumber(p.estimatedCost);
    const override = p.costOverrideAmount == null ? null : toNumber(p.costOverrideAmount);
    // If no override AND no per-product estimatedCost has been written,
    // fall back to price × defaultCostRatio — the same rule the sync
    // pipeline uses when costing NEW line items. Previously this
    // editor showed "100% margin" on every un-costed product because
    // estimatedCost is a Decimal that defaults to 0; meanwhile the
    // Profit page silently applied defaultCostRatio at the line-item
    // level. Same product, two pages, two completely different
    // "truths" — fixed by aligning the editor's view to the sync rule.
    const effectiveUnitCost =
      override != null
        ? override
        : estimatedCost > 0
          ? estimatedCost
          : price * defaultCostRatio;
    const sales = salesMap.get(p.id) ?? { units: 0, revenue: 0 };
    const primarySku = p.variants.find((v) => v.sku && v.sku.trim())?.sku?.trim() ?? null;
    return {
      productId: p.id,
      title: p.title,
      handle: p.handle,
      primarySku,
      variantCount: p.variants.length,
      price,
      marginProfile: p.marginProfile,
      estimatedCost,
      costOverrideAmount: override,
      effectiveUnitCost,
      hasOverride: override != null,
      unitsSold: sales.units,
      revenue: sales.revenue,
      marginPct: marginPct(price, effectiveUnitCost)
    };
  });

  rows.sort((a, b) => b.unitsSold - a.unitsSold || a.title.localeCompare(b.title));

  const soldRows = rows.filter((r) => r.unitsSold > 0);
  const soldWithCost = soldRows.filter((r) => r.costOverrideAmount != null || r.estimatedCost > 0);
  const summary: ProductCostSummary = {
    totalProducts: rows.length,
    productsWithOverride: rows.filter((r) => r.hasOverride).length,
    soldProducts: soldRows.length,
    soldProductsWithCost: soldWithCost.length,
    costCoverage: soldRows.length > 0 ? soldWithCost.length / soldRows.length : 0,
    defaultCostRatio
  };

  return { rows, summary };
}

// ── Guided COGS onboarding (Launch-QA P0) ────────────────────────────────
// "Real profit" is only as true as its cost data. Rather than a flat editor
// of 378 SKUs, surface the TOP-REVENUE products that still lack a real cost —
// 80% of profit accuracy sits in ~20% of products — so the owner can clear
// the coverage gap in a 5-minute focused task. Coverage is measured by
// REVENUE (same definition contribution-margin-service uses for costCoverage)
// so this card and the profit numbers agree.

export interface CogsOnboardingProduct {
  productId: string;
  title: string;
  primarySku: string | null;
  price: number;
  revenue: number;
  unitsSold: number;
}

export interface CogsOnboarding {
  /** 0–1 share of the window's product revenue backed by a REAL cost. */
  coverage: number;
  soldProducts: number;
  soldProductsWithCost: number;
  revenueCovered: number;
  revenueMissing: number;
  defaultCostRatio: number;
  /** Top-revenue products still missing a real cost — the work queue. */
  topMissing: CogsOnboardingProduct[];
  /** Total count of sold products still missing a real cost. */
  missingCount: number;
  /** How many top-missing products to cost to cross 90% revenue coverage. */
  toReachTarget: number;
}

const COVERAGE_TARGET = 0.9;

export async function buildCogsOnboarding(
  storeId: string,
  range?: { start: Date; end: Date },
  opts?: { limit?: number }
): Promise<CogsOnboarding> {
  const { rows, summary } = await listProductCosts(storeId, range);
  // A product has a REAL cost when a manual override is set OR Shopify gave a
  // concrete estimatedCost — the ratio fallback does NOT count (that's the
  // "estimated" state the onboarding exists to eliminate).
  const hasRealCost = (r: ProductCostRow) => r.costOverrideAmount != null || r.estimatedCost > 0;
  const sold = rows.filter((r) => r.revenue > 0);
  const soldRevenue = sold.reduce((s, r) => s + r.revenue, 0);
  const covered = sold.filter(hasRealCost);
  const revenueCovered = covered.reduce((s, r) => s + r.revenue, 0);
  const missing = sold
    .filter((r) => !hasRealCost(r))
    .sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold);
  const revenueMissing = missing.reduce((s, r) => s + r.revenue, 0);
  // No sales in the window → nothing to judge; treat as fully covered so the
  // onboarding card stays hidden rather than nagging on an empty window.
  const coverage = soldRevenue > 0 ? revenueCovered / soldRevenue : 1;

  let running = revenueCovered;
  let toReachTarget = 0;
  for (const m of missing) {
    if (soldRevenue > 0 && running / soldRevenue >= COVERAGE_TARGET) break;
    running += m.revenue;
    toReachTarget += 1;
  }

  return {
    coverage,
    soldProducts: sold.length,
    soldProductsWithCost: covered.length,
    revenueCovered: roundCurrency(revenueCovered),
    revenueMissing: roundCurrency(revenueMissing),
    defaultCostRatio: summary.defaultCostRatio,
    topMissing: missing.slice(0, opts?.limit ?? 8).map((m) => ({
      productId: m.productId,
      title: m.title,
      primarySku: m.primarySku,
      price: m.price,
      revenue: m.revenue,
      unitsSold: m.unitsSold
    })),
    missingCount: missing.length,
    toReachTarget
  };
}

// ── Default-ratio calibration (F-040) ────────────────────────────────────
// The hardcoded 35% fallback was ~3.3× the store's MEASURED cost ratio
// (real costs run 7–10% of price here), so every product without a cost was
// assigned triple its plausible cost and profit was systematically
// understated. Instead of a blind constant, derive the fallback from the
// store's own measured products and keep Store.defaultCostRatio (which every
// consumer — sync mapper, summary service, analytics repo — already reads)
// up to date.

const CALIBRATION_MIN_PRODUCTS = 3;
const CALIBRATION_MIN_RATIO = 0.03;
const CALIBRATION_MAX_RATIO = 0.85;
// Don't churn the column (and the full recost that follows) for sub-point moves.
const CALIBRATION_APPLY_DELTA = 0.01;

/**
 * Recompute Store.defaultCostRatio from products that have a REAL cost
 * (manual override or Shopify-provided estimatedCost), weighted by lifetime
 * units sold so head SKUs dominate. When the ratio moves by more than a
 * point, writes the column and re-costs every line item to the same
 * precedence the editor displays (override → product estimatedCost → ratio),
 * so the profit engine and the editor stop telling two different truths.
 *
 * Runs after any cost edit/import. Best-effort by design — callers should
 * not fail the user's save if calibration throws.
 */
export async function calibrateDefaultCostRatio(storeId: string): Promise<{
  ratio: number;
  measuredProducts: number;
  applied: boolean;
}> {
  const db = getDb();
  const [store, products, sales] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { defaultCostRatio: true } }),
    db.product.findMany({
      where: { storeId },
      select: { id: true, price: true, estimatedCost: true, costOverrideAmount: true }
    }),
    db.orderLineItem.groupBy({
      by: ["productId"],
      where: { storeId, productId: { not: null }, order: { cancelledAt: null, test: false } },
      _sum: { quantity: true }
    })
  ]);

  const unitsByProduct = new Map<string, number>();
  for (const s of sales as Array<{ productId: string | null; _sum: { quantity: number | null } }>) {
    if (s.productId) unitsByProduct.set(s.productId, s._sum.quantity ?? 0);
  }

  let weightedCost = 0;
  let weightedPrice = 0;
  let measuredProducts = 0;
  for (const p of products as Array<{
    id: string;
    price: unknown;
    estimatedCost: unknown;
    costOverrideAmount: unknown;
  }>) {
    const price = toNumber(p.price);
    if (!(price > 0)) continue;
    const override = p.costOverrideAmount == null ? null : toNumber(p.costOverrideAmount);
    const estimated = toNumber(p.estimatedCost);
    const unitCost = override != null ? override : estimated > 0 ? estimated : null;
    if (unitCost == null) continue;
    // +1 so a store with no sales history still calibrates from its catalog.
    const weight = (unitsByProduct.get(p.id) ?? 0) + 1;
    weightedCost += unitCost * weight;
    weightedPrice += price * weight;
    measuredProducts += 1;
  }

  const current = store?.defaultCostRatio ? toNumber(store.defaultCostRatio) : 0.35;
  if (measuredProducts < CALIBRATION_MIN_PRODUCTS || !(weightedPrice > 0)) {
    return { ratio: current, measuredProducts, applied: false };
  }

  const ratio = Math.min(
    CALIBRATION_MAX_RATIO,
    Math.max(CALIBRATION_MIN_RATIO, Math.round((weightedCost / weightedPrice) * 10000) / 10000)
  );
  if (Math.abs(ratio - current) <= CALIBRATION_APPLY_DELTA) {
    return { ratio: current, measuredProducts, applied: false };
  }

  await db.store.update({ where: { id: storeId }, data: { defaultCostRatio: ratio } });

  // Re-cost EVERY line to the editor's precedence in one statement:
  // override × qty → product estimatedCost × qty → net × new ratio.
  // (Lines with no productId keep their sync-time cost — nothing to join.)
  await db.$executeRaw`
    UPDATE "OrderLineItem" AS oli
    SET "estimatedCostAmount" = ROUND(
      CASE
        WHEN p."costOverrideAmount" IS NOT NULL THEN p."costOverrideAmount" * oli."quantity"
        WHEN p."estimatedCost" > 0 THEN p."estimatedCost" * oli."quantity"
        ELSE GREATEST(oli."lineSubtotal" - oli."lineDiscountAmount", 0) * ${ratio}::numeric
      END, 2)
    FROM "Product" AS p
    WHERE p."id" = oli."productId" AND oli."storeId" = ${storeId}
  `;

  return { ratio, measuredProducts, applied: true };
}

/**
 * Re-cost the already-synced order line items for one product so the Profit
 * page reflects a cost change immediately (the sync only applies the override
 * to NEW/updated orders). Mirrors the exact cost math used at sync time:
 *   - override set   → estimatedCostAmount = cost × quantity
 *   - override clear → estimatedCostAmount = (lineSubtotal − lineDiscount) × defaultCostRatio
 * Returns the number of line items updated.
 */
async function recostLineItemsForProduct(
  storeId: string,
  productId: string,
  cost: number | null,
  defaultCostRatio: number
): Promise<number> {
  const db = getDb();

  if (cost == null) {
    // Clearing the override: fall back to the ratio estimate. Column
    // arithmetic isn't expressible via Prisma updateMany, so use a single
    // parameterised raw UPDATE (same pattern as lib/data/prisma-analytics-repository.ts).
    const affected = (await db.$executeRaw`
      UPDATE "OrderLineItem"
      SET "estimatedCostAmount" = ROUND(GREATEST("lineSubtotal" - "lineDiscountAmount", 0) * ${defaultCostRatio}::numeric, 2)
      WHERE "storeId" = ${storeId} AND "productId" = ${productId}
    `) as number;
    return affected;
  }

  // Setting a per-unit cost: estimatedCostAmount = cost × quantity. Group by
  // the (small) set of distinct quantities so each updateMany sets a constant.
  const groups = (await db.orderLineItem.groupBy({
    by: ["quantity"],
    where: { storeId, productId }
  })) as Array<{ quantity: number }>;

  let updated = 0;
  for (const g of groups) {
    const res = await db.orderLineItem.updateMany({
      where: { storeId, productId, quantity: g.quantity },
      data: { estimatedCostAmount: roundCurrency(cost * g.quantity) }
    });
    updated += res.count;
  }
  return updated;
}

/**
 * Set (or clear, with null) the manual COGS for one product, then re-cost its
 * already-synced order line items. Validates the product belongs to the store.
 */
export async function setProductCost(input: {
  storeId: string;
  productId: string;
  costOverrideAmount: number | null;
  /** Internal: the CSV importer batches many saves and calibrates ONCE at the end. */
  skipCalibration?: boolean;
}): Promise<SetProductCostResult> {
  const { storeId, productId } = input;
  const db = getDb();

  if (input.costOverrideAmount != null) {
    if (!Number.isFinite(input.costOverrideAmount) || input.costOverrideAmount < 0) {
      throw new Error("Cost must be a number ≥ 0.");
    }
  }
  const cost = input.costOverrideAmount == null ? null : roundCurrency(input.costOverrideAmount);

  const product = (await db.product.findFirst({
    where: { id: productId, storeId },
    select: { id: true }
  })) as { id: string } | null;
  if (!product) {
    throw new Error("Product not found for this store.");
  }

  const store = (await db.store.findUnique({
    where: { id: storeId },
    select: { defaultCostRatio: true }
  })) as { defaultCostRatio: unknown } | null;
  const defaultCostRatio = store?.defaultCostRatio ? toNumber(store.defaultCostRatio) : 0.35;

  await db.product.update({
    where: { id: productId },
    data: { costOverrideAmount: cost }
  });

  const lineItemsRecosted = await recostLineItemsForProduct(storeId, productId, cost, defaultCostRatio);

  // A cost edit changes the store's measured cost picture — refresh the
  // fallback ratio (and the estimate-costed lines) so the profit engine
  // tracks reality instead of the hardcoded 35%. Best-effort: the save
  // itself already succeeded.
  if (!input.skipCalibration) {
    await calibrateDefaultCostRatio(storeId).catch((err) =>
      console.warn(
        "[product-cost] ratio calibration failed:",
        err instanceof Error ? err.message : err
      )
    );
  }

  return { ok: true, productId, costOverrideAmount: cost, lineItemsRecosted };
}

// ── CSV import ────────────────────────────────────────────────────────────
// Accepts a header row + data rows. Recognised identifier columns (first match
// wins, case-insensitive): sku, handle, product_id / shopify_product_id,
// title / product. Recognised cost columns: cost, cogs, unit_cost,
// cost_per_item, cost_per_unit. Blank cost clears the override.

const ID_HEADERS = {
  sku: ["sku", "variant_sku", "variant sku"],
  barcode: ["barcode", "ean", "upc", "gtin"],
  handle: ["handle", "product_handle", "product handle"],
  shopifyProductId: ["product_id", "shopify_product_id", "product id", "shopify product id"],
  title: ["title", "product", "product_title", "product title", "name", "product name"]
} as const;
const COST_HEADERS = ["cost", "cogs", "unit_cost", "unit cost", "cost_per_item", "cost per item", "cost_per_unit", "cost per unit"];

function normHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findHeaderIndex(headers: string[], candidates: readonly string[]): number {
  const normalized = headers.map(normHeader);
  for (const c of candidates) {
    const idx = normalized.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseCostCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null; // explicit clear
  // Tolerate currency symbols/spaces (e.g. "$7.50", "₪ 12"). Anything left
  // that isn't a number is junk → signal invalid so the row is skipped, not
  // silently cleared.
  const cleaned = trimmed.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return Number.NaN;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return Number.NaN; // signal invalid
  return roundCurrency(n);
}

export async function importProductCostsCsv(input: {
  storeId: string;
  csvContent: string;
}): Promise<ImportProductCostsResult> {
  const { storeId } = input;
  const db = getDb();
  const warnings: string[] = [];

  const rows = parseCsv(input.csvContent);
  if (rows.length < 2) {
    return {
      ok: false,
      totalRows: Math.max(0, rows.length - 1),
      parsedRows: 0,
      updated: 0,
      cleared: 0,
      skipped: 0,
      lineItemsRecosted: 0,
      warnings: ["CSV needs a header row and at least one data row."]
    };
  }

  const headers = rows[0];
  const costIdx = findHeaderIndex(headers, COST_HEADERS);
  if (costIdx === -1) {
    return {
      ok: false,
      totalRows: rows.length - 1,
      parsedRows: 0,
      updated: 0,
      cleared: 0,
      skipped: 0,
      lineItemsRecosted: 0,
      warnings: [`No cost column found. Add one of: ${COST_HEADERS.join(", ")}.`]
    };
  }
  const idIdx = {
    sku: findHeaderIndex(headers, ID_HEADERS.sku),
    barcode: findHeaderIndex(headers, ID_HEADERS.barcode),
    handle: findHeaderIndex(headers, ID_HEADERS.handle),
    shopifyProductId: findHeaderIndex(headers, ID_HEADERS.shopifyProductId),
    title: findHeaderIndex(headers, ID_HEADERS.title)
  };
  if (
    idIdx.sku === -1 &&
    idIdx.barcode === -1 &&
    idIdx.handle === -1 &&
    idIdx.shopifyProductId === -1 &&
    idIdx.title === -1
  ) {
    return {
      ok: false,
      totalRows: rows.length - 1,
      parsedRows: 0,
      updated: 0,
      cleared: 0,
      skipped: 0,
      lineItemsRecosted: 0,
      warnings: ["No product-identifier column found. Add a sku, barcode, handle, product_id, or title column."]
    };
  }

  // Build lookup maps once.
  const products = (await db.product.findMany({
    where: { storeId },
    select: {
      id: true,
      title: true,
      handle: true,
      shopifyProductId: true,
      variants: { select: { sku: true, barcode: true } }
    }
  })) as Array<{
    id: string;
    title: string;
    handle: string;
    shopifyProductId: string;
    variants: Array<{ sku: string | null; barcode: string | null }>;
  }>;

  const byHandle = new Map<string, string>();
  const byShopifyId = new Map<string, string>();
  const byTitle = new Map<string, string>();
  const bySku = new Map<string, string>();
  const byBarcode = new Map<string, string>();
  for (const p of products) {
    if (p.handle) byHandle.set(p.handle.trim().toLowerCase(), p.id);
    if (p.shopifyProductId) byShopifyId.set(p.shopifyProductId.trim(), p.id);
    if (p.title) byTitle.set(p.title.trim().toLowerCase(), p.id);
    for (const v of p.variants) {
      if (v.sku && v.sku.trim()) bySku.set(v.sku.trim().toLowerCase(), p.id);
      if (v.barcode && v.barcode.trim()) byBarcode.set(v.barcode.trim(), p.id);
    }
  }

  const cell = (row: string[], idx: number): string => (idx >= 0 ? (row[idx] ?? "").trim() : "");
  const resolveProductId = (row: string[]): string | null => {
    const sku = cell(row, idIdx.sku);
    if (sku && bySku.has(sku.toLowerCase())) return bySku.get(sku.toLowerCase())!;
    const barcode = cell(row, idIdx.barcode);
    if (barcode && byBarcode.has(barcode)) return byBarcode.get(barcode)!;
    const handle = cell(row, idIdx.handle);
    if (handle && byHandle.has(handle.toLowerCase())) return byHandle.get(handle.toLowerCase())!;
    const spid = cell(row, idIdx.shopifyProductId);
    if (spid && byShopifyId.has(spid)) return byShopifyId.get(spid)!;
    const title = cell(row, idIdx.title);
    if (title && byTitle.has(title.toLowerCase())) return byTitle.get(title.toLowerCase())!;
    return null;
  };

  // Aggregate by product so two SKU rows mapping to the same product don't
  // fight each other (last non-blank cost wins; we warn on the collision).
  const desired = new Map<string, number | null>();
  let parsedRows = 0;
  let skipped = 0;
  const dataRows = rows.slice(1);

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const lineNo = r + 2; // 1-based incl. header
    const productId = resolveProductId(row);
    if (!productId) {
      skipped++;
      if (warnings.length < 12) {
        const label =
          cell(row, idIdx.sku) || cell(row, idIdx.handle) || cell(row, idIdx.title) || cell(row, idIdx.shopifyProductId) || "(blank)";
        warnings.push(`Row ${lineNo}: no matching product for "${label}".`);
      }
      continue;
    }
    const parsed = parseCostCell(cell(row, costIdx));
    if (Number.isNaN(parsed as number)) {
      skipped++;
      if (warnings.length < 12) warnings.push(`Row ${lineNo}: invalid cost "${cell(row, costIdx)}".`);
      continue;
    }
    if (desired.has(productId) && desired.get(productId) !== parsed && warnings.length < 12) {
      warnings.push(`Multiple rows map to the same product (${productId}); using the last value.`);
    }
    desired.set(productId, parsed);
    parsedRows++;
  }

  let updated = 0;
  let cleared = 0;
  let lineItemsRecosted = 0;
  for (const [productId, cost] of desired) {
    const res = await setProductCost({ storeId, productId, costOverrideAmount: cost, skipCalibration: true });
    lineItemsRecosted += res.lineItemsRecosted;
    if (cost == null) cleared++;
    else updated++;
  }
  if (updated > 0 || cleared > 0) {
    await calibrateDefaultCostRatio(storeId).catch((err) =>
      console.warn(
        "[product-cost] post-import ratio calibration failed:",
        err instanceof Error ? err.message : err
      )
    );
  }

  return {
    ok: true,
    totalRows: dataRows.length,
    parsedRows,
    updated,
    cleared,
    skipped,
    lineItemsRecosted,
    warnings
  };
}
