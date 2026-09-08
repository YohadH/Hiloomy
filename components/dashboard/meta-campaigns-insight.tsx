"use client";

// BI insight under the Meta campaigns section (owner ask, 2026-08-26:
// "under it i want to have BI insight about the campaigns we are running").
// Lazy: fetches after mount so the dashboard render never waits on an LLM;
// the server caches per store+window for 6h, and the refresh button forces
// a regeneration.

import { useEffect, useState } from "react";
import { Bot, ChevronDown, Loader2, RefreshCw, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Confidence = "high" | "medium" | "low";

interface Insight {
  decision: string;
  conclusion: string;
  known: string[];
  unknown: string[];
  actions: string[];
  evidence: string[];
  health: "strong" | "mixed" | "weak";
  performanceConfidence: Confidence;
  profitConfidence: Confidence;
  profitability: "verified_profitable" | "verified_losing" | "not_verified";
  breakevenRoas: number | null;
  generatedAt: string;
}

// Two badges the manager reads before anything else: how the campaigns are
// doing, and whether profit is verified. Missing COGS lowers the second
// axis without muting the first.
function AxisBadge({ label, value, tone }: { label: string; value: string; tone: "good" | "neutral" | "bad" | "unknown" }) {
  const toneClass =
    tone === "good"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
      : tone === "bad"
        ? "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
        : tone === "unknown"
          ? "border-dashed border-border bg-transparent text-muted-foreground"
          : "border-border bg-muted text-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      <span className="font-normal opacity-80">{label}:</span>
      {value}
    </span>
  );
}

function confidenceLabel(level: Confidence, isHe: boolean): string {
  if (level === "high") return isHe ? "גבוה" : "high";
  if (level === "medium") return isHe ? "בינוני" : "medium";
  return isHe ? "נמוך" : "low";
}

export function MetaCampaignsInsight({ isHe }: { isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden" | "failed">("loading");
  const [failure, setFailure] = useState<string | null>(null);
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
        setFailure(null);
      } else if (res.status === 404) {
        // No campaign data in this window — nothing to analyze, hide quietly.
        setState("hidden");
      } else {
        // A real failure stays visible with its reason and a retry — a card
        // that spins and vanishes tells the manager nothing (7 Sep 2026).
        setFailure(String(body?.error ?? `HTTP ${res.status}`));
        setState("failed");
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "network");
      setState("failed");
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
        ) : state === "failed" ? (
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p>
              {failure === "recent_failure"
                ? lang("הניסיון האחרון לנתח נכשל; הילומה תנסה שוב אוטומטית בעוד כמה דקות.", "The last analysis attempt failed; Hiloma retries automatically in a few minutes.")
                : failure === "llm_budget_exhausted"
                  ? lang("תקציב ה־AI היומי של החנות נוצל. תובנה חדשה מחר.", "Today's AI budget for this store is used up. A new insight tomorrow.")
                  : failure === "provider_rate_limited"
                ? lang("ספק המודל דחה את הבקשה (מכסה או מגבלת קצב). נסו שוב בעוד דקה.", "The model provider refused the request (quota or rate limit). Try again in a minute.")
                : failure === "model_output_incomplete" || failure === "model_output_unparseable"
                  ? lang("הילומה לא סיימה את הניתוח הפעם (התשובה נחתכה). נסו שוב.", "Hiloma did not finish the analysis this time (the answer was cut off). Try again.")
                  : lang(`הילומה לא הצליחה לנתח הפעם: ${failure ?? ""}`, `Hiloma could not analyze this time: ${failure ?? ""}`)}
            </p>
            <button
              type="button"
              onClick={() => {
                setState("loading");
                void load(true);
              }}
              className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-emerald-700"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              {lang("לנסות שוב", "Try again")}
            </button>
          </div>
        ) : insight ? (
          <div className="mt-3 space-y-4">
            {/* Two axes first, then decision → what we know → what we don't →
                what to do. Evidence stays behind a toggle: Hiloma should show
                how much reading she saved, not how much she analyzed. */}
            <div className="flex flex-wrap gap-2">
              <AxisBadge
                label={lang("בריאות הקמפיינים", "Campaign health")}
                value={
                  insight.health === "strong"
                    ? lang("חזקה", "Strong")
                    : insight.health === "weak"
                      ? lang("חלשה", "Weak")
                      : lang("מעורבת", "Mixed")
                }
                tone={insight.health === "strong" ? "good" : insight.health === "weak" ? "bad" : "neutral"}
              />
              <AxisBadge
                label={lang("רווחיות", "Profitability")}
                value={
                  insight.profitability === "verified_profitable"
                    ? lang(`מאומתת · מעל נקודת איזון ${insight.breakevenRoas ?? ""}×`, `Verified · above ${insight.breakevenRoas ?? ""}× breakeven`)
                    : insight.profitability === "verified_losing"
                      ? lang(`מתחת לנקודת האיזון ${insight.breakevenRoas ?? ""}×`, `Below ${insight.breakevenRoas ?? ""}× breakeven`)
                      : lang("לא מאומתת · חסר COGS", "Not verified · COGS missing")
                }
                tone={insight.profitability === "verified_profitable" ? "good" : insight.profitability === "verified_losing" ? "bad" : "unknown"}
              />
              <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                {lang("ביטחון", "Confidence")}: {lang("ביצועים", "performance")} {confidenceLabel(insight.performanceConfidence, isHe)} · {lang("רווח", "profit")}{" "}
                {confidenceLabel(insight.profitConfidence, isHe)}
              </span>
            </div>
            <div className="space-y-1.5">
              <p className="text-lg font-semibold leading-snug tracking-tight text-foreground">{insight.decision}</p>
              <p className="text-sm leading-6 text-muted-foreground">{insight.conclusion}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{lang("מה אנחנו כן יודעים", "What we know")}</p>
                <ul className="mt-1.5 space-y-1">
                  {insight.known.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {insight.unknown.length > 0 ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{lang("מה אנחנו לא יודעים", "What we don't know")}</p>
                  <ul className="mt-1.5 space-y-1">
                    {insight.unknown.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full border border-current" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
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
