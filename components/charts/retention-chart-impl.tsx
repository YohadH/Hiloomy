"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyMetric } from "@/lib/domain/types";
import { formatMetricValue } from "@/lib/formatters";

export function RetentionChart({ data }: { data: DailyMetric[] }) {
  return (
    <div className="h-[220px] w-full sm:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(value) => formatMetricValue(value, "percent")} tickLine={false} axisLine={false} width={52} />
          <Tooltip formatter={(value: number) => formatMetricValue(value, "percent")} />
          <Area type="monotone" dataKey="returningCustomerRate" stroke="#2563eb" strokeWidth={3} fill="url(#retentionFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
