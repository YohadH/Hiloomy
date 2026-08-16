"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

export function AffiliateTrendChart({
  data,
  currency = "NIS"
}: {
  data: { date: string; sales: number; clicks: number }[];
  currency?: string;
}) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tickLine={false} axisLine={false} dy={10} tick={{ fill: "#6b7280", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} tickFormatter={(value) => formatCurrency(value, currency)} width={80} />
          <Tooltip
            contentStyle={{ borderRadius: 16, border: "1px solid rgba(15,23,42,0.08)", boxShadow: "0 20px 45px rgba(15,23,42,0.08)" }}
            formatter={(value: number, key: string) => [key === "sales" ? formatCurrency(value, currency) : formatNumber(value), key === "sales" ? "מכירות" : "קליקים"]}
          />
          <Line type="monotone" dataKey="sales" stroke="#0f766e" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="clicks" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
