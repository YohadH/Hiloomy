import { createHash } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { extractCouponCode, extractDiscountPct } from "@/lib/services/gantt-brief-generator-service";
import { getActiveCampaignsByProduct } from "@/lib/services/campaign-product-link-service";
import type { Localized } from "@/lib/domain/decision";
import {
  INITIATIVE_STATUS_ORDER,
  emptyStatusCounts,
  type DecisionHook,
  type DependencyCheck,
  type ExecutionAction,
  type Initiative,
  type InitiativeProduct,
  type InitiativeStatus,
  type PlanDay,
  type PlanView,
  type RelatedDecision
} from "@/lib/domain/plan";

/**
 * Plan service — spreadsheet rows → Commercial Initiatives → executions and
 * decision hooks, evaluated against synced data (lib/domain/plan.ts).
 *
 * Deterministic. No model call. Every number rendered comes from a query.
 */

const DAY_MS = 86_400_000;
const READY_HORIZON_DAYS = 7;
// Rows sharing an anchor join one initiative when their dates are within
// this many days of the initiative's current span.
const CLUSTER_GAP_DAYS = 3;
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
function firstLine(text: string, max = 90): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? text.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
function hash(s: string, len = 12): string {
  return createHash("sha1").update(s).digest("hex").slice(0, len);
}

export interface RowLite {
  id: string;
  task: string;
  role: string | null;
  category: string | null;
  actionType: string | null;
  startDate: Date | null;
  endDate: Date | null;
  executionJson: unknown;
}

// ─── Anchors: what makes two cells the same business move ───────────────
// Events/holidays and named mechanics. Each entry: [regex, canonical label].
const EVENT_ANCHORS: Array<[RegExp, string]> = [
  [/ראש\s*השנה|rosh\s*hashan/i, "ראש השנה"],
  [/סוכות|sukkot|succot/i, "סוכות"],
  [/יום\s*כיפור|כיפור|yom\s*kippur/i, "יום כיפור"],
  [/שמחת\s*תורה|simchat\s*torah/i, "שמחת תורה"],
  [/חנוכה|hanukk?ah|chanukk?ah/i, "חנוכה"],
  [/פסח|passover|pesach/i, "פסח"],
  [/פורים|purim/i, "פורים"],
  [/שבועות|shavuot/i, "שבועות"],
  [/ט"ו\s*באב|טו\s*באב|tu\s*b'?av/i, "ט״ו באב"],
  [/יום\s*האהבה|valentine/i, "יום האהבה"],
  [/יום\s*המשפחה|family\s*day/i, "יום המשפחה"],
  [/יום\s*האישה|women'?s\s*day/i, "יום האישה"],
  [/יום\s*האם|mother'?s\s*day/i, "יום האם"],
  [/black\s*friday|בלאק\s*פריידי/i, "Black Friday"],
  [/cyber\s*monday|סייבר\s*מאנדיי/i, "Cyber Monday"],
  [/shopping\s*il|שופינג\s*איי\s*אל/i, "Shopping IL"],
  [/back\s*in\s*stock|חזר(?:ה|ו)?\s*למלאי|חזרה\s*למלאי/i, "Back in stock"],
  [/give\s*&\s*take|give\s*and\s*take|גיב\s*אנד\s*טייק/i, "Give & Take"],
  [/gift\s*card|גיפט\s*קארד|כרטיס\s*מתנה/i, "Gift card"],
  [/סוף\s*עונה|end\s*of\s*season/i, "סוף עונה"],
  [/חזרה\s*לבית\s*הספר|back\s*to\s*school/i, "חזרה לבית הספר"]
];

// A launch name: up to three words after "השקת" / "launch", stopping at any
// punctuation or dash, so "השקת סאטן קוטור — קמפיין" and "השקת סאטן קוטור:
// באנר" both anchor on "סאטן קוטור".
const LAUNCH_HE = /השקת\s+([^\s,.:;|/\-–—()[\]"'\n]+(?:\s+[^\s,.:;|/\-–—()[\]"'\n]+){0,2})/;
const LAUNCH_EN = /\blaunch(?:ing)?\s+(?:of\s+)?([A-Za-z][^\s,.:;|/\-–—()[\]"'\n]*(?:\s+[A-Za-z][^\s,.:;|/\-–—()[\]"'\n]*){0,2})/i;

export interface Anchor {
  kind: "event" | "launch" | "coupon" | "product" | "text";
  key: string;
  label: string;
}

export function extractAnchors(text: string, productTitles: string[] = []): Anchor[] {
  const out: Anchor[] = [];
  for (const [re, label] of EVENT_ANCHORS) {
    if (re.test(text)) out.push({ kind: "event", key: `event:${label}`, label });
  }
  const launch = text.match(LAUNCH_HE)?.[1] ?? text.match(LAUNCH_EN)?.[1] ?? null;
  if (launch) {
    const l = launch.trim();
    out.push({ kind: "launch", key: `launch:${norm(l)}`, label: `השקת ${l}` });
  }
  const coupon = extractCouponCode(text);
  if (coupon) out.push({ kind: "coupon", key: `coupon:${coupon.toUpperCase()}`, label: coupon.toUpperCase() });
  const t = norm(text);
  for (const title of productTitles) {
    const n = norm(title);
    if (n.length >= 4 && t.includes(n)) out.push({ kind: "product", key: `product:${n}`, label: title });
  }
  return out;
}

const ANCHOR_PRIORITY: Record<Anchor["kind"], number> = { event: 0, launch: 1, coupon: 2, product: 3, text: 4 };

function primaryAnchor(anchors: Anchor[], fallbackText: string): Anchor {
  const sorted = [...anchors].sort((a, b) => ANCHOR_PRIORITY[a.kind] - ANCHOR_PRIORITY[b.kind] || b.label.length - a.label.length);
  return sorted[0] ?? { kind: "text", key: `text:${norm(fallbackText)}`, label: firstLine(fallbackText, 60) };
}

// ─── Decision hooks: sentences that already say "management decides" ─────
const CONDITIONAL_RE = /אופציונלי|בהתאם\s+ל|במידה\s+ו|בכפוף\s+ל|אם\s+צריך|\boptional\b|depending\s+on|if\s+needed|subject\s+to|conditional/i;
// A review is a sentence ABOUT the move ("assess the campaign", "check
// status and consider continuing", "keep as is or raise again"). Marketing
// copy that merely contains "decide" or ends with "?" ("tired of deciding?
// let them…") is not a hook — that false positive showed up in the
// September sheet.
const REVIEW_RE =
  /הערכת\s+מצב|לבחון\s+(?:המשך|את\s+ה|אם)|לבדוק\s+(?:סטטוס|מצב|אם)|(?:צריך\s+)?להחליט\s+(?:אם|האם|על|לגבי|בהתאם)|נחליט\s+(?:אם|האם|בהתאם)|משאירים\s+(?:ככה|כמו|או)|מעלים\s+שוב|להמשיך\s+או|continue\s+or\s+stop|review\s+(?:performance|status|results)|\bevaluate\s+(?:the|performance|results)|check\s+status|decide\s+(?:whether|if|based)|keep\s+or\s+/i;
const QUESTION_RE = /^\s*האם\s|(?:האם|להמשיך|להשאיר|לעצור)[^?]*\?\s*$/;

export function detectDecisionHooks(row: { id: string; task: string; start: string; end: string }, initiativeTitle: string, scopeKey?: string): DecisionHook[] {
  const text = row.task.replace(/\s+/g, " ").trim();
  const hooks: DecisionHook[] = [];
  const evidence = ["sales_pace", "product_velocity", "inventory", "active_promotions", "profit"];
  // Stable across days and re-parses: the initiative, the kind, the sentence.
  const idBase = scopeKey ? `${scopeKey}|${norm(text)}` : row.id;
  if (CONDITIONAL_RE.test(text)) {
    hooks.push({
      id: hash(`${idBase}|conditional`, 10),
      rowId: row.id,
      kind: "conditional",
      sourceText: text,
      question: L(`האם להפעיל כמתוכנן: ${initiativeTitle}?`, `Should we activate as planned: ${initiativeTitle}?`),
      windowStart: addDays(row.start, -7),
      windowEnd: row.end,
      requiredEvidence: evidence
    });
  }
  if (REVIEW_RE.test(text) || QUESTION_RE.test(text)) {
    hooks.push({
      id: hash(`${idBase}|review`, 10),
      rowId: row.id,
      kind: "review",
      sourceText: text,
      question: L(`הערכת מצב: ${initiativeTitle} — להמשיך, לשנות או לעצור?`, `Review: ${initiativeTitle} — continue, change or stop?`),
      windowStart: addDays(row.start, -1),
      windowEnd: addDays(row.end, 2),
      requiredEvidence: evidence
    });
  }
  return hooks;
}

// ─── Grouping ─────────────────────────────────────────────────────────────
interface Cluster {
  anchor: Anchor;
  start: string;
  end: string;
  rows: Array<RowLite & { s: string; e: string; anchors: Anchor[] }>;
}

export function groupIntoClusters(rows: RowLite[], productTitles: string[] = []): Cluster[] {
  const dated = rows
    .filter((r) => r.startDate)
    .map((r) => {
      const s = dayOf(r.startDate)!;
      const e0 = dayOf(r.endDate ?? r.startDate)!;
      return { ...r, s, e: e0 < s ? s : e0, anchors: extractAnchors(r.task, productTitles) };
    })
    .sort((a, b) => a.s.localeCompare(b.s));

  const byKey = new Map<string, Cluster[]>();
  for (const r of dated) {
    const a = primaryAnchor(r.anchors, r.task);
    const list = byKey.get(a.key) ?? [];
    // Join the latest cluster of this anchor when the dates are close.
    const last = list[list.length - 1];
    if (last && daysBetween(last.end, r.s) <= CLUSTER_GAP_DAYS) {
      last.rows.push(r);
      if (r.e > last.end) last.end = r.e;
    } else {
      list.push({ anchor: a, start: r.s, end: r.e, rows: [r] });
    }
    byKey.set(a.key, list);
  }
  return [...byKey.values()].flat().sort((a, b) => a.start.localeCompare(b.start) || a.anchor.label.localeCompare(b.anchor.label));
}

const MAIN_STORY_RE = /סיפור|story|hero|הירו|ראשי|main/i;

// A merged cell spanning N days arrives as N rows with identical text. One
// execution = one span of identical text + channel over contiguous days.
export interface ExecutionSpan {
  key: string; // norm(text)|norm(channel)
  rowIds: string[];
  task: string;
  category: string | null;
  role: string | null;
  actionType: string | null;
  start: string;
  end: string;
  executedAt: string | null;
}

export function mergeExecutionSpans(rows: Array<RowLite & { s: string; e: string }>): ExecutionSpan[] {
  const sorted = [...rows].sort((a, b) => a.s.localeCompare(b.s));
  const open = new Map<string, ExecutionSpan>();
  const out: ExecutionSpan[] = [];
  for (const r of sorted) {
    const key = `${norm(r.task)}|${norm(r.category)}`;
    const executedAt = (r.executionJson as { executedAt?: string } | null)?.executedAt ?? null;
    const cur = open.get(key);
    if (cur && daysBetween(cur.end, r.s) <= 1) {
      cur.rowIds.push(r.id);
      if (r.e > cur.end) cur.end = r.e;
      if (executedAt && (!cur.executedAt || executedAt > cur.executedAt)) cur.executedAt = executedAt;
    } else {
      const span: ExecutionSpan = { key, rowIds: [r.id], task: r.task, category: r.category, role: r.role, actionType: r.actionType, start: r.s, end: r.e, executedAt };
      open.set(key, span);
      out.push(span);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.task.localeCompare(b.task));
}

function titleFor(c: Cluster): string {
  const main = c.rows.find((r) => r.category && MAIN_STORY_RE.test(r.category));
  if (c.anchor.kind === "event" || c.anchor.kind === "launch") return c.anchor.label;
  if (main) return firstLine(main.task, 70);
  return firstLine(c.rows[0].task, 70);
}

function confidenceFor(c: Cluster): Initiative["groupingConfidence"] {
  if (c.rows.length === 1) return c.anchor.kind === "text" ? "low" : "medium";
  if (c.anchor.kind === "event" || c.anchor.kind === "launch" || c.anchor.kind === "coupon") return "high";
  if (c.anchor.kind === "product") return "medium";
  return "low";
}

// ─── Catalogue facts ──────────────────────────────────────────────────────
interface CatalogueProduct {
  id: string;
  title: string;
  hasRealCost: boolean;
  inventory: number | null;
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

  const d14 = new Date(now.getTime() - 14 * DAY_MS);
  const d28 = new Date(now.getTime() - 28 * DAY_MS);
  const [products, campaignsByProduct, usedCodes, affiliateCodes, planAlerts] = await Promise.all([
    db.product.findMany({
      where: { storeId },
      select: { id: true, title: true, estimatedCost: true, costOverrideAmount: true, variants: { select: { inventoryQuantity: true } } }
    }) as Promise<Array<{ id: string; title: string; estimatedCost: unknown; costOverrideAmount: unknown; variants: Array<{ inventoryQuantity: number | null }> }>>,
    getActiveCampaignsByProduct(storeId).catch(() => new Map<string, unknown[]>()),
    db.discountUsage.findMany({ where: { storeId }, distinct: ["code"], select: { code: true } }).catch(() => []) as Promise<Array<{ code: string }>>,
    (db.affiliateCoupon ? db.affiliateCoupon.findMany({ where: { storeId }, select: { code: true } }) : Promise.resolve([])).catch(() => []) as Promise<Array<{ code: string | null }>>,
    // Decisions this plan created (open or resolved) — the link back from Today.
    db.alert
      .findMany({
        where: { storeId, type: "plan_decision", payloadJson: { path: ["sheetId"], equals: sheetId } },
        select: { id: true, status: true, payloadJson: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100
      })
      .catch(() => []) as Promise<Array<{ id: string; status: string; payloadJson: Record<string, unknown> | null; createdAt: Date }>>
  ]);
  const knownCodes = new Set<string>([...usedCodes.map((c) => c.code), ...affiliateCodes.map((c) => c.code ?? "")].map((c) => c.trim().toUpperCase()).filter(Boolean));
  const catalogue: CatalogueProduct[] = products.map((p) => ({
    id: p.id,
    title: p.title,
    hasRealCost: p.costOverrideAmount !== null && p.costOverrideAmount !== undefined ? true : Number(p.estimatedCost ?? 0) > 0,
    inventory: p.variants.reduce<number | null>((acc, v) => (v.inventoryQuantity === null ? acc : (acc ?? 0) + v.inventoryQuantity), null)
  }));
  const catalogueByNorm = new Map(catalogue.map((p) => [norm(p.title), p]));

  const unitRows = (await db.$queryRaw`
    SELECT li."productId" AS product_id,
           SUM(CASE WHEN o."createdAt" >= ${d14} THEN li.quantity ELSE 0 END)::int AS recent,
           SUM(CASE WHEN o."createdAt" < ${d14} THEN li.quantity ELSE 0 END)::int AS prior
    FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
    WHERE li."storeId" = ${storeId} AND o."createdAt" >= ${d28} AND o."cancelledAt" IS NULL AND o."test" = false AND li."productId" IS NOT NULL
    GROUP BY 1`) as Array<{ product_id: string; recent: number; prior: number }>;
  const unitsByProduct = new Map(unitRows.map((r) => [r.product_id, r]));

  // Related decisions by hook id.
  const decisionsByHook = new Map<string, RelatedDecision>();
  for (const a of planAlerts) {
    const p = a.payloadJson ?? {};
    const hookId = typeof p.hookId === "string" ? p.hookId : null;
    if (!hookId || decisionsByHook.has(hookId)) continue;
    const human = (p.humanDecision as { choice?: RelatedDecision["choice"]; optionKey?: string; decidedAt?: string } | undefined) ?? {};
    const q = (p.question as Localized | undefined) ?? L("החלטה מהתוכנית", "Plan decision");
    decisionsByHook.set(hookId, {
      id: a.id,
      hookId,
      state: a.status === "open" ? "open" : "resolved",
      choice: human.choice ?? (a.status === "open" ? "pending" : "auto_closed"),
      optionKey: human.optionKey ?? null,
      decidedAt: human.decidedAt ?? null,
      question: q
    });
  }

  const clusters = groupIntoClusters(sheet.rows as RowLite[], catalogue.map((p) => p.title));
  const initiatives: Initiative[] = clusters.map((c) => {
    const title = titleFor(c);
    const allText = c.rows.map((r) => r.task).join("\n");
    // Products named anywhere in the initiative.
    const productKeys = new Set<string>();
    for (const r of c.rows) for (const a of r.anchors) if (a.kind === "product") productKeys.add(a.key.slice("product:".length));
    const matched = [...productKeys].map((k) => catalogueByNorm.get(k)).filter(Boolean) as CatalogueProduct[];
    const productFacts: InitiativeProduct[] = matched.slice(0, 6).map((p) => {
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
    const couponCode = c.rows.map((r) => extractCouponCode(r.task)).find(Boolean) ?? null;
    const discountPct = c.rows.map((r) => extractDiscountPct(r.task)).find((n) => n !== null) ?? null;

    const spans = mergeExecutionSpans(c.rows);
    const executions: ExecutionAction[] = spans.map((sp) => {
      const rowCoupon = extractCouponCode(sp.task);
      const couponDone = sp.actionType === "discount_code" && rowCoupon !== null && knownCodes.has(rowCoupon.toUpperCase());
      return {
        rowId: sp.rowIds[0],
        text: firstLine(sp.task, 120),
        channel: sp.category,
        role: sp.role,
        actionType: sp.actionType,
        start: sp.start,
        end: sp.end,
        state: sp.executedAt || couponDone ? "done" : "open",
        executedAt: sp.executedAt
      };
    });
    const channels = [...new Set(executions.map((e) => e.channel).filter(Boolean) as string[])];

    const deps: DependencyCheck[] = [];
    const checked: string[] = ["Plan"];
    if (couponCode) {
      const known = knownCodes.has(couponCode.toUpperCase());
      deps.push({ kind: "coupon", label: L("קופון", "Coupon"), state: known ? "ok" : "unverified", detail: known ? L(`${couponCode} קיים`, `${couponCode} exists`) : L(`${couponCode} עדיין לא נראה ב־Shopify`, `${couponCode} not seen in Shopify yet`) });
      checked.push("Shopify");
    }
    if (productFacts.length > 0) {
      checked.push("Sales", "Inventory");
      const out = productFacts.filter((p) => p.inventory !== null && p.inventory <= 0);
      const thin = productFacts.filter((p) => p.coverDays !== null && p.coverDays < Math.max(7, daysBetween(c.start, c.end) + 1));
      deps.push({
        kind: "inventory",
        label: L("מלאי", "Inventory"),
        state: out.length > 0 ? "missing" : "ok",
        detail:
          out.length > 0
            ? L(`${out.map((p) => p.title).join(", ")} — אזל`, `${out.map((p) => p.title).join(", ")} — out of stock`)
            : thin.length > 0
              ? L(thin.map((p) => `${p.title} (${p.coverDays} ימי כיסוי)`).join(", "), thin.map((p) => `${p.title} (${p.coverDays} days cover)`).join(", "))
              : L(`${productFacts.length} מוצרים עם מלאי`, `${productFacts.length} products in stock`)
      });
      const live = productFacts.reduce((n, p) => n + p.liveCampaigns, 0);
      if (live > 0) {
        checked.push("Meta");
        deps.push({ kind: "campaign", label: L("קמפיין", "Campaign"), state: "ok", detail: L(`${live} קמפיינים פעילים על המוצרים`, `${live} live campaigns on these products`) });
      }
      const withCost = productFacts.filter((p) => p.hasRealCost).length;
      checked.push("Profit");
      deps.push({
        kind: "cost",
        label: L("עלות", "Cost"),
        state: withCost === productFacts.length ? "ok" : "unverified",
        detail: withCost === productFacts.length ? L("עלות אמיתית לכל המוצרים", "Real cost on every product") : L(`${productFacts.length - withCost} מוצרים ללא עלות — הרווחיות לא ניתנת לאימות`, `${productFacts.length - withCost} products without a cost — profitability cannot be verified`)
      });
    }

    // Decision hooks, per execution span (not per day), keyed by initiative.
    const scopeKey = `${c.anchor.key}|${c.start}`;
    // One hook per kind per initiative: the same sentence repeats across
    // channels; keep the widest window.
    const byKind = new Map<DecisionHook["kind"], DecisionHook>();
    for (const h of spans.flatMap((sp) => detectDecisionHooks({ id: sp.rowIds[0], task: sp.task, start: sp.start, end: sp.end }, title, scopeKey))) {
      const cur = byKind.get(h.kind);
      if (!cur) byKind.set(h.kind, { ...h, id: hash(`${scopeKey}|${h.kind}`, 10) });
      else byKind.set(h.kind, { ...cur, windowStart: h.windowStart < cur.windowStart ? h.windowStart : cur.windowStart, windowEnd: h.windowEnd > cur.windowEnd ? h.windowEnd : cur.windowEnd });
    }
    const hooks: DecisionHook[] = [...byKind.values()];
    const related = hooks.map((h) => decisionsByHook.get(h.id)).filter(Boolean) as RelatedDecision[];

    // Status: dates → dependencies → decisions.
    let status: InitiativeStatus;
    let reason: Localized | null = null;
    const daysToStart = daysBetween(today, c.start);
    if (c.end < today) status = "completed";
    else if (c.start <= today) status = "live";
    else status = "planned";
    const blocked = deps.filter((d) => d.state === "missing");
    const openDecision = related.find((r) => r.state === "open");
    if (status !== "completed" && openDecision) {
      status = "needs_decision";
      reason = openDecision.question;
    } else if (status !== "completed" && blocked.length > 0) {
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
    const resolved = related.find((r) => r.state === "resolved" && r.choice !== "auto_closed");
    if (resolved && !reason) {
      reason = L(`עודכן לפי החלטה ${displayId(resolved.id)}`, `Updated by decision ${displayId(resolved.id)}`);
    }

    return {
      id: hash(`${c.anchor.key}|${c.start}`),
      sheetId: sheet.id,
      title,
      anchor: { kind: c.anchor.kind, label: c.anchor.label },
      groupingConfidence: confidenceFor(c),
      category: c.rows.find((r) => r.category && MAIN_STORY_RE.test(r.category))?.category ?? c.rows[0].category,
      start: c.start,
      end: c.end,
      days: daysBetween(c.start, c.end) + 1,
      offer: { discountPct, couponCode },
      products: productFacts,
      channels,
      executions,
      dependencies: deps,
      checked: [...new Set(checked)],
      status,
      statusReason: reason,
      profitConfidence: productFacts.length === 0 ? null : productFacts.filter((p) => p.hasRealCost).length / productFacts.length,
      decisionHooks: hooks,
      relatedDecisions: related,
      rowIds: c.rows.map((r) => r.id)
    };
  });

  const rangeStart = dayOf(sheet.rangeStart);
  const rangeEnd = dayOf(sheet.rangeEnd);
  const days: PlanDay[] = [];
  if (rangeStart && rangeEnd) {
    for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) {
      const on = initiatives.filter((i) => i.start <= d && i.end >= d);
      const byStatus = emptyStatusCounts();
      for (const i of on) byStatus[i.status] += 1;
      days.push({ date: d, initiativeIds: on.map((i) => i.id), executionCount: on.reduce((n, i) => n + i.executions.filter((e) => e.start <= d && e.end >= d).length, 0), byStatus });
    }
  }

  const counts = { ...emptyStatusCounts(), total: initiatives.length } as PlanView["counts"];
  for (const i of initiatives) counts[i.status] += 1;

  const upcoming = initiatives
    .filter((i) => i.status !== "completed" && i.start >= today && daysBetween(today, i.start) <= 14)
    .sort((a, b) => INITIATIVE_STATUS_ORDER.indexOf(a.status) - INITIATIVE_STATUS_ORDER.indexOf(b.status) || a.start.localeCompare(b.start))
    .slice(0, 5);

  const decisionsPending = initiatives.flatMap((i) =>
    i.relatedDecisions
      .filter((r) => r.state === "open")
      .map((r) => {
        const hook = i.decisionHooks.find((h) => h.id === r.hookId);
        return { initiativeId: i.id, initiativeTitle: i.title, decisionId: r.id, question: r.question, due: hook?.windowEnd ?? i.start };
      })
  );

  const health: PlanView["health"] =
    initiatives.length === 0
      ? { tone: "quiet", line: L("אין יוזמות בתוכנית.", "No initiatives in the plan.") }
      : counts.needs_decision > 0 || counts.blocked > 0
        ? {
            tone: "attention",
            line: L(
              `${counts.needs_decision > 0 ? `${counts.needs_decision} דורשות החלטה · ` : ""}${counts.blocked > 0 ? `${counts.blocked} חסומות · ` : ""}${counts.live} באוויר`,
              `${counts.needs_decision > 0 ? `${counts.needs_decision} need a decision · ` : ""}${counts.blocked > 0 ? `${counts.blocked} blocked · ` : ""}${counts.live} live`
            )
          }
        : { tone: "good", line: L(`${counts.ready + counts.planned} בתוכנית · ${counts.live} באוויר · ${counts.completed} הסתיימו`, `${counts.ready + counts.planned} planned · ${counts.live} live · ${counts.completed} completed`) };

  return {
    sheetId: sheet.id,
    title: sheet.title,
    rangeStart,
    rangeEnd,
    today,
    initiatives,
    executionsTotal: initiatives.reduce((n, i) => n + i.executions.length, 0),
    days,
    counts,
    upcoming,
    decisionsPending,
    health,
    generatedAt: now.toISOString()
  };
}

function displayId(id: string): string {
  return `D-${id.slice(-5).toUpperCase()}`;
}

// The newest sheet whose range covers `on` (else the newest sheet at all).
export async function currentPlanSheetId(storeId: string, on: Date): Promise<string | null> {
  const db = getDb() as any;
  const dayStart = new Date(`${on.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const sheet =
    (await db.ganttSheet.findFirst({ where: { storeId, rangeStart: { lte: dayStart }, rangeEnd: { gte: dayStart } }, orderBy: { createdAt: "desc" }, select: { id: true } })) ??
    (await db.ganttSheet.findFirst({ where: { storeId }, orderBy: { createdAt: "desc" }, select: { id: true } }));
  return sheet?.id ?? null;
}

// Test seam (tests/unit/plan-service.test.ts).
export const __testing = { groupIntoClusters, extractAnchors, detectDecisionHooks, titleFor, confidenceFor, mergeExecutionSpans };
