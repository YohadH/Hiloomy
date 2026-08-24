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

export const dynamic = "force-dynamic";


export default async function DiscountsPage() {
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  const isHe = locale === "he";
  const currency = chrome.store.currency;

  const report = await buildDiscountScorecards({
    storeId: chrome.store.id,
    start: new Date(`${chrome.controls.startDate}T00:00:00Z`),
    end: new Date(`${chrome.controls.endDate}T23:59:59Z`)
  }).catch(() => null);

  const cards = report?.cards ?? [];
  const activeCards = cards.filter((c) => c.active);
  const endedCards = cards.filter((c) => !c.active);
  const underwater = cards.filter((c) => c.verdict === "stop");

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
              ? `${underwater.length} קודים מוכרים בהפסד כרגע: ${underwater.map((c) => c.code).join(", ")} — כל הזמנה נוספת תחתיהם מפסידה כסף.`
              : `${underwater.length} codes are selling at a loss right now: ${underwater.map((c) => c.code).join(", ")} — every additional order under them loses money.`}
          </p>
        </div>
      ) : null}

      {report && cards.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">{isHe ? "עלות הנחות בחלון" : "Discount cost in window"}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatCurrency(report.totalDiscountCost, currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">{isHe ? "הכנסה נטו מהזמנות עם קוד" : "Net revenue on coded orders"}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(report.totalRevenue, currency)}</p>
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
        <DiscountBoard active={activeCards} ended={endedCards} currency={currency} isHe={isHe} />
      )}
    </AppShell>
  );
}
