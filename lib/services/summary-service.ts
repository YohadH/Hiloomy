import { getAnalyticsRepository } from "@/lib/repositories";
import { getAppLocale } from "@/lib/i18n";
import type { Summary } from "@/lib/domain/types";
import { getFounderSummaryInputs, getOverviewPayload, getProfitAnalyticsPayload, getRetentionPayload } from "@/lib/services/analytics-service";
import { getDb } from "@/lib/server/db";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { generateSummaryHeadline, type SummaryInsightInput } from "@/lib/services/summary-insights-service";

// Direct-from-Orders fallback for the headline %s.
//
// The existing comparison pipeline goes through DailyMetric aggregation /
// Shopify parity, both of which can return empty in dev environments or when
// the periodic aggregation hasn't run. When that happens the headline degrades
// to "Revenue is 0.0% versus the prior period…" — misleading, since the raw
// Order table actually has data. This function shortcuts straight to the
// Order rows, computes revenue + estimated profit for the current and prior
// reporting windows, and returns the % deltas (null when there is genuinely
// no prior data to compare against).
async function computeHeadlineDeltasFromOrders(
  locale: "en" | "he"
): Promise<{ revenueChange: number | null; profitChange: number | null } | null> {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) return null;
    const db = getDb();
    const range = await getReportingDateRangeSelection(locale);
    if (!range.comparison.enabled) return null;

    const [store, current, previous] = await Promise.all([
      db.store.findUnique({
        where: { id: storeId },
        select: { defaultCostRatio: true }
      }),
      db.order.aggregate({
        where: { storeId, createdAt: { gte: range.start, lte: range.end } },
        _sum: { totalPrice: true }
      }),
      db.order.aggregate({
        where: {
          storeId,
          createdAt: { gte: range.comparison.start, lte: range.comparison.end }
        },
        _sum: { totalPrice: true }
      })
    ]);

    const curRev = Number(current._sum.totalPrice ?? 0);
    const prevRev = Number(previous._sum.totalPrice ?? 0);
    // No prior period to compare against — null tells the headline builder
    // to fall through to the existing copy rather than show 0.0%.
    if (prevRev <= 0) return null;

    // Estimated profit uses the store's configured cost ratio (default 0.35).
    // Same flat multiplier for both periods so the comparison is apples-to-apples
    // even if the real margin profile is more sophisticated downstream.
    const costRatio = Number(store?.defaultCostRatio ?? 0.35);
    const margin = 1 - costRatio;
    const curProfit = curRev * margin;
    const prevProfit = prevRev * margin;

    return {
      revenueChange: ((curRev - prevRev) / prevRev) * 100,
      profitChange: prevProfit > 0 ? ((curProfit - prevProfit) / prevProfit) * 100 : null
    };
  } catch {
    return null;
  }
}

function buildGeneratedSummary(
  locale: "en" | "he",
  overview: Awaited<ReturnType<typeof getOverviewPayload>>,
  profit: Awaited<ReturnType<typeof getProfitAnalyticsPayload>>,
  retention: Awaited<ReturnType<typeof getRetentionPayload>>,
  inputs: Awaited<ReturnType<typeof getFounderSummaryInputs>>
): Summary {
  if (locale === "he") {
    return {
      id: "generated-summary",
      headline: `ההכנסות השתנו ב-${Math.abs(overview.comparisonMetrics[0]?.change ?? 0).toFixed(1)}% מול התקופה הקודמת, והרווח המשוער עומד על ${Math.abs(overview.comparisonMetrics[1]?.change ?? 0).toFixed(1)}%.`,
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: "ניצחונות",
          items: inputs.bestProducts.length
            ? inputs.bestProducts.map((item) => `${item} תורם כרגע בצורה חיובית לביצועי החנות ברמת מייסד.`)
            : ["חברו נתוני חנות כדי למלא ניצחונות ברמת מוצר."]
        },
        {
          title: "סיכונים",
          items: [
            `שיעור ההנחות עומד על ${overview.kpis[4]?.value.toFixed(1) ?? "0.0"}%.`,
            `שיעור ההחזרים עומד על ${overview.kpis[5]?.value.toFixed(1) ?? "0.0"}%.`
          ]
        },
        {
          title: "שינויים מרכזיים מול התקופה הקודמת",
          items: overview.comparisonMetrics.map((metric) => `${metric.label}: שינוי של ${metric.change.toFixed(1)}`)
        },
        {
          title: "תובנות מוצר",
          items: profit.topProducts.slice(0, 3).map((item) => `${item.productTitle} יצר ${Math.round(item.revenue).toLocaleString()} בהכנסות.`)
        },
        {
          title: "תובנות הנחות ומבצעים",
          items: inputs.discountSpikes.length ? inputs.discountSpikes.map((item) => `${item} הזמנות`) : ["לא זוהתה חריגת הנחות."]
        },
        {
          title: "תובנות שימור לקוחות",
          items: [
            `שיעור הרכישה החוזרת עומד על ${retention.snapshot.repeatPurchaseRate.toFixed(1)}%.`,
            `שיעור ההזמנה השנייה עומד על ${retention.snapshot.secondOrderRate.toFixed(1)}%.`
          ]
        },
        {
          title: "הצעדים הבאים",
          items: [
            "הריצו סנכרון אינקרמנטלי לפני שיתוף עדכון למייסד.",
            "עברו על עמודי הרווחיות ושימור הלקוחות כדי לזהות לחץ על מרווח והזדמנויות להזמנה שנייה."
          ]
        }
      ]
    };
  }

  return {
    id: "generated-summary",
    headline: `Revenue is ${overview.comparisonMetrics[0]?.change.toFixed(1) ?? "0.0"}% versus the prior period, with estimated profit at ${overview.comparisonMetrics[1]?.change.toFixed(1) ?? "0.0"}%.`,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "Wins",
        items: inputs.bestProducts.length
          ? inputs.bestProducts.map((item) => `${item} is contributing positively to founder-level performance.`)
          : ["Sync store data to populate product-level wins."]
      },
      {
        title: "Risks",
        items: [
          `Discount rate is ${overview.kpis[4]?.value.toFixed(1) ?? "0.0"}%.`,
          `Refund rate is ${overview.kpis[5]?.value.toFixed(1) ?? "0.0"}%.`
        ]
      },
      {
        title: "Key changes from previous period",
        items: overview.comparisonMetrics.map((metric) => `${metric.label}: ${metric.change.toFixed(1)} change`)
      },
      {
        title: "Product insights",
        items: profit.topProducts.slice(0, 3).map((item) => `${item.productTitle} generated ${Math.round(item.revenue).toLocaleString()} in revenue.`)
      },
      {
        title: "Discount and promotion insights",
        items: inputs.discountSpikes.length ? inputs.discountSpikes : ["No discount spikes detected."]
      },
      {
        title: "Retention insights",
        items: [
          `Repeat purchase rate is ${retention.snapshot.repeatPurchaseRate.toFixed(1)}%.`,
          `Second-order rate is ${retention.snapshot.secondOrderRate.toFixed(1)}%.`
        ]
      },
      {
        title: "Recommended next actions",
        items: [
          "Run incremental sync before publishing a founder update.",
          "Review the profit and retention pages for margin pressure and second-order opportunities."
        ]
      }
    ]
  };
}

function buildHeadlineFromDeltas(
  locale: "en" | "he",
  deltas: { revenueChange: number | null; profitChange: number | null }
): string {
  const rev = deltas.revenueChange;
  const prof = deltas.profitChange;
  if (locale === "he") {
    return `הכנסות השתנו ב${rev != null ? Math.abs(rev).toFixed(1) : "0.0"}% מול התקופה הקודמת, והרווח המשוער ב${prof != null ? Math.abs(prof).toFixed(1) : "0.0"}%.`;
  }
  return `Revenue is ${rev != null ? rev.toFixed(1) : "0.0"}% versus the prior period, with estimated profit at ${prof != null ? prof.toFixed(1) : "0.0"}%.`;
}

function headlineLooksBogus(headline: string): boolean {
  // A headline like "Revenue is 0.0% versus the prior period, with estimated
  // profit at 0.0%." (or its Hebrew equivalent) is the placeholder pattern
  // that fires when the comparison pipeline returns nothing. We rewrite it
  // from the Order table directly.
  return /\b0\.0%[^0-9]+0\.0%/.test(headline);
}

export async function getLatestSummary(): Promise<Summary> {
  const locale = await getAppLocale();
  const repository = await getAnalyticsRepository();
  const summaries = await repository.getSummaries();

  // Compute order-based deltas in parallel with whichever summary path we
  // take, so we can repair a bogus headline regardless of source.
  const orderDeltasPromise = computeHeadlineDeltasFromOrders(locale);

  if (summaries.length && locale === "en") {
    const stored = summaries[0];
    const orderDeltas = await orderDeltasPromise;
    if (orderDeltas && headlineLooksBogus(stored.headline)) {
      return { ...stored, headline: buildHeadlineFromDeltas(locale, orderDeltas) };
    }
    return stored;
  }

  const [overview, profit, retention, inputs, orderDeltas] = await Promise.all([
    getOverviewPayload(),
    getProfitAnalyticsPayload(),
    getRetentionPayload(),
    getFounderSummaryInputs(),
    orderDeltasPromise
  ]);

  const summary = buildGeneratedSummary(locale, overview, profit, retention, inputs);

  // Override the headline when the structured comparison came up empty but
  // the Order-based fallback has real numbers to report.
  const overviewRevenueChange = overview.comparisonMetrics[0]?.change;
  const overviewProfitChange = overview.comparisonMetrics[1]?.change;
  const overviewLooksEmpty =
    (overviewRevenueChange === undefined || overviewRevenueChange === 0) &&
    (overviewProfitChange === undefined || overviewProfitChange === 0);
  if ((overviewLooksEmpty || headlineLooksBogus(summary.headline)) && orderDeltas) {
    summary.headline = buildHeadlineFromDeltas(locale, orderDeltas);
  }

  return summary;
}

// Assemble the structured metric inputs the LLM needs from the real payloads.
// Prefers the Order-table deltas for revenue/profit (the most reliable source,
// same shortcut the headline-repair path uses) and falls back to the
// comparison-pipeline figures when the Order deltas come up empty.
function buildSummaryInsightInput(
  overview: Awaited<ReturnType<typeof getOverviewPayload>>,
  profit: Awaited<ReturnType<typeof getProfitAnalyticsPayload>>,
  retention: Awaited<ReturnType<typeof getRetentionPayload>>,
  orderDeltas: { revenueChange: number | null; profitChange: number | null } | null
): SummaryInsightInput {
  const revenueChange =
    orderDeltas?.revenueChange ?? overview.comparisonMetrics[0]?.change ?? null;
  const profitChange =
    orderDeltas?.profitChange ?? overview.comparisonMetrics[1]?.change ?? null;

  const top = profit.topProducts[0];
  return {
    revenueChange,
    profitChange,
    topProduct: top ? { title: top.productTitle, revenue: top.revenue } : null,
    keyChanges: overview.comparisonMetrics
      .filter((m) => Number.isFinite(m.change))
      .slice(0, 4)
      .map((m) => ({ label: m.label, change: m.change })),
    discountRate: overview.kpis[4]?.value ?? null,
    refundRate: overview.kpis[5]?.value ?? null,
    repeatPurchaseRate: retention.snapshot.repeatPurchaseRate ?? null,
    secondOrderRate: retention.snapshot.secondOrderRate ?? null
  };
}

// Replaces the hand-crafted template headline with an OpenAI LLM prompt
// pipeline (SA-HIGH-05). Keeps the structured sections from the deterministic
// builder — they back the print/UI layout — but rewrites the founder-facing
// headline as a concise 3-5 sentence AI summary in the store's locale.
// Falls back to the template summary verbatim when OPENAI_API_KEY is missing
// or the LLM call fails (generateSummaryHeadline returns null, never throws).
export async function regenerateSummary(): Promise<Summary> {
  const locale = await getAppLocale();

  const [overview, profit, retention, inputs, orderDeltas] = await Promise.all([
    getOverviewPayload(),
    getProfitAnalyticsPayload(),
    getRetentionPayload(),
    getFounderSummaryInputs(),
    computeHeadlineDeltasFromOrders(locale)
  ]);

  const summary = buildGeneratedSummary(locale, overview, profit, retention, inputs);

  // Repair a bogus/empty template headline from the Order deltas first, so the
  // deterministic fallback below is already the best non-AI copy we can show.
  const overviewLooksEmpty =
    (overview.comparisonMetrics[0]?.change === undefined ||
      overview.comparisonMetrics[0]?.change === 0) &&
    (overview.comparisonMetrics[1]?.change === undefined ||
      overview.comparisonMetrics[1]?.change === 0);
  if ((overviewLooksEmpty || headlineLooksBogus(summary.headline)) && orderDeltas) {
    summary.headline = buildHeadlineFromDeltas(locale, orderDeltas);
  }

  // LLM pass: produce a 3-5 sentence founder-facing summary from the real
  // metrics. On any failure (no key / network / bad JSON) it returns null and
  // we keep the deterministic headline above.
  try {
    const aiHeadline = await generateSummaryHeadline(
      buildSummaryInsightInput(overview, profit, retention, orderDeltas),
      locale
    );
    if (aiHeadline) {
      return { ...summary, headline: aiHeadline };
    }
  } catch {
    // Defensive: generateSummaryHeadline already swallows its own errors, but
    // never let summary regeneration throw — fall through to the template.
  }

  return summary;
}

