"use client";

// The prescribed-response half of the competitors section (today / this
// week). Split out as a CLIENT component so it can show a loading spinner
// and fetch the BI analysis live — the same UX as the Meta campaigns
// insight — instead of the static "BI unavailable" fallback that only
// updated on the next page load.
//
// It's seeded with the server-rendered brief. If that's already a real BI
// answer (source "bi-agent"), it renders immediately. If it's the fallback
// (BI not cached yet), it shows the spinner and POSTs the blocking endpoint,
// which generates the brief and returns it.

import { useEffect, useState } from "react";
import { Zap, CalendarDays, Bot, FileText, Target, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { BriefAction, CompetitorBriefActions as BriefActions } from "@/lib/services/competitor-brief-service";

function ActionItem({
  item,
  index,
  accent,
  isHe
}: {
  item: BriefAction;
  index: number;
  accent: "indigo" | "muted";
  isHe: boolean;
}) {
  const chip = accent === "indigo" ? "bg-emerald-600 text-white" : "bg-muted text-foreground";
  return (
    <li className="flex items-start gap-2 text-sm leading-6">
      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${chip}`}>
        {index + 1}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{item.action}</p>
        {item.why ? (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            <span className="font-semibold">{isHe ? "למה: " : "Why: "}</span>
            {item.why}
          </p>
        ) : null}
        {item.how ? (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            <span className="font-semibold">{isHe ? "איך: " : "How: "}</span>
            {item.how}
          </p>
        ) : null}
        {item.target ? (
          <p className="mt-0.5 flex items-start gap-1 text-[13px] leading-5 text-emerald-700">
            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{isHe ? "יעד: " : "Target: "}</span>
              {item.target}
            </span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function CompetitorBriefActionsBlock({
  initial,
  isHe
}: {
  initial: BriefActions;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const [brief, setBrief] = useState<BriefActions>(initial);
  const [loading, setLoading] = useState(initial.source === "fallback");

  useEffect(() => {
    // Already have a real BI answer from the server render — nothing to do.
    if (initial.source !== "fallback") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/competitor-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && body?.ok && body.brief) {
          setBrief(body.brief as BriefActions);
        }
      } catch {
        // keep the fallback tips already on screen
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.source]);

  const showFallbackBanner = !loading && brief.source === "fallback";

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {lang(
            "סוכן ה-BI מנתח את מהלכי המתחרים מול הנתונים שלכם…",
            "The BI agent is analyzing competitor moves against your data…"
          )}
        </div>
      ) : showFallbackBanner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs leading-5 text-amber-900">
          {lang(
            "⚠️ סוכן ה-BI לא הצליח להחזיר ניתוח כרגע — הפעולות למטה הן טיפים כלליים מוכנים מראש, לא מסקנות מהמודיעין.",
            "⚠️ The BI agent couldn't return an analysis right now — the actions below are pre-written generic tips, not intel conclusions."
          )}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
              <Zap className="h-4 w-4" aria-hidden />
              {lang("לעשות באתר היום", "Do on the site today")}
            </p>
            <ul className="mt-2 space-y-3">
              {brief.today.map((item, i) => (
                <ActionItem key={i} item={item} index={i} accent="indigo" isHe={isHe} />
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden />
              {lang("השבוע", "This week")}
            </p>
            <ul className="mt-2 space-y-3">
              {brief.thisWeek.map((item, i) => (
                <ActionItem key={i} item={item} index={i} accent="muted" isHe={isHe} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {!loading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {brief.source === "bi-agent" ? (
            <>
              <Bot className="h-3.5 w-3.5" aria-hidden />
              {lang(
                `ניתוח BI על בסיס סקירת מודיעין מ${brief.generatedAt}.`,
                `BI analysis based on the ${brief.generatedAt} intel sweep.`
              )}
            </>
          ) : (
            <>
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {lang(
                `מתוך סיכום המודיעין מ${brief.generatedAt} (סוכן ה-BI לא זמין כרגע).`,
                `From the ${brief.generatedAt} intel summary (BI agent currently unavailable).`
              )}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
