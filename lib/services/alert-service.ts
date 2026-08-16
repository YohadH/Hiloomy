import { getAnalyticsRepository } from "@/lib/repositories";
import { getAppLocale } from "@/lib/i18n";
import type { Alert } from "@/lib/domain/types";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getOverviewPayload, getProfitAnalyticsPayload, getRetentionPayload } from "@/lib/services/analytics-service";

export async function generateAlerts(): Promise<Alert[]> {
  const locale = await getAppLocale();
  const [overview, profit, retention, range] = await Promise.all([
    getOverviewPayload(),
    getProfitAnalyticsPayload(),
    getRetentionPayload(),
    getReportingDateRangeSelection(locale)
  ]);
  // The alerts are computed over the SELECTED reporting window, so the period
  // label must reflect that window — not a hardcoded "Last 30 days" that lies
  // when the user picks 7/90/custom days.
  const periodLabel = range.label;

  const alerts: Alert[] = [];
  const revenueMetric = overview.comparisonMetrics[0];
  const discountMetric = overview.comparisonMetrics[3];
  const returningMetric = overview.comparisonMetrics[2];
  const refundKpi = overview.kpis[5];
  const topGrowthProduct = profit.topProducts[0];

  if (revenueMetric && revenueMetric.change < 0) {
    alerts.push({
      id: "rule-revenue-down",
      severity: "high",
      title: locale === "he" ? "ההכנסות ירדו מול התקופה הקודמת" : "Revenue is down versus the prior period",
      explanation: locale === "he" ? `ההכנסות זזו ב-${Math.abs(revenueMetric.change).toFixed(1)}% מול החלון הקודם.` : `Revenue moved ${revenueMetric.change.toFixed(1)}% against the previous window.`,
      suggestedAction: locale === "he" ? "בדקו את הביקוש למוצרים המובילים, תמהיל ההנחות וקצב ההזמנות לפני העדכון הבא למייסד." : "Review top product demand, discount mix, and order cadence before the next founder update.",
      periodLabel,
      timestamp: new Date().toISOString()
    });
  }

  if (discountMetric && discountMetric.change > 0.5) {
    alerts.push({
      id: "rule-discount-spike",
      severity: "medium",
      title: locale === "he" ? "שיעור ההנחות עולה מהר יותר מהתקופה הקודמת" : "Discount rate is rising faster than the prior period",
      explanation: locale === "he" ? `שיעור ההנחות השתנה ב-${discountMetric.change.toFixed(1)} נקודות.` : `Discount rate changed by ${discountMetric.change.toFixed(1)} points.`,
      suggestedAction: locale === "he" ? "בדקו אם העלייה בהכנסות באמת מוצדקת ברמת הרווחיות, וצמצמו מבצעים חלשים אם צריך." : "Check whether the revenue lift is justified by profit contribution and tighten low-margin offers if needed.",
      periodLabel,
      timestamp: new Date().toISOString()
    });
  }

  if ((refundKpi?.value ?? 0) > 3) {
    alerts.push({
      id: "rule-refund-spike",
      severity: "medium",
      title: locale === "he" ? "שיעור ההחזרים גבוה" : "Refund rate is elevated",
      explanation: locale === "he" ? `שיעור ההחזרים עומד כרגע על ${refundKpi?.value.toFixed(1)}%.` : `Refund rate is currently ${refundKpi?.value.toFixed(1)}%.`,
      suggestedAction: locale === "he" ? "עברו על המוצרים עם הכי הרבה החזרים ובעיות לוגיסטיקה לפני שהשחיקה במרווח תעמיק." : "Inspect refund-heavy products and fulfillment issues before margin erosion compounds.",
      periodLabel,
      timestamp: new Date().toISOString()
    });
  }

  if (returningMetric && returningMetric.change < 0) {
    alerts.push({
      id: "rule-repeat-rate-drop",
      severity: "medium",
      title: locale === "he" ? "שיעור הלקוחות החוזרים נחלש מול התקופה הקודמת" : "Returning customer rate slipped versus the prior period",
      explanation: locale === "he" ? `ביצועי הרכישה החוזרת זזו ב-${Math.abs(returningMetric.change).toFixed(1)} נקודות.` : `Repeat performance moved ${returningMetric.change.toFixed(1)} points.`,
      suggestedAction: locale === "he" ? "בדקו את התזמון של הזמנה שנייה ואת מסרי שימור הלקוחות לרוכשים חדשים." : "Review second-order timing and retention messages for recent first-time buyers.",
      periodLabel,
      timestamp: new Date().toISOString()
    });
  }

  if (topGrowthProduct) {
    alerts.push({
      id: "rule-strong-product-growth",
      severity: "low",
      title: locale === "he" ? `${topGrowthProduct.productTitle} הוא מוצר חזק במיוחד` : `${topGrowthProduct.productTitle} is a strong performer`,
      explanation: locale === "he" ? `המוצר מוביל את התקופה עם ${Math.round(topGrowthProduct.revenue).toLocaleString()} בהכנסות.` : `This product is leading the period with ${Math.round(topGrowthProduct.revenue).toLocaleString()} in revenue.`,
      suggestedAction: locale === "he" ? "שמרו על מלאי זמין והגנו על מרווח התרומה של המוצר הזה." : "Monitor inventory and protect contribution margin on this product.",
      periodLabel,
      timestamp: new Date().toISOString()
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "rule-no-alerts",
      severity: "low",
      title: locale === "he" ? "לא זוהו חריגות משמעותיות" : "No major anomalies detected",
      explanation: locale === "he" ? `שיעור הרכישה החוזרת הוא ${retention.snapshot.repeatPurchaseRate.toFixed(1)}% והתקופה נראית יציבה יחסית.` : `Repeat rate is ${retention.snapshot.repeatPurchaseRate.toFixed(1)}% and the current period is relatively stable.`,
      suggestedAction: locale === "he" ? "שמרו על סנכרון עדכני ועברו על קלט הסיכום לפני שליחת הדיווחים." : "Keep syncs current and review the founder summary inputs before sending reports.",
      periodLabel,
      timestamp: new Date().toISOString()
    });
  }

  return alerts;
}

export async function getAlerts(): Promise<Alert[]> {
  const locale = await getAppLocale();
  const repository = await getAnalyticsRepository();
  const stored = await repository.getAlerts();
  if (stored.length && locale === "en") return stored;
  return generateAlerts();
}
