import { CalendarClock, Repeat, TrendingUp, UserPlus, Users2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatTile } from "@/components/dashboard-v2/kpi-tile";
import { RetentionLineChartV2 } from "@/components/dashboard-v2/retention-line-chart";
import { BarInsightChart } from "@/components/charts/bar-insight-chart";
import { getAppChromeData, getRetentionPayload } from "@/lib/services/analytics-service";
import { buildCohortRetention } from "@/lib/services/cohort-retention-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { CohortHeatmap } from "@/components/retention/cohort-heatmap";
import { formatNumber } from "@/lib/utils";
import { getAppLocale, getDictionary } from "@/lib/i18n";
import type { StatTileStatus } from "@/components/dashboard-v2/kpi-tile";

export default async function RetentionPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const tips = dictionary.retention.tips;
  const [retention, chrome, storeId] = await Promise.all([
    getRetentionPayload(),
    getAppChromeData(),
    resolveActiveStoreId()
  ]);
  const snap = retention.snapshot;
  // 12-month cohort retention — the single best signal for LTV health.
  const cohortReport = storeId
    ? await buildCohortRetention({ storeId, lookbackMonths: 12 }).catch(() => null)
    : null;

  // --- KPI health thresholds ---
  // repeatPurchaseRate > 20% = good, < 10% = warn — but NEVER a warn badge
  // when the window simply has no customers (0/0 is absence of data, not a
  // measured 0%).
  const repeatRateStatus: StatTileStatus =
    snap.newCustomers + snap.returningCustomers === 0
      ? undefined
      : snap.repeatPurchaseRate >= 20
        ? "good"
        : snap.repeatPurchaseRate < 10
          ? "warn"
          : undefined;
  // secondOrderRate > 15% = good, < 5% = warn — but only when the window is
  // long enough for a second order to have happened at all. In a 7-day
  // window with a ~300-day average repeat cycle the rate is structurally
  // ~0; a warning icon there reads as a business emergency and is a
  // windowing artifact (QA run 3). Require ≥ 60 days AND at least the
  // store's own average time-to-second-order.
  const windowDays = retention.dailyMetrics.length;
  const secondOrderMeasurable =
    windowDays >= 60 &&
    (snap.averageDaysToSecondOrder <= 0 || windowDays >= snap.averageDaysToSecondOrder);
  const secondOrderStatus: StatTileStatus =
    snap.secondOrderRate >= 15
      ? "good"
      : secondOrderMeasurable && snap.secondOrderRate < 5 && snap.secondOrderRate > 0
        ? "warn"
        : undefined;
  // averageDaysToSecondOrder: shorter is better; < 45 days = good, > 120 days = warn
  const avgDaysStatus: StatTileStatus =
    snap.averageDaysToSecondOrder > 0
      ? snap.averageDaysToSecondOrder <= 45 ? "good" : snap.averageDaysToSecondOrder > 120 ? "warn" : undefined
      : undefined;
  // returningCustomers: if more returning than 20% of total customers = good
  const totalCustomers = snap.newCustomers + snap.returningCustomers;
  const returningShare = totalCustomers > 0 ? snap.returningCustomers / totalCustomers : 0;
  const returningStatus: StatTileStatus =
    returningShare >= 0.2 ? "good" : returningShare > 0 && returningShare < 0.1 ? "warn" : undefined;

  // --- Auto conclusion: top retention product ---
  const topFirstOrderProduct = retention.firstOrderProducts[0]?.title ?? null;
  const topSecondOrderProduct = retention.secondOrderProducts[0]?.title ?? null;
  const autoConclusion: string | null =
    topFirstOrderProduct && topSecondOrderProduct
      ? locale === "he"
        ? `המוצר המוביל ברכישה ראשונה: "${topFirstOrderProduct}". המוצר שמחזיר הכי הרבה לקוחות: "${topSecondOrderProduct}".`
        : `Top acquisition product: "${topFirstOrderProduct}". Top product that brings customers back: "${topSecondOrderProduct}".`
      : topSecondOrderProduct
        ? locale === "he"
          ? `המוצר הנמכר ביותר בקנייה חוזרת הוא "${topSecondOrderProduct}".`
          : `The top product in repeat purchases is "${topSecondOrderProduct}".`
        : null;

  // Narrative — GATED on data presence. A window with zero customer rows
  // (empty range, or a query that fell back) must never render "דורש
  // טיפול"/"בסיכון": the QA found this page confidently declaring a
  // retention crisis from 0/0 while the real repeat rate was 38.5% (F-060).
  // An empty page gets ignored; a confident wrong verdict gets believed.
  const hasWindowData = totalCustomers > 0;
  const repeatRate = snap.repeatPurchaseRate;
  const tone = !hasWindowData
    ? "neutral"
    : repeatRate >= 30
      ? "up"
      : repeatRate >= 15
        ? "neutral"
        : "down";
  const repeatStateLabel =
    locale === "he"
      ? repeatRate >= 30
        ? "בריא"
        : repeatRate >= 15
          ? "במגמת שיפור"
          : "דורש טיפול"
      : repeatRate >= 30
        ? "healthy"
        : repeatRate >= 15
          ? "growing"
          : "needs work";
  const headline = !hasWindowData
    ? locale === "he"
      ? "אין נתוני לקוחות בחלון שנבחר — אין מסקנה."
      : "No customer data in the selected window — no verdict."
    : locale === "he"
      ? `נתח הלקוחות החוזרים עומד על ${repeatRate.toFixed(1)}% — ${repeatStateLabel}.`
      : `Returning-customer share is ${repeatRate.toFixed(1)}% — ${repeatStateLabel}.`;
  const noDataBody =
    locale === "he"
      ? "יכול להיות שהחלון קצר/עתידי, שהסנכרון עדיין רץ, או שהשליפה נכשלה. נסו להרחיב את טווח התאריכים או להריץ סנכרון — אם זה לא משתנה, זו תקלה ולא מציאות עסקית."
      : "The window may be short/future, the sync may still be running, or the query fell back. Widen the range or run a sync — if nothing changes, this is a defect, not business reality.";
  const body = [
    locale === "he"
      ? `${formatNumber(snap.newCustomers)} לקוחות חדשים ו${formatNumber(snap.returningCustomers)} לקוחות חוזרים הזמינו בחלון הזמן הזה.`
      : `${formatNumber(snap.newCustomers)} new customers and ${formatNumber(snap.returningCustomers)} returning customers ordered in this window.`,
    snap.averageDaysToSecondOrder > 0
      ? locale === "he"
        ? `לקוחות חוזרים שבים בממוצע אחרי ${snap.averageDaysToSecondOrder.toFixed(0)} ימים.`
        : `Returning buyers come back after about ${snap.averageDaysToSecondOrder.toFixed(0)} days on average.`
      : null,
    snap.secondOrderRate > 0
      ? locale === "he"
        ? `שיעור ההזמנה השנייה הוא ${snap.secondOrderRate.toFixed(1)}% — כך נראה אחוז הלקוחות שחזרו להזמנה נוספת אחרי הראשונה.`
        : `Second-order rate is ${snap.secondOrderRate.toFixed(1)}% — that's how many first-time buyers came back for a second order.`
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={dictionary.retention.eyebrow}
          title={dictionary.retention.title}
          description={dictionary.retention.description}
        />

        <NarrativeBanner
          eyebrow={locale === "he" ? "דופק השימור" : "Retention pulse"}
          headline={headline}
          body={hasWindowData ? body : noDataBody}
          tone={tone}
          toneLabel={
            !hasWindowData
              ? locale === "he"
                ? "אין נתונים"
                : "No data"
              : tone === "up"
                ? locale === "he"
                  ? "בריא"
                  : "Healthy"
                : tone === "down"
                  ? locale === "he"
                    ? "בסיכון"
                    : "At risk"
                  : locale === "he"
                    ? "לעקוב מקרוב"
                    : "Watch closely"
          }
        />

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 1" : "Step 1"}
            title={locale === "he" ? "תמהיל הלקוחות בתקופה" : "Customer mix this period"}
            hint={
              locale === "he"
                ? "חמישה מספרים שמראים אם הלקוחות חוזרים. ריחוף על ? יציג את הנוסחה."
                : "Five numbers that tell you if buyers come back. Hover any ? for the calculation."
            }
          />
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label={dictionary.retention.newCustomers}
              value={formatNumber(snap.newCustomers)}
              icon={UserPlus}
              tooltip={tips.newCustomers}
              hint={locale === "he" ? "הזמנות ראשונות אי פעם בחלון הזה." : "First-ever orders in this window."}
            />
            <StatTile
              label={dictionary.retention.returningCustomers}
              value={formatNumber(snap.returningCustomers)}
              icon={Users2}
              tooltip={tips.returningCustomers}
              hint={locale === "he" ? "כבר הייתה להם לפחות הזמנה קודמת אחת." : "Already had at least one prior order."}
              status={returningStatus}
            />
            <StatTile
              label={dictionary.retention.repeatPurchaseRate}
              value={`${snap.repeatPurchaseRate.toFixed(1)}%`}
              icon={Repeat}
              tooltip={tips.repeatRate}
              hint={locale === "he" ? "גבוה יותר = מותג דביק יותר." : "Higher = stickier brand."}
              status={repeatRateStatus}
            />
            <StatTile
              label={dictionary.retention.secondOrderRate}
              value={`${snap.secondOrderRate.toFixed(1)}%`}
              icon={TrendingUp}
              tooltip={tips.secondOrderRate}
              hint={
                secondOrderMeasurable
                  ? locale === "he"
                    ? "לקוחות חדשים שחזרו להזמין שוב."
                    : "First-time buyers who came back."
                  : locale === "he"
                    ? "חלון קצר ממחזור הרכישה החוזרת — הרחיבו את הטווח כדי למדוד."
                    : "Window shorter than your repeat cycle — widen the range to measure this."
              }
              status={secondOrderStatus}
            />
            <StatTile
              label={dictionary.retention.avgDaysToSecondOrder}
              value={
                Number.isFinite(snap.averageDaysToSecondOrder) && snap.averageDaysToSecondOrder > 0
                  ? `${formatNumber(Math.round(snap.averageDaysToSecondOrder))} ${locale === "he" ? "ימים" : "days"}`
                  : "—"
              }
              icon={CalendarClock}
              tooltip={tips.avgDaysToSecond}
              hint={locale === "he" ? "ימים בין הזמנה ראשונה לשנייה." : "Days between order #1 and #2."}
              status={avgDaysStatus}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 2" : "Step 2"}
            title={locale === "he" ? "מגמת הלקוחות החוזרים" : "Returning customer trend"}
            hint={
              locale === "he"
                ? "האזור הסגול מציג את אחוז ההזמנות היומי שמגיע מלקוחות קיימים. שווה לעקוב אחרי ירידות מתמשכות."
                : "Indigo area shows the daily share of orders coming from existing customers. Watch for sustained drops."
            }
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{dictionary.retention.repeatRateOverTime}</CardTitle>
            </CardHeader>
            <CardContent>
              <RetentionLineChartV2
                data={retention.dailyMetrics}
                previousData={retention.previousDailyMetrics}
                locale={locale}
              />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 3" : "Step 3"}
            title={
              locale === "he"
                ? "מה לקוחות קונים בפעם הראשונה לעומת מה שמחזיר אותם"
                : "What customers buy first vs. what brings them back"
            }
            hint={
              locale === "he"
                ? "שמאל = המוצרים הטובים ביותר לרכישת לקוחות חדשים. ימין = המוצרים שהכי משמרים. SKU-ים שונים בכל צד זה תקין — ולרוב מלמד הרבה."
                : "Left = best acquisition products. Right = best retention products. Different SKUs are normal — and often very revealing."
            }
          />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.retention.topFirstOrderProducts}</CardTitle>
                  <HelpTip>{tips.topFirstOrder}</HelpTip>
                </div>
              </CardHeader>
              <CardContent className="overflow-hidden">
                <BarInsightChart
                  data={retention.firstOrderProducts}
                  dataKey="orders"
                  xKey="title"
                  format="number"
                  valueLabel={locale === "he" ? "הזמנות ראשונות" : "First orders"}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.retention.topSecondOrderProducts}</CardTitle>
                  <HelpTip>{tips.topSecondOrder}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.retention.topSecondOrderDescription}</p>
              </CardHeader>
              <CardContent className="overflow-hidden">
                <BarInsightChart
                  data={retention.secondOrderProducts}
                  dataKey="orders"
                  xKey="title"
                  color="#F97316"
                  format="number"
                  valueLabel={locale === "he" ? "הזמנות שניות" : "Second orders"}
                />
              </CardContent>
            </Card>
          </div>
          {autoConclusion ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                {locale === "he" ? "סיכום אוטומטי" : "Auto insight"}&ensp;
                <span className="font-normal text-emerald-700 dark:text-emerald-400">{autoConclusion}</span>
              </p>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 4" : "Step 4"}
            title={
              locale === "he"
                ? "שימור קוהורטים — האם הלקוחות חוזרים?"
                : "Cohort retention — do customers come back?"
            }
            hint={
              locale === "he"
                ? "כל שורה היא קבוצת לקוחות שהצטרפה באותו חודש. העמודות מציגות איזה אחוז מהקוהורט הזמין שוב N חודשים לאחר מכן. כהה יותר = שימור טוב יותר. שווה להשוות שורות עדכניות (למעלה) לשורות ישנות (למטה) — אם הקוהורטים החדשים משמרים פחות, השיווק מביא לקוחות חד פעמיים."
                : "Each row is a group of customers acquired in the same month. Columns show what percent of that cohort ordered again N months later. Darker = better retention. Compare recent rows (top) to older rows (bottom): if recent cohorts retain worse, marketing is buying first-order tourists."
            }
          />
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">{dictionary.retention.cohortView}</CardTitle>
                <HelpTip>{tips.cohort}</HelpTip>
              </div>
              <p className="text-sm text-muted-foreground">{dictionary.retention.cohortDescription}</p>
            </CardHeader>
            <CardContent>
              {cohortReport ? (
                <CohortHeatmap report={cohortReport} locale={locale} display="rate" />
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">{retention.cohortPlaceholder}</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
