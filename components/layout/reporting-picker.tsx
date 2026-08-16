"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, GitCompareArrows, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { DualCalendar } from "@/components/layout/calendar";

type RangePreset =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "last_90"
  | "wtd"
  | "mtd"
  | "qtd"
  | "ytd"
  | "last_year"
  | "custom";

type ComparisonMode = "none" | "prev_period" | "prev_year" | "prev_year_dow" | "custom";

function getPresetGroups(
  locale: AppLocale
): Array<{ heading: string; presets: Array<{ value: RangePreset; label: string }> }> {
  const isHe = locale === "he";
  return [
    {
      heading: isHe ? "יום" : "Day",
      presets: [
        { value: "today", label: isHe ? "היום" : "Today" },
        { value: "yesterday", label: isHe ? "אתמול" : "Yesterday" }
      ]
    },
    {
      heading: isHe ? "אחרונים" : "Last",
      presets: [
        { value: "last_7", label: isHe ? "7 הימים האחרונים" : "Last 7 days" },
        { value: "last_30", label: isHe ? "30 הימים האחרונים" : "Last 30 days" },
        { value: "last_90", label: isHe ? "90 הימים האחרונים" : "Last 90 days" }
      ]
    },
    {
      heading: isHe ? "מתחילת התקופה" : "Period to date",
      presets: [
        { value: "wtd", label: isHe ? "מתחילת השבוע" : "Week to date" },
        { value: "mtd", label: isHe ? "מתחילת החודש" : "Month to date" },
        { value: "qtd", label: isHe ? "מתחילת הרבעון" : "Quarter to date" },
        { value: "ytd", label: isHe ? "מתחילת השנה" : "Year to date" }
      ]
    },
    {
      heading: isHe ? "שנה" : "Year",
      presets: [{ value: "last_year", label: isHe ? "השנה שעברה" : "Last year" }]
    }
  ];
}

function getComparisonOptions(
  locale: AppLocale
): Array<{ value: ComparisonMode; label: string }> {
  const isHe = locale === "he";
  return [
    { value: "none", label: isHe ? "ללא השוואה" : "No comparison" },
    { value: "prev_period", label: isHe ? "תקופה קודמת" : "Previous period" },
    { value: "prev_year", label: isHe ? "שנה קודמת" : "Previous year" },
    {
      value: "prev_year_dow",
      label: isHe ? "שנה קודמת (התאמת יום בשבוע)" : "Previous year (match day of week)"
    },
    { value: "custom", label: isHe ? "טווח מותאם" : "Custom" }
  ];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseInputDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() < 1970 || date.getFullYear() > 2100) return null;
  return date;
}

function toInputDate(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(value: string | null, locale: AppLocale) {
  if (!value) return "";
  const d = parseInputDate(value);
  if (!d) return "";
  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  return d.toLocaleDateString(intlLocale, { month: "short", day: "numeric", year: "numeric" });
}

function rangeSummary(start: string, end: string, locale: AppLocale) {
  const a = formatDate(start, locale);
  const b = formatDate(end, locale);
  if (!a || !b) return "";
  if (a === b) return a;
  return `${a} – ${b}`;
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end";
}

function Popover({ open, onClose, children, className, align = "end" }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    // Lock body scroll while the bottom-sheet variant is open on mobile —
    // otherwise the user's tap can scroll the page underneath instead of
    // hitting the calendar.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      {/* Mobile-only backdrop. Dimmed overlay makes the bottom sheet feel
          like a modal and provides a tap target to close. Hidden on sm+ */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 sm:hidden"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        className={cn(
          // Mobile: bottom-anchored sheet, full width minus 16px gutters,
          // capped height with internal scroll. Lives in fixed coordinates
          // so it doesn't get clipped by parent overflow.
          "fixed bottom-2 start-2 end-2 z-50 max-h-[calc(100vh-1rem)] overflow-y-auto rounded-2xl border border-border/70 bg-card text-card-foreground shadow-xl",
          // Desktop: restore the original anchored popover behavior.
          "sm:absolute sm:bottom-auto sm:start-auto sm:end-auto sm:mt-2 sm:max-h-none sm:overflow-visible",
          align === "end" ? "sm:end-0" : "sm:start-0",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}

export interface ReportingPickerProps {
  storeId?: string;
  storeConnected?: boolean;
  initialPreset: RangePreset;
  initialStart: string;
  initialEnd: string;
  initialComparisonMode: ComparisonMode;
  initialComparisonStart: string;
  initialComparisonEnd: string;
  initialRangeLabel: string;
  initialComparisonLabel: string;
  exportLabel?: string;
  locale?: AppLocale;
}

export function ReportingPicker(props: ReportingPickerProps) {
  const locale: AppLocale = props.locale ?? "en";
  const isHe = locale === "he";
  const PRESET_GROUPS = getPresetGroups(locale);
  const COMPARISON_OPTIONS = getComparisonOptions(locale);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [preset, setPreset] = useState<RangePreset>(props.initialPreset);
  const [start, setStart] = useState<string>(props.initialStart);
  const [end, setEnd] = useState<string>(props.initialEnd);

  // Pending selection inside the popover (only committed on Apply)
  const [pendingStart, setPendingStart] = useState<Date | null>(parseInputDate(props.initialStart));
  const [pendingEnd, setPendingEnd] = useState<Date | null>(parseInputDate(props.initialEnd));
  const [pendingPreset, setPendingPreset] = useState<RangePreset>(props.initialPreset);
  // Buffered text for the date inputs so partial typing doesn't get reinterpreted as 1908
  const [startText, setStartText] = useState<string>(props.initialStart);
  const [endText, setEndText] = useState<string>(props.initialEnd);

  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(props.initialComparisonMode);
  const [comparisonStart, setComparisonStart] = useState<string>(props.initialComparisonStart);
  const [comparisonEnd, setComparisonEnd] = useState<string>(props.initialComparisonEnd);

  // Pending comparison state — what the user has SELECTED but not yet
  // applied. We keep this separate from `comparisonMode` so the user can
  // change their mind in the popover without firing off a slow page
  // refresh on every click.
  const [pendingComparisonMode, setPendingComparisonMode] = useState<ComparisonMode>(props.initialComparisonMode);

  // Re-sync the pending comparison state every time the popover opens, so
  // closing the popover without applying doesn't leave stale "pending" state
  // on the next open.
  useEffect(() => {
    if (compareOpen) setPendingComparisonMode(comparisonMode);
  }, [compareOpen, comparisonMode]);

  // Re-sync pending state every time the popover opens
  useEffect(() => {
    if (rangeOpen) {
      setPendingStart(parseInputDate(start));
      setPendingEnd(parseInputDate(end));
      setPendingPreset(preset);
      setStartText(start);
      setEndText(end);
    }
  }, [rangeOpen, start, end, preset]);

  async function resyncDataSources() {
    // Pressing Apply / picking a preset means "show me this window as it looks
    // right now", so pull the freshest data from every external source before
    // re-rendering. Best-effort: the endpoint already swallows per-source
    // failures (e.g. Meta/Instagram not connected), and a network error here
    // must still let the page refresh with whatever data we have.
    if (!props.storeConnected || !props.storeId) return;
    try {
      await fetch("/api/reporting/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: props.storeId })
      });
    } catch {
      // ignore — fall through to refresh
    }
  }

  async function commit(
    state: {
      preset: RangePreset;
      start: string;
      end: string;
      comparison: { mode: ComparisonMode; start?: string; end?: string };
    },
    options: { resync: boolean }
  ) {
    document.cookie = `reporting-date-range=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=31536000; samesite=lax`;
    if (options.resync && props.storeConnected && props.storeId) {
      setSyncing(true);
      try {
        await resyncDataSources();
      } finally {
        setSyncing(false);
      }
    }
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleApplyRange() {
    if (!pendingStart || !pendingEnd) return;
    const nextStart = toInputDate(pendingStart);
    const nextEnd = toInputDate(pendingEnd);
    setPreset(pendingPreset);
    setStart(nextStart);
    setEnd(nextEnd);
    await commit(
      {
        preset: pendingPreset,
        start: nextStart,
        end: nextEnd,
        comparison: { mode: comparisonMode, start: comparisonStart, end: comparisonEnd }
      },
      { resync: true }
    );
    setRangeOpen(false);
  }

  async function handlePresetClick(value: RangePreset) {
    if (value === "custom") {
      setPendingPreset("custom");
      return;
    }
    // Non-custom presets apply immediately and close the popover
    setPreset(value);
    setRangeOpen(false);
    await commit(
      {
        preset: value,
        start,
        end,
        comparison: { mode: comparisonMode, start: comparisonStart, end: comparisonEnd }
      },
      { resync: true }
    );
  }

  function handleStartTextChange(value: string) {
    setStartText(value);
    const parsed = parseInputDate(value);
    if (parsed) setPendingStart(parsed);
  }

  function handleEndTextChange(value: string) {
    setEndText(value);
    const parsed = parseInputDate(value);
    if (parsed) setPendingEnd(parsed);
  }

  function handleCalendarChange(s: Date | null, e: Date | null) {
    setPendingStart(s);
    setPendingEnd(e);
    setPendingPreset("custom");
    setStartText(toInputDate(s));
    setEndText(toInputDate(e));
  }

  // Picking an option in the comparison popover now sets PENDING state only,
  // not the committed value. The user has to click Apply to commit. Same UX
  // as the date-range picker — gives an explicit confirmation step and avoids
  // hot-applying on every accidental click.
  function handleComparisonChoice(mode: ComparisonMode) {
    setPendingComparisonMode(mode);
  }

  function handleApplyComparison() {
    // Validation: custom mode requires both dates filled.
    if (pendingComparisonMode === "custom" && (!comparisonStart || !comparisonEnd)) return;
    setComparisonMode(pendingComparisonMode);
    setCompareOpen(false);
    void commit(
      {
        preset,
        start,
        end,
        comparison:
          pendingComparisonMode === "custom"
            ? { mode: "custom", start: comparisonStart, end: comparisonEnd }
            : { mode: pendingComparisonMode }
      },
      { resync: false }
    );
  }

  const rangeButtonLabel =
    preset === "custom" ? rangeSummary(start, end, locale) || props.initialRangeLabel : props.initialRangeLabel;

  const isLoading = isPending || syncing;
  const loadingLabel = syncing
    ? isHe
      ? "מסנכרן את Shopify, Meta וInstagram…"
      : "Syncing Shopify, Meta & Instagram…"
    : isPending
      ? isHe
        ? "מחיל טווח חדש — יכול להימשך עד דקה"
        : "Applying new range — this may take up to a minute"
      : "";

  return (
    // Mobile: items wrap and each goes full-width if needed. Desktop: row of pills.
    <div className="flex flex-wrap items-stretch gap-2 sm:items-center">
      {/* Top-of-page progress bar — pinned, always visible while any apply/sync
          is in flight. Indeterminate animation because the underlying page
          refresh has no real progress to measure. Inline keyframes so we
          don't have to touch global CSS. */}
      {isLoading ? (
        <>
          <style>{`@keyframes pwr-progress {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }`}</style>
          <div
            role="progressbar"
            aria-label={loadingLabel}
            aria-busy="true"
            className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1 overflow-hidden bg-indigo-100"
          >
            <div
              className="h-full w-1/3 bg-indigo-600"
              style={{ animation: "pwr-progress 1.4s ease-in-out infinite" }}
            />
          </div>
          <div className="pointer-events-none fixed inset-x-0 top-1 z-[9998] flex justify-center">
            <span className="rounded-b-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-md">
              <Loader2 className="me-1.5 inline h-3 w-3 animate-spin" aria-hidden />
              {loadingLabel}
            </span>
          </div>
        </>
      ) : null}

      {syncing ? (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground shadow-sm"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {isHe ? "מסנכרן את Shopify, Meta וInstagram…" : "Syncing Shopify, Meta & Instagram…"}
        </span>
      ) : null}

      {/* RANGE BUTTON */}
      <div className="relative flex-1 sm:flex-none">
        <button
          type="button"
          disabled={syncing}
          onClick={() => {
            setRangeOpen((v) => !v);
            setCompareOpen(false);
          }}
          aria-expanded={rangeOpen}
          aria-haspopup="dialog"
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium shadow-sm transition-colors sm:w-auto sm:justify-start",
            "hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            "disabled:cursor-not-allowed disabled:opacity-60",
            rangeOpen && "bg-muted/60"
          )}
        >
          <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="max-w-[200px] truncate sm:max-w-[260px]">{rangeButtonLabel}</span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", rangeOpen && "rotate-180")}
            aria-hidden
          />
        </button>

        <Popover
          open={rangeOpen}
          onClose={() => setRangeOpen(false)}
          align="end"
          className="w-auto sm:w-[min(820px,calc(100vw-2rem))]"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr]">
            {/* PRESETS SIDEBAR */}
            <div className="border-b border-border/70 p-3 sm:border-b-0 sm:border-e">
              <div className="space-y-4">
                {PRESET_GROUPS.map((group) => (
                  <div key={group.heading}>
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.heading}
                    </p>
                    <div className="flex flex-col">
                      {group.presets.map((option) => {
                        const active = pendingPreset === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handlePresetClick(option.value)}
                            className={cn(
                              "flex items-center justify-between rounded-md px-2 py-1.5 text-start text-sm transition-colors",
                              active ? "bg-muted text-foreground font-medium" : "text-foreground hover:bg-muted/60"
                            )}
                          >
                            <span>{option.label}</span>
                            {active ? <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPendingPreset("custom")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-start text-sm transition-colors",
                    pendingPreset === "custom" ? "bg-muted font-medium" : "hover:bg-muted/60"
                  )}
                >
                  <span>{isHe ? "טווח מותאם" : "Custom range"}</span>
                  {pendingPreset === "custom" ? (
                    <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  ) : null}
                </button>
              </div>
            </div>

            {/* CALENDAR */}
            <div className="p-3 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={startText}
                  onChange={(e) => handleStartTextChange(e.target.value)}
                  max={endText || undefined}
                  className="min-w-0 flex-1 sm:flex-none sm:w-[150px] rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                  aria-label={isHe ? "תאריך התחלה" : "Start date"}
                />
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
                <input
                  type="date"
                  value={endText}
                  onChange={(e) => handleEndTextChange(e.target.value)}
                  min={startText || undefined}
                  className="min-w-0 flex-1 sm:flex-none sm:w-[150px] rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                  aria-label={isHe ? "תאריך סיום" : "End date"}
                />
              </div>

              <DualCalendar
                start={pendingStart}
                end={pendingEnd}
                onChange={handleCalendarChange}
                initialMonth={pendingStart ?? new Date()}
                maxDate={new Date()}
              />

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/70 pt-4">
                <Button type="button" variant="secondary" size="sm" onClick={() => setRangeOpen(false)}>
                  {isHe ? "ביטול" : "Cancel"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || syncing || !pendingStart || !pendingEnd}
                  onClick={handleApplyRange}
                >
                  {syncing
                    ? isHe
                      ? "מסנכרן נתונים…"
                      : "Syncing data…"
                    : isPending
                      ? isHe
                        ? "מחיל…"
                        : "Applying…"
                      : isHe
                        ? "החילו"
                        : "Apply"}
                </Button>
              </div>
            </div>
          </div>
        </Popover>
      </div>

      {/* COMPARISON BUTTON */}
      <div className="relative flex-1 sm:flex-none">
        <button
          type="button"
          disabled={syncing}
          onClick={() => {
            setCompareOpen((v) => !v);
            setRangeOpen(false);
          }}
          aria-expanded={compareOpen}
          aria-haspopup="menu"
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium shadow-sm transition-colors sm:w-auto sm:justify-start",
            "hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            "disabled:cursor-not-allowed disabled:opacity-60",
            compareOpen && "bg-muted/60"
          )}
        >
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="max-w-[180px] truncate sm:max-w-[220px]">{props.initialComparisonLabel}</span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", compareOpen && "rotate-180")}
            aria-hidden
          />
        </button>

        <Popover open={compareOpen} onClose={() => setCompareOpen(false)} align="end" className="w-[min(320px,calc(100vw-1rem))]">
          <div className="p-2">
            {COMPARISON_OPTIONS.map((option) => {
              const active = pendingComparisonMode === option.value;
              const committed = comparisonMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleComparisonChoice(option.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-sm transition-colors",
                    active ? "bg-muted text-foreground font-medium" : "hover:bg-muted/60"
                  )}
                >
                  <span>{option.label}</span>
                  {active ? <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : committed ? (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {isHe ? "פעיל" : "current"}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {pendingComparisonMode === "custom" ? (
              <div className="mt-2 space-y-2 border-t border-border/70 px-3 pt-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {isHe ? "מתאריך" : "From"}
                  </label>
                  <input
                    type="date"
                    value={comparisonStart}
                    onChange={(e) => setComparisonStart(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {isHe ? "עד תאריך" : "To"}
                  </label>
                  <input
                    type="date"
                    value={comparisonEnd}
                    onChange={(e) => setComparisonEnd(e.target.value)}
                    min={comparisonStart || undefined}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-2 flex items-center justify-end gap-2 border-t border-border/70 px-1 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCompareOpen(false)}
                disabled={isPending || syncing}
              >
                {isHe ? "ביטול" : "Cancel"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  isPending ||
                  syncing ||
                  pendingComparisonMode === comparisonMode ||
                  (pendingComparisonMode === "custom" &&
                    (!comparisonStart || !comparisonEnd || comparisonStart > comparisonEnd))
                }
                onClick={handleApplyComparison}
              >
                {isPending || syncing ? (isHe ? "מחיל…" : "Applying…") : isHe ? "החל" : "Apply"}
              </Button>
            </div>
          </div>
        </Popover>
      </div>

      {props.exportLabel ? <Button className="ms-1">{props.exportLabel}</Button> : null}
    </div>
  );
}
