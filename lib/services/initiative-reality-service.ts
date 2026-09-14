// Initiative Reality — gathers the initiative-specific evidence for one plan
// initiative and evaluates it (lib/domain/initiative-reality.ts).
//
// Only MAPPED entities produce initiative metrics: sales come from the
// mapped products' order lines inside the initiative window, coupon usage
// from the mapped code, spend from the mapped Meta campaigns. Whole-store
// numbers are passed separately as `store` context and rendered as such.
// Nothing is persisted; the plan engine stores a compact summary on the
// decision it creates.

import { getDb } from "@/lib/server/db";
import type { Initiative, PlanView } from "@/lib/domain/plan";
import {
  evaluateInitiativeReality,
  resolveMappings,
  summarizeReality,
  usableLinks,
  type CampaignEvidence,
  type ConfirmedEntityLink,
  type DiscountEvidence,
  type InitiativeEvidence,
  type InitiativeFreshness,
  type InitiativeMappings,
  type InitiativeReality,
  type InitiativeRealitySummary,
  type MappingCandidates,
  type ProductEvidence
} from "@/lib/domain/initiative-reality";
import { buildPlanView, readPlanOverrides } from "@/lib/services/plan-service";

const DAY_MS = 86_400_000;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const dayStart = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface RealityInputs {
  candidates: MappingCandidates;
  confirmed: ConfirmedEntityLink[];
  freshness: InitiativeFreshness;
  store: InitiativeEvidence["store"];
}

// Everything that is the same for every initiative of a sheet: the
// catalogue, the known codes, recent Meta campaigns, confirmed links, sync
// times, and (optionally) the store pulse for broader context.
export async function loadRealityInputs(storeId: string, sheetId: string, now: Date, store: InitiativeEvidence["store"] = null): Promise<RealityInputs> {
  const db = getDb() as any;
  const since60 = new Date(now.getTime() - 60 * DAY_MS);
  const [products, usedCodes, affiliateCodes, campaignRows, links, overrides, shopify, meta, sheet, usageRows] = await Promise.all([
    db.product.findMany({ where: { storeId }, select: { id: true, title: true } }) as Promise<Array<{ id: string; title: string }>>,
    db.discountUsage.findMany({ where: { storeId }, distinct: ["code"], select: { code: true } }).catch(() => []) as Promise<Array<{ code: string }>>,
    (db.affiliateCoupon ? db.affiliateCoupon.findMany({ where: { storeId }, select: { code: true } }) : Promise.resolve([])).catch(() => []) as Promise<Array<{ code: string | null }>>,
    db.metaAdsCampaignInsight
      .findMany({ where: { storeId, level: "campaign", dateStart: { gte: since60 } }, distinct: ["campaignId"], select: { campaignId: true, campaignName: true }, orderBy: { dateStart: "desc" } })
      .catch(() => []) as Promise<Array<{ campaignId: string; campaignName: string }>>,
    db.campaignProductLink.findMany({ where: { storeId }, select: { campaignId: true, productId: true } }).catch(() => []) as Promise<Array<{ campaignId: string; productId: string }>>,
    readPlanOverrides(sheetId),
    db.shopifyConnection.findFirst({ where: { storeId }, select: { lastSyncAt: true, lastProductsSyncAt: true } }).catch(() => null) as Promise<{ lastSyncAt: Date | null; lastProductsSyncAt: Date | null } | null>,
    db.metaAdsConnection.findUnique({ where: { storeId }, select: { lastSyncAt: true } }).catch(() => null) as Promise<{ lastSyncAt: Date | null } | null>,
    db.ganttSheet.findUnique({ where: { id: sheetId }, select: { updatedAt: true, sourceLastSyncedAt: true } }).catch(() => null) as Promise<{ updatedAt: Date; sourceLastSyncedAt: Date | null } | null>,
    // Codes used on orders in the last 120 days, with dates — coupon candidates
    // for initiatives whose plan names no code.
    db.discountUsage
      .findMany({ where: { storeId, order: { createdAt: { gte: new Date(now.getTime() - 120 * DAY_MS) }, cancelledAt: null, test: false } }, select: { code: true, orderId: true, order: { select: { createdAt: true } } } })
      .catch(() => []) as Promise<Array<{ code: string; orderId: string; order: { createdAt: Date } }>>
  ]);
  const usageByCode = new Map<string, { orders: Set<string>; first: string; last: string }>();
  for (const u of usageRows) {
    const code = u.code.trim().toUpperCase();
    if (!code) continue;
    const d = u.order.createdAt.toISOString().slice(0, 10);
    const cur = usageByCode.get(code) ?? { orders: new Set<string>(), first: d, last: d };
    cur.orders.add(u.orderId);
    if (d < cur.first) cur.first = d;
    if (d > cur.last) cur.last = d;
    usageByCode.set(code, cur);
  }
  const linkedByCampaign = new Map<string, string[]>();
  for (const l of links) linkedByCampaign.set(l.campaignId, [...(linkedByCampaign.get(l.campaignId) ?? []), l.productId]);
  return {
    candidates: {
      products,
      knownDiscountCodes: [...usedCodes.map((c) => c.code), ...affiliateCodes.map((c) => c.code ?? "")].filter(Boolean),
      metaCampaigns: campaignRows.map((c) => ({ id: c.campaignId, name: c.campaignName, linkedProductIds: linkedByCampaign.get(c.campaignId) ?? [] })),
      discountUsage: [...usageByCode.entries()].map(([code, u]) => ({ code, orders: u.orders.size, firstUsed: u.first, lastUsed: u.last }))
    },
    confirmed: overrides.entityLinks,
    freshness: {
      shopify: shopify?.lastSyncAt?.toISOString() ?? null,
      inventory: shopify?.lastProductsSyncAt?.toISOString() ?? shopify?.lastSyncAt?.toISOString() ?? null,
      meta: meta?.lastSyncAt?.toISOString() ?? null,
      plan: (sheet?.sourceLastSyncedAt ?? sheet?.updatedAt)?.toISOString() ?? null
    },
    store
  };
}

// Sales for the mapped products inside [start, endExclusive): net of line
// discounts and refunds; cancelled and test orders excluded.
async function productSalesViaPrisma(storeId: string, productIds: string[], start: string, endExclusive: string) {
  const db = getDb() as any;
  if (!productIds.length) return new Map<string, { revenue: number; units: number; cost: number; dailyUnits: number[] }>();
  const days = Math.max(1, Math.round((Date.parse(`${endExclusive}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS));
  const lines = (await db.orderLineItem.findMany({
    where: { storeId, productId: { in: productIds }, order: { createdAt: { gte: dayStart(start), lt: dayStart(endExclusive) }, cancelledAt: null, test: false } },
    select: { productId: true, lineSubtotal: true, lineDiscountAmount: true, refundedSubtotal: true, quantity: true, refundedQuantity: true, estimatedCostAmount: true, order: { select: { createdAt: true } } }
  })) as Array<{ productId: string; lineSubtotal: unknown; lineDiscountAmount: unknown; refundedSubtotal: unknown; quantity: number; refundedQuantity: number; estimatedCostAmount: unknown; order: { createdAt: Date } }>;
  const out = new Map<string, { revenue: number; units: number; cost: number; dailyUnits: number[] }>();
  for (const l of lines) {
    const cur = out.get(l.productId) ?? { revenue: 0, units: 0, cost: 0, dailyUnits: Array.from({ length: days }, () => 0) };
    const units = l.quantity - l.refundedQuantity;
    cur.revenue += num(l.lineSubtotal) - num(l.lineDiscountAmount) - num(l.refundedSubtotal);
    cur.units += units;
    cur.cost += num(l.estimatedCostAmount);
    const dayIdx = Math.min(days - 1, Math.max(0, Math.floor((l.order.createdAt.getTime() - dayStart(start).getTime()) / DAY_MS)));
    cur.dailyUnits[dayIdx] += units;
    out.set(l.productId, cur);
  }
  return out;
}

export async function gatherInitiativeEvidence(storeId: string, initiative: Initiative, mappings: InitiativeMappings, inputs: RealityInputs, now: Date): Promise<InitiativeEvidence> {
  const db = getDb() as any;
  const today = now.toISOString().slice(0, 10);
  const windowStart = initiative.start;
  const windowEndExclusive = addDays(initiative.end < today ? initiative.end : today, 1);
  const windowDays = Math.max(1, Math.round((Date.parse(`${windowEndExclusive}T00:00:00Z`) - Date.parse(`${windowStart}T00:00:00Z`)) / DAY_MS));
  const priorStart = addDays(windowStart, -windowDays);

  const usable = usableLinks(mappings);
  const productLinks = usable.filter((l) => l.kind === "product" || l.kind === "gift_product");
  const productIds = productLinks.map((l) => l.id);
  const [sales, prior, catalogue] = await Promise.all([
    productSalesViaPrisma(storeId, productIds, windowStart, windowEndExclusive),
    productSalesViaPrisma(storeId, productIds, priorStart, windowStart),
    productIds.length
      ? (db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, title: true, estimatedCost: true, costOverrideAmount: true, variants: { select: { inventoryQuantity: true } } } }) as Promise<
          Array<{ id: string; title: string; estimatedCost: unknown; costOverrideAmount: unknown; variants: Array<{ inventoryQuantity: number | null }> }>
        >)
      : Promise.resolve([])
  ]);
  const products: ProductEvidence[] = productLinks.map((l) => {
    const cat = catalogue.find((c) => c.id === l.id);
    const s = sales.get(l.id) ?? null;
    const p = prior.get(l.id) ?? null;
    const inventory = cat ? cat.variants.reduce<number | null>((acc, v) => (v.inventoryQuantity === null ? acc : (acc ?? 0) + v.inventoryQuantity), null) : null;
    const perDay = s && initiative.start <= today ? s.units / windowDays : 0;
    const hasRealCost = cat ? cat.costOverrideAmount !== null && cat.costOverrideAmount !== undefined : false;
    const marginRate = s && s.revenue > 0 && (hasRealCost || num(cat?.estimatedCost) > 0) ? (s.revenue - s.cost) / s.revenue : null;
    return {
      id: l.id,
      title: cat?.title ?? l.label,
      role: l.kind === "gift_product" ? "gift" : "product",
      basis: l.state as "confirmed" | "provisional",
      rule: l.provenance.rule,
      revenue: s ? s.revenue : initiative.start <= today ? 0 : null,
      units: s ? s.units : initiative.start <= today ? 0 : null,
      priorRevenue: p ? p.revenue : 0,
      priorUnits: p ? p.units : 0,
      dailyUnits: s ? s.dailyUnits : Array.from({ length: windowDays }, () => 0),
      inventory,
      coverDays: inventory === null ? null : inventory <= 0 ? 0 : perDay > 0 ? Math.round(inventory / perDay) : null,
      hasRealCost,
      marginRate
    };
  });

  const discountLink = usable.find((l) => l.kind === "discount");
  let discount: DiscountEvidence | null = null;
  if (discountLink) {
    const rows = (await db.discountUsage
      .findMany({ where: { storeId, code: { equals: discountLink.id, mode: "insensitive" }, order: { createdAt: { gte: dayStart(windowStart), lt: dayStart(windowEndExclusive) }, cancelledAt: null, test: false } }, select: { orderId: true, amount: true } })
      .catch(() => [])) as Array<{ orderId: string; amount: unknown }>;
    discount = { code: discountLink.id, basis: discountLink.state as "confirmed" | "provisional", rule: discountLink.provenance.rule, orders: new Set(rows.map((r) => r.orderId)).size, amount: rows.reduce((n, r) => n + num(r.amount), 0) };
  }

  const campaignLinks = usable.filter((l) => l.kind === "meta_campaign");
  let campaigns: CampaignEvidence[] = [];
  if (campaignLinks.length) {
    const rows = (await db.metaAdsCampaignInsight
      .findMany({ where: { storeId, level: "campaign", campaignId: { in: campaignLinks.map((l) => l.id) }, dateStart: { gte: dayStart(windowStart), lt: dayStart(windowEndExclusive) } }, select: { campaignId: true, spend: true, purchases: true, purchaseRoas: true } })
      .catch(() => [])) as Array<{ campaignId: string; spend: unknown; purchases: number; purchaseRoas: unknown }>;
    campaigns = campaignLinks.map((l) => {
      const mine = rows.filter((r) => r.campaignId === l.id);
      const spend = mine.reduce((n, r) => n + num(r.spend), 0);
      const withRoas = mine.filter((r) => r.purchaseRoas !== null && r.purchaseRoas !== undefined);
      const attributed = mine.length && withRoas.length === mine.length ? withRoas.reduce((n, r) => n + num(r.spend) * num(r.purchaseRoas), 0) : null;
      return { id: l.id, name: l.label, basis: l.state as "confirmed" | "provisional", rule: l.provenance.rule, spend, purchases: mine.reduce((n, r) => n + r.purchases, 0), attributedRevenue: attributed };
    });
  }

  return { products, discount, campaigns, store: inputs.store, freshness: inputs.freshness };
}

export async function buildInitiativeReality(storeId: string, initiative: Initiative, inputs: RealityInputs, now: Date): Promise<InitiativeReality> {
  const mappings = resolveMappings(initiative, inputs.candidates, inputs.confirmed);
  const evidence = await gatherInitiativeEvidence(storeId, initiative, mappings, inputs, now);
  return evaluateInitiativeReality(initiative, mappings, evidence, now);
}

// All live (or about-to-start) initiatives of a plan, evaluated once.
const realityMemo = new Map<string, { at: number; value: Promise<Map<string, InitiativeReality>> }>();
const MEMO_MS = 2 * 60_000;

export async function buildPlanRealities(storeId: string, plan: PlanView, now: Date, store: InitiativeEvidence["store"] = null): Promise<Map<string, InitiativeReality>> {
  // One Today load evaluates the plan twice (engine + audit); share the work.
  const key = `${storeId}|${plan.sheetId}|${plan.generatedAt}`;
  const hit = realityMemo.get(key);
  if (hit && now.getTime() - hit.at < MEMO_MS) return hit.value;
  const value = buildPlanRealitiesUncached(storeId, plan, now, store);
  realityMemo.set(key, { at: now.getTime(), value });
  if (realityMemo.size > 50) realityMemo.delete(realityMemo.keys().next().value!);
  return value;
}

async function buildPlanRealitiesUncached(storeId: string, plan: PlanView, now: Date, store: InitiativeEvidence["store"]): Promise<Map<string, InitiativeReality>> {
  const inputs = await loadRealityInputs(storeId, plan.sheetId, now, store);
  const out = new Map<string, InitiativeReality>();
  for (const i of plan.initiatives) {
    if (i.kind !== "move" || i.status === "completed") continue;
    try {
      out.set(i.id, await buildInitiativeReality(storeId, i, inputs, now));
    } catch (err) {
      console.warn("[initiative-reality] failed for", i.id, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

// After the operator confirms / removes a mapping: recompute this initiative's
// reality NOW and refresh any open plan decision that carries it, so the
// receipt and Today do not wait for the nightly run. Candidate generation
// happens on the next audit pass (Today load / cron), through the pipeline.
export async function refreshInitiativeAfterMapping(storeId: string, sheetId: string, initiativeId: string, now = new Date()): Promise<{ status: InitiativeReality["status"]; updatedDecisions: number } | null> {
  const db = getDb() as any;
  const plan = await buildPlanView(storeId, sheetId, now);
  const initiative = plan.initiatives.find((i) => i.id === initiativeId);
  if (!initiative) return null;
  const inputs = await loadRealityInputs(storeId, sheetId, now);
  const reality = await buildInitiativeReality(storeId, initiative, inputs, now);
  const summary = summarizeReality(reality, initiative.offer);
  const open = (await db.alert.findMany({ where: { storeId, type: "plan_decision", relatedEntityId: initiativeId, status: "open" }, select: { id: true, payloadJson: true } }).catch(() => [])) as Array<{ id: string; payloadJson: Record<string, unknown> | null }>;
  for (const a of open) {
    await db.alert.update({ where: { id: a.id }, data: { payloadJson: { ...(a.payloadJson ?? {}), reality: summary, evidenceRefreshedAt: now.toISOString() } } }).catch(() => null);
  }
  realityMemo.clear();
  return { status: reality.status, updatedDecisions: open.length };
}

export { summarizeReality };
export type { InitiativeRealitySummary };
