"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DailyMetric } from "@/lib/domain/types";

/**
 * Merges current and previous period metrics into a single data array for
 * the dual-line chart. Previous period values are keyed as `prevRate` and
 * indexed by position (day 0, 1, 2…) so the two series overlay cleanly
 * even when the periods have different calendar dates.
 */
function mergeChartData(
  current: DailyMetric[],
  previous: DailyMetric[]
): Array<{ date: string; returningCustomerRate: number; prevRate?: number }> {
  const len = Math.max(current.length, previous.length);
  const result: Array<{ date: string; returningCustomerRate: number; prevRate?: number }> = [];
  for (let i = 0; i < len; i++) {
    const cur = current[i];
    const prev = previous[i];
    if (!cur) continue;
    result.push({
      date: cur.date,
      returningCustomerRate: cur.returningCustomerRate,
      prevRate: prev ? prev.returningCustomerRate : undefined
    });
  }
  return result;
}

export function RetentionLineChartV2({
  data,
  previousData,
  locale = "he"
}: {
  data: DailyMetric[];
  previousData?: DailyMetric[];
  locale?: "he" | "en";
}) {
  const hasPrev = previousData && previousData.length > 0;
  const chartData = hasPrev ? mergeChartData(data, previousData) : data;
  const currentLabel = locale === "he" ? "תקופה נוכחית" : "Current period";
  const prevLabel = locale === "he" ? "תקופה קודמת" : "Previous period";

  return (
    <div className="h-[280px] w-full sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ left: 8, right: 16, top: 16, bottom: 0 }}>
          <defs>
            <linearGradient id="ov2-retention" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5E6AD2" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#5E6AD2" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ov2-retention-prev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.20} />
              <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02} />
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
            width={48}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
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
              `${value.toFixed(1)}%`,
              name === "returningCustomerRate" ? currentLabel : prevLabel
            ]}
          />
          {hasPrev && (
            <Legend
              iconType="line"
              iconSize={12}
              formatter={(value) =>
                value === "returningCustomerRate" ? currentLabel : prevLabel
              }
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
          )}
          {/* Previous period rendered first so it sits behind the current period */}
          {hasPrev && (
            <Area
              type="monotone"
              dataKey="prevRate"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              fill="url(#ov2-retention-prev)"
              dot={false}
              activeDot={{ r: 3 }}
            />
          )}
          <Area
            type="monotone"
            dataKey="returningCustomerRate"
            stroke="#5E6AD2"
            strokeWidth={2.2}
            fill="url(#ov2-retention)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
