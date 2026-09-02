"use client";

// Meta campaigns on the Command Center (owner ask, 2026-08-26): "show me
// the meta ads campaigns that are running... make the UI/UX very clear —
// make sure to add a filter". Renders below the traffic/links section.
//
// UX decisions:
// - Sorted by spend; the bar under each row is spend share, COLORED BY
//   ROAS (green ≥ break-even ×2, amber in between, red = losing money) so
//   the eye finds the burn instantly — same visual language as the links
//   section above it.
// - Filters: free-text search, status chips (all / recently active /
//   losing money), and a sort switch. "Recently active" is derived from
//   the data (spend within the last 3 data-days) — Meta's live status
//   isn't stored, and the label says so honestly.

import { useMemo, useState } from "react";
import { Megaphone, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";

type StatusFilter = "all" | "active" | "losing";
type SortKey = "spend" | "roas" | "purchases";

export function MetaCampaignsSection({
  overview,
  isHe,
  breakevenRoas
}: {
  overview: MetaCampaignsOverview;
  isHe: boolean;
  /**
   * Store breakeven ROAS = 1 / contribution-margin rate. The point where a
   * campaign stops making money AFTER COGS/shipping/fees. Null when cost
   * coverage is too low to trust it — then we fall back to the ROAS=1 line
   * and say so, rather than quote a false breakeven (Meta only ever judges
   * against its own objective; the profit truth is the edge — 2 Sep 2026).
   */
  breakevenRoas?: number | null;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  // The line a campaign must clear to be profitable. Breakeven when we trust
  // it, else 1.0 (revenue = spend) as a floor.
  const profitLine = breakevenRoas && breakevenRoas > 0 ? breakevenRoas : 1;
  const nf = new Intl.NumberFormat(isHe ? "he-IL" : "en-US");
  const money = (n: number) => `₪${nf.format(Math.round(n))}`;

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");

  const maxSpend = useMemo(
    () => Math.max(...overview.campaigns.map((c) => c.spend), 1),
    [overview.campaigns]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overview.campaigns
      .filter((c) => {
        if (q && !c.campaignName.toLowerCase().includes(q)) return false;
        if (status === "active" && !c.activeRecently) return false;
        if (status === "losing" && !(c.spend > 0 && (c.roas ?? 0) < 1)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortKey === "roas") return (b.roas ?? -1) - (a.roas ?? -1);
        if (sortKey === "purchases") return b.purchases - a.purchases;
        return b.spend - a.spend;
      });
  }, [overview.campaigns, query, status, sortKey]);

  const activeCount = overview.campaigns.filter((c) => c.activeRecently).length;
  // "Losing money" = below the PROFIT line (breakeven), not below ROAS 1 —
  // a campaign at ROAS 3 still loses money if breakeven is 3.5.
  const losingCount = overview.campaigns.filter((c) => c.spend > 0 && (c.roas ?? 0) < profitLine).length;

  // Tone by distance from the profit line: comfortably above → green, just
  // above (within 20%) → amber, below → red.
  const roasTone = (roas: number | null) =>
    roas == null
      ? "text-muted-foreground"
      : roas >= profitLine * 1.2
        ? "text-emerald-700 dark:text-emerald-400"
        : roas >= profitLine
          ? "text-amber-700 dark:text-amber-400"
          : "text-rose-700 dark:text-rose-400";

  const barTone = (roas: number | null) =>
    roas == null
      ? "bg-slate-300 dark:bg-slate-600"
      : roas >= profitLine * 1.2
        ? "bg-emerald-500"
        : roas >= profitLine
          ? "bg-amber-500"
          : "bg-rose-500";

  const chip = (value: StatusFilter, label: string, count?: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setStatus(value)}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold transition",
        status === value
          ? "bg-foreground text-background"
          : "border border-border bg-background text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {count != null ? ` · ${count}` : ""}
    </button>
  );

  return (
    <Card>
      <CardContent className="p-4">
        {/* Header + totals */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Megaphone className="h-4 w-4" aria-hidden />
              {lang("קמפיינים בMeta", "Meta campaigns")}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {lang(
                `${overview.rangeStart} עד ${overview.rangeEnd} · נתונים עד ${overview.dataThrough ?? "—"} · ״פעיל״ = הוציא תקציב ב־3 ימי הנתונים האחרונים`,
                `${overview.rangeStart} to ${overview.rangeEnd} · data through ${overview.dataThrough ?? "—"} · "active" = spent within the last 3 data-days`
              )}
            </p>
            <p className="mt-1 text-[11px]">
              {breakevenRoas && breakevenRoas > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {lang(`נקודת איזון רווחית: ROAS ×${breakevenRoas.toFixed(2)}`, `Breakeven: ROAS ×${breakevenRoas.toFixed(2)}`)}
                  <span className="font-normal opacity-80">
                    {lang("— מתחתיה הקמפיין מפסיד כסף אחרי עלויות", "— below this a campaign loses money after costs")}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {lang(
                    "נקודת האיזון האמיתית דורשת עלויות מוצר — כרגע נמדד מול ROAS ×1 בלבד (הכנסה = הוצאה).",
                    "A real breakeven needs product costs — currently judged against ROAS ×1 only (revenue = spend)."
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            {[
              { label: lang("הוצאה", "Spend"), value: money(overview.totalSpend) },
              { label: lang("רכישות", "Purchases"), value: nf.format(overview.totalPurchases) },
              { label: lang("הכנסה מיוחסת", "Attributed revenue"), value: money(overview.totalRevenue) },
              {
                label: "ROAS",
                value: overview.blendedRoas != null ? `×${overview.blendedRoas}` : "—",
                tone: roasTone(overview.blendedRoas)
              }
            ].map((t) => (
              <div key={t.label} className="text-center">
                <p className="text-[10px] text-muted-foreground">{t.label}</p>
                <p className={cn("font-bold tabular-nums", t.tone)}>{t.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground ltr:left-2.5 rtl:right-2.5" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang("חיפוש קמפיין…", "Search campaigns…")}
              className="w-48 rounded-full border border-border bg-background py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ltr:pl-8 ltr:pr-3 rtl:pl-3 rtl:pr-8"
            />
          </div>
          {chip("all", lang("הכל", "All"), overview.campaigns.length)}
          {chip("active", lang("פעילים לאחרונה", "Recently active"), activeCount)}
          {chip("losing", lang("מפסידים כסף", "Losing money"), losingCount)}
          <div className="ms-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {lang("מיון:", "Sort:")}
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] focus:outline-none"
            >
              <option value="spend">{lang("הוצאה", "Spend")}</option>
              <option value="roas">ROAS</option>
              <option value="purchases">{lang("רכישות", "Purchases")}</option>
            </select>
          </div>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {lang("אין קמפיינים שתואמים את הסינון.", "No campaigns match the filter.")}
          </p>
        ) : (
          <div className="mt-2 divide-y divide-border/60">
            {filtered.map((c) => (
              <div key={c.campaignId} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        c.activeRecently ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                      )}
                      title={
                        c.activeRecently
                          ? lang("פעיל לאחרונה", "Recently active")
                          : lang(`ללא הוצאה מאז ${c.lastActiveDate ?? "—"}`, `No spend since ${c.lastActiveDate ?? "—"}`)
                      }
                    />
                    <p className="min-w-0 truncate text-sm font-semibold" dir="ltr">
                      {c.campaignName}
                    </p>
                    {!c.activeRecently ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {lang(`לא פעיל מאז ${c.lastActiveDate ?? "—"}`, `inactive since ${c.lastActiveDate ?? "—"}`)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.roas != null && c.spend > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          c.roas >= profitLine
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                        )}
                        title={
                          breakevenRoas && breakevenRoas > 0
                            ? lang(`מול נקודת איזון ×${profitLine.toFixed(2)}`, `vs breakeven ×${profitLine.toFixed(2)}`)
                            : lang("מול ROAS ×1 (אין עלויות מוצר)", "vs ROAS ×1 (no product costs)")
                        }
                      >
                        {c.roas >= profitLine ? lang("רווחי", "profitable") : lang("מפסיד", "losing")}
                      </span>
                    ) : null}
                    <p className={cn("text-sm font-bold tabular-nums", roasTone(c.roas))}>
                      {c.roas != null ? `ROAS ×${c.roas}` : lang("ללא רכישות", "No purchases")}
                    </p>
                  </div>
                </div>

                {/* Spend-share bar, colored by ROAS */}
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", barTone(c.roas))}
                    style={{ width: `${Math.max(3, Math.round((c.spend / maxSpend) * 100))}%` }}
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    {lang("הוצאה", "Spend")}{" "}
                    <b className="tabular-nums text-foreground">{money(c.spend)}</b>
                  </span>
                  <span>
                    {lang("רכישות", "Purchases")}{" "}
                    <b className="tabular-nums text-foreground">{nf.format(c.purchases)}</b>
                  </span>
                  <span>
                    {lang("הכנסה", "Revenue")}{" "}
                    <b className="tabular-nums text-foreground">{money(c.revenue)}</b>
                  </span>
                  {c.cpa != null ? (
                    <span>
                      {lang("עלות לרכישה", "CPA")}{" "}
                      <b className="tabular-nums text-foreground">{money(c.cpa)}</b>
                    </span>
                  ) : null}
                  <span>
                    {lang("קליקים", "Clicks")}{" "}
                    <b className="tabular-nums text-foreground">{nf.format(c.clicks)}</b>
                  </span>
                  {c.ctr != null ? (
                    <span>
                      CTR <b className="tabular-nums text-foreground">{c.ctr}%</b>
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
