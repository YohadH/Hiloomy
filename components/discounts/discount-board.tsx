"use client";

// Discount scorecards board: search + sort over the code cards.
//
// Split out of app/discounts/page.tsx (a server component) because the
// filter needs local state. The card renderer moved with it rather than
// being imported back into the server file — it is pure presentation, and
// keeping it beside the only thing that renders it avoids a shared module
// that exists for no reason other than the client/server boundary.

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { DiscountScorecard } from "@/lib/services/discount-scorecard-service";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

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

function ScorecardCard({
  card,
  currency,
  isHe,
  shopifyStoreHandle
}: {
  card: DiscountScorecard;
  currency: string;
  isHe: boolean;
  shopifyStoreHandle: string | null;
}) {
  const aovDelta =
    card.baselineAov != null && card.baselineAov > 0
      ? (card.aov - card.baselineAov) / card.baselineAov
      : null;
  // The owner asked for TOTALS in plain language (F-055): gross sales
  // through the code, total discount given, orders — not derived ratios.
  // Σ lineSubtotal over the code's DISTINCT orders (ex-VAT), computed in the
  // service — not revenue + discountCost, which drifted whenever an order's
  // line discounts and its DiscountUsage rows disagreed (H-10).
  const grossSales = card.grossSales;
  const isSeeding = card.classification === "seeding";
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4",
        card.verdict === "stop" ? "border-red-300" : isSeeding ? "border-violet-200" : "border-border/70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-bold tracking-wide">
            <span className="truncate">{card.code}</span>
            {card.affiliateName ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-sans text-[10px] font-semibold text-emerald-800">
                {isHe ? `קוד שותפה · ${card.affiliateName}` : `Affiliate · ${card.affiliateName}`}
              </span>
            ) : null}
            {isSeeding ? (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 font-sans text-[10px] font-semibold text-violet-800">
                {isHe ? "חלוקת מוצרים (סידינג)" : "Product seeding"}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(card.lastUsedAt).toLocaleDateString(isHe ? "he-IL" : "en-US")}{" "}
            {isHe ? "(שימוש אחרון)" : "(last use)"}
            {card.affiliateName ? (isHe ? " · העמלה נספרת בנפרד בפורטל השותפים" : " · commission tracked separately in the affiliate portal") : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {shopifyStoreHandle ? (
            <a
              href={`https://admin.shopify.com/store/${shopifyStoreHandle}/discounts?query=${encodeURIComponent(card.code)}`}
              target="_blank"
              rel="noopener noreferrer"
              title={isHe ? "פתיחת ההנחה בShopify" : "Open the discount in Shopify"}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Shopify
            </a>
          ) : null}
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold",
              verdictStyles(card.verdict)
            )}
          >
            {verdictLabel(card.verdict, isHe)}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isHe ? "סך מכירות דרך הקוד" : "Total sales via code"}
          </p>
          <p className="text-sm font-semibold tabular-nums">{formatCurrency(grossSales, currency)}</p>
          <p className="text-[10px] text-muted-foreground">
            {isHe ? `נטו אחרי ההנחה: ${formatCurrency(card.revenue, currency)}` : `Net after discount: ${formatCurrency(card.revenue, currency)}`}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isHe ? "הזמנות" : "Orders"}
          </p>
          <p className="text-sm font-semibold tabular-nums">{card.uses}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {/* Retail value forgone, NOT money out of pocket — labeling this
                "cost" is how a ₪313 giveaway read as a ₪4,472 loss (F-057). */}
            {isHe ? "סך ההנחה שניתנה (מחיר מדף)" : "Total discount given (list price)"}
          </p>
          <p className="text-sm font-semibold tabular-nums text-orange-700">
            {formatCurrency(card.discountCost, currency)}
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

      <div className="mt-3 space-y-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold">
            {isHe ? "רווח בפועל (נטו פחות עלות מוצרים): " : "Actual profit (net minus COGS): "}
          </span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              card.marginAfterDiscount < 0 ? "text-red-700" : "text-emerald-800"
            )}
          >
            {card.hasCostData ? formatCurrency(card.marginAfterDiscount, currency) : "—"}
          </span>
          <span
            className="ms-2"
            title={
              isHe
                ? "סל ממוצע נטו: הכנסת מוצרים אחרי ההנחה, ללא מע\"מ ומשלוח, חלקי ההזמנות תחת הקוד — אותה הגדרה כמו ה-AOV בדשבורד."
                : "Net AOV: product revenue after the discount, excluding VAT and shipping, ÷ orders under the code — the same definition as the dashboard's AOV."
            }
          >
            AOV {formatCurrency(card.aov, currency)}
            {aovDelta != null ? (
              <span className={cn("ms-1 font-semibold", aovDelta >= 0 ? "text-emerald-700" : "text-red-600")}>
                ({aovDelta >= 0 ? "+" : ""}
                {Math.round(aovDelta * 100)}% {isHe ? "מול הזמנות ללא הנחה" : "vs non-discounted"})
              </span>
            ) : null}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{isHe ? card.verdictReason.he : card.verdictReason.en}</p>
      </div>
    </div>
  );
}

// Sort keys chosen for discounts rather than copied from the inventory
// board: "critical" there meant near-stockout, here it means losing money.
type SortKey = "critical" | "used" | "costliest";

export function DiscountBoard({
  active,
  ended,
  currency,
  isHe,
  shopifyStoreHandle = null
}: {
  active: DiscountScorecard[];
  ended: DiscountScorecard[];
  currency: string;
  isHe: boolean;
  /** myshopify subdomain (e.g. "incenseparfums") for admin deep links. */
  shopifyStoreHandle?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("critical");

  const apply = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rank = { stop: 0, keep: 1, expand: 2 } as const;
    return (rows: DiscountScorecard[]) => {
      const filtered = needle
        ? rows.filter(
            (c) =>
              c.code.toLowerCase().includes(needle) ||
              (c.affiliateName ?? "").toLowerCase().includes(needle)
          )
        : rows;
      const sorted = [...filtered];
      if (sortKey === "used") {
        sorted.sort((a, b) => b.uses - a.uses);
      } else if (sortKey === "costliest") {
        sorted.sort((a, b) => b.discountCost - a.discountCost);
      } else {
        // Losing codes first, then the thinnest margin — the order a
        // merchant needs when deciding what to switch off today.
        sorted.sort(
          (a, b) => rank[a.verdict] - rank[b.verdict] || a.marginAfterDiscount - b.marginAfterDiscount
        );
      }
      return sorted;
    };
  }, [query, sortKey]);

  const activeRows = apply(active);
  const endedRows = apply(ended);
  const total = activeRows.length + endedRows.length;

  const sorts: { key: SortKey; he: string; en: string }[] = [
    { key: "critical", he: "הכי קריטי", en: "Most critical" },
    { key: "used", he: "הכי בשימוש", en: "Most used" },
    { key: "costliest", he: "הכי יקר", en: "Costliest" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isHe ? "חיפוש קוד הנחה..." : "Search discount code..."}
            className="h-9 w-full rounded-lg border border-input bg-background pe-3 ps-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            dir={isHe ? "rtl" : "ltr"}
            aria-label={isHe ? "חיפוש קוד הנחה" : "Search discount code"}
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
          {sorts.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => setSortKey(btn.key)}
              aria-pressed={sortKey === btn.key}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                sortKey === btn.key
                  ? "bg-white text-emerald-700 shadow-sm dark:bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isHe ? btn.he : btn.en}
            </button>
          ))}
        </div>
      </div>

      {/* A search that matches nothing must say so — otherwise the page just
          looks broken, indistinguishable from having no discounts at all. */}
      {query.trim() && total === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-background/70 p-8 text-center text-sm text-muted-foreground">
          {isHe ? `לא נמצא קוד הנחה שתואם ל־"${query.trim()}".` : `No discount code matches "${query.trim()}".`}
        </div>
      ) : null}

      {activeRows.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {isHe ? `פעילים (${activeRows.length})` : `Active (${activeRows.length})`}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {activeRows.map((card) => (
              <ScorecardCard key={card.code} card={card} currency={currency} isHe={isHe} shopifyStoreHandle={shopifyStoreHandle} />
            ))}
          </div>
        </section>
      ) : null}

      {endedRows.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {isHe ? `היסטוריה (${endedRows.length})` : `History (${endedRows.length})`}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {endedRows.map((card) => (
              <ScorecardCard key={card.code} card={card} currency={currency} isHe={isHe} shopifyStoreHandle={shopifyStoreHandle} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
