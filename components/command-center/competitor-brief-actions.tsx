"use client";

// The action console half of the competitors section: what to do TODAY
// (three tiered cards, the first one large) and THIS WEEK (a compact list).
// Each action shows only: action, driver (why now), impact, confidence,
// connected systems, one button. The how-to steps, the market context and
// the success condition live behind "Review".
//
// Client component so it can show a loading state and fetch the BI analysis
// live — seeded with the server-rendered brief; if that is the fallback (BI
// not cached yet) it polls the blocking endpoint.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, FileText, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BriefAction, BriefLevel, CompetitorBriefActions as BriefActions } from "@/lib/services/competitor-brief-service";

const LEVEL_LABEL: Record<BriefLevel, { he: string; en: string }> = {
  high: { he: "גבוה", en: "High" },
  medium: { he: "בינוני", en: "Medium" },
  low: { he: "נמוך", en: "Low" }
};

const IMPACT_CLASS: Record<BriefLevel, string> = {
  high: "text-foreground",
  medium: "text-foreground",
  low: "text-muted-foreground"
};

function Level({ label, level, isHe, className }: { label: string; level: BriefLevel | null | undefined; isHe: boolean; className?: string }) {
  if (!level) return null;
  return (
    <span className={cn("text-xs", className)}>
      <span className="text-muted-foreground">{label}: </span>
      <span className={cn("font-semibold", IMPACT_CLASS[level])}>{isHe ? LEVEL_LABEL[level].he : LEVEL_LABEL[level].en}</span>
    </span>
  );
}

function Connected({ items }: { items: string[] | null | undefined }) {
  if (!items || items.length === 0) return null;
  return <span className="text-xs text-muted-foreground">{items.join(" × ")}</span>;
}

// Older cached briefs carry why/target instead of driver/successCondition.
function driverOf(a: BriefAction): string | null {
  return a.driver ?? a.why ?? null;
}

function TodayCard({ item, index, lead, isHe, onReview }: { item: BriefAction; index: number; lead: boolean; isHe: boolean; onReview: () => void }) {
  const t = (he: string, en: string) => (isHe ? he : en);
  const driver = driverOf(item);
  return (
    <Card className={cn("relative overflow-hidden", lead && "border-primary/40")}>
      {lead ? <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-primary" /> : null}
      <div className={cn("space-y-3", lead ? "p-5 sm:p-6" : "p-4 sm:p-5")}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-muted-foreground">
            {index + 1}
            {lead ? ` · ${t("היום", "Today")}` : ""}
          </span>
          <div className="flex items-center gap-3">
            <Level label={t("השפעה", "Impact")} level={item.impact} isHe={isHe} />
            <Level label={t("ביטחון", "Confidence")} level={item.confidence} isHe={isHe} />
          </div>
        </div>
        <h3 className={cn("font-semibold leading-snug tracking-tight", lead ? "text-xl sm:text-2xl" : "text-base sm:text-lg")}>{item.action}</h3>
        {driver ? <p className={cn("leading-6 text-muted-foreground", lead ? "text-sm sm:text-base" : "text-sm")}>{driver}</p> : null}
        <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <Connected items={item.connected} />
          <Button size={lead ? "lg" : "sm"} variant={lead ? "default" : "secondary"} className={cn(lead ? "sm:h-10" : "")} onClick={onReview}>
            {t("לסקור", "Review")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function WeekRow({ item, isHe, onReview }: { item: BriefAction; isHe: boolean; onReview: () => void }) {
  const t = (he: string, en: string) => (isHe ? he : en);
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-5">{item.action}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Connected items={item.connected} />
          {item.connected && item.connected.length > 0 && item.impact ? <span aria-hidden>·</span> : null}
          <Level label={t("השפעה", "Impact")} level={item.impact} isHe={isHe} />
        </p>
      </div>
      <button type="button" onClick={onReview} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-foreground underline-offset-4 hover:underline sm:min-h-0">
        {t("לסקור", "Review")}
      </button>
    </li>
  );
}

// "Review": the full receipt for one action — driver, market context, the
// steps, and the success condition. Bottom sheet on phones, side sheet on
// desktop. Purely informational: the manager acts in Meta/Shopify.
function ReviewDrawer({ item, isHe, onClose }: { item: BriefAction | null; isHe: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!item) return;
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
  }, [item, onClose]);
  if (!mounted || !item) return null;
  const t = (he: string, en: string) => (isHe ? he : en);
  const steps = (item.how ?? "")
    .split(/\s*\|\s*|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const driver = driverOf(item);
  const success = item.successCondition ?? item.target ?? null;
  return createPortal(
    <div dir={isHe ? "rtl" : "ltr"} className="fixed inset-0 z-50 flex items-end bg-slate-950/40 sm:items-stretch sm:justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.action}>
      <div
        className="flex max-h-[90dvh] w-full flex-col rounded-t-3xl border-t border-border bg-background shadow-dialog sm:h-[100dvh] sm:max-h-none sm:w-[min(560px,94vw)] sm:rounded-none sm:border-s sm:border-t-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 sm:pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <p className="text-xs font-semibold text-muted-foreground">{t("סקירת פעולה", "Review action")}</p>
          <button type="button" onClick={onClose} className="-me-2 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("סגירה", "Close")}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold leading-snug tracking-tight">{item.action}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Level label={t("השפעה", "Impact")} level={item.impact} isHe={isHe} />
              <Level label={t("ביטחון", "Confidence")} level={item.confidence} isHe={isHe} />
              <Connected items={item.connected} />
            </div>
          </div>
          {driver ? (
            <section className="space-y-1">
              <h4 className="text-sm font-semibold">{t("למה עכשיו", "Why now")}</h4>
              <p className="text-sm leading-6">{driver}</p>
            </section>
          ) : null}
          {item.marketContext ? (
            <section className="space-y-1">
              <h4 className="text-sm font-semibold">{t("הקשר שוק", "Market context")}</h4>
              <p className="text-sm leading-6 text-muted-foreground">{item.marketContext}</p>
              <p className="text-xs text-muted-foreground">{t("הקשר בלבד — לא הסיבה לפעולה.", "Context only — not the reason for the action.")}</p>
            </section>
          ) : null}
          {steps.length > 0 ? (
            <section className="space-y-1.5">
              <h4 className="text-sm font-semibold">{t("איך", "How")}</h4>
              <ol className="space-y-1.5">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm leading-6">
                    <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {success ? (
            <section className="space-y-1 border-t border-border pt-4">
              <h4 className="text-sm font-semibold">{t("איך נדע שזה עבד", "How we'll know it worked")}</h4>
              <p className="text-sm leading-6">{success}</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function CompetitorBriefActionsBlock({ initial, isHe }: { initial: BriefActions; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const [brief, setBrief] = useState<BriefActions>(initial);
  const [loading, setLoading] = useState(initial.source === "fallback");
  const [open, setOpen] = useState<BriefAction | null>(null);

  useEffect(() => {
    // Already have a real BI answer from the server render — nothing to do.
    if (initial.source !== "fallback") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // The loader route answers within ~20s. If the BI generation is still
    // running it says `pending` and we poll — a bounded series of short
    // requests instead of one request held open for minutes (C-08).
    const MAX_POLLS = 6;
    const POLL_MS = 20_000;
    const load = async (attempt: number) => {
      try {
        const res = await fetch("/api/dashboard/competitor-brief", { method: "POST", headers: { "Content-Type": "application/json" } });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body?.ok && body.brief) {
          const next = body.brief as BriefActions;
          if (next.source === "bi-agent") {
            setBrief(next);
            setLoading(false);
            return;
          }
          if (next.pending && attempt < MAX_POLLS) {
            timer = setTimeout(() => void load(attempt + 1), POLL_MS);
            return;
          }
        }
        setLoading(false);
      } catch {
        // keep the fallback tips already on screen
        if (!cancelled) setLoading(false);
      }
    };
    void load(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initial.source]);

  const showFallbackBanner = !loading && brief.source === "fallback";
  const isFallback = brief.source === "fallback";

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {lang("הילומה מנתחת את הנתונים שלכם מול השוק…", "Hiloma is analyzing your data against the market…")}
        </div>
      ) : showFallbackBanner ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-xs leading-5 text-foreground">
          {lang(
            "הילומה לא הצליחה להחזיר ניתוח כרגע — הפעולות למטה הן טיפים כלליים מוכנים מראש, לא מסקנות מהנתונים.",
            "Hiloma couldn't return an analysis right now — the actions below are pre-written generic tips, not conclusions from your data."
          )}
        </div>
      ) : null}

      {/* Today: tiered. The first action is the big one. */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-semibold">{lang("היום", "Today")}</h3>
          <span className="text-xs text-muted-foreground">{lang(`${brief.today.length} פעולות`, `${brief.today.length} actions`)}</span>
        </div>
        {isFallback ? (
          <ul className="divide-y divide-border border-y border-border">
            {brief.today.map((item, i) => (
              <li key={i} className="py-3 text-sm">
                {item.action}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {brief.today.map((item, i) => (
              <TodayCard key={i} item={item} index={i} lead={i === 0} isHe={isHe} onReview={() => setOpen(item)} />
            ))}
          </div>
        )}
      </section>

      {/* This week: a compact list. */}
      {brief.thisWeek.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-base font-semibold">{lang("השבוע", "This week")}</h3>
          <ul className="divide-y divide-border border-y border-border">
            {brief.thisWeek.map((item, i) =>
              isFallback ? (
                <li key={i} className="py-3 text-sm">
                  {item.action}
                </li>
              ) : (
                <WeekRow key={i} item={item} isHe={isHe} onReview={() => setOpen(item)} />
              )
            )}
          </ul>
        </section>
      ) : null}

      {!loading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {brief.source === "bi-agent" ? (
            <>
              <Bot className="h-3.5 w-3.5" aria-hidden />
              {lang(`ניתוח על בסיס הנתונים החיים וסקירת השוק מ${brief.generatedAt}. הקשר שוק הוא הקשר בלבד — הסיבה לכל פעולה היא מספר של החנות.`, `Analysis from live store data and the ${brief.generatedAt} market sweep. Market context is context only — every action's reason is a store number.`)}
            </>
          ) : (
            <>
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {lang(`מתוך סיכום המודיעין מ${brief.generatedAt} (הילומה לא זמינה כרגע).`, `From the ${brief.generatedAt} intel summary (Hiloma currently unavailable).`)}
            </>
          )}
        </p>
      ) : null}

      <ReviewDrawer item={open} isHe={isHe} onClose={() => setOpen(null)} />
    </div>
  );
}
