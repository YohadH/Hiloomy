"use client";

// Guided COGS onboarding (Launch-QA P0). Instead of a 378-row editor, this
// surfaces the TOP-REVENUE products still missing a real cost and lets the
// owner type each cost inline — clearing the accuracy gap where it matters
// most in a few minutes. Saves go to the same /api/products/costs endpoint
// the full editor uses (server re-costs the line items immediately); the
// coverage meter updates optimistically as rows are saved.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ArrowRight, Coins, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { CogsOnboarding } from "@/lib/services/product-cost-service";

export function CogsOnboardingCard({
  data,
  currency,
  isHe
}: {
  data: CogsOnboarding;
  currency: string;
  isHe: boolean;
}) {
  const t = (he: string, en: string) => (isHe ? he : en);
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<Record<string, boolean>>({});
  const [savedCount, setSavedCount] = useState(0);
  const [coveredRevenue, setCoveredRevenue] = useState(data.revenueCovered);
  const [refreshing, setRefreshing] = useState(false);

  const soldRevenue = data.revenueCovered + data.revenueMissing;
  const liveCoverage = soldRevenue > 0 ? Math.min(1, coveredRevenue / soldRevenue) : 1;
  const pct = Math.round(liveCoverage * 100);

  async function save(productId: string, revenue: number) {
    const raw = (drafts[productId] ?? "").trim();
    const cost = Number(raw.replace(/[^0-9.]/g, ""));
    if (!raw || !Number.isFinite(cost) || cost < 0) {
      setError((e) => ({ ...e, [productId]: true }));
      return;
    }
    setError((e) => ({ ...e, [productId]: false }));
    setSaving((s) => ({ ...s, [productId]: true }));
    try {
      const res = await fetch("/api/products/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, cost })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) {
        setDone((d) => new Set(d).add(productId));
        setSavedCount((c) => c + 1);
        setCoveredRevenue((r) => r + revenue);
      } else {
        setError((e) => ({ ...e, [productId]: true }));
      }
    } catch {
      setError((e) => ({ ...e, [productId]: true }));
    } finally {
      setSaving((s) => ({ ...s, [productId]: false }));
    }
  }

  const remaining = data.topMissing.filter((p) => !done.has(p.productId));
  const allTopDone = remaining.length === 0;

  return (
    <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Coins className="h-4 w-4 text-amber-600" aria-hidden />
              {t("דייקו את הרווח — עלויות המוצר החסרות", "Make your profit accurate — missing product costs")}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              {t(
                `כרגע ${pct}% מהרווח בחלון מבוסס על עלות מוצר אמיתית; השאר מוערך לפי יחס ברירת מחדל (${Math.round(data.defaultCostRatio * 100)}%). הזינו עלות ל־${data.toReachTarget || data.missingCount} המוצרים הכי משמעותיים כדי להגיע ל־90% דיוק.`,
                `Right now ${pct}% of this window's profit is backed by a real product cost; the rest is estimated at the default ratio (${Math.round(data.defaultCostRatio * 100)}%). Enter costs for the top ${data.toReachTarget || data.missingCount} products to reach 90% accuracy.`
              )}
            </p>
          </div>
          <span className="shrink-0 text-2xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
            {pct}%
          </span>
        </div>

        {/* Coverage meter */}
        <div className="h-2.5 overflow-hidden rounded-full border border-amber-200 bg-white dark:border-amber-900 dark:bg-amber-950/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Inline entry rows */}
        <div className="space-y-2">
          {data.topMissing.map((p) => {
            const isDone = done.has(p.productId);
            return (
              <div
                key={p.productId}
                className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  isDone
                    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                    : "border-border bg-background"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.primarySku ? `${p.primarySku} · ` : ""}
                    {t(
                      `${formatCurrency(p.revenue, currency)} מכירות · מחיר ${formatCurrency(p.price, currency)}`,
                      `${formatCurrency(p.revenue, currency)} sales · price ${formatCurrency(p.price, currency)}`
                    )}
                  </p>
                </div>
                {isDone ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check className="h-4 w-4" aria-hidden />
                    {t("נשמר", "Saved")}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 start-2 flex items-center text-xs text-muted-foreground">
                        {t("עלות", "cost")}
                      </span>
                      <input
                        inputMode="decimal"
                        value={drafts[p.productId] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.productId]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void save(p.productId, p.revenue);
                        }}
                        placeholder="0.00"
                        dir="ltr"
                        aria-label={t(`עלות ל־${p.title}`, `Cost for ${p.title}`)}
                        className={`w-28 rounded-lg border bg-background py-2 pe-3 ps-11 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40 ${
                          error[p.productId] ? "border-rose-400" : "border-border"
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void save(p.productId, p.revenue)}
                      disabled={saving[p.productId]}
                      className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {saving[p.productId] ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        t("שמירה", "Save")
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <a
            href="/profit/costs"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {t("לעורך העלויות המלא (וייבוא CSV)", "Open the full cost editor (and CSV import)")}
            <ArrowRight className={`h-3.5 w-3.5 ${isHe ? "rotate-180" : ""}`} aria-hidden />
          </a>
          {savedCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                router.refresh();
                // router.refresh resolves without a promise we can await here;
                // clear the spinner shortly after so it doesn't hang.
                setTimeout(() => setRefreshing(false), 1500);
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
              {allTopDone
                ? t("סיימתם! רעננו את הרווח", "Done! Refresh profit")
                : t(`עדכנו את הרווח (${savedCount} נשמרו)`, `Update profit (${savedCount} saved)`)}
            </button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
