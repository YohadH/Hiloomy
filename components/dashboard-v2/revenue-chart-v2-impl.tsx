"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DailyMetric } from "@/lib/domain/types";
import { formatCurrency } from "@/lib/utils";

/**
 * Light-canvas revenue + estimated profit area chart.
 * Indigo (#5E6AD2) for revenue, blue (#0080FF) for profit — the accent palette
 * the user liked, applied to a clean light background.
 */
export function RevenueChartV2({
  data,
  currency = "USD"
}: {
  data: DailyMetric[];
  currency?: string;
}) {
  return (
    <div className="h-[280px] w-full sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 0 }}>
          <defs>
            <linearGradient id="ov2-revenue-light" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5E6AD2" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#5E6AD2" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ov2-profit-light" x1="0" y1="0" x2="0" y2="1">
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
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
              color: "hsl(var(--foreground))",
              boxShadow: "0 18px 45px -24px rgba(15, 23, 42, 0.28)"
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            formatter={(value: number, name: string) => [
              formatCurrency(value, currency),
              name === "revenue" ? "Revenue" : "Estimated profit"
            ]}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#5E6AD2"
            strokeWidth={2.2}
            fill="url(#ov2-revenue-light)"
          />
          <Area
            type="monotone"
            dataKey="estimatedProfit"
            stroke="#0080FF"
            strokeWidth={2.2}
            fill="url(#ov2-profit-light)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
