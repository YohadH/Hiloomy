import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StyledTable } from "@/components/dashboard-v2/styled-table";
import { BarInsightChart } from "@/components/charts/bar-insight-chart";
import { CollectionChips } from "@/components/dashboard-v2/collection-chips";
import { CollectionRhythmHeatmap } from "@/components/profit/collection-rhythm-heatmap";
import { DataTable } from "@/components/shared/data-table";
import { getAppChromeData, getProfitAnalyticsPayload } from "@/lib/services/analytics-service";
import { buildChannelCacReport } from "@/lib/services/channel-cac-service";
import { buildCollectionRhythm } from "@/lib/services/collection-rhythm-service";
import { buildBundleProfitability } from "@/lib/services/bundle-profitability-service";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";
import { buildCogsOnboarding } from "@/lib/services/product-cost-service";
import { CogsOnboardingCard } from "@/components/profit/cogs-onboarding-card";
import { ProfitAccuracyBadge } from "@/components/profit/profit-accuracy-badge";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { getAppLocale, getDictionary } from "@/lib/i18n";

export default async function ProfitPage() {
  const locale = await getAppLocale();
  const dictionary = getDictionary(locale);
  const tips = dictionary.profit.tips;
  const overviewColTips = dictionary.overview.colTips;
  const [profit, chrome, storeId, selection] = await Promise.all([
    getProfitAnalyticsPayload(),
    getAppChromeData(),
    resolveActiveStoreId(),
    getReportingDateRangeSelection(locale === "he" ? "he" : "en")
  ]);
  const currency = chrome.store.currency;
  // The selection's instants are store-timezone day boundaries — the old
  // bare-UTC re-parse drifted 3 hours vs every other surface (SYS-001).
  const channelCac = storeId
    ? await buildChannelCacReport({
        storeId,
        start: selection.start,
        end: selection.end
      }).catch(() => null)
    : null;
  // Collection rhythm — rolling 12 weeks regardless of the page's date
  // controls: a weekday pattern needs weeks of sampling to mean anything.
  const collectionRhythm = storeId
    ? await buildCollectionRhythm({ storeId }).catch(() => null)
    : null;
  // Bundle profitability (F-036) — real numbers once the owner mapped kit
  // components in Settings; empty array until then.
  const bundleRows = storeId
    ? await buildBundleProfitability(storeId, {
        start: selection.start,
        end: selection.end
      }).catch(() => [])
    : [];
  // Guided COGS onboarding + accuracy label: how much of this window's profit
  // is backed by real product cost vs the default-ratio estimate.
  const cogs = storeId
    ? await buildCogsOnboarding(storeId, { start: selection.start, end: selection.end }).catch(() => null)
    : null;
  // Headline profit = the ONE app-wide contribution definition (net product
  // sales − COGS − affiliate commission), sourced from the SAME single-source
  // layer the dashboard uses. Critically it subtracts refunds by REFUND date
  // (money actually returned this window), whereas the per-product table below
  // uses each order's own line refunds (by order date, which lag). Summing the
  // table gave a higher, inconsistent headline than the dashboard — this makes
  // contribution one number across dashboard, /profit and BI.
  const contribution = storeId
    ? await buildContributionMargin({ storeId, start: selection.start, end: selection.end }).catch(() => null)
    : null;
  const isHe = locale === "he";

  // Narrative — headline from the single-source contribution; fall back to the
  // per-product sum only if that layer is unavailable.
  const totalRevenue = contribution
    ? contribution.totals.revenue
    : profit.productPerformance.reduce((acc, row) => acc + row.revenue, 0);
  const totalProfit = contribution
    ? contribution.totals.contributionMargin
    : profit.productPerformance.reduce((acc, row) => acc + row.estimatedProfit, 0);
  const totalDiscount = profit.productPerformance.reduce((acc, row) => acc + row.discountImpact, 0);
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  // "Top profit driver" must be the highest-PROFIT product, not the highest-
  // revenue one (profit.topProducts is revenue-sorted — using it here labelled
  // a loss-making SKU as the "leading profit engine", M-01).
  const topProduct = profit.topProfitableProducts[0];
  const watchlistFirst = profit.lowProducts[0];

  const narrativeBody = [
    locale === "he"
      ? `המרווח עמד על כ-${margin.toFixed(1)}% — מכל ₪100 הכנסה נשארו ${formatCurrency((totalProfit / Math.max(totalRevenue, 1)) * 100, currency)}.`
      : `Margin landed near ${margin.toFixed(1)}% — every ₪100 in revenue kept ${formatCurrency((totalProfit / Math.max(totalRevenue, 1)) * 100, currency)}.`,
    topProduct
      ? locale === "he"
        ? `${topProduct.productTitle} הוא מנוע הרווח המוביל שלכם עם ${formatCurrency(topProduct.estimatedProfit, currency)}.`
        : `${topProduct.productTitle} is your top profit driver at ${formatCurrency(topProduct.estimatedProfit, currency)}.`
      : null,
    watchlistFirst
      ? locale === "he"
        ? `מעקב: ${watchlistFirst.productTitle} הוא הSKU עם המרווח הנמוך ביותר ומומלץ לבחון תמחור.`
        : `Watchlist: ${watchlistFirst.productTitle} is the lowest-margin SKU and worth a pricing review.`
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageHead
            eyebrow={dictionary.profit.eyebrow}
            title={dictionary.profit.title}
            description={dictionary.profit.description}
          />
          {/* Measured-vs-estimated label so a profit figure is never read with
              more authority than its cost data supports. */}
          {cogs && totalRevenue > 0 ? (
            // Same coverage object the dashboard's profit card renders, so
            // the two pages cannot quote different shares for one window
            // (M-10). cogs.coverage is computed by the same helper; the
            // fallback only matters if the contribution call failed.
            <ProfitAccuracyBadge
              coverage={contribution?.quality.costCoverage ?? cogs.coverage}
              isHe={isHe}
              className="mt-1"
            />
          ) : null}
        </div>

        {/* Guided COGS onboarding — top-revenue products still missing a real
            cost. Only when coverage is short and there's actually work to do. */}
        {cogs && cogs.coverage < 0.9 && cogs.topMissing.length > 0 ? (
          <CogsOnboardingCard data={cogs} currency={currency} isHe={isHe} />
        ) : null}

        {/* Verdict is GATED on data presence: a ₪0/₪0 window used to render
            "המרווח תחת לחץ" — the app confidently declaring collapsing
            margins from a divide-by-zero (F-025). No rows → no verdict. */}
        {totalRevenue > 0 ? (
          <NarrativeBanner
            eyebrow={locale === "he" ? "רווחיות במבט מהיר" : "Profit at a glance"}
            headline={
              locale === "he"
                ? `רווח משוער בתקופה: ${formatCurrency(totalProfit, currency)} מתוך ${formatCurrency(totalRevenue, currency)} הכנסה.`
                : `Estimated profit this period: ${formatCurrency(totalProfit, currency)} on ${formatCurrency(totalRevenue, currency)} revenue.`
            }
            body={narrativeBody}
            tone={totalProfit > 0 ? "up" : "down"}
            toneLabel={
              totalProfit > 0
                ? locale === "he"
                  ? "רווח חיובי"
                  : "Profit positive"
                : locale === "he"
                  ? "המרווח תחת לחץ"
                  : "Margin pressure"
            }
          />
        ) : (
          <NarrativeBanner
            eyebrow={locale === "he" ? "רווחיות במבט מהיר" : "Profit at a glance"}
            headline={
              locale === "he"
                ? "אין נתוני מכירות בחלון שנבחר — אין מסקנה."
                : "No sales data in the selected window — no verdict."
            }
            body={
              locale === "he"
                ? "יכול להיות שהחלון קצר, שהסנכרון עדיין רץ, או שהשליפה נכשלה. הרחיבו את הטווח או הריצו סנכרון; אם המספרים בדשבורד מלאים והעמוד הזה ריק — זו תקלה ששווה לדווח עליה."
                : "The window may be short, the sync may still be running, or the query fell back. Widen the range or run a sync; if the dashboard shows data while this page is empty — that is a defect worth reporting."
            }
            tone="neutral"
            toneLabel={locale === "he" ? "אין נתונים" : "No data"}
          />
        )}

        {/* MoM profit summary line */}
        {profit.momProfitDelta !== null ? (
          <div
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
              profit.momProfitDelta >= 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <span className="text-base" aria-hidden="true">
              {profit.momProfitDelta >= 0 ? "▲" : "▼"}
            </span>
            <span>
              {locale === "he"
                ? `הרווחיות ${profit.momProfitDelta >= 0 ? "עלתה" : "ירדה"} ${Math.abs(profit.momProfitDelta).toFixed(1)}% לעומת התקופה הקודמת`
                : `Profitability ${profit.momProfitDelta >= 0 ? "increased" : "decreased"} ${Math.abs(profit.momProfitDelta).toFixed(1)}% vs. the previous period`}
            </span>
          </div>
        ) : null}

        {/* Charts row */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 1" : "Step 1"}
            title={locale === "he" ? "איפה נמצאים ההכנסה והמרווח" : "Where revenue and margin live"}
            hint={
              locale === "he"
                ? "הגרף משמאל = אילו מוצרים מביאים את הכסף. הגרף מימין = אילו קולקציות משאירות הכי הרבה אחרי עלויות."
                : "Left chart = which products bring in the money. Right chart = which collections keep the most after costs."
            }
          />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.profit.salesByProduct}</CardTitle>
                  <HelpTip>{tips.salesByProduct}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.profit.salesByProductDescription}</p>
              </CardHeader>
              <CardContent>
                <BarInsightChart
                  data={profit.topProducts.map((item) => ({ title: item.productTitle, revenue: item.revenue }))}
                  dataKey="revenue"
                  xKey="title"
                  format="currency"
                  currency={currency}
                  valueLabel={locale === "he" ? "הכנסה" : "Revenue"}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.profit.profitByCollection}</CardTitle>
                  <HelpTip>{tips.profitByCollection}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.profit.profitByCollectionDescription}</p>
              </CardHeader>
              <CardContent>
                <BarInsightChart
                  data={(() => {
                    // Render only the top contributors and roll the long tail
                    // into a single "Other" bar. Without this the x-axis crams
                    // 40+ labels into a few hundred pixels and nothing is
                    // readable. Sorted desc so the heroes are on the left.
                    const MAX_BARS = 10;
                    const sorted = [...profit.collectionPerformance]
                      .filter((c) => Number(c.estimatedProfit) > 0)
                      .sort((a, b) => Number(b.estimatedProfit) - Number(a.estimatedProfit));
                    const top = sorted.slice(0, MAX_BARS);
                    const rest = sorted.slice(MAX_BARS);
                    const tailLabel = locale === "he" ? `אחר (${rest.length})` : `Other (${rest.length})`;
                    const tail =
                      rest.length > 0
                        ? [{
                            collection: tailLabel,
                            estimatedProfit: rest.reduce((sum, c) => sum + Number(c.estimatedProfit), 0)
                          }]
                        : [];
                    return [...top.map((item) => ({
                      collection: item.collection,
                      estimatedProfit: Number(item.estimatedProfit)
                    })), ...tail];
                  })()}
                  dataKey="estimatedProfit"
                  xKey="collection"
                  color="#F97316"
                  format="currency"
                  currency={currency}
                  valueLabel={locale === "he" ? "רווח משוער" : "Estimated profit"}
                />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Tables row */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 2" : "Step 2"}
            title={locale === "he" ? "הפירוט המלא" : "The full breakdown"}
            hint={
              locale === "he"
                ? "טבלאות עם מיון ועימוד. השתמשו בבורר גודל העמוד כדי לראות יותר שורות בבת אחת."
                : "Sortable, paginated tables. Use the page-size toggle if you want to see more rows at once."
            }
            cta={{
              href: "/products/costs",
              label: locale === "he" ? "עריכת עלויות מוצרים (COGS) →" : "Edit product costs (COGS) →"
            }}
          />
          <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {locale === "he"
              ? "הרווח בכותרת מנכה את כל ההחזרים שבוצעו בתקופה (כולל על הזמנות ישנות), בדיוק כמו בדשבורד. בטבלה למטה הרווח לכל מוצר מנכה רק את ההחזרים של אותה הזמנה — לכן ייתכן שסכום הטבלה לא יזדהה במדויק עם הכותרת בחלון קצר."
              : "The headline profit subtracts every refund processed in this window (including on older orders), matching the dashboard. In the table below, each product's profit subtracts only that order's own refunds — so the table may not sum exactly to the headline in a short window."}
          </p>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <DataTable
              title={dictionary.profit.productTable}
              locale={locale}
              description={dictionary.profit.productTableDescription}
              tooltip={tips.productTable}
              paginate
              initialPageSize={20}
              pageSizes={[20, 50, 100]}
              columns={[
                { key: "productTitle", label: dictionary.profit.product },
                {
                  key: "collection",
                  label: dictionary.profit.collection,
                  tooltip:
                    locale === "he"
                      ? "כל קולקציית Shopify שהמוצר משתייך אליה."
                      : "Every Shopify collection the product belongs to.",
                  render: (row) => <CollectionChips collections={row.collections} fallback={row.collection} />
                },
                {
                  key: "unitsSold",
                  label: dictionary.profit.units,
                  tooltip: overviewColTips.units,
                  render: (row) => formatNumber(Number(row.unitsSold))
                },
                {
                  key: "revenue",
                  label: dictionary.profit.revenue,
                  tooltip: overviewColTips.revenue,
                  render: (row) => formatCurrency(Number(row.revenue), currency)
                },
                {
                  key: "discountImpact",
                  label: dictionary.profit.discount,
                  tooltip: tips.discountCol,
                  render: (row) => formatCurrency(Number(row.discountImpact), currency)
                },
                {
                  key: "refundImpact",
                  label: dictionary.profit.refunds,
                  tooltip: tips.refundsCol,
                  render: (row) => formatCurrency(Number(row.refundImpact), currency)
                },
                {
                  key: "estimatedProfit",
                  label: dictionary.profit.estimatedProfit,
                  tooltip: overviewColTips.profit,
                  render: (row) => {
                    const val = Number(row.estimatedProfit);
                    if (val < 0) {
                      return (
                        <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                          <span aria-label={locale === "he" ? "מפסיד" : "Loss"} role="img">⚠</span>
                          {formatCurrency(val, currency)}
                        </span>
                      );
                    }
                    return <span className="font-semibold text-emerald-700">{formatCurrency(val, currency)}</span>;
                  }
                }
              ]}
              rows={profit.productPerformance}
            />
            <div className="grid gap-4">
              <DataTable
                title={dictionary.profit.salesByCollection}
                locale={locale}
                paginate
                initialPageSize={20}
                pageSizes={[20, 50, 100]}
                columns={[
                  { key: "collection", label: dictionary.profit.collection },
                  {
                    key: "revenue",
                    label: dictionary.profit.revenue,
                    tooltip: overviewColTips.revenue,
                    render: (row) => formatCurrency(Number(row.revenue), currency)
                  },
                  {
                    key: "estimatedProfit",
                    label: dictionary.profit.estimatedProfit,
                    tooltip: overviewColTips.profit,
                    render: (row) => formatCurrency(Number(row.estimatedProfit), currency)
                  }
                ]}
                rows={profit.collectionPerformance}
              />
              <DataTable
                title={dictionary.profit.discountImpact}
                locale={locale}
                paginate
                initialPageSize={20}
                pageSizes={[20, 50, 100]}
                columns={[
                  { key: "code", label: dictionary.profit.discountCode },
                  {
                    key: "orderCount",
                    label: dictionary.profit.orders,
                    render: (row) => formatNumber(Number(row.orderCount))
                  },
                  {
                    key: "revenueInfluenced",
                    label: dictionary.profit.influencedRevenue,
                    render: (row) => formatCurrency(Number(row.revenueInfluenced), currency)
                  },
                  {
                    key: "discountAmount",
                    label: dictionary.profit.discountAmount,
                    tooltip: tips.discountCol,
                    render: (row) => formatCurrency(Number(row.discountAmount), currency)
                  }
                ]}
                rows={profit.discountUsage}
              />
            </div>
          </div>
        </section>

        {/* Top + watchlist row */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 3" : "Step 3"}
            title={locale === "he" ? "מובילים ומעקב" : "Heroes & watchlist"}
            hint={
              locale === "he"
                ? "המובילים הניעו את המרווח בתקופה. רשימת המעקב היא הבאה בתור לטיפול — תמחור, באנדלים או בחינת החזרים."
                : "Heroes drove margin this period. Watchlist needs your attention next — pricing, bundles, or refund review."
            }
          />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <StyledTable
              numbered
              locale={locale}
              rowKey={(row) => row.productId}
              rows={profit.topProducts}
              columns={[
                { key: "productTitle", label: locale === "he" ? "מוצר" : "Product" },
                {
                  key: "revenue",
                  label: locale === "he" ? "הכנסה" : "Revenue",
                  align: "end",
                  render: (row) => formatCurrency(row.revenue, currency)
                },
                {
                  key: "estimatedProfit",
                  label: locale === "he" ? "רווח משוער" : "Est. profit",
                  align: "end",
                  emphasis: true,
                  render: (row) => formatCurrency(row.estimatedProfit, currency)
                }
              ]}
            />
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{dictionary.profit.watchlistProducts}</CardTitle>
                  <HelpTip width="lg">{tips.watchlist}</HelpTip>
                </div>
                <p className="text-sm text-muted-foreground">{dictionary.profit.watchlistDescription}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {profit.lowProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {locale === "he" ? "אין פריטים למעקב בתקופה זו." : "No watchlist items in this window."}
                  </p>
                ) : null}
                {profit.lowProducts.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200/60 bg-rose-50/40 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.productTitle}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {formatCurrency(item.estimatedProfit, currency)} {dictionary.profit.watchlistCopy}{" "}
                        {formatCurrency(item.discountImpact, currency)} {dictionary.profit.watchlistCopyEnd}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Per-channel CAC & contribution margin */}
        {channelCac && channelCac.rows.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "ערוצים" : "Channels"}
              title={locale === "he" ? "רווח תרומה ועלות רכישת לקוח לפי ערוץ" : "Channel CAC & contribution margin"}
              hint={
                locale === "he"
                  ? "כמה כל ערוץ עולה לכם, מה הוא החזיר בהכנסה ומה נשאר כרווח תרומה אחרי עלות מוצרים (COGS) והוצאת פרסום מיוחסת. להגדיל = להרחיב תקציב. לבדיקה = לבחון קריאייטיב/קהל. להרעיב = לעצור הוצאה."
                  : "How much each channel costs, what it returned in revenue, and what's left as contribution margin after COGS and attributed spend. Push = scale, review = check creative/audience, starve = stop spending."
              }
            />
            <ChannelCacTable report={channelCac} currency={currency} locale={locale} />
          </section>
        ) : null}

        {/* Most / least profitable products */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 4" : "Step 4"}
            title={locale === "he" ? "הכי רווחיים ופחות רווחיים" : "Most & least profitable products"}
            hint={
              locale === "he"
                ? "המוצרים הכי רווחיים מניעים את המרווח — שקלו להגביר את המכירות שלהם. המוצרים הפחות רווחיים (או מפסידים) ידרשו בדיקת תמחור, עלות או ביטול הנחות."
                : "Most profitable products drive your margin — consider scaling them. Least profitable (or loss-making) products need pricing, cost, or promo review."
            }
          />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/* Most profitable */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {locale === "he" ? "המוצרים הכי רווחיים" : "Most profitable products"}
              </p>
              <StyledTable
                numbered
                locale={locale}
                rowKey={(row) => row.productId}
                rows={profit.topProfitableProducts}
                columns={[
                  { key: "productTitle", label: locale === "he" ? "מוצר" : "Product" },
                  {
                    key: "revenue",
                    label: locale === "he" ? "הכנסה" : "Revenue",
                    align: "end",
                    render: (row) => formatCurrency(row.revenue, currency)
                  },
                  {
                    key: "estimatedProfit",
                    label: locale === "he" ? "רווח משוער" : "Est. profit",
                    align: "end",
                    emphasis: true,
                    render: (row) => formatCurrency(row.estimatedProfit, currency)
                  }
                ]}
              />
            </div>
            {/* Least profitable */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
                {locale === "he" ? "המוצרים הפחות רווחיים" : "Least profitable products"}
              </p>
              <StyledTable
                numbered
                locale={locale}
                rowKey={(row) => row.productId}
                rows={profit.leastProfitableProducts}
                columns={[
                  { key: "productTitle", label: locale === "he" ? "מוצר" : "Product" },
                  {
                    key: "revenue",
                    label: locale === "he" ? "הכנסה" : "Revenue",
                    align: "end",
                    render: (row) => formatCurrency(row.revenue, currency)
                  },
                  {
                    key: "estimatedProfit",
                    label: locale === "he" ? "רווח משוער" : "Est. profit",
                    align: "end",
                    render: (row) => {
                      const val = row.estimatedProfit;
                      return (
                        <span className={`font-semibold ${val < 0 ? "text-rose-700" : "text-amber-700"}`}>
                          {val < 0 ? "⚠ " : null}{formatCurrency(val, currency)}
                        </span>
                      );
                    }
                  }
                ]}
              />
            </div>
          </div>
        </section>

        {/* Collection rhythm — which collection sells on which day */}
        {collectionRhythm && collectionRhythm.rows.length > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "קצב שבועי" : "Weekly rhythm"}
              title={locale === "he" ? "איזו קולקציה מוכרת באיזה יום" : "Which collection sells on which day"}
              hint={
                locale === "he"
                  ? "מפת חום של הכנסות לפי קולקציה ויום בשבוע — כדי לתזמן מבצעים, פוסטים ובאנרים ליום החזק של כל קולקציה."
                  : "Revenue heatmap by collection and weekday — schedule promos, posts and banners on each collection's strongest day."
              }
            />
            <CollectionRhythmHeatmap report={collectionRhythm} currency={currency} isHe={locale === "he"} />
          </section>
        ) : null}

        {/* Bundles — real profitability once components are mapped (F-036) */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "באנדלים" : "Bundles"}
            title={
              locale === "he"
                ? "רווחיות מארזים — אחרי עלות המוצרים שבפנים"
                : "Bundle profitability — after component costs"
            }
            hint={
              locale === "he"
                ? "מארז נמכר כמוצר אחד אבל עולה כמו הסכום של מה שבתוכו. הטבלה מציגה את הרווח האמיתי לפי הרכב שהגדרתם."
                : "A kit sells as one product but costs the sum of its parts. This table shows real profit from the components you defined."
            }
          />
          {bundleRows.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto table-scroll scroll-fade-end">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {[
                          locale === "he" ? "מארז" : "Bundle",
                          locale === "he" ? "יחידות" : "Units",
                          locale === "he" ? "הכנסה" : "Revenue",
                          locale === "he" ? "עלות אמיתית (רכיבים)" : "True cost (components)",
                          locale === "he" ? "רווח אמיתי" : "True profit",
                          locale === "he" ? "מרווח %" : "Margin %"
                        ].map((label, i) => (
                          <th
                            key={label}
                            className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${i === 0 ? "text-start" : "text-end"}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bundleRows.map((row) => (
                        <tr key={row.bundleProductId} className="border-t border-border">
                          <td className="px-3 py-2">
                            <div className="font-semibold">{row.title}</div>
                            {row.componentsMissingRealCost > 0 ? (
                              <div className="text-[10px] text-amber-700">
                                {locale === "he"
                                  ? `${row.componentsMissingRealCost} רכיבים עדיין עם עלות משוערת`
                                  : `${row.componentsMissingRealCost} components still on estimated cost`}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-end tabular-nums">{row.unitsSold}</td>
                          <td className="px-3 py-2 text-end tabular-nums">{formatCurrency(row.revenue, currency)}</td>
                          <td className="px-3 py-2 text-end tabular-nums">
                            {formatCurrency(row.trueCogs, currency)}
                            <div className="text-[10px] text-muted-foreground">
                              {locale === "he"
                                ? `נרשם קודם: ${formatCurrency(row.bookedCogs, currency)}`
                                : `previously booked: ${formatCurrency(row.bookedCogs, currency)}`}
                            </div>
                          </td>
                          <td
                            className={`px-3 py-2 text-end font-semibold tabular-nums ${row.trueProfit < 0 ? "text-rose-700" : "text-emerald-700"}`}
                          >
                            {formatCurrency(row.trueProfit, currency)}
                          </td>
                          <td className="px-3 py-2 text-end tabular-nums">
                            {row.trueMarginRate != null ? `${(row.trueMarginRate * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-6">
                <p className="text-sm leading-6 text-muted-foreground">
                  {locale === "he" ? (
                    <>
                      כדי לראות רווחיות אמיתית למארזים, הגדירו פעם אחת מה יש בתוך כל מארז —{" "}
                      <a href="/settings" className="font-semibold text-emerald-700 hover:text-emerald-800">
                        הגדרות ← קמפיינים ובאנדלים
                      </a>
                      . שווה במיוחד: המוצר הנמכר ביותר שלכם הוא מארז.
                    </>
                  ) : (
                    <>
                      To see real bundle profitability, define each kit&apos;s components once —{" "}
                      <a href="/settings" className="font-semibold text-emerald-700 hover:text-emerald-800">
                        Settings → Campaigns &amp; bundles
                      </a>
                      . Especially worth it: your best seller is a bundle.
                    </>
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ChannelCacTable({
  report,
  currency,
  locale
}: {
  report: import("@/lib/services/channel-cac-service").ChannelCacReport;
  currency: string;
  locale: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => formatCurrency(n, currency);
  const recPill = (rec: import("@/lib/services/channel-cac-service").ChannelCacRow["recommendation"]) => {
    const label = {
      push: { he: "להגדיל", en: "Push" },
      hold: { he: "להחזיק", en: "Hold" },
      review: { he: "לבדיקה", en: "Review" },
      starve: { he: "להרעיב", en: "Starve" },
      no_data: { he: "אין נתונים", en: "No data" }
    }[rec];
    const cls = {
      push: "bg-emerald-100 text-emerald-900 border-emerald-300",
      hold: "bg-sky-100 text-sky-900 border-sky-300",
      review: "bg-amber-100 text-amber-900 border-amber-300",
      starve: "bg-rose-100 text-rose-900 border-rose-300",
      no_data: "bg-slate-100 text-slate-700 border-slate-300"
    }[rec];
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
        {label[isHe ? "he" : "en"]}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border table-scroll scroll-fade-end">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("ערוץ", "Channel")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("הזמנות", "Orders")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("הכנסה", "Revenue")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("הוצאה", "Spend")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("רווח תרומה", "Contribution")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("מרווח % (מוערך)", "Margin % (est.)")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("לקוחות חדשים", "New customers")}
            </th>
            <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              CAC
            </th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("המלצה", "Verdict")}
            </th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.channel} className="border-t border-border">
              <td className="px-3 py-2">
                <div className="font-semibold">{r.displayName}</div>
                <div className="text-[10px] text-muted-foreground">
                  {r.spendSource === "meta_insights"
                    ? lang("מקור עלות: Meta Insights", "Cost source: Meta Insights")
                    : r.spendSource === "affiliate_commission"
                      ? lang("מקור עלות: עמלות שותפים", "Cost source: affiliate commissions")
                      : r.spendSource === "assumed_zero"
                        ? lang("מקור עלות: 0 (אורגני)", "Cost source: 0 (organic)")
                        : lang("מקור עלות: לא ידוע", "Cost source: unknown")}
                </div>
              </td>
              <td className="px-3 py-2 text-end">{r.orders}</td>
              <td className="px-3 py-2 text-end">{fmt(r.revenue)}</td>
              <td className="px-3 py-2 text-end">
                {r.attributedSpend > 0 ? fmt(r.attributedSpend) : "—"}
              </td>
              <td className={`px-3 py-2 text-end font-semibold ${r.contributionMargin < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {fmt(r.contributionMargin)}
              </td>
              <td className="px-3 py-2 text-end">
                {(r.contributionMarginRate * 100).toFixed(1)}%
              </td>
              {/* CAC's denominator, visible (F-030) — spend ÷ NEW customers,
                  not orders; without this column the CAC read as wrong math
                  next to the orders column. */}
              <td className="px-3 py-2 text-end">{r.newCustomers}</td>
              <td className="px-3 py-2 text-end">
                {r.cac != null ? fmt(r.cac) : "—"}
              </td>
              <td className="px-3 py-2 text-center">{recPill(r.recommendation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-slate-50 px-3 py-2 text-[10px] text-muted-foreground">
        {lang(
          `כיסוי שיוך: ${Math.round(report.attributionCoverage * 100)}% · רווח תרומה = הכנסה − הנחות − החזרים − עלות מוצרים − הוצאת הערוץ (אותה נוסחה כמו בדשבורד) · CAC = הוצאה ÷ לקוחות חדשים · הקצאת עלויות/הנחות לערוץ לפי משקל הכנסה — לכן עמודת המרווח היא הערכה ולא מדידה פר ערוץ (יחודד בעתיד)`,
          `Attribution coverage: ${Math.round(report.attributionCoverage * 100)}% · Contribution = revenue − discounts − refunds − COGS − channel spend (same formula as the dashboard) · CAC = spend ÷ new customers · costs/discounts allocated by revenue share, so the margin column is an estimate, not a per-channel measurement (refined in future)`
        )}
      </div>
    </div>
  );
}
