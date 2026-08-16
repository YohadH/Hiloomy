import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { OverviewPayload } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { formatCurrency } from "@/lib/utils";

/**
 * Generic narrative banner — pass headline + body text + optional trend tone.
 * Used at the top of every page to summarize the situation in plain English.
 */
export function NarrativeBanner({
  eyebrow,
  headline,
  context,
  body,
  tone = "neutral",
  toneLabel,
  locale = "en"
}: {
  eyebrow: string;
  headline: string;
  context?: string;
  body?: string;
  tone?: "up" | "down" | "neutral";
  toneLabel?: string;
  locale?: AppLocale;
}) {
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : null;
  const pillClass =
    tone === "up"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "down"
        ? "bg-rose-500/10 text-rose-700"
        : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50/80 via-white to-sky-50/60 p-5 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-sm">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
            {eyebrow}
          </p>
          <h2 className="text-lg font-semibold leading-snug text-foreground sm:text-xl">
            {headline}
          </h2>
          {context ? (
            <p className="text-xs font-medium text-muted-foreground">
              {context}
            </p>
          ) : null}
          {body ? <p className="text-sm leading-6 text-muted-foreground">{body}</p> : null}
        </div>
        {tone !== "neutral" && Icon ? (
          <div className="shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${pillClass}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {toneLabel ??
                (tone === "up"
                  ? locale === "he"
                    ? "מגמת עלייה"
                    : "Trending up"
                  : locale === "he"
                    ? "מגמת ירידה"
                    : "Trending down")}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Convenience wrapper that auto-generates the overview narrative from the payload.
 */
export function OverviewNarrative({
  overview,
  comparisonContext
}: {
  overview: OverviewPayload;
  comparisonContext?: string;
}) {
  const revenueKpi = overview.kpis[0];
  const profitKpi = overview.kpis[1];
  const refundKpi = overview.kpis[5];
  const topProduct = overview.productPerformance[0];
  const currency = overview.store.currency;

  const comparisonEnabled = overview.comparisonEnabled;
  const revenueDirection = revenueKpi?.change ?? 0;
  const positive = revenueDirection >= 0;

  const headline =
    comparisonEnabled && revenueKpi
      ? positive
        ? `You earned ${formatCurrency(revenueKpi.value, currency)} this period — up ${Math.abs(revenueDirection).toFixed(1)}% vs. the prior period.`
        : `You earned ${formatCurrency(revenueKpi.value, currency)} this period — down ${Math.abs(revenueDirection).toFixed(1)}% vs. the prior period.`
      : `You earned ${formatCurrency(revenueKpi?.value ?? 0, currency)} this period.`;

  const profitLine = profitKpi
    ? comparisonEnabled && typeof profitKpi.change === "number"
      ? `Estimated profit landed at ${formatCurrency(profitKpi.value, currency)} (${profitKpi.change >= 0 ? "+" : ""}${profitKpi.change.toFixed(1)}%).`
      : `Estimated profit landed at ${formatCurrency(profitKpi.value, currency)}.`
    : null;

  const productLine = topProduct
    ? `Your bestseller right now is ${topProduct.productTitle}, contributing ${formatCurrency(topProduct.revenue, currency)}.`
    : null;

  const refundLine =
    refundKpi && refundKpi.value > 5
      ? `⚠ Refund rate is ${refundKpi.value.toFixed(1)}% — worth a look at your most-returned items.`
      : null;

  const body = [profitLine, productLine, refundLine].filter(Boolean).join(" ");

  return (
    <NarrativeBanner
      eyebrow="What happened this period"
      headline={headline}
      context={comparisonContext}
      body={body}
      tone={positive ? "up" : "down"}
    />
  );
}
