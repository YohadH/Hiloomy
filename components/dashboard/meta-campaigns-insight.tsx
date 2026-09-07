"use client";

// BI insight under the Meta campaigns section (owner ask, 2026-08-26:
// "under it i want to have BI insight about the campaigns we are running").
// Lazy: fetches after mount so the dashboard render never waits on an LLM;
// the server caches per store+window for 6h, and the refresh button forces
// a regeneration.

import { useEffect, useState } from "react";
import { Bot, ChevronDown, Loader2, RefreshCw, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Insight {
  decision: string;
  conclusion: string;
  why: string[];
  actions: string[];
  evidence: string[];
  generatedAt: string;
}

export function MetaCampaignsInsight({ isHe }: { isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const load = async (force: boolean) => {
    try {
      const res = await fetch("/api/meta-ads/campaigns-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok && body.insight) {
        setInsight(body.insight as Insight);
        setState("ready");
      } else if (!force) {
        // No data / no LLM key — hide quietly rather than nag.
        setState("hidden");
      }
    } catch {
      if (!force) setState("hidden");
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "hidden") return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Bot className="h-4 w-4" aria-hidden />
            {lang("מה לעשות היום?", "What to do today?")}
          </p>
          {state === "ready" ? (
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                void load(true).finally(() => setRefreshing(false));
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={refreshing ? "h-3 w-3 animate-spin" : "h-3 w-3"} aria-hidden />
              {lang("רענון", "Refresh")}
            </button>
          ) : null}
        </div>

        {state === "loading" ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {lang("הסוכן מנתח את הקמפיינים…", "The agent is analyzing the campaigns…")}
          </p>
        ) : insight ? (
          <div className="mt-3 space-y-4">
            {/* Decision → why → what to do. Evidence stays behind a toggle:
                Hiloma should show how much reading she saved, not how much
                she analyzed. */}
            <div className="space-y-1.5">
              <p className="text-lg font-semibold leading-snug tracking-tight text-foreground">{insight.decision}</p>
              <p className="text-sm leading-6 text-muted-foreground">{insight.conclusion}</p>
            </div>
            <ul className="space-y-1">
              {insight.why.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {insight.actions.length > 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  {lang("מה לעשות עכשיו", "What to do now")}
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {insight.actions.map((line, i) => (
                    <p key={i} className="flex items-start gap-2 text-xs text-foreground">
                      <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                      <span>{line}</span>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {insight.evidence.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowEvidence((v) => !v)}
                  aria-expanded={showEvidence}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={showEvidence ? "h-3.5 w-3.5 rotate-180 transition-transform" : "h-3.5 w-3.5 transition-transform"} aria-hidden />
                  {showEvidence
                    ? lang("להסתיר ראיות", "Hide evidence")
                    : lang(`הצג ראיות (${insight.evidence.length} קמפיינים)`, `Show evidence (${insight.evidence.length} campaigns)`)}
                </button>
                {showEvidence ? (
                  <ul className="mt-2 space-y-1.5 border-s-2 border-border ps-3">
                    {insight.evidence.map((line, i) => (
                      <li key={i} className="text-xs leading-5 text-muted-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <p className="text-[10px] text-muted-foreground">
              {lang("נוצר על ידי הילומה · ", "Generated by Hiloma · ")}
              {new Date(insight.generatedAt).toLocaleString(isHe ? "he-IL" : "en-US", {
                timeZone: "Asia/Jerusalem",
                dateStyle: "short",
                timeStyle: "short"
              })}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
