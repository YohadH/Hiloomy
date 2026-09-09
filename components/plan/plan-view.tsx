"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { INITIATIVE_STATUS_LABEL, INITIATIVE_STATUS_ORDER, type Initiative, type InitiativeStatus, type PlanView as PlanViewData } from "@/lib/domain/plan";

type Locale = "he" | "en";

// Status is the primary visual system. Category is a small label.
const STATUS_DOT: Record<InitiativeStatus, string> = {
  planned: "bg-muted-foreground/40",
  ready: "bg-success",
  blocked: "bg-danger",
  live: "bg-primary",
  completed: "bg-border"
};
const STATUS_TEXT: Record<InitiativeStatus, string> = {
  planned: "text-muted-foreground",
  ready: "text-success",
  blocked: "text-danger",
  live: "text-primary",
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

export interface RowAction {
  label: string;
  ctaLabel: string;
  href: string;
}

export function PlanView({
  sheetId,
  locale,
  refreshKey,
  openDayRequest = null,
  rowActionFor,
  onExecuteRow,
  executingRowId
}: {
  sheetId: string;
  locale: Locale;
  // Bump to re-fetch (after a sync / reparse).
  refreshKey: number;
  // A YYYY-MM-DD the host wants opened (insight chips).
  openDayRequest?: string | null;
  // The studio owns the per-row action wiring (open coupon tool, creative
  // studio…). The plan view only asks for a label/href per row id.
  rowActionFor: (rowId: string) => RowAction | null;
  onExecuteRow: (rowId: string) => void;
  executingRowId: string | null;
}) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [plan, setPlan] = useState<PlanViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null); // YYYY-MM
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
        setMonth((m) => m ?? (p.today >= (p.rangeStart ?? "") && p.today <= (p.rangeEnd ?? "") ? p.today.slice(0, 7) : (p.rangeStart ?? p.today).slice(0, 7)));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [sheetId, refreshKey]);

  useEffect(() => {
    if (openDayRequest) {
      setOpenDay(openDayRequest);
      setMonth(openDayRequest.slice(0, 7));
    }
  }, [openDayRequest]);

  const byId = useMemo(() => new Map((plan?.initiatives ?? []).map((i) => [i.id, i])), [plan]);
  const dayMap = useMemo(() => new Map((plan?.days ?? []).map((d) => [d.date, d])), [plan]);

  const monthDays = useMemo(() => {
    if (!month) return [];
    const first = `${month}-01`;
    const out: string[] = [];
    for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d);
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
  const c = { planned: 0, ready: 0, blocked: 0, live: 0, completed: 0 } as Record<InitiativeStatus, number>;
  for (const i of inMonth) c[i.status] += 1;
  const weekDays = (() => {
    const start = plan.today;
    const out: string[] = [];
    for (let k = 0; k < 7; k++) out.push(addDays(start, k));
    return out;
  })();

  return (
    <div className="space-y-6">
      {/* ── Month header ─────────────────────────────────────────── */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftMonth(-1)} className="rounded-md border border-border p-2 hover:bg-accent" aria-label={t("חודש קודם", "Previous month")}>
              <ChevronRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" aria-hidden />
            </button>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{monthLabel}</h2>
            <button type="button" onClick={() => shiftMonth(1)} className="rounded-md border border-border p-2 hover:bg-accent" aria-label={t("חודש הבא", "Next month")}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" aria-hidden />
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
        <p className="text-sm text-muted-foreground">
          {t(`${inMonth.length} יוזמות מתוכננות`, `${inMonth.length} planned initiatives`)}
          {c.live > 0 ? ` · ${c.live} ${t("באוויר", "live")}` : ""}
          {c.ready > 0 ? ` · ${c.ready} ${t("מוכנות", "ready")}` : ""}
          {c.blocked > 0 ? (
            <>
              {" · "}
              <span className="font-semibold text-danger">
                {c.blocked} {t("חסומות", "blocked")}
              </span>
            </>
          ) : null}
        </p>
        {/* Plan health: one line, deterministic. */}
        <p className="border-y border-border py-3 text-sm">
          <span className={cn("font-semibold", plan.health.tone === "attention" ? "text-danger" : plan.health.tone === "good" ? "text-success" : "text-muted-foreground")}>
            {plan.health.tone === "attention" ? t("דורש תשומת לב", "Needs attention") : plan.health.tone === "good" ? t("בעיקר במסלול", "Mostly on track") : t("שקט", "Quiet")}
          </span>
          <span className="text-muted-foreground"> · {plan.health.line[locale]}</span>
          <span className="block text-xs text-muted-foreground sm:inline">
            {" "}
            {t("הילומי בדקה קופונים, מלאי, מכירות, קמפיינים ועלויות על המוצרים שמוזכרים בתוכנית.", "Hiloomy checked coupons, inventory, sales, campaigns and costs for the products the plan names.")}
          </span>
        </p>
      </header>

      {/* ── Coming up ────────────────────────────────────────────── */}
      {plan.upcoming.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-base font-semibold">{t("בקרוב", "Coming up")}</h3>
          <ul className="divide-y divide-border border-y border-border">
            {plan.upcoming.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => setOpenDay(i.start)} className="flex w-full items-start justify-between gap-4 py-3 text-start">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{relativeDay(plan.today, i.start, locale)}</p>
                    <p className="line-clamp-2 text-sm font-semibold">{i.title}</p>
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
            const n = day?.initiativeIds.length ?? 0;
            return (
              <li key={d}>
                <button type="button" onClick={() => n > 0 && setOpenDay(d)} className="flex min-h-11 w-full items-center justify-between gap-4 py-2 text-start" disabled={n === 0}>
                  <span className={cn("text-sm", d === plan.today && "font-semibold")}>{fmtDay(d, locale, { weekday: "short", day: "numeric" })}</span>
                  <DayCounts day={day} locale={locale} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Month grid (desktop always, phone on demand) ─────────── */}
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
            const n = day?.initiativeIds.length ?? 0;
            const attention = (day?.byStatus.blocked ?? 0) > 0;
            const isToday = d === plan.today;
            const inRange = plan.rangeStart && plan.rangeEnd ? d >= plan.rangeStart && d <= plan.rangeEnd : false;
            return (
              <button
                key={d}
                type="button"
                onClick={() => n > 0 && setOpenDay(d)}
                disabled={n === 0}
                className={cn(
                  "flex min-h-[4.5rem] flex-col rounded-md border p-1.5 text-start sm:min-h-20",
                  attention ? "border-danger/50 bg-danger/5" : n > 0 ? "border-border bg-card hover:bg-accent" : inRange ? "border-border/60 bg-muted/20" : "border-transparent",
                  isToday && "ring-2 ring-primary/40"
                )}
              >
                <span className={cn("text-xs", isToday ? "font-bold" : "font-medium", !inRange && "text-muted-foreground/60")}>{Number(d.slice(8, 10))}</span>
                {n > 0 ? (
                  <>
                    <span className="mt-1 text-xs font-semibold">
                      {n} {t("יוזמות", "initiatives")}
                    </span>
                    <span className="mt-auto flex flex-wrap items-center gap-1">
                      {INITIATIVE_STATUS_ORDER.filter((s) => (day?.byStatus[s] ?? 0) > 0).map((s) => (
                        <span key={s} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={INITIATIVE_STATUS_LABEL[s][locale]}>
                          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s])} />
                          {day?.byStatus[s]}
                        </span>
                      ))}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <DayPanel day={openDay} plan={plan} byId={byId} locale={locale} onClose={close} onShift={(n) => setOpenDay((d) => (d ? addDays(d, n) : d))} rowActionFor={rowActionFor} onExecuteRow={onExecuteRow} executingRowId={executingRowId} />
    </div>
  );
}

function relativeDay(today: string, iso: string, locale: Locale): string {
  const n = daysBetween(today, iso);
  const isHe = locale === "he";
  if (n === 0) return isHe ? "היום" : "Today";
  if (n === 1) return isHe ? "מחר" : "Tomorrow";
  return isHe ? `בעוד ${n} ימים · ${fmtDay(iso, locale, { day: "numeric", month: "short" })}` : `In ${n} days · ${fmtDay(iso, locale, { day: "numeric", month: "short" })}`;
}

function StatusTag({ status, locale, className }: { status: InitiativeStatus; locale: Locale; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase", STATUS_TEXT[status], className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {INITIATIVE_STATUS_LABEL[status][locale]}
    </span>
  );
}

function DayCounts({ day, locale }: { day: { initiativeIds: string[]; byStatus: Record<InitiativeStatus, number> } | undefined; locale: Locale }) {
  const isHe = locale === "he";
  if (!day || day.initiativeIds.length === 0) return <span className="text-xs text-muted-foreground">{isHe ? "—" : "—"}</span>;
  const parts = INITIATIVE_STATUS_ORDER.filter((s) => day.byStatus[s] > 0).map((s) => `${day.byStatus[s]} ${INITIATIVE_STATUS_LABEL[s][locale]}`);
  return (
    <span className="text-end text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">{day.initiativeIds.length}</span> · {parts.join(" · ")}
    </span>
  );
}

// ── Day panel: initiatives grouped by status ────────────────────────
function DayPanel({
  day,
  plan,
  byId,
  locale,
  onClose,
  onShift,
  rowActionFor,
  onExecuteRow,
  executingRowId
}: {
  day: string | null;
  plan: PlanViewData;
  byId: Map<string, Initiative>;
  locale: Locale;
  onClose: () => void;
  onShift: (n: number) => void;
  rowActionFor: (rowId: string) => RowAction | null;
  onExecuteRow: (rowId: string) => void;
  executingRowId: string | null;
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
  const ids = plan.days.find((d) => d.date === day)?.initiativeIds ?? [];
  const items = ids.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => INITIATIVE_STATUS_ORDER.indexOf(a.status) - INITIATIVE_STATUS_ORDER.indexOf(b.status));
  const counts = INITIATIVE_STATUS_ORDER.map((s) => [s, items.filter((i) => i.status === s).length] as const).filter(([, n]) => n > 0);

  return createPortal(
    <div dir={isHe ? "rtl" : "ltr"} className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex h-[100dvh] w-full flex-col bg-background shadow-dialog sm:w-[min(720px,94vw)] sm:border-s sm:border-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-5 sm:pt-3">
          <button type="button" onClick={() => onShift(-1)} className="rounded-md border border-border p-2 hover:bg-accent" aria-label={t("יום קודם", "Previous day")}>
            <ChevronRight className="h-4 w-4 ltr:rotate-180" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{fmtDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}</h3>
            <p className="text-xs text-muted-foreground">
              {items.length} {t("יוזמות", "initiatives")}
              {counts.map(([s, n]) => ` · ${n} ${INITIATIVE_STATUS_LABEL[s][locale]}`).join("")}
            </p>
          </div>
          <button type="button" onClick={() => onShift(1)} className="rounded-md border border-border p-2 hover:bg-accent" aria-label={t("יום הבא", "Next day")}>
            <ChevronLeft className="h-4 w-4 ltr:rotate-180" aria-hidden />
          </button>
          <button type="button" onClick={onClose} className="-me-1 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("סגירה", "Close")}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5">
          {items.length === 0 ? <p className="text-sm text-muted-foreground">{t("אין יוזמות ביום הזה.", "No initiatives on this day.")}</p> : null}
          {items.map((i) => (
            <InitiativeCard key={i.id} initiative={i} locale={locale} today={plan.today} rowActionFor={rowActionFor} onExecuteRow={onExecuteRow} executingRowId={executingRowId} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Initiative card: title, planned move, dependencies, what Hiloomy
//    checked, current reality (observable facts only), row action. ──
function InitiativeCard({
  initiative: i,
  locale,
  today,
  rowActionFor,
  onExecuteRow,
  executingRowId
}: {
  initiative: Initiative;
  locale: Locale;
  today: string;
  rowActionFor: (rowId: string) => RowAction | null;
  onExecuteRow: (rowId: string) => void;
  executingRowId: string | null;
}) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const action = rowActionFor(i.rowIds[0]);
  const executed = Boolean(i.executedAt);
  const range = i.days === 1 ? fmtDay(i.start, locale, { day: "numeric", month: "short" }) : `${fmtDay(i.start, locale, { day: "numeric", month: "short" })} – ${fmtDay(i.end, locale, { day: "numeric", month: "short" })}`;
  const missingCost = i.products.filter((p) => !p.hasRealCost);
  return (
    <article className={cn("rounded-xl border bg-card p-4", i.status === "blocked" ? "border-danger/50" : i.status === "live" ? "border-primary/40" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <StatusTag status={i.status} locale={locale} />
        <span className="text-xs text-muted-foreground">
          {range}
          {i.days > 1 ? ` · ${i.days} ${t("ימים", "days")}` : ""}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">{i.title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {i.category ? <span>{i.category}</span> : null}
        {i.role ? <span>· {i.role}</span> : null}
        {i.discountPct !== null ? <span>· {i.discountPct}%</span> : null}
        {i.couponCode ? <span dir="ltr">· {i.couponCode}</span> : null}
      </p>

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
      {i.statusReason ? <p className="mt-1 text-xs text-muted-foreground">{i.statusReason[locale]}</p> : null}

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
                    {t(`${p.units14d} יח׳ ב־14 יום`, `${p.units14d} units / 14d`)}
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

      {action ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {executed ? t(`סומן כבוצע ${new Date(i.executedAt!).toLocaleDateString(isHe ? "he-IL" : "en-US")}`, `Marked done ${new Date(i.executedAt!).toLocaleDateString("en-US")}`) : action.label}
          </span>
          <button
            type="button"
            onClick={() => onExecuteRow(i.rowIds[0])}
            disabled={executingRowId === i.rowIds[0]}
            className={cn("inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold sm:h-9", executed ? "border border-border bg-card hover:bg-accent" : "bg-primary text-primary-foreground hover:bg-primary/90", "disabled:opacity-50")}
          >
            {executingRowId === i.rowIds[0] ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden />}
            {executed ? t("פתיחה מחדש", "Open again") : action.ctaLabel}
          </button>
        </div>
      ) : null}
      {i.status === "completed" && today > i.end ? null : null}
    </article>
  );
}
