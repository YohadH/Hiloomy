import { getProfitAnalyticsFromDb, getRetentionAnalyticsFromDb, getShopifyParityOverview } from "@/lib/data/prisma-analytics-repository";
import { getAnalyticsRepository } from "@/lib/repositories";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getAppLocale, getDictionary } from "@/lib/i18n";
import type {
  Alert,
  ComparisonMetric,
  DailyMetric,
  FounderSummaryInputs,
  OverviewPayload,
  ProfitAnalyticsPayload,
  RetentionPayload
} from "@/lib/domain/types";

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

// Weighted-by-denominator average of daily rates.
//
// Bug audit Pattern B (docs/ANALYTICS-AUDIT-2026-06-16.md) — averaging
// pre-computed daily rates across a window is mathematically wrong:
//
//   Day 1: 100 orders, 50 returning (50% rate)
//   Day 2:  10 orders,  0 returning ( 0% rate)
//   avg([50,0]) = 25%      WRONG
//   correct:    50/110 = 45.5%
//
// We can recover the correct sum-of-numerators / sum-of-denominators
// value without a schema change because each day's numerator is
// `denominator × rate`. So:
//
//   sum(rate_i * denominator_i) / sum(denominator_i)
//   = sum(numerator_i)          / sum(denominator_i)
//   = the correct window rate
//
// Use this any time the buggy `average(daily.map(m => m.rate))` pattern
// shows up in a fallback path where parity data isn't available.
function windowRateWeighted(rates: number[], denominators: number[]): number {
  if (rates.length !== denominators.length) {
    // Defensive: shouldn't happen — but fall back to plain average
    // rather than throw. The rate is only approximate at the boundary
    // where parity data is missing anyway.
    return average(rates);
  }
  let numeratorTotal = 0;
  let denominatorTotal = 0;
  for (let i = 0; i < rates.length; i++) {
    const rate = rates[i];
    const denom = denominators[i];
    if (!Number.isFinite(rate) || !Number.isFinite(denom) || denom <= 0) continue;
    numeratorTotal += rate * denom;
    denominatorTotal += denom;
  }
  return denominatorTotal > 0 ? numeratorTotal / denominatorTotal : 0;
}

// Legacy comparison builder — used ONLY when the Shopify-parity layer is
// unavailable (no DB / disconnected store). The rate metrics it produces
// here are mathematically wrong (averages of daily rates rather than
// sum-of-numerators / sum-of-denominators) but the parity-fed path is
// preferred everywhere a real Shopify connection exists, so this only
// affects the legacy / fallback signal. Do NOT extend this — fix the
// underlying parity-fed path instead.
function buildComparisonMetrics(
  currentMetrics: DailyMetric[],
  previousMetrics: DailyMetric[],
  labels: {
    revenue: string;
    estimatedProfit: string;
    returningCustomerRate: string;
    discountRate: string;
  }
): ComparisonMetric[] {
  const revenueCurrent = sum(currentMetrics.map((metric) => metric.revenue));
  const revenuePrevious = sum(previousMetrics.map((metric) => metric.revenue));
  const profitCurrent = sum(currentMetrics.map((metric) => metric.estimatedProfit));
  const profitPrevious = sum(previousMetrics.map((metric) => metric.estimatedProfit));
  // Bug audit Pattern B — weight rates by their true denominator.
  // Retention rate = returning / total_orders, so weight by orders.
  const retentionCurrent = windowRateWeighted(
    currentMetrics.map((m) => m.returningCustomerRate),
    currentMetrics.map((m) => m.orders)
  );
  const retentionPrevious = windowRateWeighted(
    previousMetrics.map((m) => m.returningCustomerRate),
    previousMetrics.map((m) => m.orders)
  );
  // Discount rate = discount_amount / revenue, so weight by revenue.
  const discountCurrent = windowRateWeighted(
    currentMetrics.map((m) => m.discountRate),
    currentMetrics.map((m) => m.revenue)
  );
  const discountPrevious = windowRateWeighted(
    previousMetrics.map((m) => m.discountRate),
    previousMetrics.map((m) => m.revenue)
  );
  const calcChange = (current: number, previous: number) => (previous === 0 ? 0 : ((current - previous) / previous) * 100);

  return [
    { label: labels.revenue, current: revenueCurrent, previous: revenuePrevious, change: calcChange(revenueCurrent, revenuePrevious) },
    { label: labels.estimatedProfit, current: profitCurrent, previous: profitPrevious, change: calcChange(profitCurrent, profitPrevious) },
    { label: labels.returningCustomerRate, current: retentionCurrent, previous: retentionPrevious, change: retentionCurrent - retentionPrevious },
    { label: labels.discountRate, current: discountCurrent, previous: discountPrevious, change: discountCurrent - discountPrevious }
  ];
}

// Build comparison metrics directly from Shopify-parity period summaries
// (cur + prev objects). The parity layer already computes rates as
// sum(numerators)/sum(denominators) across the window, so no rate-of-rates
// trap here. Used when both sides of the comparison have parity data.
function buildComparisonMetricsFromParity(
  cur: NonNullable<Awaited<ReturnType<typeof getShopifyParityOverview>>>["current"],
  prev: NonNullable<Awaited<ReturnType<typeof getShopifyParityOverview>>>["previous"],
  labels: {
    revenue: string;
    estimatedProfit: string;
    returningCustomerRate: string;
    discountRate: string;
  }
): ComparisonMetric[] {
  const calcChange = (current: number, previous: number) =>
    previous === 0 ? 0 : ((current - previous) / previous) * 100;
  return [
    { label: labels.revenue, current: cur.totalSales, previous: prev.totalSales, change: calcChange(cur.totalSales, prev.totalSales) },
    { label: labels.estimatedProfit, current: cur.estimatedProfit, previous: prev.estimatedProfit, change: calcChange(cur.estimatedProfit, prev.estimatedProfit) },
    // Rates compare as percentage-point deltas (absolute), not relative
    // percent change, to match the parity-fed AOV/refund delta pattern
    // already used below.
    { label: labels.returningCustomerRate, current: cur.returningCustomerRate, previous: prev.returningCustomerRate, change: cur.returningCustomerRate - prev.returningCustomerRate },
    { label: labels.discountRate, current: cur.discountRate, previous: prev.discountRate, change: cur.discountRate - prev.discountRate }
  ];
}

function buildOverviewAlerts(locale: "en" | "he", refundRate: number, discountRate: number, returningCustomerRate: number): Alert[] {
  if (locale === "he") {
    return [
      {
        id: "overview-alert-refunds",
        severity: "high",
        title: "שיעור ההחזרים גבוה מהרגיל",
        explanation: `שיעור ההחזרים עומד על ${refundRate.toFixed(1)}% בחלון הנוכחי.`,
        suggestedAction: "בדקו את המוצרים עם הכי הרבה החזרים ואת איכות המשלוח והשירות.",
        periodLabel: "30 הימים האחרונים",
        timestamp: new Date().toISOString()
      },
      {
        id: "overview-alert-discounts",
        severity: "medium",
        title: "תמהיל ההנחות דורש בדיקה",
        explanation: `שיעור ההנחות הממוצע עומד על ${discountRate.toFixed(1)}% בתקופה הנוכחית.`,
        suggestedAction: "בדקו אילו קודים מייצרים הכנסה בלי לפגוע יותר מדי ברווח.",
        periodLabel: "30 הימים האחרונים",
        timestamp: new Date().toISOString()
      },
      {
        id: "overview-alert-repeat",
        severity: "low",
        title: "שיעור הלקוחות החוזרים ראוי למעקב",
        explanation: `שיעור הלקוחות החוזרים כרגע הוא ${returningCustomerRate.toFixed(1)}%.`,
        suggestedAction: "עברו על מסלולי הזמנה שנייה ועל מוצרי שימור הלקוחות המרכזיים.",
        periodLabel: "30 הימים האחרונים",
        timestamp: new Date().toISOString()
      }
    ];
  }

  return [
    {
      id: "overview-alert-refunds",
      severity: "high",
      title: "Refund rate is elevated",
      explanation: `Refund rate is ${refundRate.toFixed(1)}% in the current window.`,
      suggestedAction: "Review refund-heavy products and post-purchase experience.",
      periodLabel: "Last 30 days",
      timestamp: new Date().toISOString()
    },
    {
      id: "overview-alert-discounts",
      severity: "medium",
      title: "Discount mix needs review",
      explanation: `Average discount rate is ${discountRate.toFixed(1)}% in the current period.`,
      suggestedAction: "Check which offers are driving revenue without eroding profit.",
      periodLabel: "Last 30 days",
      timestamp: new Date().toISOString()
    },
    {
      id: "overview-alert-repeat",
      severity: "low",
      title: "Returning customer rate should be monitored",
      explanation: `Returning customer rate is ${returningCustomerRate.toFixed(1)}% right now.`,
      suggestedAction: "Review second-order programs and top retention products.",
      periodLabel: "Last 30 days",
      timestamp: new Date().toISOString()
    }
  ];
}

export async function getOverviewPayload(): Promise<OverviewPayload> {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const repository = await getAnalyticsRepository();
  const reportingRange = await getReportingDateRangeSelection(locale);
  const comparisonEnabled = reportingRange.comparison.enabled;

  const [store, parity, collectionPerformance, discounts, productPerformance] = await Promise.all([
    repository.getStore(),
    getShopifyParityOverview(),
    repository.getCollectionPerformance(),
    repository.getDiscountUsage(),
    getProfitAnalyticsPayload().then((payload) => payload.productPerformance)
  ]);

  // Shopify-parity numbers (reconcile to Shopify's Sales report). Fall back to
  // the legacy per-order metrics only when the parity layer is unavailable
  // (no DB / disconnected preview store).
  const cur = parity?.current ?? null;
  const prev = parity?.previous ?? null;
  const dailyMetrics: DailyMetric[] = parity ? parity.daily : await repository.getDailyMetrics();
  const previousPeriodMetrics: DailyMetric[] =
    comparisonEnabled && prev
      ? [
          {
            date: "previous",
            revenue: prev.totalSales,
            estimatedProfit: prev.estimatedProfit,
            returningCustomerRate: prev.returningCustomerRate,
            averageOrderValue: prev.averageOrderValue,
            discountRate: prev.discountRate,
            refundRate: prev.refundRate,
            orders: prev.orders
          }
        ]
      : comparisonEnabled && !parity
        ? await repository.getPreviousPeriodMetrics()
        : [];

  // Prefer the parity-fed comparison when both sides have parity data —
  // its rates are sum-of-numerators / sum-of-denominators across the
  // window (correct). Fall back to the legacy buildComparisonMetrics
  // path only when no parity is available (disconnected/preview store).
  const comparisonLabels = {
    revenue: dictionary.overview.revenue,
    estimatedProfit: dictionary.overview.estimatedProfit,
    returningCustomerRate: locale === "he" ? "שיעור לקוחות חוזרים" : "Returning Customer Rate",
    discountRate: locale === "he" ? "שיעור הנחות" : "Discount Rate"
  };
  const comparisonMetrics = comparisonEnabled
    ? cur && prev
      ? buildComparisonMetricsFromParity(cur, prev, comparisonLabels)
      : buildComparisonMetrics(dailyMetrics, previousPeriodMetrics, comparisonLabels)
    : [];
  const revenue = cur ? cur.totalSales : sum(dailyMetrics.map((metric) => metric.revenue));
  const estimatedProfit = cur ? cur.estimatedProfit : sum(dailyMetrics.map((metric) => metric.estimatedProfit));
  // Fallback path — no parity data. Rate metrics use windowRateWeighted
  // (Pattern B fix) so we don't ship "average of daily rates" nonsense.
  const returningCustomerRate = cur
    ? cur.returningCustomerRate
    : windowRateWeighted(
        dailyMetrics.map((m) => m.returningCustomerRate),
        dailyMetrics.map((m) => m.orders)
      );
  // Bug #20 — AOV must be sum(revenue) / sum(orders), not avg of daily AOVs.
  const totalOrders = sum(dailyMetrics.map((m) => m.orders));
  const averageOrderValue = cur
    ? cur.averageOrderValue
    : totalOrders > 0
      ? sum(dailyMetrics.map((m) => m.revenue)) / totalOrders
      : 0;
  const discountRate = cur
    ? cur.discountRate
    : windowRateWeighted(
        dailyMetrics.map((m) => m.discountRate),
        dailyMetrics.map((m) => m.revenue)
      );
  const refundRate = cur
    ? cur.refundRate
    : windowRateWeighted(
        dailyMetrics.map((m) => m.refundRate),
        dailyMetrics.map((m) => m.revenue)
      );
  const topProduct = productPerformance[0];
  const mostProfitableCollection = [...collectionPerformance].sort((a, b) => b.estimatedProfit - a.estimatedProfit)[0];
  const topDiscount = discounts[0];
  const biggestDropMetric = comparisonMetrics.filter((metric) => metric.change < 0).sort((a, b) => a.change - b.change)[0];
  const alerts = buildOverviewAlerts(locale, refundRate, discountRate, returningCustomerRate);
  const aovChange =
    comparisonEnabled && cur && prev
      ? cur.averageOrderValue - prev.averageOrderValue
      : comparisonEnabled && !parity
        ? averageOrderValue - average(previousPeriodMetrics.map((metric) => metric.averageOrderValue))
        : undefined;
  const refundChange =
    comparisonEnabled && cur && prev
      ? cur.refundRate - prev.refundRate
      : comparisonEnabled && !parity
        ? refundRate - average(previousPeriodMetrics.map((metric) => metric.refundRate))
        : undefined;

  const payload: OverviewPayload = {
    store,
    kpis: [
      { label: dictionary.overview.revenue, value: revenue, change: comparisonMetrics[0]?.change, format: "currency" },
      { label: dictionary.overview.estimatedProfit, value: estimatedProfit, change: comparisonMetrics[1]?.change, format: "currency" },
      { label: locale === "he" ? "שיעור לקוחות חוזרים" : "Returning Customer Rate", value: returningCustomerRate, change: comparisonMetrics[2]?.change, format: "percent" },
      { label: locale === "he" ? "ערך הזמנה ממוצע" : "Average Order Value", value: averageOrderValue, change: aovChange, format: "currency" },
      { label: locale === "he" ? "שיעור הנחות" : "Discount Rate", value: discountRate, change: comparisonMetrics[3]?.change, format: "percent" },
      { label: locale === "he" ? "שיעור החזרים" : "Refund Rate", value: refundRate, change: refundChange, format: "percent" }
    ],
    dailyMetrics,
    insights: [
      {
        title: locale === "he" ? "המוצר המוביל" : "Top performing product",
        detail: topProduct
          ? locale === "he"
            ? `${topProduct.productTitle} הוא כרגע מנוע ההכנסות החזק ביותר.`
            : `${topProduct.productTitle} is currently the strongest revenue driver.`
          : locale === "he"
            ? "עדיין אין נתוני מוצרים זמינים."
            : "No product data is available yet.",
        emphasis: topProduct ? (locale === "he" ? `${Math.round(topProduct.revenue).toLocaleString()} הכנסות בתקופה הנוכחית` : `${Math.round(topProduct.revenue).toLocaleString()} revenue in the current period`) : undefined
      },
      {
        title: locale === "he" ? "ההנחה המובילה לפי שימוש" : "Top discount by usage",
        detail: topDiscount
          ? locale === "he"
            ? `${topDiscount.code} הוא מנוף ההנחה הבולט ביותר בתקופה הנוכחית.`
            : `${topDiscount.code} is the most visible discount lever in the current period.`
          : locale === "he"
            ? "עדיין לא נרשם שימוש בהנחות."
            : "No discount usage has been recorded yet.",
        emphasis: topDiscount ? (locale === "he" ? `${topDiscount.orderCount} הזמנות הושפעו` : `${topDiscount.orderCount} influenced orders`) : undefined
      },
      {
        title: locale === "he" ? "הקטגוריה הרווחית ביותר" : "Most profitable collection",
        detail: mostProfitableCollection
          ? locale === "he"
            ? `${mostProfitableCollection.collection} מחזיקה כרגע את מרווח התרומה המשוער החזק ביותר.`
            : `${mostProfitableCollection.collection} is carrying the best estimated contribution margin.`
          : locale === "he"
            ? "ביצועי הקטגוריות יופיעו לאחר הסנכרון."
            : "Collection performance will appear after sync.",
        emphasis: mostProfitableCollection ? (locale === "he" ? `${Math.round(mostProfitableCollection.estimatedProfit).toLocaleString()} רווח משוער` : `${Math.round(mostProfitableCollection.estimatedProfit).toLocaleString()} estimated profit`) : undefined
      },
      {
        title: locale === "he" ? "הירידה הגדולה ביותר מול התקופה הקודמת" : "Biggest drop vs prior period",
        detail: biggestDropMetric
          ? locale === "he"
            ? `${biggestDropMetric.label} נחלש מול חלון ההשוואה הקודם.`
            : `${biggestDropMetric.label} softened versus the previous comparison window.`
          : locale === "he"
            ? "לא זוהתה ירידה מהותית מול התקופה הקודמת."
            : "No major downside move versus the previous period.",
        emphasis: biggestDropMetric ? (locale === "he" ? `שינוי של ${biggestDropMetric.change.toFixed(1)}` : `${biggestDropMetric.change.toFixed(1)} change`) : undefined
      },
      {
        title: locale === "he" ? "תובנת רכישה חוזרת" : "Repeat purchase highlight",
        detail: locale === "he"
          ? "אנליטיקת שימור הלקוחות נשענת כעת על הזמנות ולקוחות מנורמלים ולא רק על הערכות מדומות."
          : "Retention analytics is now sourced from normalized orders and customer history rather than placeholder estimates.",
        emphasis: locale === "he" ? `${returningCustomerRate.toFixed(1)}% שיעור חוזרים` : `${returningCustomerRate.toFixed(1)}% returning rate`
      }
    ],
    actionPanel: [
      {
        title: locale === "he" ? "מה השתנה השבוע" : "What changed this week",
        items: [
          locale === "he"
            ? `ההכנסות הן ${comparisonMetrics[0]?.change.toFixed(1) ?? "0.0"}% לעומת התקופה הקודמת.`
            : `Revenue is ${comparisonMetrics[0]?.change.toFixed(1) ?? "0.0"}% versus the previous period.`,
          locale === "he"
            ? `הרווח המשוער הוא ${comparisonMetrics[1]?.change.toFixed(1) ?? "0.0"}% לעומת התקופה הקודמת.`
            : `Estimated profit is ${comparisonMetrics[1]?.change.toFixed(1) ?? "0.0"}% versus the previous period.`
        ]
      },
      {
        title: locale === "he" ? "מה דורש תשומת לב" : "What needs attention",
        items: [
          locale === "he"
            ? `שיעור ההנחות עומד על ממוצע של ${discountRate.toFixed(1)}% בחלון הנוכחי.`
            : `Discount rate is averaging ${discountRate.toFixed(1)}% across the current window.`,
          locale === "he"
            ? `שיעור ההחזרים עומד על ממוצע של ${refundRate.toFixed(1)}% בחלון הנוכחי.`
            : `Refund rate is averaging ${refundRate.toFixed(1)}% across the current window.`
        ]
      },
      {
        title: locale === "he" ? "פעולות מומלצות" : "Recommended actions",
        items: [
          locale === "he"
            ? "בדקו את טבלת הרווחיות ברמת מוצר כדי לזהות הזמנות עמוסות הנחות ומוצרים עם מרווח נמוך."
            : "Review the product-level profit table to isolate discount-heavy orders and low-margin products.",
          locale === "he"
            ? "השתמשו בבקרות הסנכרון בהגדרות כדי לשמור את הדיווח מעודכן ומוכן להתראות ולסיכומי מייסד."
            : "Use the sync controls in Settings to keep reporting current and ready for alerts and founder summaries."
        ]
      }
    ],
    productPerformance,
    collectionPerformance,
    discounts,
    alerts,
    comparisonMetrics,
    comparisonEnabled
  };

  if (!comparisonEnabled) {
    // No comparison selected: drop the comparative "What changed this week"
    // panel (always the first actionPanel entry) and the "Biggest drop vs
    // prior period" insight (always the 4th insight) so nothing implies a
    // period-over-period delta the user didn't ask for.
    payload.actionPanel = payload.actionPanel.slice(1);
    payload.insights = payload.insights.filter((_, index) => index !== 3);
  }

  return payload;
}

export async function getProfitAnalyticsPayload(): Promise<ProfitAnalyticsPayload> {
  const locale = await getAppLocale();
  const dbPayload = await getProfitAnalyticsFromDb();
  if (dbPayload) return dbPayload;

  const repository = await getAnalyticsRepository();
  const [orders, products, collectionPerformance, discountUsage] = await Promise.all([
    repository.getOrders(),
    repository.getProducts(),
    repository.getCollectionPerformance(),
    repository.getDiscountUsage()
  ]);

  const productLookup = new Map(products.map((product) => [product.id, { title: product.title, collection: product.collection }]));
  const productPerformance = orders.flatMap((order) =>
    order.lineItems
      .filter((item) => item.productId && productLookup.has(item.productId))
      .map((item) => ({
        productId: item.productId as string,
        productTitle: productLookup.get(item.productId as string)?.title ?? (locale === "he" ? "מוצר לא ידוע" : "Unknown product"),
        collection: productLookup.get(item.productId as string)?.collection ?? (locale === "he" ? "ללא קטגוריה" : "Uncategorized"),
        unitsSold: item.quantity,
        revenue: item.unitPrice * item.quantity,
        estimatedProfit: item.unitPrice * item.quantity - item.discountAmount - item.estimatedCost,
        discountImpact: item.discountAmount,
        refundImpact: 0,
        inventoryQuantity: null,
        collections: []
      }))
  );

  const sortedByProfit = [...productPerformance].sort((a, b) => b.estimatedProfit - a.estimatedProfit);

  return {
    productPerformance,
    collectionPerformance,
    discountUsage,
    topProducts: productPerformance.slice(0, 4),
    lowProducts: [...productPerformance].sort((a, b) => a.estimatedProfit - b.estimatedProfit).slice(0, 4),
    momProfitDelta: null,
    topProfitableProducts: sortedByProfit.slice(0, 5),
    leastProfitableProducts: [...productPerformance].sort((a, b) => a.estimatedProfit - b.estimatedProfit).slice(0, 5)
  };
}

export async function getRetentionPayload(): Promise<RetentionPayload> {
  const locale = await getAppLocale();
  const dbPayload = await getRetentionAnalyticsFromDb();
  if (dbPayload) return dbPayload;

  const repository = await getAnalyticsRepository();
  const [dailyMetrics, previousDailyMetrics] = await Promise.all([
    repository.getDailyMetrics(),
    repository.getPreviousPeriodMetrics()
  ]);

  return {
    snapshot: {
      newCustomers: 0,
      returningCustomers: 0,
      repeatPurchaseRate: average(dailyMetrics.map((metric) => metric.returningCustomerRate)),
      secondOrderRate: 0,
      averageDaysToSecondOrder: 0
    },
    dailyMetrics,
    previousDailyMetrics,
    firstOrderProducts: [],
    secondOrderProducts: [],
    cohortPlaceholder:
      locale === "he"
        ? "קוהורטות שימור לקוחות יתמלאנה כשיצטבר יותר היסטוריית הזמנות מנורמלת."
        : "Cohort retention modeling will populate once enough normalized order history is available."
  };
}

export async function getFounderSummaryInputs(): Promise<FounderSummaryInputs> {
  const [overview, profit] = await Promise.all([getOverviewPayload(), getProfitAnalyticsPayload()]);

  return {
    biggestRevenueMovers: overview.productPerformance.slice(0, 3).map((item) => `${item.productTitle} ${Math.round(item.revenue).toLocaleString()}`),
    biggestProfitMovers: profit.topProducts.slice(0, 3).map((item) => `${item.productTitle} ${Math.round(item.estimatedProfit).toLocaleString()}`),
    discountSpikes: overview.discounts.slice(0, 3).map((item) => `${item.code} ${item.orderCount}`),
    repeatRateChanges: [`${overview.kpis[2]?.value.toFixed(1) ?? "0.0"}%`],
    refundSpikes: [`${overview.kpis[5]?.value.toFixed(1) ?? "0.0"}%`],
    bestProducts: profit.topProducts.slice(0, 3).map((item) => item.productTitle),
    worstProducts: profit.lowProducts.slice(0, 3).map((item) => item.productTitle)
  };
}

export async function getAppChromeData(storeId?: string) {
  const locale = await getAppLocale();
  const repository = await getAnalyticsRepository();
  const [store, range] = await Promise.all([repository.getStore(storeId), getReportingDateRangeSelection(locale)]);

  return {
    store,
    controls: {
      dateRangeLabel: range.label,
      comparisonLabel: range.comparison.label,
      startDate: range.startInput,
      endDate: range.endInput,
      preset: range.preset,
      comparison: {
        mode: range.comparison.mode,
        enabled: range.comparison.enabled,
        startDate: range.comparison.startInput,
        endDate: range.comparison.endInput,
        label: range.comparison.label
      }
    }
  };
}
