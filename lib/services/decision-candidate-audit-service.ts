// Decision Candidate Audit — recorder + report (docs/DECISION-INBOX-PLAN.md §0c).
//
// Shadow instrumentation around Today. On every engine pass the inbox hands
// this service what it built and what it showed; the service adds one probe
// per domain that has no ledger candidate (the strongest signal the engine
// rejected, with the gate it applied), scores every candidate on the same
// seven dimensions, ranks them globally, tags every non-surfaced one with a
// reason, and persists the run. `composeRun` is pure and unit-tested; the
// recorder only gathers inputs and writes rows. Nothing here changes Today.

import { getDb } from "@/lib/server/db";
import type { Decision, JudgmentTag, Localized } from "@/lib/domain/decision";
import type { PlanView } from "@/lib/domain/plan";
import type { MetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";
import type { LeakageSummary } from "@/lib/services/affiliate-leakage-service";
import { buildCompetitorWeekSection, type CompetitorWeekSection } from "@/lib/services/competitor-intel-service";
import {
  CANDIDATE_DOMAINS,
  DOMAIN_OF_KIND,
  KIND_PRIORS_VERSION,
  RANKING_WEIGHTS_V1,
  explainRank,
  rankCandidates,
  scoreCandidate,
  type CandidateDomain,
  type CandidateRunSummary,
  type DecisionCandidateInput,
  type RankingWeights,
  type ScoreDimension,
  type ScoredCandidate,
  type SuppressionReason
} from "@/lib/domain/decision-candidate";

const L = (he: string, en: string): Localized => ({ he, en });
const DAY_MS = 86_400_000;
const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Presentation constants mirrored from the inbox (kept in step by the
// composer test): a kind gets 2 cards, a critical one a 3rd, 5 cards total.
const MAX_CARDS_PER_KIND = 2;

// ─── Inputs from the inbox ────────────────────────────────────────────

export interface LedgerCandidateSource {
  decision: Decision;
  payload: Record<string, unknown>;
  // human.choice === "pending" (eligible for Today at all)
  pending: boolean;
  // dropped by the inbox's singleton rule (commission month boundary)
  duplicate: boolean;
}

export interface ProbeData {
  // Store economics the inbox already loaded.
  productEcon: Array<{ productId: string; title: string; units14: number; net14: number; realCost: boolean; inventory: number; liveCampaigns: number }>;
  leakage: LeakageSummary | null;
  leakageAllProtected: boolean;
  meta: MetaCampaignsOverview | null;
  plan: PlanView | null;
  // Silent-product alerts that never became decisions (no live campaign).
  silentAlerts: Array<{ id: string; title: string; payload: Record<string, unknown>; createdAt: string }>;
  // Worst contribution SKU (90d, real cost) and thinnest discounted SKU
  // (30d) WITHOUT the engines' unit / LIMIT gates. null = query not run.
  discount: { worstLoss: DiscountProbeRow | null; thinnest: DiscountProbeRow | null; anyRealCost: boolean } | null;
  competitors: CompetitorWeekSection | null;
}

export interface DiscountProbeRow {
  productId: string;
  title: string;
  units: number;
  gross: number;
  discounts: number;
  net: number;
  cogs: number;
  contribution: number;
}

export interface ComposeInput {
  storeId: string;
  now: Date;
  ledger: LedgerCandidateSource[];
  cardIds: string[]; // Today's cards, in order
  todayOrder: string[]; // every pending decision in Today's order (cards then overflow)
  probes: ProbeData;
  weights?: RankingWeights;
}

export interface ComposedRun {
  candidates: ScoredCandidate[];
  summary: Omit<CandidateRunSummary, "id" | "storeId" | "runAt" | "trigger">;
}

// ─── Ledger decisions → candidates ────────────────────────────────────

const EXPOSURE_TYPE: Record<string, string> = {
  stockout_imminent: "revenue_14d",
  roas_collapse: "spend_30d",
  commission_leakage: "commission_30d",
  decision_standalone_loss: "contribution_90d",
  decision_discount_tradeoff: "discounts_30d",
  product_gone_silent: "lost_sales_14d",
  competitor_promo: "none",
  plan_decision: "none"
};

function ledgerCandidate(src: LedgerCandidateSource, cardIds: string[], todayOrder: string[], cardsByKind: Map<string, number>, revenue14: number | null): DecisionCandidateInput {
  const d = src.decision;
  const domain = DOMAIN_OF_KIND[d.kind] ?? "product_performance";
  const exposureType = EXPOSURE_TYPE[d.kind] ?? "none";
  const exposure = exposureType === "none" ? null : d.rank > 0 ? d.rank : null;
  const campaignMatters = !!d.materiality && d.materiality.level !== "evidence";
  const daysCover = d.kind === "stockout_imminent" ? num(src.payload.daysToStockout) : null;

  let surfaced = false;
  let reason: SuppressionReason | null = null;
  let todayRank: number | null = null;
  if (!src.pending) reason = "ALREADY_DECIDED";
  else if (src.duplicate) reason = "DUPLICATE";
  else {
    todayRank = todayOrder.indexOf(d.id) + 1 || null;
    if (cardIds.includes(d.id)) surfaced = true;
    else reason = (cardsByKind.get(d.kind) ?? 0) >= MAX_CARDS_PER_KIND ? "DOMAIN_DISPLAY_CAP" : "LOWER_GLOBAL_PRIORITY";
  }

  return {
    domain,
    kind: d.kind,
    title: d.title,
    managementQuestion: d.question,
    trigger: d.trigger,
    evidenceSummary: d.evidence.slice(0, 5).map((f) => `${f.label.en}: ${typeof f.value === "string" ? f.value : f.value ? f.value.en : "n/a"}`),
    connectedDomains: d.domains,
    financialExposure: exposure,
    financialExposureType: exposure === null ? null : exposureType,
    financialConfidence: exposure === null ? "unavailable" : d.kind === "stockout_imminent" || d.kind === "roas_collapse" ? "known" : "calculated",
    proposedStatus: d.status,
    proposedRecommendation: d.recommendation,
    missingEvidence: d.missingEvidence.map((m) => m.en),
    entity: d.entity,
    inputs: {
      daysCover,
      windowOpensInDays: d.kind === "plan_decision" ? 0 : null,
      promoLive: d.kind === "competitor_promo",
      confidence: d.confidence,
      domainsJoined: d.domains.length,
      campaignMatters,
      revenue14dStore: revenue14
    },
    relatedDecisionId: d.id,
    surfaced,
    todayRank,
    suppressionReason: reason,
    eligible: true
  };
}

// ─── Per-domain probes (the strongest signal the engine did not alert on) ─

function noneRow(domain: CandidateDomain, reason: SuppressionReason, note: Localized): DecisionCandidateInput {
  return {
    domain,
    kind: "none",
    title: note,
    managementQuestion: null,
    trigger: null,
    evidenceSummary: [],
    connectedDomains: [],
    financialExposure: null,
    financialExposureType: null,
    financialConfidence: "unavailable",
    proposedStatus: null,
    proposedRecommendation: null,
    missingEvidence: [],
    entity: null,
    inputs: {},
    relatedDecisionId: null,
    surfaced: false,
    todayRank: null,
    suppressionReason: reason,
    eligible: reason !== "NOT_ELIGIBLE" && reason !== "NO_ENGINE"
  };
}

function probe(domain: CandidateDomain, p: ProbeData, now: Date, revenue14: number | null): DecisionCandidateInput {
  const base = (over: Partial<DecisionCandidateInput> & Pick<DecisionCandidateInput, "kind" | "title">): DecisionCandidateInput => ({
    domain,
    managementQuestion: null,
    trigger: null,
    evidenceSummary: [],
    connectedDomains: [domain],
    financialExposure: null,
    financialExposureType: null,
    financialConfidence: "calculated",
    proposedStatus: null,
    proposedRecommendation: null,
    missingEvidence: [],
    entity: null,
    inputs: { revenue14dStore: revenue14 },
    relatedDecisionId: null,
    surfaced: false,
    todayRank: null,
    suppressionReason: "ENGINE_THRESHOLD",
    eligible: true,
    ...over
  });

  switch (domain) {
    case "inventory": {
      const rows = p.productEcon.filter((r) => r.inventory > 0 && r.units14 > 0).map((r) => ({ ...r, daysCover: r.inventory / (r.units14 / 14) }));
      if (p.productEcon.length === 0) return noneRow(domain, "NOT_ELIGIBLE", L("אין מוצרים עם מלאי ומכירות", "No products with inventory and sales"));
      if (rows.length === 0) return noneRow(domain, "NO_CANDIDATE", L("אין מוצר עם מלאי ומכירות ב-14 יום", "No product with both stock and 14-day sales"));
      const best = rows.sort((a, b) => a.daysCover - b.daysCover)[0];
      const gate = best.net14 < 500 ? `trailing revenue ${ils(best.net14)} < ₪500` : `cover ${best.daysCover.toFixed(0)}d > 30d`;
      return base({
        kind: "stockout_imminent",
        title: L(`${best.title} — ${best.daysCover.toFixed(0)} ימי כיסוי`, `${best.title} — ${best.daysCover.toFixed(0)} days of cover`),
        managementQuestion: L("להזמין מלאי עכשיו?", "Replenish now?"),
        evidenceSummary: [`inventory ${best.inventory}`, `units 14d ${best.units14}`, `net 14d ${ils(best.net14)}`, `gate: ${gate}`],
        connectedDomains: best.liveCampaigns > 0 ? ["inventory", "shopify", "meta"] : ["inventory", "shopify"],
        financialExposure: best.net14 > 0 ? best.net14 : null,
        financialExposureType: "revenue_14d",
        entity: { type: "product", id: best.productId, label: best.title },
        inputs: { daysCover: best.daysCover, confidence: "medium", domainsJoined: best.liveCampaigns > 0 ? 3 : 2, campaignMatters: best.liveCampaigns > 0, revenue14dStore: revenue14, engineGate: gate }
      });
    }
    case "affiliate": {
      if (!p.leakage) return noneRow(domain, "NOT_ELIGIBLE", L("אין תוכנית שותפים עם ייחוסים", "No affiliate program with attributions"));
      const rc = p.leakage.returningCustomer;
      if (rc.commission <= 0) return noneRow(domain, "NO_CANDIDATE", L("אין עמלות על לקוחות חוזרים ב-30 יום", "No commission on returning customers in 30 days"));
      const gate = p.leakageAllProtected ? "every program already protects returning customers" : p.leakage.leakageRate < 0.15 ? `leakage ${(p.leakage.leakageRate * 100).toFixed(0)}% < 15%` : `commission ${ils(rc.commission)} < ₪100`;
      return base({
        kind: "commission_leakage",
        title: L(`${ils(rc.commission)} עמלות על לקוחות חוזרים`, `${ils(rc.commission)} commission on returning customers`),
        managementQuestion: L("להגביל עמלה על לקוחות קיימים?", "Limit commission on existing customers?"),
        evidenceSummary: [`returning commission 30d ${ils(rc.commission)}`, `leakage rate ${(p.leakage.leakageRate * 100).toFixed(0)}%`, `conversions ${rc.conversions}`, `gate: ${gate}`],
        connectedDomains: ["affiliate", "shopify"],
        financialExposure: rc.commission,
        financialExposureType: "commission_30d",
        suppressionReason: p.leakageAllProtected ? "ALREADY_DECIDED" : "ENGINE_THRESHOLD",
        inputs: { confidence: "medium", domainsJoined: 2, revenue14dStore: revenue14, engineGate: gate }
      });
    }
    case "discount_profit": {
      if (!p.discount) return noneRow(domain, "NO_CANDIDATE", L("הבדיקה לא רצה", "Probe did not run"));
      if (!p.discount.anyRealCost) return noneRow(domain, "NOT_ELIGIBLE", L("אין מוצרים עם עלות אמיתית", "No products with a real cost"));
      const loss = p.discount.worstLoss;
      const thin = p.discount.thinnest;
      const pick = loss && loss.contribution < 0 ? { row: loss, kind: "decision_standalone_loss", gate: loss.units < 20 ? `units ${loss.units} < 20` : "beyond the engine's 3-row limit" } : thin ? { row: thin, kind: "decision_discount_tradeoff", gate: thin.units < 30 ? `units ${thin.units} < 30` : thin.gross > 0 && thin.discounts / thin.gross < 0.15 ? `discount rate ${((thin.discounts / thin.gross) * 100).toFixed(0)}% < 15%` : "margin ≥ 25% or beyond the engine's 2-row limit" } : null;
      if (!pick) return noneRow(domain, "NO_CANDIDATE", L("אין מוצר מפסיד או בהנחה דקה", "No loss-making or thin-margin discounted product"));
      const r = pick.row;
      const exposure = pick.kind === "decision_standalone_loss" ? Math.abs(r.contribution) : r.discounts;
      return base({
        kind: pick.kind,
        title: pick.kind === "decision_standalone_loss" ? L(`${r.title} — מפסיד ${ils(Math.abs(r.contribution))}`, `${r.title} — loses ${ils(Math.abs(r.contribution))}`) : L(`${r.title} — ${ils(r.discounts)} הנחות, מרווח דק`, `${r.title} — ${ils(r.discounts)} discounts, thin margin`),
        managementQuestion: pick.kind === "decision_standalone_loss" ? L("להמשיך למכור במחיר הזה?", "Keep selling at this price?") : L("ההנחה שווה את המרווח?", "Is the discount worth the margin?"),
        evidenceSummary: [`units ${r.units}`, `net ${ils(r.net)}`, `cogs ${ils(r.cogs)}`, `contribution ${ils(r.contribution)}`, `gate: ${pick.gate}`],
        connectedDomains: ["profit", "shopify"],
        financialExposure: exposure > 0 ? exposure : null,
        financialExposureType: pick.kind === "decision_standalone_loss" ? "contribution_90d" : "discounts_30d",
        entity: { type: "product", id: r.productId, label: r.title },
        inputs: { confidence: "medium", domainsJoined: 2, revenue14dStore: revenue14, engineGate: pick.gate }
      });
    }
    case "paid_media": {
      if (!p.meta || p.meta.campaigns.length === 0) return noneRow(domain, "NOT_ELIGIBLE", L("אין חשבון Meta מחובר עם קמפיינים", "No Meta account connected with campaigns"));
      const rows = p.meta.campaigns.filter((c) => c.spend >= 100);
      if (rows.length === 0) return noneRow(domain, "NO_CANDIDATE", L("אין קמפיין עם הוצאה מעל ₪100", "No campaign with spend above ₪100"));
      const best = [...rows].sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0) || b.spend - a.spend)[0];
      const gate = best.spend < 500 ? `spend ${ils(best.spend)} < ₪500` : best.roas !== null && best.roas >= 3 ? `ROAS ${best.roas.toFixed(1)} ≥ 3.0` : "engine ran; campaign already alerted or resolved";
      return base({
        kind: "roas_collapse",
        title: L(`${best.campaignName} — ROAS ${best.roas === null ? "—" : best.roas.toFixed(1)}`, `${best.campaignName} — ROAS ${best.roas === null ? "—" : best.roas.toFixed(1)}`),
        managementQuestion: L("להמשיך להשקיע בקמפיין?", "Keep funding this campaign?"),
        evidenceSummary: [`spend ${ils(best.spend)}`, `purchases ${best.purchases}`, `revenue ${ils(best.revenue)}`, `gate: ${gate}`],
        connectedDomains: ["meta", "shopify"],
        financialExposure: best.spend,
        financialExposureType: "spend_30d",
        financialConfidence: "known",
        entity: { type: "campaign", id: best.campaignId, label: best.campaignName },
        inputs: { confidence: "medium", domainsJoined: 2, revenue14dStore: revenue14, engineGate: gate }
      });
    }
    case "product_performance": {
      if (p.productEcon.length === 0) return noneRow(domain, "NOT_ELIGIBLE", L("אין מכירות ב-14 יום", "No sales in 14 days"));
      if (p.silentAlerts.length === 0) return noneRow(domain, "NO_CANDIDATE", L("אף מוצר לא השתתק", "No product went silent"));
      const best = [...p.silentAlerts].sort((a, b) => (num(b.payload.lostEstimate) ?? 0) - (num(a.payload.lostEstimate) ?? 0))[0];
      const lost = num(best.payload.lostEstimate);
      return base({
        kind: "product_gone_silent",
        title: L(`${best.title} — השתתק, ${lost !== null ? ils(lost) : "?"} אובדן משוער`, `${best.title} — went silent, ${lost !== null ? ils(lost) : "?"} estimated loss`),
        managementQuestion: L("להחזיר את המוצר לתשומת לב?", "Bring the product back into focus?"),
        evidenceSummary: [`lost 14d ${lost !== null ? ils(lost) : "?"}`, "no live campaign → no reallocation lever"],
        connectedDomains: ["shopify"],
        financialExposure: lost,
        financialExposureType: "lost_sales_14d",
        financialConfidence: "estimated",
        suppressionReason: "NO_MANAGEMENT_JUDGMENT",
        inputs: { confidence: "low", domainsJoined: 1, revenue14dStore: revenue14, engineGate: "alert written; not a decision without a live campaign" }
      });
    }
    case "plan": {
      if (!p.plan) return noneRow(domain, "NOT_ELIGIBLE", L("אין תוכנית שיווקית", "No marketing plan"));
      const today = now.toISOString().slice(0, 10);
      const hooks = p.plan.initiatives.flatMap((i) => i.decisionHooks.map((h) => ({ i, h })));
      if (hooks.length === 0) return noneRow(domain, "NO_CANDIDATE", L("אין נקודות החלטה בתוכנית", "No decision hooks in the plan"));
      const dayDiff = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS);
      const scored = hooks.map(({ i, h }) => ({ i, h, opensIn: dayDiff(today, h.windowStart), closedFor: dayDiff(h.windowEnd, today) }));
      const upcoming = scored.filter((x) => x.opensIn > 0).sort((a, b) => a.opensIn - b.opensIn)[0];
      const pick = upcoming ?? scored.sort((a, b) => a.closedFor - b.closedFor)[0];
      const excluded = pick.i.excludedFromEngine;
      return base({
        kind: "plan_decision",
        title: L(`${pick.i.title} — ${pick.h.question.he}`, `${pick.i.title} — ${pick.h.question.en}`),
        managementQuestion: pick.h.question,
        trigger: L(pick.h.sourceText, pick.h.sourceText),
        evidenceSummary: [`window ${pick.h.windowStart} → ${pick.h.windowEnd}`, pick.opensIn > 0 ? `opens in ${pick.opensIn}d` : `closed ${pick.closedFor}d ago`],
        connectedDomains: ["plan"],
        financialExposure: null,
        financialConfidence: "unavailable",
        suppressionReason: excluded ? "OPERATIONAL_ONLY" : "NOT_IN_DECISION_WINDOW",
        entity: { type: "plan_initiative", id: pick.i.id, label: pick.i.title },
        inputs: { windowOpensInDays: pick.opensIn > 0 ? pick.opensIn : 999, confidence: "medium", domainsJoined: 1, revenue14dStore: revenue14, engineGate: excluded ? "excluded from the engine by the operator" : "hook window does not contain today" }
      });
    }
    case "market": {
      if (!p.competitors || p.competitors.competitors.length === 0) return noneRow(domain, "NOT_ELIGIBLE", L("אין מתחרים פעילים במעקב", "No active competitors tracked"));
      const withData = p.competitors.competitors.filter((c) => c.change.kind !== "no_data");
      if (withData.length === 0) return noneRow(domain, "NO_CANDIDATE", L("אין נתוני מתחרים השבוע", "No competitor data this week"));
      const best = [...withData].sort((a, b) => (b.current.maxDiscountPct ?? 0) - (a.current.maxDiscountPct ?? 0) || b.current.activePromoCount - a.current.activePromoCount)[0];
      const gate = `change this week: ${best.change.kind} (only opened/deepened promos alert)`;
      return base({
        kind: "competitor_promo",
        title: L(`${best.name} — ${best.current.maxDiscountPct !== null ? `${best.current.maxDiscountPct}% הנחה` : "ללא הנחה"}, ${best.change.summary.he}`, `${best.name} — ${best.current.maxDiscountPct !== null ? `${best.current.maxDiscountPct}% off` : "no discount"}, ${best.change.summary.en}`),
        managementQuestion: L("להגיב למהלך של המתחרה?", "Respond to the competitor's move?"),
        evidenceSummary: [`max discount ${best.current.maxDiscountPct ?? "—"}%`, `active promos ${best.current.activePromoCount}`, `gate: ${gate}`],
        connectedDomains: ["market"],
        financialExposure: null,
        financialConfidence: "unavailable",
        entity: { type: "competitor", id: best.competitorId, label: best.name },
        inputs: { promoLive: best.current.activePromoCount > 0, confidence: "low", domainsJoined: 1, revenue14dStore: revenue14, engineGate: gate }
      });
    }
    case "returns":
      return noneRow(domain, "NO_ENGINE", L("אין מנוע החלטות להחזרות (דוח בלבד)", "No returns decision engine yet (report only)"));
  }
}

// ─── Compose (pure) ───────────────────────────────────────────────────

export function composeRun(input: ComposeInput): ComposedRun {
  const weights = input.weights ?? RANKING_WEIGHTS_V1;
  const revenue14 = input.probes.productEcon.reduce((n, r) => n + r.net14, 0) || null;
  const cardsByKind = new Map<string, number>();
  for (const src of input.ledger) if (input.cardIds.includes(src.decision.id)) cardsByKind.set(src.decision.kind, (cardsByKind.get(src.decision.kind) ?? 0) + 1);

  const raw: DecisionCandidateInput[] = input.ledger.map((src) => ledgerCandidate(src, input.cardIds, input.todayOrder, cardsByKind, revenue14));
  const covered = new Set(raw.map((c) => c.domain));
  for (const domain of CANDIDATE_DOMAINS) if (!covered.has(domain)) raw.push(probe(domain, input.probes, input.now, revenue14));

  const scored = raw.map((c) => {
    const s = scoreCandidate(c, weights);
    return { ...c, ...s, rank: null as number | null, observableRank: null as number | null, crossDomain: (c.inputs.domainsJoined ?? c.connectedDomains.length) >= 2 };
  });
  const candidates: ScoredCandidate[] = rankCandidates(scored);

  const globalTop = candidates.filter((c) => c.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const todayTop = input.cardIds.slice(0, 3);
  const globalTop3 = globalTop.slice(0, 3).map((c) => c.relatedDecisionId ?? `${c.domain}:${c.kind}`);
  const top3Overlap = globalTop3.filter((id) => todayTop.includes(id)).length;
  const topDiffers = todayTop.length > 0 && globalTop3[0] !== todayTop[0];

  return {
    candidates,
    summary: {
      rankingVersion: weights.version,
      priorsVersion: KIND_PRIORS_VERSION,
      weights: weights.weights,
      candidates: candidates.filter((c) => c.kind !== "none").length,
      surfaced: candidates.filter((c) => c.surfaced).length,
      topDiffers,
      top3Overlap
    }
  };
}

// ─── Recorder ─────────────────────────────────────────────────────────

let nextTrigger: CandidateRunSummary["trigger"] = "today";
// The cron route marks its pass so runs are attributable; every other pass
// is a Today load.
export function markNextAuditTrigger(t: CandidateRunSummary["trigger"]): void {
  nextTrigger = t;
}

const MIN_MINUTES_BETWEEN_TODAY_RUNS = 55;

async function discountProbe(storeId: string, now: Date): Promise<ProbeData["discount"]> {
  const db = getDb() as any;
  const d90 = new Date(now.getTime() - 90 * DAY_MS);
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const anyRealCost = ((await db.product.count({ where: { storeId, OR: [{ costOverrideAmount: { not: null } }, { estimatedCost: { gt: 0 } }] } })) as number) > 0;
  if (!anyRealCost) return { worstLoss: null, thinnest: null, anyRealCost: false };
  const rowOf = (r: any): DiscountProbeRow => ({
    productId: String(r.product_id),
    title: String(r.title ?? ""),
    units: Number(r.units ?? 0),
    gross: Number(r.gross ?? 0),
    discounts: Number(r.discounts ?? 0),
    net: Number(r.net ?? 0),
    cogs: Number(r.cogs ?? 0),
    contribution: Number(r.net ?? 0) - Number(r.cogs ?? 0)
  });
  const [loss, thin] = await Promise.all([
    db.$queryRaw`
      SELECT li."productId" AS product_id, MAX(p.title) AS title, SUM(li.quantity)::int AS units,
             SUM(li."lineSubtotal")::float AS gross, SUM(li."lineDiscountAmount")::float AS discounts,
             SUM(li."lineSubtotal" - li."lineDiscountAmount")::float AS net, SUM(li."estimatedCostAmount")::float AS cogs
      FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId" JOIN "Product" p ON p.id = li."productId"
      WHERE li."storeId" = ${storeId} AND o."createdAt" >= ${d90} AND o."cancelledAt" IS NULL AND o."test" = false
        AND (p."costOverrideAmount" IS NOT NULL OR p."estimatedCost" > 0)
      GROUP BY 1 ORDER BY SUM(li."lineSubtotal" - li."lineDiscountAmount") - SUM(li."estimatedCostAmount") ASC LIMIT 1` as Promise<any[]>,
    db.$queryRaw`
      SELECT li."productId" AS product_id, MAX(p.title) AS title, SUM(li.quantity)::int AS units,
             SUM(li."lineSubtotal")::float AS gross, SUM(li."lineDiscountAmount")::float AS discounts,
             SUM(li."lineSubtotal" - li."lineDiscountAmount")::float AS net, SUM(li."estimatedCostAmount")::float AS cogs
      FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId" JOIN "Product" p ON p.id = li."productId"
      WHERE li."storeId" = ${storeId} AND o."createdAt" >= ${d30} AND o."cancelledAt" IS NULL AND o."test" = false
        AND (p."costOverrideAmount" IS NOT NULL OR p."estimatedCost" > 0)
      GROUP BY 1 HAVING SUM(li."lineDiscountAmount") > 0 AND SUM(li."lineSubtotal" - li."lineDiscountAmount") > 0
      ORDER BY SUM(li."lineDiscountAmount") DESC LIMIT 1` as Promise<any[]>
  ]);
  return { worstLoss: loss[0] ? rowOf(loss[0]) : null, thinnest: thin[0] ? rowOf(thin[0]) : null, anyRealCost: true };
}

export interface RecordRunInput {
  storeId: string;
  now: Date;
  ledger: LedgerCandidateSource[];
  cardIds: string[];
  todayOrder: string[];
  productEcon: ProbeData["productEcon"];
  leakage: LeakageSummary | null;
  leakageAllProtected: boolean;
  meta: MetaCampaignsOverview | null;
  plan: PlanView | null;
  silentAlerts: ProbeData["silentAlerts"];
}

export async function recordCandidateRun(input: RecordRunInput): Promise<string | null> {
  const db = getDb() as any;
  const trigger = nextTrigger;
  nextTrigger = "today";
  if (trigger === "today") {
    const last = (await db.decisionCandidateRun.findFirst({ where: { storeId: input.storeId }, orderBy: { runAt: "desc" }, select: { runAt: true } })) as { runAt: Date } | null;
    if (last && input.now.getTime() - last.runAt.getTime() < MIN_MINUTES_BETWEEN_TODAY_RUNS * 60_000) return null;
  }
  const d7 = new Date(input.now.getTime() - 7 * DAY_MS);
  const [discount, competitors] = await Promise.all([
    discountProbe(input.storeId, input.now).catch(() => null),
    buildCompetitorWeekSection({ storeId: input.storeId, start: d7, end: input.now }).catch(() => null)
  ]);
  const composed = composeRun({
    storeId: input.storeId,
    now: input.now,
    ledger: input.ledger,
    cardIds: input.cardIds,
    todayOrder: input.todayOrder,
    probes: { productEcon: input.productEcon, leakage: input.leakage, leakageAllProtected: input.leakageAllProtected, meta: input.meta, plan: input.plan, silentAlerts: input.silentAlerts, discount, competitors }
  });
  const run = await db.decisionCandidateRun.create({
    data: {
      storeId: input.storeId,
      runAt: input.now,
      trigger,
      rankingVersion: composed.summary.rankingVersion,
      priorsVersion: composed.summary.priorsVersion,
      weightsJson: composed.summary.weights,
      candidates: composed.summary.candidates,
      surfaced: composed.summary.surfaced,
      topDiffers: composed.summary.topDiffers,
      top3Overlap: composed.summary.top3Overlap,
      summaryJson: {
        todayTop: input.cardIds,
        globalTop: composed.candidates.filter((c) => c.rank !== null).sort((a, b) => a.rank! - b.rank!).slice(0, 5).map((c) => ({ domain: c.domain, kind: c.kind, title: c.title.en, score: c.globalScore, decisionId: c.relatedDecisionId }))
      }
    },
    select: { id: true }
  });
  await db.decisionCandidate.createMany({
    data: composed.candidates.map((c) => ({
      runId: run.id,
      storeId: input.storeId,
      runAt: input.now,
      domain: c.domain,
      kind: c.kind,
      eligible: c.eligible,
      entityType: c.entity?.type ?? null,
      entityId: c.entity?.id ?? null,
      entityLabel: c.entity?.label ?? null,
      titleJson: c.title,
      detailJson: {
        managementQuestion: c.managementQuestion,
        trigger: c.trigger,
        evidenceSummary: c.evidenceSummary,
        connectedDomains: c.connectedDomains,
        proposedRecommendation: c.proposedRecommendation,
        missingEvidence: c.missingEvidence,
        inputs: c.inputs
      },
      financialExposure: c.financialExposure,
      financialExposureType: c.financialExposureType,
      financialConfidence: c.financialConfidence,
      materiality: c.scores.materiality,
      urgency: c.scores.urgency,
      confidence: c.scores.confidence,
      actionability: c.scores.actionability,
      managementJudgment: c.scores.managementJudgment,
      novelty: c.scores.novelty,
      crossDomainScore: c.scores.crossDomain,
      globalScore: c.globalScore,
      observableScore: c.observableScore,
      rank: c.rank,
      observableRank: c.observableRank,
      todayRank: c.todayRank,
      crossDomain: c.crossDomain,
      proposedStatus: c.proposedStatus,
      surfaced: c.surfaced,
      suppressionReason: c.suppressionReason,
      relatedDecisionId: c.relatedDecisionId
    }))
  });
  return run.id as string;
}

// ─── Report ───────────────────────────────────────────────────────────

export interface DomainAuditStats {
  domain: CandidateDomain;
  runs: number;
  eligibleRuns: number;
  candidates: number; // non-none rows
  surfacedRows: number;
  distinctDecisions: number;
  distinctSurfaced: number;
  conversion: number | null; // distinctSurfaced / distinctDecisions
  avgScore: number | null;
  avgObservableScore: number | null;
  avgRank: number | null;
  avgNovelty: number | null;
  top3Share: number; // share of this domain among rank ≤ 3 rows
  crossDomainRate: number | null;
  topSuppression: Array<{ reason: string; n: number }>;
  feedback: { judged: number; useful: number; obvious: number; wrong: number; missingContext: number; changed: number; highValue: number };
}

export type BiasClass = "NO_EVIDENCE_OF_BIAS" | "GENERATION_BIAS" | "RANKING_BIAS" | "REAL_BUSINESS_CONDITION" | "INCONCLUSIVE";

export interface InventoryBiasDiagnostic {
  candidateShare: number; // % of all candidates generated by Inventory
  top3Share: number; // % of top-3 ranked rows that were Inventory
  surfacedShare: number; // % of surfaced rows that were Inventory
  obviousRate: number | null; // % of judged Inventory decisions marked obvious
  usefulRate: number | null;
  otherDomainsEligibleButNone: number; // eligible runs where a non-inventory domain produced no candidate
  otherDomainsEligibleRuns: number;
  judgedInventory: number;
  judgedOther: number;
  classification: BiasClass;
  because: string;
}

export interface CandidateAuditReport {
  storeId: string;
  since: string;
  until: string;
  runs: number;
  rankingVersions: string[];
  disagreement: { topDiffersRate: number | null; avgTop3Overlap: number | null };
  domains: DomainAuditStats[];
  topSuppression: Array<{ reason: string; n: number }>;
  inventory: InventoryBiasDiagnostic;
  latest: {
    runAt: string;
    trigger: string;
    rows: Array<ScoredCandidate & { id: string }>;
    explanations: Array<{ title: string; domain: CandidateDomain; strengths: string[]; outranked: ReturnType<typeof explainRank>["outranked"] }>;
    ablation: { exclude: CandidateDomain[]; rows: Array<{ rank: number; domain: CandidateDomain; title: string; score: number }> } | null;
  } | null;
}

type StoredRow = {
  id: string;
  runId: string;
  runAt: Date;
  domain: string;
  kind: string;
  eligible: boolean;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  titleJson: Localized;
  detailJson: Record<string, unknown>;
  financialExposure: unknown;
  financialExposureType: string | null;
  financialConfidence: string;
  materiality: number;
  urgency: number;
  confidence: number;
  actionability: number;
  managementJudgment: number;
  novelty: number;
  crossDomainScore: number;
  globalScore: unknown;
  observableScore: unknown;
  rank: number | null;
  observableRank: number | null;
  todayRank: number | null;
  crossDomain: boolean;
  proposedStatus: string | null;
  surfaced: boolean;
  suppressionReason: string | null;
  relatedDecisionId: string | null;
};

function toScored(r: StoredRow): ScoredCandidate & { id: string } {
  const d = r.detailJson ?? {};
  return {
    id: r.id,
    domain: r.domain as CandidateDomain,
    kind: r.kind,
    title: r.titleJson,
    managementQuestion: (d.managementQuestion as Localized | null) ?? null,
    trigger: (d.trigger as Localized | null) ?? null,
    evidenceSummary: (d.evidenceSummary as string[]) ?? [],
    connectedDomains: (d.connectedDomains as string[]) ?? [],
    financialExposure: num(r.financialExposure),
    financialExposureType: r.financialExposureType,
    financialConfidence: r.financialConfidence as DecisionCandidateInput["financialConfidence"],
    proposedStatus: r.proposedStatus,
    proposedRecommendation: (d.proposedRecommendation as Localized | null) ?? null,
    missingEvidence: (d.missingEvidence as string[]) ?? [],
    entity: r.entityType ? { type: r.entityType, id: r.entityId, label: r.entityLabel ?? "" } : null,
    inputs: (d.inputs as DecisionCandidateInput["inputs"]) ?? {},
    relatedDecisionId: r.relatedDecisionId,
    surfaced: r.surfaced,
    todayRank: r.todayRank,
    suppressionReason: r.suppressionReason as SuppressionReason | null,
    eligible: r.eligible,
    scores: { materiality: r.materiality, urgency: r.urgency, confidence: r.confidence, actionability: r.actionability, managementJudgment: r.managementJudgment, novelty: r.novelty, crossDomain: r.crossDomainScore },
    globalScore: num(r.globalScore) ?? 0,
    observableScore: num(r.observableScore) ?? 0,
    rank: r.rank,
    observableRank: r.observableRank,
    crossDomain: r.crossDomain
  };
}

const MIN_JUDGED_FOR_CLASSIFICATION = 5;

export function classifyInventoryBias(d: Omit<InventoryBiasDiagnostic, "classification" | "because">): { classification: BiasClass; because: string } {
  const enoughFeedback = d.judgedInventory >= MIN_JUDGED_FOR_CLASSIFICATION && d.judgedOther >= MIN_JUDGED_FOR_CLASSIFICATION;
  const othersSilent = d.otherDomainsEligibleRuns > 0 ? d.otherDomainsEligibleButNone / d.otherDomainsEligibleRuns : 0;
  if (d.top3Share <= 40) return { classification: "NO_EVIDENCE_OF_BIAS", because: `Inventory holds ${d.top3Share.toFixed(0)}% of top-3 ranks.` };
  if (othersSilent >= 0.6 && d.candidateShare >= 50) {
    return { classification: "GENERATION_BIAS", because: `Other domains were eligible but produced no candidate in ${(othersSilent * 100).toFixed(0)}% of runs; Inventory supplied ${d.candidateShare.toFixed(0)}% of candidates.` };
  }
  if (!enoughFeedback) return { classification: "INCONCLUSIVE", because: `Inventory dominates the ranking (${d.top3Share.toFixed(0)}% of top-3) but feedback is thin: ${d.judgedInventory} judged inventory, ${d.judgedOther} judged other (need ${MIN_JUDGED_FOR_CLASSIFICATION} each).` };
  if ((d.obviousRate ?? 0) >= 50 && (d.usefulRate ?? 0) < 40) {
    return { classification: "RANKING_BIAS", because: `Inventory wins ${d.top3Share.toFixed(0)}% of top-3 ranks while managers mark ${d.obviousRate?.toFixed(0)}% obvious and ${d.usefulRate?.toFixed(0)}% useful.` };
  }
  if ((d.usefulRate ?? 0) >= 50) return { classification: "REAL_BUSINESS_CONDITION", because: `Inventory wins ${d.top3Share.toFixed(0)}% of top-3 ranks and ${d.usefulRate?.toFixed(0)}% of judged inventory decisions were useful.` };
  return { classification: "INCONCLUSIVE", because: "Ranking share is high but feedback does not point one way." };
}

export async function buildCandidateAuditReport(storeId: string, days = 14, exclude: CandidateDomain[] = []): Promise<CandidateAuditReport> {
  const db = getDb() as any;
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);
  const runs = (await db.decisionCandidateRun.findMany({ where: { storeId, runAt: { gte: since } }, orderBy: { runAt: "desc" }, select: { id: true, runAt: true, trigger: true, rankingVersion: true, topDiffers: true, top3Overlap: true } })) as Array<{
    id: string;
    runAt: Date;
    trigger: string;
    rankingVersion: string;
    topDiffers: boolean;
    top3Overlap: number;
  }>;
  const rows = (await db.decisionCandidate.findMany({ where: { storeId, runAt: { gte: since } } })) as StoredRow[];

  // Feedback join: one judgment per decision, regardless of how many runs saw it.
  const decisionIds = [...new Set(rows.map((r) => r.relatedDecisionId).filter(Boolean) as string[])];
  const alerts = decisionIds.length ? ((await db.alert.findMany({ where: { id: { in: decisionIds } }, select: { id: true, payloadJson: true } })) as Array<{ id: string; payloadJson: Record<string, unknown> | null }>) : [];
  const judgmentOf = new Map<string, { tags: JudgmentTag[]; changed: boolean | null }>();
  for (const a of alerts) {
    const j = (a.payloadJson?.judgment as { tags?: JudgmentTag[]; changedDecision?: boolean | null } | undefined) ?? null;
    if (j && Array.isArray(j.tags)) judgmentOf.set(a.id, { tags: j.tags, changed: j.changedDecision ?? null });
  }

  const nonNone = rows.filter((r) => r.kind !== "none");
  const top3Rows = nonNone.filter((r) => r.rank !== null && r.rank <= 3);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

  const domains: DomainAuditStats[] = CANDIDATE_DOMAINS.map((domain) => {
    const all = rows.filter((r) => r.domain === domain);
    const cands = all.filter((r) => r.kind !== "none");
    const distinct = new Map<string, { surfaced: boolean }>();
    for (const r of cands) {
      const key = r.relatedDecisionId ?? `${r.kind}:${r.entityId ?? r.titleJson.en}`;
      const cur = distinct.get(key);
      distinct.set(key, { surfaced: (cur?.surfaced ?? false) || r.surfaced });
    }
    const distinctSurfaced = [...distinct.values()].filter((v) => v.surfaced).length;
    const suppression = new Map<string, number>();
    for (const r of all) if (!r.surfaced && r.suppressionReason) suppression.set(r.suppressionReason, (suppression.get(r.suppressionReason) ?? 0) + 1);
    const judgedIds = [...new Set(cands.map((r) => r.relatedDecisionId).filter(Boolean) as string[])].filter((id) => judgmentOf.has(id));
    const fb = { judged: judgedIds.length, useful: 0, obvious: 0, wrong: 0, missingContext: 0, changed: 0, highValue: 0 };
    for (const id of judgedIds) {
      const j = judgmentOf.get(id)!;
      if (j.tags.includes("useful")) fb.useful += 1;
      if (j.tags.includes("obvious")) fb.obvious += 1;
      if (j.tags.includes("wrong")) fb.wrong += 1;
      if (j.tags.includes("missing_context")) fb.missingContext += 1;
      if (j.changed === true) fb.changed += 1;
      if (j.tags.includes("useful") && !j.tags.includes("obvious")) fb.highValue += 1;
    }
    return {
      domain,
      runs: new Set(all.map((r) => r.runId)).size,
      eligibleRuns: new Set(all.filter((r) => r.eligible).map((r) => r.runId)).size,
      candidates: cands.length,
      surfacedRows: cands.filter((r) => r.surfaced).length,
      distinctDecisions: distinct.size,
      distinctSurfaced,
      conversion: distinct.size ? Math.round((distinctSurfaced / distinct.size) * 100) : null,
      avgScore: avg(cands.map((r) => num(r.globalScore) ?? 0)),
      avgObservableScore: avg(cands.map((r) => num(r.observableScore) ?? 0)),
      avgRank: avg(cands.filter((r) => r.rank !== null).map((r) => r.rank as number)),
      avgNovelty: avg(cands.map((r) => r.novelty)),
      top3Share: top3Rows.length ? Math.round((top3Rows.filter((r) => r.domain === domain).length / top3Rows.length) * 100) : 0,
      crossDomainRate: cands.length ? Math.round((cands.filter((r) => r.crossDomain).length / cands.length) * 100) : null,
      topSuppression: [...suppression.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, n]) => ({ reason, n })),
      feedback: fb
    };
  });

  const inv = domains.find((d) => d.domain === "inventory")!;
  const otherEligible = rows.filter((r) => r.domain !== "inventory" && r.domain !== "returns" && r.eligible);
  const diagBase = {
    candidateShare: nonNone.length ? Math.round((nonNone.filter((r) => r.domain === "inventory").length / nonNone.length) * 100) : 0,
    top3Share: inv.top3Share,
    surfacedShare: nonNone.filter((r) => r.surfaced).length ? Math.round((nonNone.filter((r) => r.surfaced && r.domain === "inventory").length / nonNone.filter((r) => r.surfaced).length) * 100) : 0,
    obviousRate: inv.feedback.judged ? Math.round((inv.feedback.obvious / inv.feedback.judged) * 100) : null,
    usefulRate: inv.feedback.judged ? Math.round((inv.feedback.useful / inv.feedback.judged) * 100) : null,
    otherDomainsEligibleButNone: otherEligible.filter((r) => r.kind === "none").length,
    otherDomainsEligibleRuns: otherEligible.length,
    judgedInventory: inv.feedback.judged,
    judgedOther: domains.filter((d) => d.domain !== "inventory").reduce((n, d) => n + d.feedback.judged, 0)
  };
  const suppressionAll = new Map<string, number>();
  for (const r of rows) if (!r.surfaced && r.suppressionReason) suppressionAll.set(r.suppressionReason, (suppressionAll.get(r.suppressionReason) ?? 0) + 1);

  let latest: CandidateAuditReport["latest"] = null;
  if (runs[0]) {
    const latestRows = rows.filter((r) => r.runId === runs[0].id).map(toScored).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    const ranked = latestRows.filter((r) => r.rank !== null);
    const explanations = latestRows
      .filter((r) => r.surfaced)
      .map((r) => {
        const x = explainRank(r, ranked.filter((o) => o.id !== r.id && (o.rank ?? 0) > (r.rank ?? 0)).slice(0, 4), "en");
        return { title: r.title.en, domain: r.domain, strengths: x.strengths, outranked: x.outranked };
      });
    const ablation = exclude.length
      ? {
          exclude,
          rows: rankCandidates(latestRows, exclude)
            .filter((r) => r.rank !== null)
            .sort((a, b) => a.rank! - b.rank!)
            .map((r) => ({ rank: r.rank!, domain: r.domain, title: r.title.en, score: r.globalScore }))
        }
      : null;
    latest = { runAt: runs[0].runAt.toISOString(), trigger: runs[0].trigger, rows: latestRows, explanations, ablation };
  }

  return {
    storeId,
    since: since.toISOString(),
    until: now.toISOString(),
    runs: runs.length,
    rankingVersions: [...new Set(runs.map((r) => r.rankingVersion))],
    disagreement: {
      topDiffersRate: runs.length ? Math.round((runs.filter((r) => r.topDiffers).length / runs.length) * 100) : null,
      avgTop3Overlap: avg(runs.map((r) => r.top3Overlap))
    },
    domains,
    topSuppression: [...suppressionAll.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([reason, n]) => ({ reason, n })),
    inventory: { ...diagBase, ...classifyInventoryBias(diagBase) },
    latest
  };
}

export const __testing = { probe, ledgerCandidate };
export type { ScoreDimension };
