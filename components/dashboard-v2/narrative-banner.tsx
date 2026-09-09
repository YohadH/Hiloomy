import { TrendingDown, TrendingUp } from "lucide-react";
import type { OverviewPayload } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Generic narrative banner — headline + optional context/body + trend pill.
 * Flat surface, no decorative icon (docs/UI-FOUNDATION-PLAN.md).
 *
 * Layout: the text column claims at least 14rem before anything else may sit
 * beside it, so on a phone the trend pill wraps UNDER the text instead of
 * squeezing the headline into one word per line (portfolio, 9 Sep 2026).
 */
export function NarrativeBanner({
  eyebrow,
  headline,
  context,
  body,
  tone = "neutral",
  toneLabel,
  locale = "he"
}: {
  /** Defaults to the bilingual "what happened this period" eyebrow. */
  eyebrow?: string;
  headline: string;
  context?: string;
  body?: string;
  tone?: "up" | "down" | "neutral";
  toneLabel?: string;
  locale?: AppLocale;
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const resolvedEyebrow = eyebrow ?? lang("מה קרה בתקופה הזו", "What happened this period");
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : null;
  const pillClass = tone === "up" ? "bg-success/10 text-success" : tone === "down" ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[14rem] space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{resolvedEyebrow}</p>
          <h2 className="text-lg font-semibold leading-snug text-foreground sm:text-xl">{headline}</h2>
          {context ? <p className="text-xs font-medium text-muted-foreground">{context}</p> : null}
          {body ? <p className="text-sm leading-6 text-muted-foreground">{body}</p> : null}
        </div>
        {tone !== "neutral" && Icon ? (
          <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", pillClass)}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {toneLabel ?? (tone === "up" ? lang("מגמת עלייה", "Trending up") : lang("מגמת ירידה", "Trending down"))}
          </span>
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
  comparisonContext,
  // This wrapper's generated copy is still English-only, so it renders the
  // English chrome to stay internally consistent. Pass "he" once the sentence
  // templates below are translated.
  locale = "en"
}: {
  overview: OverviewPayload;
  comparisonContext?: string;
  locale?: AppLocale;
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

  return <NarrativeBanner headline={headline} context={comparisonContext} body={body} tone={positive ? "up" : "down"} locale={locale} />;
}
