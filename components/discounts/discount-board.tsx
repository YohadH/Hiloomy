"use client";

// Discount scorecards board: search + sort over the code cards.
//
// Split out of app/discounts/page.tsx (a server component) because the
// filter needs local state. The card renderer moved with it rather than
// being imported back into the server file — it is pure presentation, and
// keeping it beside the only thing that renders it avoids a shared module
// that exists for no reason other than the client/server boundary.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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
          <p className="flex items-center gap-2 truncate font-mono text-sm font-bold tracking-wide">
            {card.code}
            {card.affiliateName ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-sans text-[10px] font-semibold text-emerald-800">
                {isHe ? `קוד שותפה · ${card.affiliateName}` : `Affiliate · ${card.affiliateName}`}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {card.uses} {isHe ? "הזמנות" : "orders"} ·{" "}
            {new Date(card.lastUsedAt).toLocaleDateString(isHe ? "he-IL" : "en-US")}{" "}
            {isHe ? "(שימוש אחרון)" : "(last use)"}
            {card.affiliateName ? (isHe ? " · העמלה נספרת בנפרד בפורטל השותפים" : " · commission tracked separately in the affiliate portal") : ""}
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

// Sort keys chosen for discounts rather than copied from the inventory
// board: "critical" there meant near-stockout, here it means losing money.
type SortKey = "critical" | "used" | "costliest";

export function DiscountBoard({
  active,
  ended,
  currency,
  isHe
}: {
  active: DiscountScorecard[];
  ended: DiscountScorecard[];
  currency: string;
  isHe: boolean;
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
              <ScorecardCard key={card.code} card={card} currency={currency} isHe={isHe} />
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
              <ScorecardCard key={card.code} card={card} currency={currency} isHe={isHe} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
