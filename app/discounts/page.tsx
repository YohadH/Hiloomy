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

export const dynamic = "force-dynamic";

function verdictStyles(verdict: DiscountScorecard["verdict"]) {
  switch (verdict) {
    case "expand":
      return "bg-green-100 text-green-800 border-green-300";
    case "stop":
      return "bg-red-100 text-red-800 border-red-300";
    default:
      return "bg-amber-50 text-amber-800 border-amber-200";
  }
}

function verdictLabel(verdict: DiscountScorecard["verdict"], isHe: boolean) {
  switch (verdict) {
    case "expand":
      return isHe ? "להרחיב" : "Expand";
    case "stop":
      return isHe ? "לעצור" : "Stop";
    default:
      return isHe ? "להשאיר" : "Keep";
  }
}

function TrendBars({ trend }: { trend: DiscountScorecard["trend"] }) {
  // Tiny dependency-free sparkline: one bar per day, height ∝ uses.
  const max = Math.max(1, ...trend.map((t) => t.uses));
  const days = trend.slice(-21); // keep it readable on long windows
  return (
    <div className="flex h-10 items-end gap-[3px]" dir="ltr" aria-hidden="true">
      {days.map((t) => (
        <div
          key={t.date}
          title={`${t.date}: ${t.uses}`}
          className="w-2 rounded-sm bg-emerald-600/70"
          style={{ height: `${Math.max(8, (t.uses / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function ScorecardCard({
  card,
  currency,
  isHe
}: {
  card: DiscountScorecard;
  currency: string;
  isHe: boolean;
}) {
  const aovDelta =
    card.baselineAov != null && card.baselineAov > 0
      ? (card.aov - card.baselineAov) / card.baselineAov
      : null;
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4",
        card.verdict === "stop" ? "border-red-300" : "border-border/70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold tracking-wide">{card.code}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {card.uses} {isHe ? "הזמנות" : "orders"} ·{" "}
            {new Date(card.lastUsedAt).toLocaleDateString(isHe ? "he-IL" : "en-US")}{" "}
            {isHe ? "(שימוש אחרון)" : "(last use)"}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-bold",
            verdictStyles(card.verdict)
          )}
        >
          {verdictLabel(card.verdict, isHe)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isHe ? "הכנסה נטו" : "Net revenue"}
          </p>
          <p className="text-sm font-semibold tabular-nums">{formatCurrency(card.revenue, currency)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isHe ? "עלות ההנחה" : "Discount cost"}
          </p>
          <p className="text-sm font-semibold tabular-nums text-orange-700">
            {formatCurrency(card.discountCost, currency)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isHe ? "שוליים אחרי הנחה" : "Margin after discount"}
          </p>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              card.marginAfterDiscount < 0 ? "text-red-700" : "text-emerald-800"
            )}
          >
            {card.hasCostData ? formatCurrency(card.marginAfterDiscount, currency) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isHe ? "לקוחות חדשים" : "New customers"}
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {card.newCustomerShare != null ? `${Math.round(card.newCustomerShare * 100)}%` : "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            AOV {formatCurrency(card.aov, currency)}
            {aovDelta != null ? (
              <span className={cn("ms-1 font-semibold", aovDelta >= 0 ? "text-emerald-700" : "text-red-600")}>
                ({aovDelta >= 0 ? "+" : ""}
                {Math.round(aovDelta * 100)}% {isHe ? "מול הזמנות ללא הנחה" : "vs non-discounted"})
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{isHe ? card.verdictReason.he : card.verdictReason.en}</p>
        </div>
        <TrendBars trend={card.trend} />
      </div>
    </div>
  );
}

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
        <>
          {activeCards.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {isHe ? `פעילים (${activeCards.length})` : `Active (${activeCards.length})`}
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {activeCards.map((card) => (
                  <ScorecardCard key={card.code} card={card} currency={currency} isHe={isHe} />
                ))}
              </div>
            </section>
          ) : null}
          {endedCards.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {isHe ? `היסטוריה (${endedCards.length})` : `History (${endedCards.length})`}
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {endedCards.map((card) => (
                  <ScorecardCard key={card.code} card={card} currency={currency} isHe={isHe} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
