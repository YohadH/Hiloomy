"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceDot
} from "recharts";
import type { DailyMetric } from "@/lib/domain/types";
import type { DailyTrendContextMap, DailyTrendContextItem } from "@/lib/services/daily-trend-context-service";
import { formatCurrency } from "@/lib/utils";
import { saasStrings, type UiLocale } from "@/lib/i18n/saas-strings";

// Enriched revenue + estimated profit chart.
//
// Builds on RevenueChartV2 by overlaying per-day context so the operator
// can see WHY a spike happened:
//   - 📦 Top 3 products that day
//   - 🎯 Active Meta Ads campaigns + spend
//   - 📸 Instagram posts published
//   - 🏷 Discount codes redeemed
//
// Surface treatment:
//   - Small colored dots above each day with at least one event
//     (one per category, stacked vertically). Click target = the chart day.
//   - Rich tooltip on hover showing all four sections.
//
// Indigo (#5E6AD2) for revenue, blue (#0080FF) for profit — the accent
// palette the user liked.

type EnrichedRowBase = DailyMetric & { context?: DailyTrendContextItem };

function CustomTooltip({
  active,
  payload,
  label,
  currency,
  locale
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: EnrichedRowBase }>;
  label?: string;
  currency: string;
  locale: UiLocale;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const ctx = row.context;
  const t = saasStrings[locale].enrichedChart;

  return (
    <div
      className="rounded-xl border border-border bg-card text-card-foreground shadow-xl"
      style={{ maxWidth: 360, minWidth: 260 }}
    >
      <div className="border-b border-border/70 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-sm">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#5E6AD2" }} />{" "}
            {t.revenue}:{" "}
            <strong className="text-foreground">
              {formatCurrency(row.revenue ?? 0, currency)}
            </strong>
          </span>
        </div>
        <div className="text-sm">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#0080FF" }} />{" "}
          {t.profit}:{" "}
          <strong className="text-foreground">
            {formatCurrency(row.estimatedProfit ?? 0, currency)}
          </strong>
        </div>
      </div>

      <div className="space-y-2.5 px-4 py-2.5 text-xs">
        {/* 📦 Top products */}
        {ctx?.topProducts && ctx.topProducts.length > 0 ? (
          <div>
            <p className="mb-1 font-semibold text-foreground">📦 {t.topProducts}</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {ctx.topProducts.map((p) => (
                <li key={p.title} className="flex justify-between gap-2">
                  <span className="truncate" title={p.title}>
                    {p.title}
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {formatCurrency(p.revenue, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 🎯 Active campaigns — ranked by VALUE (revenue/ROAS), not spend.
            Shows attributed revenue + ROAS so the founder sees which ad
            actually made money, not just which one cost the most. Falls
            back to spend display only when Meta didn't report ROAS for
            that day (e.g. zero conversions). */}
        {ctx?.campaigns && ctx.campaigns.length > 0 ? (
          <div>
            <p className="mb-1 font-semibold text-foreground">🎯 {t.campaigns}</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {ctx.campaigns.map((c) => {
                const hasValue = c.roas != null && c.revenue > 0;
                return (
                  <li key={c.name} className="flex justify-between gap-2">
                    <span className="truncate" title={c.name}>
                      {c.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground">
                      {hasValue ? (
                        <>
                          {formatCurrency(c.revenue, currency)}
                          {" · "}
                          <span className={c.roas! >= 1 ? "text-emerald-700" : "text-rose-700"}>
                            {(c.roas as number).toFixed(2)}× {t.campaignRoas}
                          </span>
                        </>
                      ) : (
                        // No conversions reported this day — show spend so
                        // the row isn't empty, but tagged as "spend" so the
                        // founder reads it as cost, not value.
                        <span className="text-muted-foreground">
                          {formatCurrency(c.spend, currency)} {t.spend}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* 📸 Instagram posts */}
        {ctx?.posts && ctx.posts.length > 0 ? (
          <div>
            <p className="mb-1 font-semibold text-foreground">📸 {t.posts}</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {ctx.posts.map((p, idx) => (
                <li key={`${p.creator}-${idx}`} className="flex justify-between gap-2">
                  <span className="truncate" title={p.caption ?? ""}>
                    @{p.creator}
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", { notation: "compact" }).format(p.engagement)} {t.eng}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 🏷 Discount codes */}
        {ctx?.discounts && ctx.discounts.length > 0 ? (
          <div>
            <p className="mb-1 font-semibold text-foreground">🏷 {t.discounts}</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {ctx.discounts.map((d) => (
                <li key={d.code} className="flex justify-between gap-2">
                  <span className="font-mono">{d.code}</span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {d.uses}× · {formatCurrency(d.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* No context at all — keep tooltip useful */}
        {(!ctx?.topProducts?.length &&
          !ctx?.campaigns?.length &&
          !ctx?.posts?.length &&
          !ctx?.discounts?.length) ? (
          <p className="text-muted-foreground">{t.noEvents}</p>
        ) : null}
      </div>
    </div>
  );
}

export function EnrichedRevenueChart({
  data,
  context,
  currency = "USD",
  locale = "he"
}: {
  data: DailyMetric[];
  context?: DailyTrendContextMap;
  currency?: string;
  locale?: UiLocale;
}) {
  const t = saasStrings[locale].enrichedChart;
  // Merge daily metrics with context so the tooltip + markers share a
  // single row source.
  const enrichedData = useMemo<EnrichedRowBase[]>(() => {
    return data.map((d: any) => {
      // d.date is whatever shape DailyMetric uses — usually "Jun 10" pre-
      // formatted. We also need an ISO key to look up context. Prefer
      // d.isoDate if present, otherwise derive from d.date.
      const iso = d.isoDate ?? d.dateISO ?? null;
      const ctx = iso && context ? context[iso] : undefined;
      return { ...d, context: ctx };
    });
  }, [data, context]);

  // Build the marker overlay: one ReferenceDot per category, stacked
  // vertically above the chart. The y-coordinate uses the row's revenue
  // value (so dots sit above each day) with a per-category offset.
  const markers = useMemo(() => {
    const dots: Array<{ key: string; x: string; y: number; color: string; emoji: string }> = [];
    const maxRevenue = enrichedData.reduce((m, d: any) => Math.max(m, d.revenue ?? 0), 0);
    const offset = maxRevenue * 0.04;
    for (const d of enrichedData) {
      const ctx = d.context;
      if (!ctx) continue;
      const baseY = (d.revenue ?? 0) + offset;
      if (ctx.campaigns.length > 0) {
        dots.push({ key: `c-${d.date}`, x: String(d.date), y: baseY + offset * 3, color: "#dc2626", emoji: "🎯" });
      }
      if (ctx.posts.length > 0) {
        dots.push({ key: `p-${d.date}`, x: String(d.date), y: baseY + offset * 2, color: "#db2777", emoji: "📸" });
      }
      if (ctx.discounts.length > 0) {
        dots.push({ key: `d-${d.date}`, x: String(d.date), y: baseY + offset * 1, color: "#f59e0b", emoji: "🏷" });
      }
    }
    return dots;
  }, [enrichedData]);

  return (
    <div className="space-y-2">
      <div className="h-[300px] w-full sm:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={enrichedData} margin={{ left: 8, right: 16, top: 24, bottom: 0 }}>
            <defs>
              <linearGradient id="erc-revenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5E6AD2" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#5E6AD2" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="erc-profit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0080FF" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#0080FF" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              minTickGap={32}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value: number) =>
                new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
              }
            />
            <Tooltip
              cursor={{ stroke: "#5E6AD2", strokeWidth: 1, strokeDasharray: "4 4" }}
              content={(props: any) => <CustomTooltip {...props} currency={currency} locale={locale} />}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#5E6AD2"
              strokeWidth={2.2}
              fill="url(#erc-revenue)"
            />
            <Area
              type="monotone"
              dataKey="estimatedProfit"
              stroke="#0080FF"
              strokeWidth={2.2}
              fill="url(#erc-profit)"
            />
            {markers.map((m) => (
              <ReferenceDot
                key={m.key}
                x={m.x}
                y={m.y}
                r={4}
                fill={m.color}
                stroke="hsl(var(--card))"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Marker legend — only shown when there's at least one marker */}
      {markers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#dc2626" }} />
            {t.legendCampaigns}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#db2777" }} />
            {t.legendPosts}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} />
            {t.legendDiscounts}
          </span>
          <span className="italic">{t.legendHint}</span>
        </div>
      ) : null}
    </div>
  );
}
