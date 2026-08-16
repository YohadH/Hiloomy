"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";
import type { PortfolioBrandRow } from "@/lib/services/portfolio-service";

// Per-brand performance table. Click any row → activate that brand
// (POST /api/settings/active-store) → navigate to its Overview. Lets the
// board operator drill down from the portfolio view into a specific
// brand without leaving the page first.

export function PortfolioBrandTable({
  rows,
  currency,
  locale
}: {
  rows: PortfolioBrandRow[];
  currency: string;
  locale: AppLocale;
}) {
  const router = useRouter();
  const isHe = locale === "he";
  const [, startTransition] = useTransition();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const handlePick = async (storeId: string) => {
    if (switchingId) return;
    setSwitchingId(storeId);
    try {
      const res = await fetch("/api/settings/active-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string })?.error ??
            (isHe ? "החלפת המותג נכשלה." : "Failed to switch brand.")
        );
      }
      startTransition(() => router.push("/" as never));
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : isHe ? "משהו השתבש." : "Something went wrong."
      );
      setSwitchingId(null);
    }
  };

  const t = isHe
    ? {
        brand: "מותג",
        revenue: "הכנסה",
        orders: "הזמנות",
        aov: "AOV",
        returning: "לקוחות חוזרים",
        refundRate: "שיעור החזרים",
        change: "שינוי",
        sync: "סנכרון",
        view: "צפייה",
        notConnected: "לא מחובר",
        neverSynced: "טרם סונכרן",
        hoursAgo: (h: number) => `לפני ${h} שעות`,
        minutesAgo: (m: number) => `לפני ${m} דק'`,
        justNow: "כעת",
        noChange: "—"
      }
    : {
        brand: "Brand",
        revenue: "Revenue",
        orders: "Orders",
        aov: "AOV",
        returning: "Returning",
        refundRate: "Refunds",
        change: "vs prior",
        sync: "Synced",
        view: "Open",
        notConnected: "Not connected",
        neverSynced: "Never synced",
        hoursAgo: (h: number) => `${h}h ago`,
        minutesAgo: (m: number) => `${m}m ago`,
        justNow: "just now",
        noChange: "—"
      };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className={cn("px-4 py-3 font-medium", isHe ? "text-right" : "text-left")}>
              {t.brand}
            </th>
            <th className={cn("px-4 py-3 font-medium", isHe ? "text-left" : "text-right")}>
              {t.revenue}
            </th>
            <th className={cn("px-4 py-3 font-medium hidden md:table-cell", isHe ? "text-left" : "text-right")}>
              {t.orders}
            </th>
            <th className={cn("px-4 py-3 font-medium hidden lg:table-cell", isHe ? "text-left" : "text-right")}>
              {t.aov}
            </th>
            <th className={cn("px-4 py-3 font-medium hidden lg:table-cell", isHe ? "text-left" : "text-right")}>
              {t.returning}
            </th>
            <th className={cn("px-4 py-3 font-medium hidden xl:table-cell", isHe ? "text-left" : "text-right")}>
              {t.refundRate}
            </th>
            <th className={cn("px-4 py-3 font-medium", isHe ? "text-left" : "text-right")}>
              {t.change}
            </th>
            <th className={cn("px-4 py-3 font-medium hidden md:table-cell", isHe ? "text-left" : "text-right")}>
              {t.sync}
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row) => {
            const isSwitching = switchingId === row.storeId;
            const change = row.totalSalesChange;
            const positive = (change ?? 0) > 0;
            const negative = (change ?? 0) < 0;
            const ChangeIcon = positive ? ArrowUpRight : negative ? ArrowDownRight : null;
            return (
              <tr
                key={row.storeId}
                className={cn(
                  "transition-colors",
                  row.isActive ? "" : "bg-muted/20 text-muted-foreground",
                  isSwitching && "opacity-60"
                )}
              >
                <td className={cn("px-4 py-3 align-middle", isHe ? "text-right" : "text-left")}>
                  <p className="font-semibold text-foreground">
                    {row.storeName}
                    {row.isDemo ? (
                      <span
                        className="ms-2 inline-flex items-center rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800 align-middle"
                        title={isHe ? "חנות הדגמה — נתונים סינתטיים" : "Demo store — synthetic data"}
                      >
                        {isHe ? "נתוני הדגמה" : "Demo data"}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.domain}</p>
                  {!row.connected ? (
                    <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                      {t.notConnected}
                    </span>
                  ) : null}
                </td>
                <td className={cn("px-4 py-3 align-middle tabular-nums font-semibold text-foreground", isHe ? "text-left" : "text-right")}>
                  {formatCurrency(row.totalSales, row.currency, isHe)}
                </td>
                <td className={cn("px-4 py-3 align-middle tabular-nums text-muted-foreground hidden md:table-cell", isHe ? "text-left" : "text-right")}>
                  {row.orders.toLocaleString(isHe ? "he-IL" : "en-US")}
                </td>
                <td className={cn("px-4 py-3 align-middle tabular-nums text-muted-foreground hidden lg:table-cell", isHe ? "text-left" : "text-right")}>
                  {formatCurrency(row.averageOrderValue, row.currency, isHe)}
                </td>
                <td className={cn("px-4 py-3 align-middle tabular-nums text-muted-foreground hidden lg:table-cell", isHe ? "text-left" : "text-right")}>
                  {row.returningCustomerRate.toFixed(1)}%
                </td>
                <td className={cn("px-4 py-3 align-middle tabular-nums text-muted-foreground hidden xl:table-cell", isHe ? "text-left" : "text-right")}>
                  {row.refundRate.toFixed(1)}%
                </td>
                <td className={cn("px-4 py-3 align-middle", isHe ? "text-left" : "text-right")}>
                  {change === null ? (
                    <span className="text-xs text-muted-foreground">{t.noChange}</span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        positive && "bg-emerald-500/10 text-emerald-700",
                        negative && "bg-rose-500/10 text-rose-700",
                        !positive && !negative && "bg-muted text-muted-foreground"
                      )}
                    >
                      {ChangeIcon ? <ChangeIcon className="h-3 w-3" /> : null}
                      {change >= 0 ? "+" : ""}
                      {change.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className={cn("px-4 py-3 align-middle text-xs text-muted-foreground hidden md:table-cell", isHe ? "text-left" : "text-right")}>
                  {renderSync(row, t)}
                </td>
                <td className={cn("px-4 py-3 align-middle", isHe ? "text-left" : "text-right")}>
                  <button
                    type="button"
                    onClick={() => handlePick(row.storeId)}
                    disabled={Boolean(switchingId)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSwitching ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowRight className={cn("h-3 w-3", isHe ? "rotate-180" : "")} />
                    )}
                    {t.view}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderSync(
  row: PortfolioBrandRow,
  t: {
    hoursAgo: (h: number) => string;
    minutesAgo: (m: number) => string;
    justNow: string;
    neverSynced: string;
  }
): string {
  if (row.syncAgeHours === null) return t.neverSynced;
  if (row.syncAgeHours < 1 / 60) return t.justNow;
  if (row.syncAgeHours < 1) return t.minutesAgo(Math.round(row.syncAgeHours * 60));
  return t.hoursAgo(Math.round(row.syncAgeHours));
}

function formatCurrency(value: number, currency: string, isHe: boolean): string {
  try {
    return new Intl.NumberFormat(isHe ? "he-IL" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 1000 ? 0 : 2
    }).format(value);
  } catch {
    return `${value.toLocaleString(isHe ? "he-IL" : "en-US")} ${currency}`;
  }
}
