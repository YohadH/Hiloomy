import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Crown,
  Flame,
  Minus,
  ShoppingBag,
  ShieldAlert,
  TrendingUp
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { KpiTile } from "@/components/dashboard-v2/kpi-tile";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PortfolioBrandTable } from "@/components/portfolio/portfolio-brand-table";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { buildPortfolioOverview, type BrandStory } from "@/lib/services/portfolio-service";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// /portfolio — the board / multi-brand operator view.
//
// Aggregates the active org's brands into a single rollup: total revenue
// + orders + weighted-rate KPIs, per-brand breakdown table with click-to-
// switch, and highlights for the biggest mover and stale brands.
//
// Audience: portfolio owner reviewing performance across 2+ brands. Hidden
// from the nav for users with only one connected store — they get the
// single-brand Overview anyway, no value in a "portfolio of one".

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const [chrome, portfolio, locale] = await Promise.all([
    getAppChromeData(),
    buildPortfolioOverview(),
    getAppLocale()
  ]);
  const isHe = locale === "he";

  const t = isHe
    ? {
        eyebrow: "סקירת תיק מותגים",
        title: "כל המותגים שלכם, בתמונה אחת",
        description: "סיכום הכנסות, רווחיות ושימור לקוחות מצטבר מכל המותגים בארגון. לחצו על שורה כדי לעבור לתצוגה של מותג בודד.",
        bannerEyebrow: "דופק התיק",
        revenue: "הכנסה כוללת",
        orders: "סך הזמנות",
        aov: "AOV ממוצע",
        returning: "שיעור לקוחות חוזרים",
        refundRate: "שיעור החזרים",
        brandsActive: "מותגים פעילים",
        perBrandTitle: "ביצועים לפי מותג",
        perBrandHint: "ממוין לפי הכנסה. ההשוואה היא מול התקופה הקודמת באותו אורך.",
        highlightsTitle: "תובנות מהירות",
        highlightsHint: "מה לבדוק קודם — המותג הגדול ביותר, השינוי הבולט ביותר ומי דורש תשומת לב.",
        topBrandLabel: "המותג המוביל",
        biggestMoverLabel: "השינוי הגדול",
        staleLabel: "מותגים עם נתונים ישנים",
        quietLabel: "מותגים שקטים",
        noBrands: "עדיין אין מותגים מחוברים. חברו לפחות מותג אחד מהגדרות.",
        oneBrand: "תצוגת התיק שימושית כשיש 2+ מותגים. כרגע מחובר מותג אחד — חברו עוד מותגים כדי לראות השוואה.",
        connectAnother: "← חיבור מותג נוסף",
        currencyMixedNote: portfolio.currencyNote
      }
    : {
        eyebrow: "Portfolio overview",
        title: "All your brands at a glance",
        description: "Aggregated revenue, profitability, and retention across every brand in your organization. Click a row to drill into a single brand.",
        bannerEyebrow: "Portfolio pulse",
        revenue: "Total revenue",
        orders: "Total orders",
        aov: "Average AOV",
        returning: "Returning rate",
        refundRate: "Refund rate",
        brandsActive: "Active brands",
        perBrandTitle: "Performance by brand",
        perBrandHint: "Sorted by revenue. Comparison is vs the previous window of equal length.",
        highlightsTitle: "Quick read",
        highlightsHint: "What to look at first — biggest brand, biggest mover, who needs attention.",
        topBrandLabel: "Top brand",
        biggestMoverLabel: "Biggest mover",
        staleLabel: "Stale data",
        quietLabel: "Quiet brands",
        noBrands: "No brands connected yet. Connect at least one brand from Settings.",
        oneBrand: "Portfolio view helps once you have 2+ brands. You currently have one connected — connect more brands to see the comparison.",
        connectAnother: "← Connect another brand",
        currencyMixedNote: portfolio.currencyNote
      };

  const brandCount = portfolio.brands.length;

  // Explicit comparison window label — "13.7–11.8 מול 13.6–12.7". Every
  // "vs the previous period" phrase on this page means exactly this.
  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat(isHe ? "he-IL" : "en-US", {
      day: "numeric",
      month: "numeric"
    }).format(new Date(iso));
  const windowLabel = isHe
    ? `התקופה: ${fmtDay(portfolio.windowStart)}–${fmtDay(portfolio.windowEnd)} מול ${fmtDay(portfolio.previousWindowStart)}–${fmtDay(portfolio.previousWindowEnd)} (${portfolio.windowDays} ימים).`
    : `Window: ${fmtDay(portfolio.windowStart)}–${fmtDay(portfolio.windowEnd)} vs ${fmtDay(portfolio.previousWindowStart)}–${fmtDay(portfolio.previousWindowEnd)} (${portfolio.windowDays} days).`;

  // Empty / single-brand states.
  if (brandCount === 0) {
    return (
      <AppShell store={chrome.store} controls={chrome.controls}>
        <PageHead eyebrow={t.eyebrow} title={t.title} description={t.description} />
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="max-w-md text-sm text-muted-foreground">{t.noBrands}</p>
            <Link href={"/connect-brand" as never} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              {t.connectAnother}
            </Link>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  // Headline narrative.
  const headline = (() => {
    const total = formatCurrency(portfolio.totals.totalSales, portfolio.currency, isHe);
    const change = portfolio.totalSalesChange;
    if (change === null) {
      return isHe
        ? `${portfolio.totals.activeBrands} מותגים פעילים, הכנסה כוללת של ${total} בתקופה.`
        : `${portfolio.totals.activeBrands} active brands, total revenue ${total} this period.`;
    }
    const arrow = change >= 0 ? (isHe ? "↑" : "↑") : isHe ? "↓" : "↓";
    return isHe
      ? `${portfolio.totals.activeBrands} מותגים פעילים, הכנסה כוללת ${total}. ${arrow} ${Math.abs(change).toFixed(1)}% לעומת התקופה הקודמת.`
      : `${portfolio.totals.activeBrands} active brands, total revenue ${total} — ${arrow} ${Math.abs(change).toFixed(1)}% vs the previous window.`;
  })();
  const tone =
    portfolio.totalSalesChange === null
      ? "neutral"
      : portfolio.totalSalesChange >= 5
        ? "up"
        : portfolio.totalSalesChange <= -5
          ? "down"
          : "neutral";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={t.eyebrow} title={t.title} description={t.description} />

        {brandCount === 1 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{t.oneBrand}</p>
              <Link
                href={"/connect-brand" as never}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                {t.connectAnother}
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <NarrativeBanner
          eyebrow={t.bannerEyebrow}
          headline={headline}
          body={t.currencyMixedNote ?? undefined}
          tone={tone}
          locale={locale}
        />

        {/* KPI strip — portfolio totals */}
        <section className="space-y-3">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <KpiTile
              kpi={{
                label: t.revenue,
                value: portfolio.totals.totalSales,
                change: portfolio.totalSalesChange ?? undefined,
                format: "currency"
              }}
              currency={portfolio.currency}
              icon={Crown}
            />
            <KpiTile
              kpi={{
                label: t.orders,
                value: portfolio.totals.orders,
                change:
                  portfolio.previousTotals.orders > 0
                    ? ((portfolio.totals.orders - portfolio.previousTotals.orders) /
                        portfolio.previousTotals.orders) *
                      100
                    : undefined,
                format: "number"
              }}
              currency={portfolio.currency}
              icon={ShoppingBag}
            />
            <KpiTile
              kpi={{
                label: t.aov,
                value: portfolio.totals.averageOrderValue,
                format: "currency"
              }}
              currency={portfolio.currency}
              icon={TrendingUp}
            />
            <KpiTile
              kpi={{
                label: t.returning,
                value: portfolio.totals.returningCustomerRate,
                format: "percent"
              }}
              currency={portfolio.currency}
              icon={Flame}
            />
            <KpiTile
              kpi={{
                label: t.refundRate,
                value: portfolio.totals.refundRate,
                format: "percent"
              }}
              currency={portfolio.currency}
              icon={ShieldAlert}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {isHe
              ? `${portfolio.totals.activeBrands} מתוך ${portfolio.totals.connectedBrands} מותגים מחוברים יצרו מכירה בתקופה זו.`
              : `${portfolio.totals.activeBrands} of ${portfolio.totals.connectedBrands} connected brands generated sales this period.`}
          </p>
        </section>

        {/* Per-brand breakdown */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={isHe ? "פירוט" : "Breakdown"}
            title={t.perBrandTitle}
            hint={`${t.perBrandHint} ${windowLabel}`}
          />
          <PortfolioBrandTable
            rows={portfolio.brands}
            currency={portfolio.currency}
            locale={locale}
          />
        </section>

        {/* CEO insights — the story behind each brand's number */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={isHe ? "תובנות" : "Insights"}
            title={isHe ? "מה הזיז את המספרים" : "What moved the numbers"}
            hint={
              isHe
                ? `המנוע והמשקולת של כל מותג בתקופה — מאיפה הצמיחה מגיעה, מה מושך למטה, והאם זה נפח הזמנות או גודל סל. ${windowLabel}`
                : `Each brand's engine and drag this window — where growth comes from, what pulls it down, and whether it's order volume or basket size. ${windowLabel}`
            }
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {portfolio.stories.map((story) => (
              <BrandStoryCard
                key={story.storeId}
                story={story}
                currency={portfolio.currency}
                isHe={isHe}
              />
            ))}
          </div>
          {portfolio.highlights.staleData.length > 0 ? (
            <p className="text-xs font-medium text-amber-700">
              ⚠{" "}
              {isHe
                ? `נתונים ישנים: ${portfolio.highlights.staleData.map((b) => `${b.storeName} (${b.ageHours} שעות)`).join(", ")} — הסיפור למעלה מבוסס על הסנכרון האחרון.`
                : `Stale data: ${portfolio.highlights.staleData.map((b) => `${b.storeName} (${b.ageHours}h)`).join(", ")} — the story above reflects the last sync.`}
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

// One brand's growth story: change chip, the product that pushed the number
// up, the product that dragged it down, and the volume-vs-basket mix.
function BrandStoryCard({
  story,
  currency,
  isHe
}: {
  story: BrandStory;
  currency: string;
  isHe: boolean;
}) {
  const change = story.revenueChange;
  const up = (change ?? 0) >= 0;
  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  const mixLine = (() => {
    if (story.ordersChangePercent === null || story.aovChangePercent === null) return null;
    const volumeLed =
      Math.abs(story.ordersChangePercent) >= Math.abs(story.aovChangePercent);
    return isHe
      ? `הזמנות ${fmtPct(story.ordersChangePercent)} · סל ממוצע ${fmtPct(story.aovChangePercent)} — השינוי מגיע בעיקר מ${volumeLed ? "נפח ההזמנות" : "גודל הסל"}.`
      : `Orders ${fmtPct(story.ordersChangePercent)} · AOV ${fmtPct(story.aovChangePercent)} — the change is mostly ${volumeLed ? "order volume" : "basket size"}.`;
  })();

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-foreground">{story.storeName}</p>
            {story.isDemo ? (
              <span className="inline-flex items-center rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                {isHe ? "נתוני הדגמה" : "Demo data"}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {formatCurrency(story.revenue, currency, isHe)}
            </span>
            {change !== null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                  up ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"
                )}
              >
                {up ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="h-3 w-3" aria-hidden />
                )}
                {fmtPct(change)}
              </span>
            ) : null}
          </div>
        </div>

        <ul className="mt-4 space-y-2.5 text-sm leading-6">
          {story.topDriver ? (
            <li className="flex items-start gap-2">
              <Flame className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <span>
                <span className="font-semibold">{isHe ? "המנוע: " : "Engine: "}</span>
                {story.topDriver.title} —{" "}
                <span className="font-semibold text-emerald-700">
                  +{formatCurrency(story.topDriver.delta, currency, isHe)}
                </span>{" "}
                {isHe ? "לעומת התקופה הקודמת." : "vs the previous window."}
              </span>
            </li>
          ) : (
            <li className="flex items-start gap-2 text-muted-foreground">
              <Minus className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {isHe
                  ? "אין מוצר בולט שדחף את המספר למעלה בתקופה הזו."
                  : "No standout product pushed the number up this window."}
              </span>
            </li>
          )}
          {story.topDrag ? (
            <li className="flex items-start gap-2">
              <ArrowDownRight className="mt-1 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
              <span>
                <span className="font-semibold">{isHe ? "המשקולת: " : "Drag: "}</span>
                {story.topDrag.title} —{" "}
                <span className="font-semibold text-rose-700">
                  {formatCurrency(story.topDrag.delta, currency, isHe)}
                </span>{" "}
                {isHe ? "לעומת התקופה הקודמת." : "vs the previous window."}
              </span>
            </li>
          ) : null}
          {mixLine ? (
            <li className="flex items-start gap-2">
              <TrendingUp className="mt-1 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
              <span>{mixLine}</span>
            </li>
          ) : (
            <li className="flex items-start gap-2 text-muted-foreground">
              <Minus className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {isHe
                  ? "תקופה ראשונה עם נתונים — עדיין אין בסיס השוואה."
                  : "First window with data — no comparison base yet."}
              </span>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number, currency: string, isHe: boolean): string {
  try {
    return new Intl.NumberFormat(isHe ? "he-IL" : "en-US", {
      style: "currency",
      currency,
      // Math.abs — a -145,151.59 drag is "large", the sign must not drop
      // it into the 2-decimal branch.
      maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
    }).format(value);
  } catch {
    return `${value.toLocaleString(isHe ? "he-IL" : "en-US")} ${currency}`;
  }
}
