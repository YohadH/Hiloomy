import { createHash } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { extractCouponCode, extractDiscountPct } from "@/lib/services/gantt-brief-generator-service";
import { getActiveCampaignsByProduct } from "@/lib/services/campaign-product-link-service";
import type { Localized } from "@/lib/domain/decision";
import {
  INITIATIVE_STATUS_ORDER,
  type DependencyCheck,
  type Initiative,
  type InitiativeProduct,
  type InitiativeStatus,
  type PlanDay,
  type PlanView
} from "@/lib/domain/plan";

/**
 * Plan view — Gantt rows → Commercial Initiatives, evaluated against synced
 * data (phase 1: deterministic, observable facts only; see lib/domain/plan.ts).
 */

const DAY_MS = 86_400_000;
const READY_HORIZON_DAYS = 7;
const L = (he: string, en: string): Localized => ({ he, en });

function dayOf(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
function addDays(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / DAY_MS);
}
function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

interface RowLite {
  id: string;
  task: string;
  role: string | null;
  category: string | null;
  actionType: string | null;
  startDate: Date | null;
  endDate: Date | null;
  executionJson: unknown;
}

// ── Grouping: same text/role/category, contiguous or overlapping dates ──
function groupRows(rows: RowLite[], sheetId: string): Array<Omit<Initiative, "products" | "dependencies" | "checked" | "status" | "statusReason" | "profitConfidence" | "discountPct" | "couponCode">> {
  const byKey = new Map<string, RowLite[]>();
  for (const r of rows) {
    if (!r.startDate) continue;
    const key = `${norm(r.task)}|${norm(r.role)}|${norm(r.category)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const out: ReturnType<typeof groupRows> = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime());
    let cur: { start: string; end: string; rows: RowLite[] } | null = null;
    const flush = () => {
      if (!cur) return;
      const first = cur.rows[0];
      const executed = cur.rows.map((r) => (r.executionJson as { executedAt?: string } | null)?.executedAt).filter(Boolean) as string[];
      out.push({
        id: createHash("sha1").update(`${key}|${cur.start}`).digest("hex").slice(0, 12),
        sheetId,
        title: first.task.replace(/\s+/g, " ").trim(),
        category: first.category,
        role: first.role,
        actionType: first.actionType,
        start: cur.start,
        end: cur.end,
        days: daysBetween(cur.start, cur.end) + 1,
        rowIds: cur.rows.map((r) => r.id),
        executedAt: executed.sort().at(-1) ?? null
      });
      cur = null;
    };
    for (const r of list) {
      const s = dayOf(r.startDate)!;
      const e = dayOf(r.endDate ?? r.startDate)!;
      if (cur && daysBetween(cur.end, s) <= 1) {
        if (e > cur.end) cur.end = e;
        cur.rows.push(r);
      } else {
        flush();
        cur = { start: s, end: e < s ? s : e, rows: [r] };
      }
    }
    flush();
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

// ── Product matching: a catalogue title mentioned in the task text ──
interface CatalogueProduct {
  id: string;
  title: string;
  status: string | null;
  hasRealCost: boolean;
  inventory: number | null;
}

function matchProducts(text: string, catalogue: CatalogueProduct[]): CatalogueProduct[] {
  const t = norm(text);
  if (t.length < 4) return [];
  const hits: CatalogueProduct[] = [];
  for (const p of catalogue) {
    const title = norm(p.title);
    if (title.length < 4) continue;
    if (t.includes(title)) hits.push(p);
  }
  // Prefer longer titles when one is a prefix of another ("Second Skin" vs "Second Skin Set").
  hits.sort((a, b) => b.title.length - a.title.length);
  const kept: CatalogueProduct[] = [];
  for (const h of hits) {
    if (!kept.some((k) => norm(k.title).includes(norm(h.title)))) kept.push(h);
  }
  return kept.slice(0, 6);
}

export async function buildPlanView(storeId: string, sheetId: string, now = new Date()): Promise<PlanView> {
  const db = getDb() as any;
  const sheet = await db.ganttSheet.findFirst({
    where: { id: sheetId, storeId },
    select: {
      id: true,
      title: true,
      rangeStart: true,
      rangeEnd: true,
      rows: { select: { id: true, task: true, role: true, category: true, actionType: true, startDate: true, endDate: true, executionJson: true } }
    }
  });
  if (!sheet) throw new AppError("Sheet not found.", 404);
  const today = now.toISOString().slice(0, 10);
  const groups = groupRows(sheet.rows as RowLite[], sheet.id);

  // Catalogue + observable facts, loaded once.
  const d14 = new Date(now.getTime() - 14 * DAY_MS);
  const d28 = new Date(now.getTime() - 28 * DAY_MS);
  const [products, campaignsByProduct, usedCodes, affiliateCodes] = await Promise.all([
    db.product.findMany({
      where: { storeId },
      select: { id: true, title: true, status: true, estimatedCost: true, costOverrideAmount: true, variants: { select: { inventoryQuantity: true } } }
    }) as Promise<Array<{ id: string; title: string; status: string | null; estimatedCost: unknown; costOverrideAmount: unknown; variants: Array<{ inventoryQuantity: number | null }> }>>,
    getActiveCampaignsByProduct(storeId).catch(() => new Map<string, unknown[]>()),
    db.discountUsage.findMany({ where: { storeId }, distinct: ["code"], select: { code: true } }).catch(() => []) as Promise<Array<{ code: string }>>,
    (db.affiliateCoupon ? db.affiliateCoupon.findMany({ where: { storeId }, select: { code: true } }) : Promise.resolve([])).catch(() => []) as Promise<Array<{ code: string | null }>>
  ]);
  const knownCodes = new Set<string>([...usedCodes.map((c) => c.code), ...affiliateCodes.map((c) => c.code ?? "")].map((c) => c.trim().toUpperCase()).filter(Boolean));
  const catalogue: CatalogueProduct[] = products.map((p) => {
    const inv = p.variants.reduce<number | null>((acc, v) => (v.inventoryQuantity === null ? acc : (acc ?? 0) + v.inventoryQuantity), null);
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      hasRealCost: p.costOverrideAmount !== null && p.costOverrideAmount !== undefined ? true : Number(p.estimatedCost ?? 0) > 0,
      inventory: inv
    };
  });

  // Units per product, last 14 days and the 14 before — one query.
  const unitRows = (await db.$queryRaw`
    SELECT li."productId" AS product_id,
           SUM(CASE WHEN o."createdAt" >= ${d14} THEN li.quantity ELSE 0 END)::int AS recent,
           SUM(CASE WHEN o."createdAt" < ${d14} THEN li.quantity ELSE 0 END)::int AS prior
    FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
    WHERE li."storeId" = ${storeId} AND o."createdAt" >= ${d28} AND o."cancelledAt" IS NULL AND o."test" = false AND li."productId" IS NOT NULL
    GROUP BY 1`) as Array<{ product_id: string; recent: number; prior: number }>;
  const unitsByProduct = new Map(unitRows.map((r) => [r.product_id, r]));

  const initiatives: Initiative[] = groups.map((g) => {
    const text = g.title;
    const matched = matchProducts(text, catalogue);
    const productFacts: InitiativeProduct[] = matched.map((p) => {
      const u = unitsByProduct.get(p.id);
      const recent = u?.recent ?? 0;
      const perDay = recent / 14;
      return {
        productId: p.id,
        title: p.title,
        inventory: p.inventory,
        units14d: recent,
        unitsPrior14d: u?.prior ?? 0,
        coverDays: p.inventory === null ? null : perDay > 0 ? Math.round(p.inventory / perDay) : null,
        hasRealCost: p.hasRealCost,
        liveCampaigns: (campaignsByProduct.get(p.id) as unknown[] | undefined)?.length ?? 0
      };
    });
    const couponCode = extractCouponCode(text);
    const discountPct = extractDiscountPct(text);
    const deps: DependencyCheck[] = [];
    const checked: string[] = ["Plan"];

    if (couponCode) {
      const known = knownCodes.has(couponCode.toUpperCase());
      deps.push({
        kind: "coupon",
        label: L("קופון", "Coupon"),
        state: known ? "ok" : "unverified",
        detail: known ? L(`${couponCode} קיים`, `${couponCode} exists`) : L(`${couponCode} עדיין לא נראה ב־Shopify`, `${couponCode} not seen in Shopify yet`)
      });
      checked.push("Shopify");
    }
    if (productFacts.length > 0) {
      checked.push("Sales", "Inventory");
      const out = productFacts.filter((p) => p.inventory !== null && p.inventory <= 0);
      const thin = productFacts.filter((p) => p.coverDays !== null && p.coverDays < g.days);
      deps.push({
        kind: "inventory",
        label: L("מלאי", "Inventory"),
        state: out.length > 0 ? "missing" : "ok",
        detail:
          out.length > 0
            ? L(`${out.map((p) => p.title).join(", ")} — אזל`, `${out.map((p) => p.title).join(", ")} — out of stock`)
            : thin.length > 0
              ? L(`${thin.map((p) => `${p.title} (${p.coverDays} ימי כיסוי)`).join(", ")}`, `${thin.map((p) => `${p.title} (${p.coverDays} days cover)`).join(", ")}`)
              : L(`${productFacts.length} מוצרים עם מלאי`, `${productFacts.length} products in stock`)
      });
      if (productFacts.some((p) => p.liveCampaigns > 0)) {
        checked.push("Meta");
        deps.push({
          kind: "campaign",
          label: L("קמפיין", "Campaign"),
          state: "ok",
          detail: L(`${productFacts.reduce((n, p) => n + p.liveCampaigns, 0)} קמפיינים פעילים על המוצרים`, `${productFacts.reduce((n, p) => n + p.liveCampaigns, 0)} live campaigns on these products`)
        });
      }
      const withCost = productFacts.filter((p) => p.hasRealCost).length;
      checked.push("Profit");
      deps.push({
        kind: "cost",
        label: L("עלות", "Cost"),
        state: withCost === productFacts.length ? "ok" : "unverified",
        detail:
          withCost === productFacts.length
            ? L("עלות אמיתית לכל המוצרים", "Real cost on every product")
            : L(`${productFacts.length - withCost} מוצרים ללא עלות — הרווחיות לא ניתנת לאימות`, `${productFacts.length - withCost} products without a cost — profitability cannot be verified`)
      });
    }

    // Status by date, then by observable dependencies.
    let status: InitiativeStatus;
    let reason: Localized | null = null;
    const daysToStart = daysBetween(today, g.start);
    if (g.end < today) status = "completed";
    else if (g.start <= today) status = "live";
    else status = "planned";
    const blocked = deps.filter((d) => d.state === "missing");
    if (status !== "completed" && blocked.length > 0) {
      status = "blocked";
      reason = L(blocked.map((d) => d.detail.he).join(" · "), blocked.map((d) => d.detail.en).join(" · "));
    } else if (status === "planned" && daysToStart <= READY_HORIZON_DAYS) {
      const unverified = deps.filter((d) => d.state === "unverified");
      if (deps.length > 0 && unverified.length === 0) {
        status = "ready";
        reason = L("כל מה שהילומי יכולה לבדוק — תקין", "Everything Hiloomy can check is in place");
      } else if (unverified.length > 0) {
        reason = L(unverified.map((d) => d.detail.he).join(" · "), unverified.map((d) => d.detail.en).join(" · "));
      }
    }

    return {
      ...g,
      discountPct,
      couponCode,
      products: productFacts,
      dependencies: deps,
      checked: [...new Set(checked)],
      status,
      statusReason: reason,
      profitConfidence: productFacts.length === 0 ? null : productFacts.filter((p) => p.hasRealCost).length / productFacts.length
    };
  });

  // Days
  const rangeStart = dayOf(sheet.rangeStart);
  const rangeEnd = dayOf(sheet.rangeEnd);
  const days: PlanDay[] = [];
  if (rangeStart && rangeEnd) {
    for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) {
      const ids = initiatives.filter((i) => i.start <= d && i.end >= d).map((i) => i.id);
      const byStatus = { planned: 0, ready: 0, blocked: 0, live: 0, completed: 0 } as Record<InitiativeStatus, number>;
      for (const id of ids) byStatus[initiatives.find((i) => i.id === id)!.status] += 1;
      days.push({ date: d, initiativeIds: ids, byStatus });
    }
  }

  const counts = { planned: 0, ready: 0, blocked: 0, live: 0, completed: 0, total: initiatives.length } as PlanView["counts"];
  for (const i of initiatives) counts[i.status] += 1;

  const upcoming = initiatives
    .filter((i) => i.status !== "completed" && i.start >= today && daysBetween(today, i.start) <= 14)
    .sort((a, b) => INITIATIVE_STATUS_ORDER.indexOf(a.status) - INITIATIVE_STATUS_ORDER.indexOf(b.status) || a.start.localeCompare(b.start))
    .slice(0, 5);

  const health: PlanView["health"] =
    initiatives.length === 0
      ? { tone: "quiet", line: L("אין יוזמות בתוכנית.", "No initiatives in the plan.") }
      : counts.blocked > 0
        ? { tone: "attention", line: L(`${counts.blocked} יוזמות חסומות · ${counts.live} באוויר · ${counts.ready} מוכנות`, `${counts.blocked} blocked · ${counts.live} live · ${counts.ready} ready`) }
        : { tone: "good", line: L(`${counts.ready + counts.planned} בתוכנית · ${counts.live} באוויר · ${counts.completed} הסתיימו`, `${counts.ready + counts.planned} planned · ${counts.live} live · ${counts.completed} completed`) };

  return {
    sheetId: sheet.id,
    title: sheet.title,
    rangeStart,
    rangeEnd,
    today,
    initiatives,
    days,
    counts,
    upcoming,
    health,
    generatedAt: now.toISOString()
  };
}

// Test seam (tests/unit/plan-service.test.ts).
export const __testing = { groupRows, matchProducts };
