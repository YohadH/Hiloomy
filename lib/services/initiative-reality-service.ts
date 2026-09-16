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
  type ProductEvidence,
  type RejectedEntityLink
} from "@/lib/domain/initiative-reality";
import { recordRelationships, relationshipsFromMappings } from "@/lib/services/entity-graph-service";
import { buildPlanView, readPlanOverrides } from "@/lib/services/plan-service";
import { classifySalesChannel } from "@/lib/domain/sales-channel";
import { diagnose, type AlternativeProduct, type ChannelEvidence, type CreatorEvidence, type DiagnosisInput, type FeasibilityFacts, type LocationStock, type PaidEvidence, type BusinessDiagnosis } from "@/lib/domain/business-diagnosis";
import { BENCHMARK_MIN_PURCHASES, type FunnelBenchmark, type LinkedProductHealth } from "@/lib/domain/funnel-diagnosis";
import { buildDecisionSpace, resolveRecommendation, type DecisionOption, type Recommendation } from "@/lib/domain/decision-space";
import { buildEpisode, type DecisionEpisode } from "@/lib/domain/decision-episode";
import { evaluateIntentFulfillment, type InitiativeIntent, type IntentFulfillment, type IntentOrder } from "@/lib/domain/intent-fulfillment";
import type { PlanOverrides } from "@/lib/domain/plan";

const DAY_MS = 86_400_000;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const dayStart = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface RealityInputs {
  sheetId?: string;
  candidates: MappingCandidates;
  confirmed: ConfirmedEntityLink[];
  freshness: InitiativeFreshness;
  store: InitiativeEvidence["store"];
  facts: PlanOverrides["feasibilityFacts"];
  // What each initiative was meant to achieve (manager-stated).
  intents: InitiativeIntent[];
  // Entities the manager rejected per initiative — never proposed again.
  rejected: RejectedEntityLink[];
}

// Everything that is the same for every initiative of a sheet: the
// catalogue, the known codes, recent Meta campaigns, confirmed links, sync
// times, and (optionally) the store pulse for broader context.
export async function loadRealityInputs(storeId: string, sheetId: string, now: Date, store: InitiativeEvidence["store"] = null): Promise<RealityInputs> {
  const db = getDb() as any;
  const since60 = new Date(now.getTime() - 60 * DAY_MS);
  const [products, usedCodes, affiliateCodes, campaignDaily, creativeRows, links, overrides, shopify, meta, sheet, usageRows, landingRows] = await Promise.all([
    db.product.findMany({ where: { storeId }, select: { id: true, title: true, handle: true } }) as Promise<Array<{ id: string; title: string; handle: string | null }>>,
    db.discountUsage.findMany({ where: { storeId }, distinct: ["code"], select: { code: true } }).catch(() => []) as Promise<Array<{ code: string }>>,
    (db.affiliateCoupon ? db.affiliateCoupon.findMany({ where: { storeId }, select: { code: true } }) : Promise.resolve([])).catch(() => []) as Promise<Array<{ code: string | null }>>,
    // Campaign-level daily rows (60 days): names + the spend/click signals
    // the Campaign Resolver scores timing and spend share from.
    db.metaAdsCampaignInsight
      .findMany({ where: { storeId, level: "campaign", dateStart: { gte: since60 } }, select: { campaignId: true, campaignName: true, dateStart: true, spend: true, clicks: true }, orderBy: { dateStart: "desc" }, take: 20000 })
      .catch(() => []) as Promise<Array<{ campaignId: string; campaignName: string; dateStart: Date; spend: unknown; clicks: number }>>,
    // Ad-level creatives (60 days): destination pages + copy per campaign.
    db.metaAdsCampaignInsight
      .findMany({
        where: { storeId, level: "ad", dateStart: { gte: since60 }, OR: [{ creativeObjectUrl: { not: null } }, { creativeTitle: { not: null } }, { creativeBody: { not: null } }] },
        distinct: ["creativeId"],
        select: { campaignId: true, creativeObjectUrl: true, creativeTitle: true, creativeBody: true },
        take: 2000
      })
      .catch(() => []) as Promise<Array<{ campaignId: string; creativeObjectUrl: string | null; creativeTitle: string | null; creativeBody: string | null }>>,
    db.campaignProductLink.findMany({ where: { storeId }, select: { campaignId: true, productId: true } }).catch(() => []) as Promise<Array<{ campaignId: string; productId: string }>>,
    readPlanOverrides(sheetId),
    db.shopifyConnection.findFirst({ where: { storeId }, select: { lastSyncAt: true, lastProductsSyncAt: true } }).catch(() => null) as Promise<{ lastSyncAt: Date | null; lastProductsSyncAt: Date | null } | null>,
    db.metaAdsConnection.findUnique({ where: { storeId }, select: { lastSyncAt: true } }).catch(() => null) as Promise<{ lastSyncAt: Date | null } | null>,
    db.ganttSheet.findUnique({ where: { id: sheetId }, select: { updatedAt: true, sourceLastSyncedAt: true } }).catch(() => null) as Promise<{ updatedAt: Date; sourceLastSyncedAt: Date | null } | null>,
    // Codes used on orders in the last 120 days, with dates — coupon candidates
    // for initiatives whose plan names no code.
    db.discountUsage
      .findMany({ where: { storeId, order: { createdAt: { gte: new Date(now.getTime() - 120 * DAY_MS) }, cancelledAt: null, test: false } }, select: { code: true, orderId: true, order: { select: { createdAt: true, lineItems: { select: { productId: true } } } } }, take: 20000 })
      .catch(() => []) as Promise<Array<{ code: string; orderId: string; order: { createdAt: Date; lineItems: Array<{ productId: string | null }> } }>>,
    // Orders by landing path (60 days) — aggregate traffic evidence for the
    // product resolver when a campaign lands on a collection page.
    db.order
      .findMany({ where: { storeId, createdAt: { gte: since60 }, cancelledAt: null, test: false, landingSiteRef: { not: null } }, select: { createdAt: true, landingSiteRef: true, lineItems: { select: { productId: true } } }, take: 6000, orderBy: { createdAt: "desc" } })
      .catch(() => []) as Promise<Array<{ createdAt: Date; landingSiteRef: string | null; lineItems: Array<{ productId: string | null }> }>>
  ]);
  const usageByCode = new Map<string, { orders: Set<string>; first: string; last: string; productOrders: Map<string, Set<string>> }>();
  for (const u of usageRows) {
    const code = u.code.trim().toUpperCase();
    if (!code) continue;
    const d = u.order.createdAt.toISOString().slice(0, 10);
    const cur = usageByCode.get(code) ?? { orders: new Set<string>(), first: d, last: d, productOrders: new Map<string, Set<string>>() };
    cur.orders.add(u.orderId);
    if (d < cur.first) cur.first = d;
    if (d > cur.last) cur.last = d;
    for (const li of u.order.lineItems) {
      if (!li.productId) continue;
      const set = cur.productOrders.get(li.productId) ?? new Set<string>();
      set.add(u.orderId);
      cur.productOrders.set(li.productId, set);
    }
    usageByCode.set(code, cur);
  }
  const landingOrders = landingRows
    .map((o) => {
      let path = o.landingSiteRef ?? "";
      try {
        path = new URL(path).pathname;
      } catch {
        path = path.split("?")[0];
      }
      return { path, date: o.createdAt.toISOString().slice(0, 10), productIds: o.lineItems.map((l) => l.productId).filter((x): x is string => !!x) };
    })
    .filter((o) => o.path && o.path !== "/" && o.productIds.length);
  const linkedByCampaign = new Map<string, string[]>();
  for (const l of links) linkedByCampaign.set(l.campaignId, [...(linkedByCampaign.get(l.campaignId) ?? []), l.productId]);
  // Fold the daily rows into one candidate per campaign (latest name wins;
  // rows arrive newest first) with its resolver signals.
  const byCampaign = new Map<string, { id: string; name: string; daily: Array<{ date: string; spend: number; clicks: number }>; urls: Set<string>; text: string[] }>();
  for (const r of campaignDaily) {
    const cur = byCampaign.get(r.campaignId) ?? { id: r.campaignId, name: r.campaignName, daily: [], urls: new Set<string>(), text: [] };
    cur.daily.push({ date: r.dateStart.toISOString().slice(0, 10), spend: num(r.spend), clicks: r.clicks ?? 0 });
    byCampaign.set(r.campaignId, cur);
  }
  for (const c of creativeRows) {
    const cur = byCampaign.get(c.campaignId);
    if (!cur) continue;
    if (c.creativeObjectUrl) cur.urls.add(c.creativeObjectUrl);
    const t = [c.creativeTitle, c.creativeBody].filter(Boolean).join(" ");
    if (t && cur.text.length < 40) cur.text.push(t);
  }
  return {
    sheetId,
    candidates: {
      products,
      knownDiscountCodes: [...usedCodes.map((c) => c.code), ...affiliateCodes.map((c) => c.code ?? "")].filter(Boolean),
      metaCampaigns: [...byCampaign.values()].map((c) => ({ id: c.id, name: c.name, linkedProductIds: linkedByCampaign.get(c.id) ?? [], signals: { daily: c.daily, destinationUrls: [...c.urls].slice(0, 20), creativeText: c.text.join(" \n ").slice(0, 8000) } })),
      discountUsage: [...usageByCode.entries()].map(([code, u]) => ({ code, orders: u.orders.size, firstUsed: u.first, lastUsed: u.last, productOrders: [...u.productOrders.entries()].map(([productId, set]) => ({ productId, orders: set.size })) })),
      landingOrders
    },
    confirmed: overrides.entityLinks,
    rejected: overrides.rejectedLinks,
    facts: overrides.feasibilityFacts.filter((f) => f.validUntil >= now.toISOString()),
    intents: overrides.intents,
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
  type Agg = { revenue: number; units: number; cost: number; dailyUnits: number[]; orderIds: Set<string>; byChannel: Record<"online" | "offline" | "manual" | "unknown", { revenue: number; units: number }> };
  if (!productIds.length) return new Map<string, Agg>();
  const days = Math.max(1, Math.round((Date.parse(`${endExclusive}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS));
  const lines = (await db.orderLineItem.findMany({
    where: { storeId, productId: { in: productIds }, order: { createdAt: { gte: dayStart(start), lt: dayStart(endExclusive) }, cancelledAt: null, test: false } },
    select: { productId: true, orderId: true, lineSubtotal: true, lineDiscountAmount: true, refundedSubtotal: true, quantity: true, refundedQuantity: true, estimatedCostAmount: true, order: { select: { createdAt: true, sourceName: true } } }
  })) as Array<{ productId: string; orderId: string; lineSubtotal: unknown; lineDiscountAmount: unknown; refundedSubtotal: unknown; quantity: number; refundedQuantity: number; estimatedCostAmount: unknown; order: { createdAt: Date; sourceName: string | null } }>;
  const out = new Map<string, Agg>();
  for (const l of lines) {
    const cur = out.get(l.productId) ?? { revenue: 0, units: 0, cost: 0, dailyUnits: Array.from({ length: days }, () => 0), orderIds: new Set<string>(), byChannel: { online: { revenue: 0, units: 0 }, offline: { revenue: 0, units: 0 }, manual: { revenue: 0, units: 0 }, unknown: { revenue: 0, units: 0 } } };
    const units = l.quantity - l.refundedQuantity;
    const rev = num(l.lineSubtotal) - num(l.lineDiscountAmount) - num(l.refundedSubtotal);
    cur.revenue += rev;
    cur.units += units;
    cur.cost += num(l.estimatedCostAmount);
    const dayIdx = Math.min(days - 1, Math.max(0, Math.floor((l.order.createdAt.getTime() - dayStart(start).getTime()) / DAY_MS)));
    cur.dailyUnits[dayIdx] += units;
    cur.orderIds.add(l.orderId);
    // Where the order was taken. Shopify POS is the only offline signal the
    // store carries today (Order.sourceName); third-party POS that writes
    // Shopify orders identified by tags / metafields is NOT stored, so those
    // classify as online — a documented gap, never forced.
    const ch = classifySalesChannel(l.order.sourceName);
    const bucket = ch === "pos" ? "offline" : ch;
    cur.byChannel[bucket].revenue += rev;
    cur.byChannel[bucket].units += units;
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

// The initiative's orders, WHOLE: every order in the window that contains a
// mapped product, with every line (so the purchase mix is visible), where
// it was taken, and whether the customer's first order falls in the window.
// Intent Fulfillment reads this; nothing else does.
export async function gatherIntentOrders(storeId: string, mainProductIds: string[], start: string, endExclusive: string): Promise<IntentOrder[]> {
  if (!mainProductIds.length) return [];
  const db = getDb() as any;
  const startAt = dayStart(start);
  const rows = (await db.order
    .findMany({
      where: { storeId, createdAt: { gte: startAt, lt: dayStart(endExclusive) }, cancelledAt: null, test: false, lineItems: { some: { productId: { in: mainProductIds } } } },
      select: {
        id: true,
        sourceName: true,
        customer: { select: { firstOrderDate: true, createdAt: true } },
        lineItems: { select: { productId: true, title: true, quantity: true, refundedQuantity: true, lineSubtotal: true, lineDiscountAmount: true, refundedSubtotal: true } }
      },
      take: 5000
    })
    .catch(() => [])) as Array<{
    id: string;
    sourceName: string | null;
    customer: { firstOrderDate: Date | null; createdAt: Date } | null;
    lineItems: Array<{ productId: string | null; title: string; quantity: number; refundedQuantity: number; lineSubtotal: unknown; lineDiscountAmount: unknown; refundedSubtotal: unknown }>;
  }>;
  const mapped = new Set(mainProductIds);
  return rows.map((o) => {
    const ch = classifySalesChannel(o.sourceName);
    const first = o.customer ? (o.customer.firstOrderDate ?? o.customer.createdAt) : null;
    return {
      orderId: o.id,
      channel: ch === "pos" ? "offline" : ch,
      isNewCustomer: first ? first.getTime() >= startAt.getTime() : null,
      lines: o.lineItems.map((l) => ({
        productId: l.productId,
        title: l.title,
        units: l.quantity - l.refundedQuantity,
        revenue: num(l.lineSubtotal) - num(l.lineDiscountAmount) - num(l.refundedSubtotal),
        initiativeProduct: !!l.productId && mapped.has(l.productId)
      }))
    };
  });
}

// Intent Fulfillment for one initiative: the manager's intent (if any)
// against the initiative's whole orders in the window to date.
export async function buildIntentFulfillment(storeId: string, initiative: Initiative, mappings: InitiativeMappings, inputs: RealityInputs, reality: InitiativeReality): Promise<IntentFulfillment> {
  const intent = inputs.intents.find((i) => i.initiativeId === initiative.id) ?? null;
  const usable = usableLinks(mappings);
  const mainIds = usable.filter((l) => l.kind === "product").map((l) => l.id);
  const titles = new Map(usable.filter((l) => l.kind === "product" || l.kind === "gift_product").map((l) => [l.id, l.label] as const));
  for (const p of inputs.candidates.products) if (!titles.has(p.id)) titles.set(p.id, p.title);
  const period = { live: reality.period.start <= reality.period.today && reality.period.end >= reality.period.today, dayIndex: reality.period.dayIndex, elapsedShare: reality.period.elapsedShare };
  if (!intent) return evaluateIntentFulfillment(null, [], period, titles);
  const endExclusive = addDays(initiative.end < reality.period.today ? initiative.end : reality.period.today, 1);
  const orders = await gatherIntentOrders(storeId, mainIds, initiative.start, endExclusive);
  return evaluateIntentFulfillment(intent, orders, period, titles);
}

// The layers the diagnosis needs beyond the reality: channel split,
// creators, inventory by location, alternative products, facts, paid clicks.
export interface DiagnosisLayers {
  channels: ChannelEvidence | null;
  creators: CreatorEvidence | null;
  paid: PaidEvidence | null;
  locations: LocationStock[];
  alternatives: DiagnosisInput["alternatives"];
  facts: FeasibilityFacts;
  // Status + all-time sales of the linked products — the fact that tells a
  // mapping-too-narrow mismatch apart from a real demand failure.
  linkedProducts: LinkedProductHealth[];
}

export async function gatherDiagnosisLayers(storeId: string, initiative: Initiative, mappings: InitiativeMappings, inputs: RealityInputs, reality: InitiativeReality, now: Date): Promise<DiagnosisLayers> {
  const db = getDb() as any;
  const today = now.toISOString().slice(0, 10);
  const windowStart = initiative.start;
  const windowEndExclusive = addDays(initiative.end < today ? initiative.end : today, 1);
  const usable = usableLinks(mappings);
  const mainIds = usable.filter((l) => l.kind === "product").map((l) => l.id);
  const allIds = usable.filter((l) => l.kind === "product" || l.kind === "gift_product").map((l) => l.id);
  const basis = mainIds.length ? (usable.filter((l) => l.kind === "product").every((l) => l.state === "confirmed") ? "confirmed" : "provisional") : null;

  // The comparable period before the window (same length) is the only
  // benchmark that lets a channel be called strong or weak.
  const windowDays = Math.max(1, Math.round((dayStart(windowEndExclusive).getTime() - dayStart(windowStart).getTime()) / DAY_MS));
  const baselineStart = addDays(windowStart, -windowDays);
  const [sales, baseSales] = await Promise.all([productSalesViaPrisma(storeId, mainIds, windowStart, windowEndExclusive), productSalesViaPrisma(storeId, mainIds, baselineStart, windowStart)]);
  const splitOf = (m: typeof sales) => {
    const agg = { online: { revenue: 0, units: 0 }, offline: { revenue: 0, units: 0 }, manual: { revenue: 0, units: 0 }, unknown: { revenue: 0, units: 0 } };
    for (const s of m.values()) for (const k of ["online", "offline", "manual", "unknown"] as const) { agg[k].revenue += s.byChannel[k].revenue; agg[k].units += s.byChannel[k].units; }
    return agg;
  };
  // Channels: sum over the main products' lines.
  let channels: ChannelEvidence | null = null;
  if (basis) {
    const agg = splitOf(sales);
    const total = agg.online.revenue + agg.offline.revenue + agg.manual.revenue + agg.unknown.revenue;
    channels = { ...agg, classifiedShare: total > 0 ? (total - agg.unknown.revenue) / total : 1, basis, baseline: baseSales.size ? splitOf(baseSales) : null };
  }
  // Creators: affiliate attributions on the initiative's orders.
  let creators: CreatorEvidence | null = null;
  if (basis) {
    const orderIds = [...new Set([...sales.values()].flatMap((s) => [...s.orderIds]))];
    const rows = orderIds.length
      ? ((await db.affiliateAttribution.findMany({ where: { storeId, orderId: { in: orderIds } }, select: { orderId: true, affiliateMemberId: true, salesAmount: true, commissionAmount: true } }).catch(() => [])) as Array<{ orderId: string; affiliateMemberId: string; salesAmount: unknown; commissionAmount: unknown }>)
      : [];
    creators = { orders: new Set(rows.map((r) => r.orderId)).size, revenue: rows.reduce((n, r) => n + num(r.salesAmount), 0), commission: rows.reduce((n, r) => n + num(r.commissionAmount), 0), creators: new Set(rows.map((r) => r.affiliateMemberId)).size, basis };
  }
  // Paid: the FULL Meta funnel for the mapped campaigns (impressions →
  // clicks → LPV → ATC → IC → purchases), plus a store-level trailing-90d
  // benchmark (all campaigns) so a stage can be judged against the store's
  // own rates instead of absolute counts. The funnel fields have been synced
  // all along — they were just never read here (owner, 2026-09-15).
  const campaignLinks = usable.filter((l) => l.kind === "meta_campaign");
  let paid: PaidEvidence | null = null;
  if (campaignLinks.length) {
    type InsightRow = { spend: unknown; purchases: number; clicks: number; purchaseRoas: unknown; impressions: number; linkClicks: number; landingPageViews: number; addToCart: number; initiateCheckout: number };
    const funnelSelect = { spend: true, purchases: true, clicks: true, purchaseRoas: true, impressions: true, linkClicks: true, landingPageViews: true, addToCart: true, initiateCheckout: true };
    const fetchRows = (from: string, to: string) =>
      db.metaAdsCampaignInsight
        .findMany({ where: { storeId, level: "campaign", campaignId: { in: campaignLinks.map((l) => l.id) }, dateStart: { gte: dayStart(from), lt: dayStart(to) } }, select: funnelSelect })
        .catch(() => []) as Promise<InsightRow[]>;
    const benchmarkStart = new Date(now.getTime() - 90 * DAY_MS).toISOString().slice(0, 10);
    const [rows, baseRows, benchRows] = await Promise.all([
      fetchRows(windowStart, windowEndExclusive),
      fetchRows(baselineStart, windowStart),
      db.metaAdsCampaignInsight
        .findMany({ where: { storeId, level: "campaign", dateStart: { gte: dayStart(benchmarkStart) } }, select: funnelSelect })
        .catch(() => []) as Promise<InsightRow[]>
    ]);
    const sum = (rs: InsightRow[]) => {
      const spend = rs.reduce((n, r) => n + num(r.spend), 0);
      const withRoas = rs.filter((r) => r.purchaseRoas !== null && r.purchaseRoas !== undefined);
      return {
        spend,
        purchases: rs.reduce((n, r) => n + r.purchases, 0),
        clicks: rs.reduce((n, r) => n + (r.clicks ?? 0), 0),
        impressions: rs.reduce((n, r) => n + (r.impressions ?? 0), 0),
        linkClicks: rs.reduce((n, r) => n + (r.linkClicks ?? 0), 0),
        lpv: rs.reduce((n, r) => n + (r.landingPageViews ?? 0), 0),
        atc: rs.reduce((n, r) => n + (r.addToCart ?? 0), 0),
        ic: rs.reduce((n, r) => n + (r.initiateCheckout ?? 0), 0),
        attributedRevenue: rs.length && withRoas.length === rs.length ? withRoas.reduce((n, r) => n + num(r.spend) * num(r.purchaseRoas), 0) : null
      };
    };
    const w = sum(rows);
    const b = sum(benchRows);
    const rate = (a: number, of: number) => (of > 0 ? a / of : null);
    const benchmark: FunnelBenchmark | null = benchRows.length
      ? {
          window: { he: "90 הימים האחרונים, כל הקמפיינים", en: "trailing 90 days, all campaigns" },
          spend: b.spend,
          purchases: b.purchases,
          cpa: b.purchases >= BENCHMARK_MIN_PURCHASES ? b.spend / b.purchases : b.purchases > 0 ? b.spend / b.purchases : null,
          ctr: rate(b.clicks, b.impressions),
          clickToLpv: rate(b.lpv, b.linkClicks),
          lpvToAtc: rate(b.atc, b.lpv),
          atcToIc: rate(b.ic, b.atc),
          icToPurchase: rate(b.purchases, b.ic)
        }
      : null;
    const baseSum = baseRows.length ? sum(baseRows) : null;
    paid = {
      spend: w.spend,
      purchases: w.purchases,
      clicks: w.clicks,
      attributedRevenue: w.attributedRevenue,
      impressions: w.impressions,
      linkClicks: w.linkClicks,
      lpv: w.lpv,
      atc: w.atc,
      ic: w.ic,
      benchmark,
      basis: campaignLinks.every((l) => l.state === "confirmed") ? "confirmed" : "provisional",
      baseline: baseSum ? { spend: baseSum.spend, purchases: baseSum.purchases, clicks: baseSum.clicks, attributedRevenue: baseSum.attributedRevenue } : null
    };
  }
  // Linked-product health: publish status + all-time units. Zero-ever units
  // on every linked product turns "Meta converts, Shopify shows 0" into a
  // mapping-too-narrow diagnosis instead of a tracking accusation.
  let linkedProducts: LinkedProductHealth[] = [];
  if (mainIds.length) {
    const [prodRows, allTime] = await Promise.all([
      db.product.findMany({ where: { id: { in: mainIds } }, select: { id: true, title: true, status: true } }).catch(() => []) as Promise<Array<{ id: string; title: string; status: string | null }>>,
      db.orderLineItem
        .groupBy({ by: ["productId"], where: { storeId, productId: { in: mainIds }, order: { cancelledAt: null, test: false } }, _sum: { quantity: true } })
        .catch(() => []) as Promise<Array<{ productId: string; _sum: { quantity: number | null } }>>
    ]);
    const unitsById = new Map(allTime.map((x) => [x.productId, x._sum.quantity ?? 0]));
    linkedProducts = prodRows.map((p) => ({ id: p.id, title: p.title, status: p.status, allTimeUnits: unitsById.get(p.id) ?? 0 }));
  }
  // Inventory by location for the mapped products.
  let locations: LocationStock[] = [];
  if (allIds.length) {
    const variants = (await db.productVariant.findMany({ where: { storeId, productId: { in: allIds } }, select: { productId: true, shopifyVariantId: true } }).catch(() => [])) as Array<{ productId: string; shopifyVariantId: string }>;
    const levels = variants.length
      ? ((await db.variantInventoryLevel.findMany({ where: { storeId, shopifyVariantId: { in: variants.map((v) => v.shopifyVariantId) } }, select: { shopifyVariantId: true, locationName: true, available: true } }).catch(() => [])) as Array<{ shopifyVariantId: string; locationName: string; available: number }>)
      : [];
    const byVariant = new Map(variants.map((v) => [v.shopifyVariantId, v.productId]));
    const byProduct = new Map<string, Map<string, number>>();
    for (const lv of levels) {
      const pid = byVariant.get(lv.shopifyVariantId);
      if (!pid) continue;
      const m = byProduct.get(pid) ?? new Map<string, number>();
      m.set(lv.locationName, (m.get(lv.locationName) ?? 0) + lv.available);
      byProduct.set(pid, m);
    }
    locations = [...byProduct.entries()].map(([productId, m]) => {
      const link = usable.find((l) => l.id === productId)!;
      return { productId, title: link.label, role: link.kind === "gift_product" ? "gift" : "product", locations: [...m.entries()].map(([name, available]) => ({ name, available })) };
    });
  }
  // Alternatives: same productType as the constrained product, with stock.
  const constrained = reality.findings.find((f) => f.kind === "gift_inventory_short" || f.kind === "inventory_short_of_window")?.product ?? null;
  const alternatives: DiagnosisInput["alternatives"] = { gift: [], product: [] };
  if (constrained) {
    const base = (await db.product.findUnique({ where: { id: constrained.id }, select: { productType: true } }).catch(() => null)) as { productType: string | null } | null;
    if (base?.productType) {
      // Never the constrained product itself — by id, and by title, since the
      // same product can exist twice in a catalogue (source ≠ target).
      const sameTitle = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
      const rows = ((await db.product
        .findMany({ where: { storeId, productType: base.productType, id: { not: constrained.id } }, select: { id: true, title: true, variants: { select: { inventoryQuantity: true } } }, take: 40 })
        .catch(() => [])) as Array<{ id: string; title: string; variants: Array<{ inventoryQuantity: number | null }> }>).filter((r) => r.id !== constrained.id && !sameTitle(r.title, constrained.title));
      const d14 = new Date(now.getTime() - 14 * DAY_MS);
      const units = (await db.orderLineItem.groupBy({ by: ["productId"], where: { storeId, productId: { in: rows.map((r) => r.id) }, order: { createdAt: { gte: d14 }, cancelledAt: null, test: false } }, _sum: { quantity: true } }).catch(() => [])) as Array<{ productId: string; _sum: { quantity: number | null } }>;
      const u = new Map(units.map((x) => [x.productId, x._sum.quantity ?? 0]));
      const alts: AlternativeProduct[] = rows
        .map((r) => {
          const inventory = r.variants.reduce((n, v) => n + (v.inventoryQuantity ?? 0), 0);
          const perDay = (u.get(r.id) ?? 0) / 14;
          return { id: r.id, title: r.title, inventory, coverDays: perDay > 0 ? Math.round(inventory / perDay) : null, sameFamily: true };
        })
        .filter((a) => a.inventory > 0 && (a.coverDays === null || a.coverDays >= reality.period.daysRemaining))
        .sort((a, b) => b.inventory - a.inventory)
        .slice(0, 5);
      if (constrained.role === "gift") alternatives.gift = alts;
      else alternatives.product = alts;
    }
  }
  // Facts the operator answered (still valid).
  const mine = inputs.facts.filter((f) => f.initiativeId === initiative.id && (!constrained || !f.productId || f.productId === constrained.id));
  const fact = (k: string) => mine.find((f) => f.key === k)?.value ?? null;
  const days = fact("replenishment_days");
  const possible = fact("replenishment_possible");
  const facts: FeasibilityFacts = {
    replenishmentWithinDays: days !== null && Number.isFinite(Number(days)) ? Number(days) : null,
    replenishmentPossible: possible === "yes" ? true : possible === "no" ? false : null,
    giftOptional: fact("gift_optional") === "yes" ? true : fact("gift_optional") === "no" ? false : null,
    alternativeGiftProductId: fact("alternative_gift")
  };
  return { channels, creators, paid, locations, alternatives, facts, linkedProducts };
}

// The full brief: reality → diagnosis → decision space → recommendation → episode.
export interface InitiativeBrief {
  reality: InitiativeReality;
  summary: InitiativeRealitySummary;
  diagnosis: BusinessDiagnosis | null; // null while context is missing
  space: DecisionOption[];
  recommendation: Recommendation | null;
  episode: DecisionEpisode | null;
  // The manager's intent for this initiative and how reality measures
  // against it. Present whenever the context is complete.
  intent: InitiativeIntent | null;
  fulfillment: IntentFulfillment | null;
}

const goalOf = (intent: InitiativeIntent | null) => (intent?.goal ? { kind: intent.goal.kind, value: intent.goal.value } : null);

export async function buildInitiativeBrief(storeId: string, initiative: Initiative, inputs: RealityInputs, now: Date, hookQuestion: { he: string; en: string } | null = null): Promise<InitiativeBrief> {
  const mappings = resolveMappings(initiative, inputs.candidates, inputs.confirmed, inputs.rejected);
  // Continuous resolution leaves a record: first seen / last validated per
  // relationship. Best effort; never blocks the brief.
  void recordRelationships(inputs.sheetId ?? "", initiative.id, relationshipsFromMappings(initiative, mappings, now), now);
  const intent = inputs.intents.find((i) => i.initiativeId === initiative.id) ?? null;
  const evidence = await gatherInitiativeEvidence(storeId, initiative, mappings, inputs, now);
  const reality = evaluateInitiativeReality(initiative, mappings, evidence, now, goalOf(intent));
  const summary = summarizeReality(reality, initiative.offer);
  if (reality.status === "needs_context") return { reality, summary, diagnosis: null, space: [], recommendation: null, episode: null, intent, fulfillment: null };
  const [layers, fulfillment] = await Promise.all([gatherDiagnosisLayers(storeId, initiative, mappings, inputs, reality, now), buildIntentFulfillment(storeId, initiative, mappings, inputs, reality).catch(() => null)]);
  const diagnosis = diagnose({ reality, ...layers, fulfillment });
  const space = buildDecisionSpace(diagnosis);
  const recommendation = resolveRecommendation(diagnosis, space, { basis: reality.evidenceBasis, stale: reality.stale });
  const episode = buildEpisode(summary, diagnosis, space, recommendation, { initiativeId: initiative.id, title: initiative.title, kind: reality.context.initiativeKind, start: initiative.start, end: initiative.end, offer: initiative.offer, hookQuestion }, now);
  return { reality, summary, diagnosis, space, recommendation, episode, intent, fulfillment };
}

export async function buildInitiativeReality(storeId: string, initiative: Initiative, inputs: RealityInputs, now: Date): Promise<InitiativeReality> {
  const mappings = resolveMappings(initiative, inputs.candidates, inputs.confirmed, inputs.rejected);
  const evidence = await gatherInitiativeEvidence(storeId, initiative, mappings, inputs, now);
  return evaluateInitiativeReality(initiative, mappings, evidence, now, goalOf(inputs.intents.find((i) => i.initiativeId === initiative.id) ?? null));
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
