"use client";

// BI insight under the Meta campaigns section (owner ask, 2026-08-26:
// "under it i want to have BI insight about the campaigns we are running").
// Lazy: fetches after mount so the dashboard render never waits on an LLM;
// the server caches per store+window for 6h, and the refresh button forces
// a regeneration.

import { useEffect, useState } from "react";
import { Bot, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Confidence = "high" | "medium" | "low";

type CandidateStatus = "context" | "winner" | "watch" | "test" | "review";
interface Candidate {
  type: string;
  status: CandidateStatus;
  campaignName: string | null;
  creativeNames: string[];
  title: { he: string; en: string };
  body: { he: string; en: string };
  recommendation: { he: string; en: string };
  confidence: Confidence;
  sampleSize: number;
}
interface Signals {
  headline: { he: string; en: string };
  mediaHealth: "strong" | "ok" | "weak" | "unverified";
  candidates: Candidate[];
  okay: { he: string; en: string }[];
}

interface Insight {
  signals?: Signals | null;
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
      ? "border-success/40 bg-success/10 text-success"
      : tone === "bad"
        ? "border-danger/40 bg-danger/10 text-danger"
        : tone === "unknown"
          ? "border-dashed border-border bg-transparent text-muted-foreground"
          : "border-border bg-muted text-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClass}`}>
      <span className="font-normal opacity-80">{label}:</span>
      {value}
    </span>
  );
}

const STATUS_STYLE: Record<CandidateStatus, string> = {
  review: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  test: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  watch: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  winner: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  context: "border-border bg-muted text-muted-foreground"
};
const STATUS_LABEL: Record<CandidateStatus, { he: string; en: string }> = {
  review: { he: "לבדוק", en: "REVIEW" },
  test: { he: "לבחון", en: "TEST" },
  watch: { he: "לעקוב", en: "WATCH" },
  winner: { he: "מנצח", en: "WINNER" },
  context: { he: "הקשר", en: "CONTEXT" }
};

// The deterministic layer: what is already okay, then the ranked candidates
// that deserve attention. Renders with or without the model's phrasing.
function SignalsBlock({ signals, isHe }: { signals: Signals; isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const t = (v: { he: string; en: string }) => (isHe ? v.he : v.en);
  const needs = signals.candidates.filter((c) => c.status === "review" || c.status === "test" || c.status === "watch");
  const winners = signals.candidates.filter((c) => c.status === "winner");
  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold leading-snug tracking-tight text-foreground">{t(signals.headline)}</p>
      {signals.okay.length ? (
        <p className="text-xs text-muted-foreground">
          {lang("כבר בסדר: ", "Already okay: ")}
          {signals.okay.map(t).join(" · ")}
        </p>
      ) : null}
      {needs.length ? (
        <ul className="space-y-2">
          {needs.map((c, i) => (
            <li key={`${c.type}-${i}`} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
              <span className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[c.status]}`}>{t(STATUS_LABEL[c.status])}</span>
              <div className="min-w-0 space-y-0.5 text-sm">
                <p className="font-semibold text-foreground">{t(c.title)}</p>
                <p className="text-muted-foreground">{t(c.body)}</p>
                <p className="text-xs text-foreground/80">{t(c.recommendation)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {lang("ביטחון", "confidence")} {confidenceLabel(c.confidence, isHe)} · n={c.sampleSize}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{lang("אין חריגים בין הקריאייטיבים בחלון הזה.", "No creative stands out in this window.")}</p>
      )}
      {winners.length ? (
        <p className="text-xs text-muted-foreground">
          {lang("מנצחים: ", "Winners: ")}
          {winners.map((w) => `${w.creativeNames[0]} (${w.campaignName})`).join(" · ")}
        </p>
      ) : null}
    </div>
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
  // Deterministic signals arrive with every response, including failures.
  const [signals, setSignals] = useState<Signals | null>(null);
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
      if (body?.signals) setSignals(body.signals as Signals);
      if (res.ok && body?.ok && body.insight) {
        setInsight(body.insight as Insight);
        if (body.insight.signals) setSignals(body.insight.signals as Signals);
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
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
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
          <div className="mt-3 space-y-3">
            {signals ? <SignalsBlock signals={signals} isHe={isHe} /> : null}
          <div className="space-y-2 text-xs text-muted-foreground">
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
              className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              {lang("לנסות שוב", "Try again")}
            </button>
          </div>
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
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                {lang("ביטחון", "Confidence")}: {lang("ביצועים", "performance")} {confidenceLabel(insight.performanceConfidence, isHe)} · {lang("רווח", "profit")}{" "}
                {confidenceLabel(insight.profitConfidence, isHe)}
              </span>
            </div>
            {insight.signals ? (
              <>
                <SignalsBlock signals={insight.signals} isHe={isHe} />
                <p className="text-sm leading-6 text-muted-foreground">{insight.conclusion}</p>
              </>
            ) : (
              <div className="space-y-1.5">
                <p className="text-lg font-semibold leading-snug tracking-tight text-foreground">{insight.decision}</p>
                <p className="text-sm leading-6 text-muted-foreground">{insight.conclusion}</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{lang("מה אנחנו כן יודעים", "What we know")}</p>
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
                  <p className="text-xs font-medium text-muted-foreground">{lang("מה אנחנו לא יודעים", "What we don't know")}</p>
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
            {/* The model's "what to do now" list used to render here. Removed
                (8 Sep 2026): the Command Center describes, it does not decide —
                campaign decisions come from the reallocation engine on Today. */}
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
            <p className="text-xs text-muted-foreground">
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
