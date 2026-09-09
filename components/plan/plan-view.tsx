"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { INITIATIVE_STATUS_LABEL, INITIATIVE_STATUS_ORDER, emptyStatusCounts, type Initiative, type InitiativeStatus, type PlanView as PlanViewData } from "@/lib/domain/plan";
import { displayDecisionId } from "@/lib/domain/decision";

type Locale = "he" | "en";

// Status is the visual system. Category/channel is a small label.
const STATUS_DOT: Record<InitiativeStatus, string> = {
  planned: "bg-muted-foreground/40",
  ready: "bg-success",
  watch: "bg-warning",
  needs_decision: "bg-warning",
  blocked: "bg-danger",
  live: "bg-primary",
  review: "bg-warning",
  completed: "bg-border"
};
const STATUS_TEXT: Record<InitiativeStatus, string> = {
  planned: "text-muted-foreground",
  ready: "text-success",
  watch: "text-warning",
  needs_decision: "text-warning",
  blocked: "text-danger",
  live: "text-primary",
  review: "text-warning",
  completed: "text-muted-foreground"
};

const DOW_HE = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDay(iso: string, locale: Locale, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", { timeZone: "UTC", ...opts });
}
function addDays(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / 86_400_000);
}
function range(i: { start: string; end: string; days: number }, locale: Locale): string {
  return i.days === 1 ? fmtDay(i.start, locale, { day: "numeric", month: "short" }) : `${fmtDay(i.start, locale, { day: "numeric", month: "short" })} – ${fmtDay(i.end, locale, { day: "numeric", month: "short" })}`;
}

export interface RowAction {
  label: string;
  ctaLabel: string;
  href: string;
}

export type RowActionFor = (rowId: string, actionType: string | null, context: string | null) => RowAction | null;

export function PlanView({
  sheetId,
  locale,
  refreshKey,
  rowActionFor,
  onExecuteRow,
  executingRowId,
  onGroupingChanged,
  onPlanLoaded
}: {
  sheetId: string;
  locale: Locale;
  refreshKey: number;
  rowActionFor: RowActionFor;
  onExecuteRow: (rowId: string) => void;
  executingRowId: string | null;
  // The operator corrected the grouping — host bumps refreshKey.
  onGroupingChanged?: () => void;
  // The plan (and the team briefs available for it) after each load.
  onPlanLoaded?: (plan: PlanViewData, roles: string[]) => void;
}) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [plan, setPlan] = useState<PlanViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<"agenda" | "month">("agenda");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/gantt/${sheetId}/plan`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (!body.ok) throw new Error(body.error || "plan failed");
        const p = body.plan as PlanViewData;
        setPlan(p);
        onPlanLoaded?.(p, Array.isArray(body.roles) ? (body.roles as string[]) : []);
        setMonth((m) => m ?? (p.today >= (p.rangeStart ?? "") && p.today <= (p.rangeEnd ?? "") ? p.today.slice(0, 7) : (p.rangeStart ?? p.today).slice(0, 7)));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [sheetId, refreshKey]);

  const byId = useMemo(() => new Map((plan?.initiatives ?? []).map((i) => [i.id, i])), [plan]);
  const dayMap = useMemo(() => new Map((plan?.days ?? []).map((d) => [d.date, d])), [plan]);
  const monthDays = useMemo(() => {
    if (!month) return [];
    const out: string[] = [];
    for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);
  const shiftMonth = (n: number) => {
    if (!month) return;
    const d = new Date(`${month}-01T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const close = useCallback(() => setOpenDay(null), []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!plan || !month) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t("הילומי בודקת את התוכנית מול הנתונים…", "Hiloomy is checking the plan against the data…")}
      </div>
    );
  }

  const monthLabel = fmtDay(`${month}-01`, locale, { month: "long", year: "numeric" });
  const inMonth = plan.initiatives.filter((i) => i.start.slice(0, 7) <= month && i.end.slice(0, 7) >= month);
  const movesInMonth = inMonth.filter((i) => i.kind === "move");
  const unattachedInMonth = inMonth.length - movesInMonth.length;
  const c = emptyStatusCounts();
  for (const i of movesInMonth) c[i.status] += 1;
  const execInMonth = inMonth.reduce((n, i) => n + i.executions.filter((e) => e.start.slice(0, 7) <= month && e.end.slice(0, 7) >= month).length, 0);
  const weekDays = Array.from({ length: 7 }, (_, k) => addDays(plan.today, k));
  const chip = (s: InitiativeStatus, n: number) =>
    n > 0 ? (
      <span key={s} className={cn("inline-flex items-center gap-1.5 text-sm", STATUS_TEXT[s], (s === "needs_decision" || s === "blocked") && "font-semibold")}>
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s])} />
        {n} {INITIATIVE_STATUS_LABEL[s][locale]}
      </span>
    ) : null;

  return (
    <div className="space-y-6">
      {/* ── Month header ─────────────────────────────────────────── */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftMonth(-1)} className="rounded-md border border-border p-2 hover:bg-accent" aria-label={t("חודש קודם", "Previous month")}>
              <ChevronRight className="h-4 w-4 ltr:hidden" aria-hidden />
              <ChevronLeft className="h-4 w-4 rtl:hidden" aria-hidden />
            </button>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{monthLabel}</h2>
            <button type="button" onClick={() => shiftMonth(1)} className="rounded-md border border-border p-2 hover:bg-accent" aria-label={t("חודש הבא", "Next month")}>
              <ChevronLeft className="h-4 w-4 ltr:hidden" aria-hidden />
              <ChevronRight className="h-4 w-4 rtl:hidden" aria-hidden />
            </button>
            <button type="button" onClick={() => setMonth(plan.today.slice(0, 7))} className="ms-1 rounded-md border border-border px-3 py-1.5 text-sm font-semibold hover:bg-accent">
              {t("היום", "Today")}
            </button>
          </div>
          <div className="flex items-center gap-1 lg:hidden">
            <button type="button" onClick={() => setMobileMode("agenda")} className={cn("rounded-md px-3 py-1.5 text-sm", mobileMode === "agenda" ? "bg-accent font-semibold" : "text-muted-foreground")}>
              {t("השבוע", "This week")}
            </button>
            <button type="button" onClick={() => setMobileMode("month")} className={cn("rounded-md px-3 py-1.5 text-sm", mobileMode === "month" ? "bg-accent font-semibold" : "text-muted-foreground")}>
              {t("חודש", "Month")}
            </button>
          </div>
        </div>
        <p className="text-base font-semibold">
          {t(`${movesInMonth.length} מהלכים מסחריים · ${execInMonth} פעולות ביצוע`, `${movesInMonth.length} commercial initiatives · ${execInMonth} execution actions`)}
          {unattachedInMonth > 0 ? <span className="text-sm font-normal text-muted-foreground"> · {t(`${unattachedInMonth} פעולות ללא מהלך`, `${unattachedInMonth} actions without a move`)}</span> : null}
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">{INITIATIVE_STATUS_ORDER.map((s) => chip(s, c[s]))}</p>
      </header>

      {/* ── Decisions affecting the plan (they live on Today) ────── */}
      {plan.decisionsPending.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-base font-semibold">
            {plan.decisionsPending.length === 1 ? t("החלטה אחת משפיעה על התוכנית", "1 decision affecting your plan") : t(`${plan.decisionsPending.length} החלטות משפיעות על התוכנית`, `${plan.decisionsPending.length} decisions affecting your plan`)}
          </h3>
          <ul className="divide-y divide-border border-y border-border">
            {plan.decisionsPending.map((d) => (
              <li key={d.decisionId} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{d.initiativeTitle}</p>
                  <p className="text-sm text-muted-foreground">{d.question[locale]}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("לקבל החלטה עד", "Decision due")} {fmtDay(d.due, locale, { day: "numeric", month: "short" })}
                  </p>
                </div>
                <Link href={`/today?open=${d.decisionId}` as never} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:h-9">
                  {t("לפתוח בהיום", "Open in Today")}
                  <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Coming up ────────────────────────────────────────────── */}
      {plan.upcoming.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-base font-semibold">{t("בקרוב", "Coming up")}</h3>
          <ul className="divide-y divide-border border-y border-border">
            {plan.upcoming.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => setOpenDay(i.start)} className="flex w-full items-start justify-between gap-4 py-3 text-start">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {relativeDay(plan.today, i.start, locale)} · {range(i, locale)}
                    </p>
                    <p className="line-clamp-2 text-sm font-semibold">{i.title}</p>
                    {i.channels.length > 0 ? <p className="text-xs text-muted-foreground">{i.channels.join(" · ")}</p> : null}
                  </div>
                  <StatusTag status={i.status} locale={locale} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Phone agenda ─────────────────────────────────────────── */}
      <section className={cn("space-y-1 lg:hidden", mobileMode !== "agenda" && "hidden")}>
        <h3 className="text-base font-semibold">{t("השבוע", "This week")}</h3>
        <ul className="divide-y divide-border border-y border-border">
          {weekDays.map((d) => {
            const day = dayMap.get(d);
            const ids = day?.initiativeIds ?? [];
            const items = ids.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => INITIATIVE_STATUS_ORDER.indexOf(a.status) - INITIATIVE_STATUS_ORDER.indexOf(b.status));
            return (
              <li key={d}>
                <button type="button" onClick={() => ids.length > 0 && setOpenDay(d)} className="flex min-h-11 w-full items-start justify-between gap-4 py-2 text-start" disabled={ids.length === 0}>
                  <span className={cn("shrink-0 text-sm", d === plan.today && "font-semibold")}>{fmtDay(d, locale, { weekday: "short", day: "numeric" })}</span>
                  <span className="min-w-0 flex-1 text-end">
                    {items.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      items.slice(0, 3).map((i) => (
                        <span key={i.id} className="block truncate text-sm">
                          {i.title} <span className={cn("text-xs font-semibold uppercase", STATUS_TEXT[i.status])}>{INITIATIVE_STATUS_LABEL[i.status][locale]}</span>
                        </span>
                      ))
                    )}
                    {items.length > 3 ? <span className="block text-xs text-muted-foreground">+{items.length - 3}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Month grid: initiatives, not every execution ─────────── */}
      <section className={cn("space-y-2", mobileMode !== "month" && "hidden lg:block")}>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
          {(isHe ? DOW_HE : DOW_EN).map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: new Date(`${monthDays[0]}T00:00:00.000Z`).getUTCDay() }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {monthDays.map((d) => {
            const day = dayMap.get(d);
            const ids = day?.initiativeIds ?? [];
            const items = ids.map((id) => byId.get(id)!).filter(Boolean).filter((i) => i.kind === "move").sort((a, b) => INITIATIVE_STATUS_ORDER.indexOf(a.status) - INITIATIVE_STATUS_ORDER.indexOf(b.status));
            const decisions = day?.byStatus.needs_decision ?? 0;
            const blocked = day?.byStatus.blocked ?? 0;
            const isToday = d === plan.today;
            const inRange = plan.rangeStart && plan.rangeEnd ? d >= plan.rangeStart && d <= plan.rangeEnd : false;
            return (
              <button
                key={d}
                type="button"
                onClick={() => ids.length > 0 && setOpenDay(d)}
                disabled={ids.length === 0}
                className={cn(
                  "flex min-h-[5.5rem] flex-col rounded-md border p-1.5 text-start",
                  decisions > 0 ? "border-warning/60 bg-warning/5" : blocked > 0 ? "border-danger/50 bg-danger/5" : ids.length > 0 ? "border-border bg-card hover:bg-accent" : inRange ? "border-border/60 bg-muted/20" : "border-transparent",
                  isToday && "ring-2 ring-primary/40"
                )}
              >
                <span className={cn("text-xs", isToday ? "font-bold" : "font-medium", !inRange && "text-muted-foreground/60")}>{Number(d.slice(8, 10))}</span>
                {items.slice(0, 2).map((i) => (
                  <span key={i.id} className="mt-1 flex items-center gap-1 text-[11px] leading-4">
                    <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[i.status])} />
                    <span className="truncate">{i.title}</span>
                  </span>
                ))}
                {items.length > 2 ? <span className="text-[11px] text-muted-foreground">+{items.length - 2}</span> : null}
                {ids.length > 0 ? (
                  <span className="mt-auto text-[11px] text-muted-foreground">
                    {day?.executionCount ?? 0} {t("פעולות", "actions")}
                    {decisions > 0 ? ` · ${decisions} ${t("החלטה", "decision")}` : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <DayPanel day={openDay} plan={plan} byId={byId} locale={locale} onClose={close} onShift={(n) => setOpenDay((d) => (d ? addDays(d, n) : d))} rowActionFor={rowActionFor} onExecuteRow={onExecuteRow} executingRowId={executingRowId} onGroupingChanged={onGroupingChanged} />
    </div>
  );
}

function relativeDay(today: string, iso: string, locale: Locale): string {
  const n = daysBetween(today, iso);
  const isHe = locale === "he";
  if (n === 0) return isHe ? "היום" : "Today";
  if (n === 1) return isHe ? "מחר" : "Tomorrow";
  return isHe ? `בעוד ${n} ימים` : `In ${n} days`;
}

function StatusTag({ status, locale, className }: { status: InitiativeStatus; locale: Locale; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase", STATUS_TEXT[status], className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {INITIATIVE_STATUS_LABEL[status][locale]}
    </span>
  );
}

// ── Day panel: initiatives on that day, grouped by status ────────────
function DayPanel({
  day,
  plan,
  byId,
  locale,
  onClose,
  onShift,
  rowActionFor,
  onExecuteRow,
  executingRowId,
  onGroupingChanged
}: {
  day: string | null;
  plan: PlanViewData;
  byId: Map<string, Initiative>;
  locale: Locale;
  onClose: () => void;
  onShift: (n: number) => void;
  rowActionFor: RowActionFor;
  onExecuteRow: (rowId: string) => void;
  executingRowId: string | null;
  onGroupingChanged?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!day) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [day, onClose]);
  if (!mounted || !day) return null;
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const info = plan.days.find((d) => d.date === day);
  const all = (info?.initiativeIds ?? []).map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => INITIATIVE_STATUS_ORDER.indexOf(a.status) - INITIATIVE_STATUS_ORDER.indexOf(b.status));
  const items = all.filter((i) => i.kind === "move");
  const unattached = all.filter((i) => i.kind !== "move");
  // Move targets: every commercial initiative in the plan, nearest first.
  const targets = plan.initiatives.filter((i) => i.kind === "move").sort((a, b) => Math.abs(daysBetween(day, a.start)) - Math.abs(daysBetween(day, b.start)));

  return createPortal(
    <div dir={isHe ? "rtl" : "ltr"} className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex h-[100dvh] w-full flex-col bg-background shadow-dialog sm:w-[min(760px,94vw)] sm:border-s sm:border-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-5 sm:pt-3">
          <button type="button" onClick={() => onShift(-1)} className="rounded-md border border-border p-2 hover:bg-accent" aria-label={t("יום קודם", "Previous day")}>
            <ChevronRight className="h-4 w-4 ltr:hidden" aria-hidden />
            <ChevronLeft className="h-4 w-4 rtl:hidden" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{fmtDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}</h3>
            <p className="text-xs text-muted-foreground">
              {t(`${items.length} מהלכים · ${info?.executionCount ?? 0} פעולות ביצוע`, `${items.length} initiatives · ${info?.executionCount ?? 0} execution actions`)}
              {unattached.length > 0 ? ` · ${t(`${unattached.length} ללא מהלך`, `${unattached.length} without a move`)}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => onShift(1)} className="rounded-md border border-border p-2 hover:bg-accent" aria-label={t("יום הבא", "Next day")}>
            <ChevronLeft className="h-4 w-4 ltr:hidden" aria-hidden />
            <ChevronRight className="h-4 w-4 rtl:hidden" aria-hidden />
          </button>
          <button type="button" onClick={onClose} className="-me-1 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("סגירה", "Close")}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5">
          {items.length === 0 && unattached.length === 0 ? <p className="text-sm text-muted-foreground">{t("אין מהלכים ביום הזה.", "No initiatives on this day.")}</p> : null}
          {items.map((i) => (
            <InitiativeCard key={i.id} initiative={i} day={day} locale={locale} sheetId={plan.sheetId} targets={targets} rowActionFor={rowActionFor} onExecuteRow={onExecuteRow} executingRowId={executingRowId} onGroupingChanged={onGroupingChanged} />
          ))}
          {unattached.length > 0 ? (
            <section className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">{t("פעולות ללא מהלך — לצרף למהלך או להשאיר", "Actions without a move — attach to a move or leave as is")}</h4>
              {unattached.map((i) => (
                <InitiativeCard key={i.id} initiative={i} day={day} locale={locale} sheetId={plan.sheetId} targets={targets} rowActionFor={rowActionFor} onExecuteRow={onExecuteRow} executingRowId={executingRowId} onGroupingChanged={onGroupingChanged} compact />
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Initiative card: the move, its executions, what Hiloomy checked,
//    current reality, verdict — and the link to Today when a decision is open.
function InitiativeCard({
  initiative: i,
  day,
  locale,
  sheetId,
  targets,
  rowActionFor,
  onExecuteRow,
  executingRowId,
  onGroupingChanged,
  compact = false
}: {
  initiative: Initiative;
  day: string;
  locale: Locale;
  sheetId: string;
  targets: Initiative[];
  rowActionFor: RowActionFor;
  onExecuteRow: (rowId: string) => void;
  executingRowId: string | null;
  onGroupingChanged?: () => void;
  compact?: boolean;
}) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const override = async (op: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/gantt/${sheetId}/plan/overrides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? "override failed");
      onGroupingChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const brief = [i.title, i.offer.discountPct !== null ? `${i.offer.discountPct}%` : null, i.offer.couponCode, `${i.start}${i.end !== i.start ? ` → ${i.end}` : ""}`].filter(Boolean).join(" · ");
  const openDecision = i.relatedDecisions.find((r) => r.state === "open");
  const expired = i.relatedDecisions.find((r) => r.state === "resolved" && r.choice === "expired");
  const resolved = i.relatedDecisions.find((r) => r.state === "resolved" && r.choice !== "auto_closed" && r.choice !== "expired");
  const missingCost = i.products.filter((p) => !p.hasRealCost);
  const todayExecutions = i.executions.filter((e) => e.start <= day && e.end >= day);
  const otherExecutions = i.executions.filter((e) => !(e.start <= day && e.end >= day));
  const verdict =
    i.status === "needs_decision"
      ? { label: t("דורש החלטה", "NEEDS DECISION"), cls: "text-warning" }
      : i.status === "blocked"
        ? { label: t("חסום", "BLOCKED"), cls: "text-danger" }
        : i.status === "live" || i.status === "ready"
          ? { label: t("להמשיך כמתוכנן", "KEEP"), cls: "text-success" }
          : i.status === "completed"
            ? { label: t("הסתיים", "COMPLETED"), cls: "text-muted-foreground" }
            : { label: t("מתוכנן", "PLANNED"), cls: "text-muted-foreground" };

  return (
    <article className={cn("rounded-xl border bg-card p-4", i.status === "needs_decision" ? "border-warning/60" : i.status === "blocked" ? "border-danger/50" : i.status === "live" ? "border-primary/40" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <StatusTag status={i.status} locale={locale} />
        <span className="text-xs text-muted-foreground">
          {range(i, locale)}
          {i.days > 1 ? ` · ${i.days} ${t("ימים", "days")}` : ""}
        </span>
      </div>
      <h4 className="mt-2 text-lg font-semibold leading-snug">{i.title}</h4>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {i.offer.discountPct !== null ? <span>{i.offer.discountPct}%</span> : null}
        {i.offer.couponCode ? <span dir="ltr">· {i.offer.couponCode}</span> : null}
        {i.channels.length > 0 ? <span>· {i.channels.join(" · ")}</span> : null}
        {i.groupingConfidence !== "high" && i.executions.length > 1 ? <span title={t("קיבוץ לפי דמיון בטקסט", "Grouped by text similarity")}>· {t("קיבוץ משוער", "grouping approximate")}</span> : null}
      </p>

      {/* Decision link — never the full receipt here. */}
      {openDecision ? (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm font-semibold">{openDecision.question[locale]}</p>
          <Link href={`/today?open=${openDecision.id}` as never} className="mt-1 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
            {t(`החלטה ${displayDecisionId(openDecision.id)} מחכה בהיום`, `Decision ${displayDecisionId(openDecision.id)} is waiting in Today`)}
            <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
          </Link>
        </div>
      ) : null}
      {expired && !resolved ? (
        <p className="mt-3 text-xs text-warning">
          {t(`החלטה ${displayDecisionId(expired.id)} פגה בלי הכרעה`, `Decision ${displayDecisionId(expired.id)} expired with no decision`)}
          {expired.decidedAt ? ` · ${new Date(expired.decidedAt).toLocaleDateString(isHe ? "he-IL" : "en-US")}` : ""}
        </p>
      ) : null}
      {resolved ? (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold">{t(`עודכן לפי החלטה ${displayDecisionId(resolved.id)}`, `Updated by decision ${displayDecisionId(resolved.id)}`)}</p>
          <p className="text-muted-foreground">
            {t("מקורי", "Original")}: {i.offer.discountPct !== null ? `${i.offer.discountPct}%` : i.title} · {t("הוחלט", "Decided")}:{" "}
            {resolved.choice === "approved" ? t("כמתוכנן", "as planned") : resolved.choice === "ignored" ? t("להתעלם", "ignored") : (resolved.optionKey ?? t("חלופה", "alternative"))}
            {resolved.decidedAt ? ` · ${new Date(resolved.decidedAt).toLocaleDateString(isHe ? "he-IL" : "en-US")}` : ""}
          </p>
          <Link href={`/today/${resolved.id}` as never} className="mt-1 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
            {t("לקבלה", "Open receipt")}
            <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
          </Link>
        </div>
      ) : null}

      {/* Execution: what each channel does. ✓ only when observable. */}
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">{t("ביצוע", "Execution")}</p>
        <ul className="mt-1 space-y-1.5">
          {[...todayExecutions, ...otherExecutions].map((e) => {
            const action = rowActionFor(e.rowId, e.actionType, `${brief}${e.channel ? ` · ${e.channel}` : ""}`);
            return (
              <li key={e.key} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-start gap-2">
                  <span aria-hidden className={cn("mt-0.5 shrink-0 text-xs", e.state === "done" ? "text-success" : "text-muted-foreground")}>
                    {e.state === "done" ? "✓" : "○"}
                  </span>
                  <span className="min-w-0">
                    {e.channel ? <span className="me-1 text-xs font-medium text-muted-foreground">{e.channel}</span> : null}
                    <span className="line-clamp-2">{e.text}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {editing ? (
                    <>
                      <select
                        aria-label={t("העברה למהלך", "Move to initiative")}
                        className="h-8 max-w-[10rem] rounded-md border border-border bg-background px-1 text-xs"
                        defaultValue=""
                        disabled={busy}
                        onChange={(ev) => ev.target.value && void override({ op: "move", executionKey: e.key, toInitiativeId: ev.target.value })}
                      >
                        <option value="">{t("העברה ל…", "Move to…")}</option>
                        {targets.filter((x) => x.id !== i.id).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.title.slice(0, 40)}
                          </option>
                        ))}
                      </select>
                      {i.executions.length > 1 ? (
                        <button type="button" disabled={busy} onClick={() => void override({ op: "split", executionKey: e.key })} className="h-8 rounded-md border border-border px-2 text-xs hover:bg-accent disabled:opacity-50">
                          {t("פיצול", "Split")}
                        </button>
                      ) : null}
                    </>
                  ) : action ? (
                    <button
                      type="button"
                      onClick={() => onExecuteRow(e.rowId)}
                      disabled={executingRowId === e.rowId}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      {executingRowId === e.rowId ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ExternalLink className="h-3 w-3" aria-hidden />}
                      {e.state === "done" ? t("שוב", "Again") : action.ctaLabel}
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {i.dependencies.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {i.dependencies.map((d) => (
            <span key={d.kind} className={cn("inline-flex items-center gap-1", d.state === "ok" ? "text-success" : d.state === "missing" ? "text-danger" : "text-warning")} title={d.detail[locale]}>
              <span aria-hidden>{d.state === "ok" ? "✓" : d.state === "missing" ? "✕" : "⚠"}</span>
              {d.label[locale]}
            </span>
          ))}
        </p>
      ) : null}

      {i.products.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {t("הילומי בדקה", "Hiloomy checked")}: {i.checked.join(" × ")}
          </p>
          <ul className="space-y-1 text-sm">
            {i.products.map((p) => {
              const trend = p.unitsPrior14d > 0 ? Math.round(((p.units14d - p.unitsPrior14d) / p.unitsPrior14d) * 100) : null;
              return (
                <li key={p.productId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 truncate font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`${p.units14d} יח׳ / 14 יום`, `${p.units14d} units / 14d`)}
                    {trend !== null ? ` (${trend >= 0 ? "+" : ""}${trend}%)` : ""}
                    {p.coverDays !== null ? ` · ${t(`${p.coverDays} ימי כיסוי`, `${p.coverDays} days cover`)}` : p.inventory !== null ? ` · ${t(`${p.inventory} במלאי`, `${p.inventory} in stock`)}` : ""}
                    {p.liveCampaigns > 0 ? ` · ${t(`${p.liveCampaigns} קמפיינים`, `${p.liveCampaigns} campaigns`)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          {missingCost.length > 0 ? (
            <p className="text-xs text-warning">
              {t("ביטחון ברווחיות נמוך — חסרה עלות ל", "Profit confidence low — cost missing for")} {missingCost.map((p) => p.title).join(", ")}.{" "}
              <Link href={"/products/costs" as never} className="font-semibold underline-offset-4 hover:underline">
                {t("להשלים", "Fix data")}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {!compact ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{t("מסקנה", "Verdict")}</p>
          <p className={cn("text-sm font-semibold", verdict.cls)}>{verdict.label}</p>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-muted-foreground underline-offset-4 hover:underline">
          {editing ? t("סיום עריכת הקיבוץ", "Done editing grouping") : t("עריכת קיבוץ", "Edit grouping")}
        </button>
        {editing ? (
          <>
            <select
              aria-label={t("מיזוג לתוך", "Merge into")}
              className="h-8 max-w-[12rem] rounded-md border border-border bg-background px-1 text-xs"
              defaultValue=""
              disabled={busy}
              onChange={(ev) => ev.target.value && void override({ op: "merge", initiativeId: i.id, intoInitiativeId: ev.target.value })}
            >
              <option value="">{t("מיזוג המהלך לתוך…", "Merge this into…")}</option>
              {targets.filter((x) => x.id !== i.id).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title.slice(0, 40)}
                </option>
              ))}
            </select>
            {i.kind === "move" ? (
              <button type="button" disabled={busy} onClick={() => void override({ op: i.excludedFromEngine ? "include" : "exclude", initiativeId: i.id })} className="rounded-md border border-border px-2 py-1 hover:bg-accent disabled:opacity-50">
                {i.excludedFromEngine ? t("להחזיר למנוע ההחלטות", "Include in decision engine") : t("להוציא ממנוע ההחלטות", "Exclude from decision engine")}
              </button>
            ) : null}
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
          </>
        ) : i.excludedFromEngine ? (
          <span className="text-muted-foreground">{t("מחוץ למנוע ההחלטות", "Excluded from the decision engine")}</span>
        ) : null}
        {err ? <span className="text-danger">{err}</span> : null}
      </div>
      {i.statusReason && !openDecision ? <p className="mt-1 text-xs text-muted-foreground">{i.statusReason[locale]}</p> : null}
      {i.decisionHooks.length > 0 && !openDecision ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("החלטה מתוכננת", "Decision scheduled")}: {fmtDay(i.decisionHooks[0].windowStart, locale, { day: "numeric", month: "short" })} → {t("תופיע בהיום כשהחלון מגיע", "appears on Today when the window arrives")}
        </p>
      ) : null}
    </article>
  );
}
