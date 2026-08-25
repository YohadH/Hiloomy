// Bundle profitability (F-036).
//
// Shopify sells a kit as ONE product and says nothing about its contents,
// so the store's best seller (a bundle) had unknowable economics: its COGS
// was a guess, and pro-rata allocation breaks down worst exactly here
// (a kit's component cost has nothing to do with its revenue weight).
// The owner defines each kit's components once (Settings → באנדלים); this
// service computes the kit's TRUE unit cost = Σ(component effective cost ×
// quantity) and reports real bundle margins for the selected window.

import { getDb } from "@/lib/server/db";
import { toNumber, roundCurrency } from "@/lib/server/numbers";
import { AppError } from "@/lib/server/errors";

export interface BundleComponentRow {
  id: string;
  componentProductId: string;
  title: string;
  quantity: number;
  effectiveUnitCost: number;
  hasRealCost: boolean;
}

export interface BundleDefinition {
  bundleProductId: string;
  title: string;
  price: number;
  components: BundleComponentRow[];
  trueUnitCost: number;
  // The cost the profit engine currently books for one kit (override →
  // estimatedCost → ratio) — shown so the owner sees the correction size.
  bookedUnitCost: number;
}

export interface BundleOverview {
  bundles: BundleDefinition[];
  products: Array<{ productId: string; title: string; price: number }>;
}

interface ProductCostFacts {
  id: string;
  title: string;
  price: number;
  estimatedCost: number;
  costOverrideAmount: number | null;
}

function effectiveUnitCost(p: ProductCostFacts, defaultCostRatio: number): { cost: number; real: boolean } {
  if (p.costOverrideAmount != null) return { cost: p.costOverrideAmount, real: true };
  if (p.estimatedCost > 0) return { cost: p.estimatedCost, real: true };
  return { cost: p.price * defaultCostRatio, real: false };
}

async function loadCostFacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  storeId: string,
  productIds?: string[]
): Promise<{ byId: Map<string, ProductCostFacts>; defaultCostRatio: number }> {
  const [store, products] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { defaultCostRatio: true } }),
    db.product.findMany({
      where: { storeId, ...(productIds ? { id: { in: productIds } } : {}) },
      select: { id: true, title: true, price: true, estimatedCost: true, costOverrideAmount: true }
    })
  ]);
  const byId = new Map<string, ProductCostFacts>();
  for (const p of products as Array<Record<string, unknown>>) {
    byId.set(p.id as string, {
      id: p.id as string,
      title: p.title as string,
      price: toNumber(p.price),
      estimatedCost: toNumber(p.estimatedCost),
      costOverrideAmount: p.costOverrideAmount == null ? null : toNumber(p.costOverrideAmount)
    });
  }
  return {
    byId,
    defaultCostRatio: store?.defaultCostRatio ? toNumber(store.defaultCostRatio) : 0.35
  };
}

export async function getBundleOverview(storeId: string): Promise<BundleOverview> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const [links, facts] = await Promise.all([
    db.bundleComponent.findMany({
      where: { storeId },
      select: { id: true, bundleProductId: true, componentProductId: true, quantity: true }
    }) as Promise<Array<{ id: string; bundleProductId: string; componentProductId: string; quantity: number }>>,
    loadCostFacts(db, storeId)
  ]);

  const byBundle = new Map<string, BundleComponentRow[]>();
  for (const link of links) {
    const component = facts.byId.get(link.componentProductId);
    if (!component) continue;
    const eff = effectiveUnitCost(component, facts.defaultCostRatio);
    const list = byBundle.get(link.bundleProductId) ?? [];
    list.push({
      id: link.id,
      componentProductId: link.componentProductId,
      title: component.title,
      quantity: link.quantity,
      effectiveUnitCost: roundCurrency(eff.cost),
      hasRealCost: eff.real
    });
    byBundle.set(link.bundleProductId, list);
  }

  const bundles: BundleDefinition[] = [];
  for (const [bundleProductId, components] of byBundle) {
    const bundle = facts.byId.get(bundleProductId);
    if (!bundle) continue;
    const booked = effectiveUnitCost(bundle, facts.defaultCostRatio);
    bundles.push({
      bundleProductId,
      title: bundle.title,
      price: bundle.price,
      components: components.sort((a, b) => a.title.localeCompare(b.title)),
      trueUnitCost: roundCurrency(
        components.reduce((s, c) => s + c.effectiveUnitCost * c.quantity, 0)
      ),
      bookedUnitCost: roundCurrency(booked.cost)
    });
  }
  bundles.sort((a, b) => a.title.localeCompare(b.title));

  return {
    bundles,
    products: [...facts.byId.values()]
      .map((p) => ({ productId: p.id, title: p.title, price: p.price }))
      .sort((a, b) => a.title.localeCompare(b.title))
  };
}

export async function setBundleComponent(
  storeId: string,
  input: { bundleProductId?: string; componentProductId?: string; quantity?: number }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const bundleProductId = typeof input.bundleProductId === "string" ? input.bundleProductId.trim() : "";
  const componentProductId =
    typeof input.componentProductId === "string" ? input.componentProductId.trim() : "";
  const quantity = Math.max(1, Math.min(99, Math.round(Number(input.quantity ?? 1)) || 1));
  if (!bundleProductId || !componentProductId) {
    throw new AppError("bundleProductId and componentProductId are required.", 400);
  }
  if (bundleProductId === componentProductId) {
    throw new AppError("A bundle cannot contain itself.", 400);
  }
  const count = await db.product.count({
    where: { storeId, id: { in: [bundleProductId, componentProductId] } }
  });
  if (count !== 2) throw new AppError("Product not found for this store.", 404);

  await db.bundleComponent.upsert({
    where: {
      storeId_bundleProductId_componentProductId: { storeId, bundleProductId, componentProductId }
    },
    update: { quantity },
    create: { storeId, bundleProductId, componentProductId, quantity }
  });
}

export async function removeBundleComponent(storeId: string, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  await db.bundleComponent.deleteMany({ where: { storeId, id } });
}

// ── Window analysis ──────────────────────────────────────────────────────

export interface BundleProfitabilityRow {
  bundleProductId: string;
  title: string;
  unitsSold: number;
  revenue: number;
  trueUnitCost: number;
  trueCogs: number;
  trueProfit: number;
  trueMarginRate: number | null;
  // What the profit engine currently books for the same sales — the size
  // of the correction the component mapping just made.
  bookedCogs: number;
  componentsMissingRealCost: number;
}

export async function buildBundleProfitability(
  storeId: string,
  range: { start: Date; end: Date }
): Promise<BundleProfitabilityRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const overview = await getBundleOverview(storeId);
  if (overview.bundles.length === 0) return [];

  const sales = (await db.orderLineItem.groupBy({
    by: ["productId"],
    where: {
      storeId,
      productId: { in: overview.bundles.map((b) => b.bundleProductId) },
      order: {
        createdAt: { gte: range.start, lte: range.end },
        cancelledAt: null,
        test: false
      }
    },
    _sum: { quantity: true, lineSubtotal: true, lineDiscountAmount: true, estimatedCostAmount: true }
  })) as Array<{
    productId: string | null;
    _sum: {
      quantity: number | null;
      lineSubtotal: unknown;
      lineDiscountAmount: unknown;
      estimatedCostAmount: unknown;
    };
  }>;
  const salesById = new Map(sales.filter((s) => s.productId).map((s) => [s.productId as string, s]));

  const rows: BundleProfitabilityRow[] = [];
  for (const bundle of overview.bundles) {
    const s = salesById.get(bundle.bundleProductId);
    const units = Number(s?._sum.quantity ?? 0);
    const revenue = Math.max(
      0,
      toNumber(s?._sum.lineSubtotal) - toNumber(s?._sum.lineDiscountAmount)
    );
    const trueCogs = roundCurrency(bundle.trueUnitCost * units);
    const trueProfit = roundCurrency(revenue - trueCogs);
    rows.push({
      bundleProductId: bundle.bundleProductId,
      title: bundle.title,
      unitsSold: units,
      revenue: roundCurrency(revenue),
      trueUnitCost: bundle.trueUnitCost,
      trueCogs,
      trueProfit,
      trueMarginRate: revenue > 0 ? trueProfit / revenue : null,
      bookedCogs: roundCurrency(toNumber(s?._sum.estimatedCostAmount)),
      componentsMissingRealCost: bundle.components.filter((c) => !c.hasRealCost).length
    });
  }
  rows.sort((a, b) => b.revenue - a.revenue);
  return rows;
}
