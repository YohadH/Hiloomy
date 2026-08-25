// Discounts screen (Insight Engine 2) — one live scorecard per discount
// code in the selected window, with a verdict: expand / keep / stop.
// Active codes first (used in the trailing 7 days), ended codes below as
// history. The underwater "stop" verdict is the same condition that
// fires the high-priority alert from the 2h cron.

import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import {
  buildDiscountScorecards,
  type DiscountScorecard
} from "@/lib/services/discount-scorecard-service";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { DiscountBoard } from "@/components/discounts/discount-board";
import { heCountPhrase } from "@/lib/i18n/he-plural";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";

export const dynamic = "force-dynamic";


export default async function DiscountsPage() {
  const locale = await getAppLocale();
  const [chrome, selection] = await Promise.all([
    getAppChromeData(),
    getReportingDateRangeSelection(locale === "he" ? "he" : "en")
  ]);
  const isHe = locale === "he";
  const currency = chrome.store.currency;
  // "incenseparfums.myshopify.com" → "incenseparfums", for admin deep links.
  const shopifyStoreHandle = chrome.store.domain?.endsWith(".myshopify.com")
    ? chrome.store.domain.replace(/\.myshopify\.com$/, "")
    : null;

  const report = await buildDiscountScorecards({
    storeId: chrome.store.id,
    start: selection.start,
    end: selection.end
  }).catch(() => null);

  const cards = report?.cards ?? [];
  const activeCards = cards.filter((c) => c.active);
  const endedCards = cards.filter((c) => !c.active);
  // Seeding giveaways are excluded — deliberately distributed product is
  // marketing spend, not an underwater promo (F-052).
  const underwater = cards.filter((c) => c.verdict === "stop" && c.classification !== "seeding");

  const heading = isHe
    ? {
        eyebrow: "שיווק מול הנחות",
        title: "כרטיסי ביצועים להנחות",
        description:
          "כל קוד הנחה בחלון הנבחר עם חשבון הרווח האמיתי שלו — הכנסה, עלות ההנחה, עלות המוצרים ופסיקה: להרחיב, להשאיר או לעצור."
      }
    : {
        eyebrow: "Marketing vs discounts",
        title: "Discount scorecards",
        description:
          "Every discount code in the selected window with its real profit math — revenue, discount cost, COGS, and a verdict: expand, keep, or stop."
      };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
      </section>

      {underwater.length > 0 ? (
        <div className="rounded-2xl border border-red-300 bg-red-50/70 px-4 py-3">
          <p className="text-sm font-semibold text-red-900">
            {isHe
              ? `${heCountPhrase(underwater.length, { one: "קוד אחד", many: "קודים" }, { one: "מוכר בהפסד כרגע", many: "מוכרים בהפסד כרגע" })}: ${underwater.map((c) => c.code).join(", ")} — כל הזמנה נוספת תחתיהם מפסידה כסף.`
              : `${underwater.length} code${underwater.length === 1 ? " is" : "s are"} selling at a loss right now: ${underwater.map((c) => c.code).join(", ")} — every additional order under them loses money.`}
          </p>
        </div>
      ) : null}

      {report && cards.length > 0 ? (
        // Waterfall order (F-049): sales first, then the discount deduction,
        // then what's left, then reach — the same revenue-first model the
        // owner asked for on the dashboard's money snapshot.
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">{isHe ? "מכירות ברוטו מהזמנות עם קוד" : "Gross sales on coded orders"}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatCurrency(report.totalRevenue + report.totalDiscountCost, currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isHe
                ? `נטו אחרי ההנחות: ${formatCurrency(report.totalRevenue, currency)}`
                : `Net after discounts: ${formatCurrency(report.totalRevenue, currency)}`}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">{isHe ? "סך ההנחות שניתנו (מחיר מדף)" : "Total discounts given (list price)"}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatCurrency(report.totalDiscountCost, currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">{isHe ? "שוליים אחרי הנחות ועלויות" : "Margin after discounts & COGS"}</p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                report.totalMargin < 0 ? "text-red-700" : "text-emerald-800"
              )}
            >
              {formatCurrency(report.totalMargin, currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">{isHe ? "נתח הזמנות עם הנחה" : "Share of orders discounted"}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {report.discountedOrderShare != null ? `${Math.round(report.discountedOrderShare * 100)}%` : "—"}
            </p>
          </div>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-background/70 p-8 text-center text-sm text-muted-foreground">
          {isHe
            ? "לא נמצאו קודי הנחה בחלון הזמן הנבחר. נסו חלון רחב יותר."
            : "No discount codes found in the selected window. Try a wider date range."}
        </div>
      ) : (
        <DiscountBoard
          active={activeCards}
          ended={endedCards}
          currency={currency}
          isHe={isHe}
          shopifyStoreHandle={shopifyStoreHandle}
        />
      )}
    </AppShell>
  );
}
