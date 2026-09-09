// Plan brief composer — Commercial Initiatives → what a reader needs → PDF.
//
// `composePlanBrief` is pure (tested): it takes the Plan view, the rows' full
// text and the options, and returns the brief. `buildPlanBrief` loads the
// inputs. The old exports filtered raw Gantt cells by role; these read the
// same initiatives the Plan page and Today read (owner, 9 Sep 2026: "Generate
// PDFs from Commercial Initiatives, not from raw Gantt tasks").

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { buildPlanView } from "@/lib/services/plan-service";
import { listSheetSyncs } from "@/lib/services/google-sheets-service";
import { displayDecisionId, type Localized } from "@/lib/domain/decision";
import type { ExecutionAction, Initiative, PlanView } from "@/lib/domain/plan";
import {
  BRIEF_ROLE_ORDER,
  parseBriefRole,
  type BriefAction,
  type BriefDecision,
  type BriefInitiative,
  type BriefRole,
  type PlanBrief,
  type PlanBriefKind,
  type PlanChange
} from "@/lib/domain/plan-brief";

const L = (he: string, en: string): Localized => ({ he, en });

// Same labels + links the Plan page offers on each execution, made absolute
// so they work from a PDF. Kept in step with buildActionMeta (gantt-studio).
const ACTION_LABEL: Record<string, Localized> = {
  discount_code: L("קופון / הנחה", "Coupon / discount"),
  creative_image: L("תמונה", "Image"),
  creative_banner: L("באנר", "Banner"),
  creative_video: L("וידאו", "Video"),
  social_post: L("פוסט / סטורי", "Post / story"),
  email_campaign: L("אימייל / ניוזלטר", "Email / newsletter"),
  sms_campaign: L("SMS", "SMS"),
  web_update: L("עדכון אתר", "Website update"),
  blog_post: L("מאמר / בלוג", "Blog post")
};

export function actionHref(actionType: string | null, prompt: string, baseUrl: string): string | null {
  const p = encodeURIComponent(prompt.slice(0, 280));
  const t = encodeURIComponent(prompt.slice(0, 80));
  const path: Record<string, string> = {
    discount_code: `/marketing-tools?action=discount&title=${t}`,
    creative_image: `/creative/new?type=PACKSHOT&prompt=${p}`,
    creative_banner: `/creative/new?type=META_AD&prompt=${p}`,
    creative_video: `/creative/new?type=UGC_VIDEO&prompt=${p}`,
    social_post: `/creative/new?type=INSTAGRAM_POST&prompt=${p}`,
    email_campaign: `/marketing-tools?action=email&title=${t}`,
    sms_campaign: `/marketing-tools?action=sms&title=${t}`
  };
  const rel = actionType ? path[actionType] : undefined;
  return rel ? `${baseUrl}${rel}` : null;
}

export interface ComposeOptions {
  kind: PlanBriefKind;
  role: BriefRole | null; // required when kind = "role"
  month: string | null; // YYYY-MM; null = the plan's whole range
  brandName: string;
  baseUrl: string; // public app URL for links
  // Full cell text by row id (the Plan view keeps only the first line).
  rowText: Map<string, string>;
  changes?: PlanChange[];
  now?: Date;
}

function overlapsMonth(i: { start: string; end: string }, month: string | null): boolean {
  return !month || (i.start.slice(0, 7) <= month && i.end.slice(0, 7) >= month);
}

function ownerOf(e: ExecutionAction): BriefRole | null {
  return parseBriefRole(e.role);
}

function toAction(e: ExecutionAction, initiative: Initiative, o: ComposeOptions): BriefAction {
  const full = (o.rowText.get(e.rowId) ?? e.text).trim();
  const brief = [initiative.title, initiative.offer.discountPct !== null ? `${initiative.offer.discountPct}%` : null, initiative.offer.couponCode, `${initiative.start}${initiative.end !== initiative.start ? ` → ${initiative.end}` : ""}`, e.channel]
    .filter(Boolean)
    .join(" · ");
  return {
    rowId: e.rowId,
    text: full,
    channel: e.channel,
    role: ownerOf(e),
    actionType: e.actionType,
    actionLabel: e.actionType ? (ACTION_LABEL[e.actionType] ?? null) : null,
    start: e.start,
    end: e.end,
    state: e.state,
    href: actionHref(e.actionType, `${brief}\n${full}`, o.baseUrl)
  };
}

function decisionOf(i: Initiative, o: ComposeOptions): BriefDecision | null {
  const hook = i.decisionHooks[0];
  if (!hook) return null;
  const related = i.relatedDecisions.find((r) => r.hookId === hook.id) ?? i.relatedDecisions[0] ?? null;
  const base = { question: hook.question, sourceText: hook.sourceText, due: hook.windowStart };
  if (!related) {
    return { ...base, state: "upcoming", id: null, displayId: null, todayUrl: null };
  }
  const state = related.state === "open" ? "pending" : related.choice === "expired" ? "expired" : "resolved";
  return {
    ...base,
    state,
    id: related.id,
    displayId: displayDecisionId(related.id),
    due: related.state === "open" ? hook.windowEnd : (related.decidedAt?.slice(0, 10) ?? hook.windowEnd),
    todayUrl: `${o.baseUrl}/today?open=${encodeURIComponent(related.id)}`
  };
}

function customerServiceRelevant(i: Initiative): boolean {
  return i.offer.discountPct !== null || i.offer.couponCode !== null || i.anchor.kind === "launch" || i.anchor.kind === "event" || i.anchor.kind === "coupon";
}

function couponNotes(initiatives: Initiative[]): Map<string, Localized[]> {
  const byCode = new Map<string, Initiative[]>();
  for (const i of initiatives) {
    const code = i.offer.couponCode?.trim().toUpperCase();
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), i]);
  }
  const notes = new Map<string, Localized[]>();
  for (const [code, list] of byCode) {
    if (list.length < 2) continue;
    for (const i of list) {
      const others = list.filter((x) => x.id !== i.id).map((x) => x.title).join(", ");
      notes.set(i.id, [...(notes.get(i.id) ?? []), L(`הקוד ${code} משמש גם במהלך: ${others} — לוודא שזה מכוון.`, `Code ${code} is also used by: ${others} — confirm this is intended.`)]);
    }
  }
  return notes;
}

export function composePlanBrief(plan: PlanView, o: ComposeOptions): PlanBrief {
  const month = o.month ?? (plan.today >= (plan.rangeStart ?? "") && plan.today <= (plan.rangeEnd ?? "") ? plan.today.slice(0, 7) : (plan.rangeStart ?? plan.today).slice(0, 7));
  const role = o.kind === "role" ? o.role : null;
  const inMonth = plan.initiatives.filter((i) => overlapsMonth(i, month));
  const moves = inMonth.filter((i) => i.kind === "move");
  const notesById = couponNotes(moves);

  const initiatives: BriefInitiative[] = [];
  for (const i of moves) {
    const all = i.executions.map((e) => toAction(e, i, o)).sort((a, b) => a.start.localeCompare(b.start));
    let groups: BriefInitiative["actionsByRole"];
    if (role === "customer_service") {
      if (!customerServiceRelevant(i)) continue;
      groups = [];
    } else if (role) {
      const mine = all.filter((a) => a.role === role);
      if (mine.length === 0) continue;
      groups = [{ role, actions: mine }];
    } else {
      const byRole = new Map<BriefRole | null, BriefAction[]>();
      for (const a of all) byRole.set(a.role, [...(byRole.get(a.role) ?? []), a]);
      groups = [...byRole.entries()].sort((a, b) => (a[0] ? BRIEF_ROLE_ORDER.indexOf(a[0]) : 99) - (b[0] ? BRIEF_ROLE_ORDER.indexOf(b[0]) : 99)).map(([r, actions]) => ({ role: r, actions }));
    }
    const owners = [...new Set(all.map((a) => a.role).filter(Boolean) as BriefRole[])].sort((a, b) => BRIEF_ROLE_ORDER.indexOf(a) - BRIEF_ROLE_ORDER.indexOf(b));
    const myOpen = groups.flatMap((g) => g.actions).filter((a) => a.state === "open");
    initiatives.push({
      id: i.id,
      kind: i.kind,
      title: i.title,
      start: i.start,
      end: i.end,
      status: i.status,
      offer: i.offer,
      channels: i.channels,
      owners,
      products: i.products.map((p) => p.title),
      dependencies: i.dependencies,
      decision: decisionOf(i, o),
      notes: notesById.get(i.id) ?? [],
      actionsByRole: groups,
      firstDue: role ? (myOpen.map((a) => a.start).sort()[0] ?? null) : null
    });
  }

  // Standalone (unattached) channel actions: the email team's 17/19/22 sends
  // are real work even when no move claims them.
  const standalone = inMonth
    .filter((i) => i.kind === "unattached")
    .flatMap((i) => i.executions.map((e) => toAction(e, i, o)))
    .filter((a) => (role === "customer_service" ? false : role ? a.role === role : true))
    .sort((a, b) => a.start.localeCompare(b.start));

  const actions = initiatives.reduce((n, i) => n + i.actionsByRole.reduce((m, g) => m + g.actions.length, 0), 0) + standalone.length;
  return {
    kind: o.kind,
    role,
    sheetId: plan.sheetId,
    sheetTitle: plan.title,
    brandName: o.brandName,
    month,
    header: {
      initiatives: initiatives.length,
      actions,
      blocked: initiatives.filter((i) => i.status === "blocked").length,
      decisionsPending: initiatives.filter((i) => i.decision && (i.decision.state === "pending" || i.decision.state === "upcoming")).length,
      live: initiatives.filter((i) => i.status === "live").length,
      ready: initiatives.filter((i) => i.status === "ready").length
    },
    initiatives,
    standalone,
    changes: o.kind === "commercial" ? (o.changes ?? []) : [],
    generatedAt: (o.now ?? new Date()).toISOString()
  };
}

interface SyncRow {
  syncedAt: Date;
  added: number;
  removed: number;
  changed: number;
  detailsJson: unknown;
}

function changeLines(details: unknown, max = 8): string[] {
  const d = (details ?? {}) as { added?: Array<{ task?: string; date?: string }>; removed?: Array<{ task?: string; date?: string }>; changed?: Array<{ task?: string; field?: string; from?: string; to?: string }> };
  const lines: string[] = [];
  for (const a of d.added ?? []) lines.push(`+ ${a.date ?? ""} ${String(a.task ?? "").slice(0, 80)}`.trim());
  for (const r of d.removed ?? []) lines.push(`− ${r.date ?? ""} ${String(r.task ?? "").slice(0, 80)}`.trim());
  for (const c of d.changed ?? []) lines.push(`~ ${String(c.task ?? "").slice(0, 60)}: ${c.field ?? ""} ${c.from ?? ""} → ${c.to ?? ""}`.trim());
  return lines.slice(0, max);
}

export async function buildPlanBrief(
  storeId: string,
  sheetId: string,
  opts: { kind: PlanBriefKind; role: BriefRole | null; month: string | null; baseUrl: string; now?: Date }
): Promise<PlanBrief> {
  if (opts.kind === "role" && !opts.role) throw new AppError("Role brief needs a role.", 400);
  const db = getDb() as any;
  const [plan, sheet] = await Promise.all([
    buildPlanView(storeId, sheetId, opts.now),
    db.ganttSheet.findFirst({ where: { id: sheetId, storeId }, select: { rows: { select: { id: true, task: true } }, store: { select: { name: true } } } }) as Promise<{
      rows: Array<{ id: string; task: string }>;
      store: { name: string } | null;
    } | null>
  ]);
  if (!sheet) throw new AppError("Sheet not found.", 404);
  const changes: PlanChange[] =
    opts.kind === "commercial"
      ? ((await listSheetSyncs(sheetId, storeId, 5).catch(() => [])) as SyncRow[]).map((s) => ({
          syncedAt: s.syncedAt.toISOString(),
          added: s.added,
          removed: s.removed,
          changed: s.changed,
          lines: changeLines(s.detailsJson)
        }))
      : [];
  return composePlanBrief(plan, {
    kind: opts.kind,
    role: opts.role,
    month: opts.month,
    brandName: sheet.store?.name ?? "",
    baseUrl: opts.baseUrl,
    rowText: new Map(sheet.rows.map((r) => [r.id, r.task])),
    changes,
    now: opts.now
  });
}

// Roles that actually appear in a plan (for the export buttons).
export function rolesInPlan(plan: PlanView): BriefRole[] {
  const present = new Set<BriefRole>();
  for (const i of plan.initiatives) for (const e of i.executions) {
    const r = parseBriefRole(e.role);
    if (r) present.add(r);
  }
  return BRIEF_ROLE_ORDER.filter((r) => present.has(r) || r === "customer_service");
}
