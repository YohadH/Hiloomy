"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyMetric } from "@/lib/domain/types";
import { formatMetricValue } from "@/lib/formatters";

export function RevenueProfitChart({
  data,
  currency = "USD"
}: {
  data: DailyMetric[];
  currency?: string;
}) {
  return (
    <div className="h-[240px] w-full sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            tickFormatter={(value) => formatMetricValue(value, "currency", { currency, compact: true })}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip formatter={(value: number) => formatMetricValue(value, "currency", { currency })} />
          <Line type="monotone" dataKey="revenue" stroke="#0f172a" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="estimatedProfit" stroke="#22c55e" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
