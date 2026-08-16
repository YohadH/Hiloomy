"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { KPI } from "@/lib/domain/types";
import { formatMetricValue } from "@/lib/formatters";

function truncate(value: string, max = 14) {
  if (value == null) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function BarInsightChart<T extends object>({
  data,
  dataKey,
  xKey,
  color = "#5E6AD2",
  format = "number",
  currency = "USD",
  valueLabel
}: {
  data: T[];
  dataKey: keyof T & string;
  xKey: keyof T & string;
  color?: string;
  format?: KPI["format"];
  currency?: string;
  /** Optional label shown in tooltip (e.g. "Estimated profit"). Defaults to dataKey humanized. */
  valueLabel?: string;
}) {
  // Mount guard: ResponsiveContainer reads DOM dimensions via ResizeObserver
  // and produces different HTML on the server (where no DOM exists) vs the
  // client — triggering React hydration error #418. Render nothing until the
  // component has mounted on the client so server and client agree on the
  // initial HTML (an empty placeholder div).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const tooltipName =
    valueLabel ??
    String(dataKey)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="h-[260px] w-full sm:h-[320px]">
      {!mounted ? null : (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ left: -8, right: 8, top: 8, bottom: 56 }}
          barCategoryGap="22%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-28}
            textAnchor="end"
            height={56}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value) => truncate(String(value ?? ""), 16)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={60}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value) => formatMetricValue(value, format, { currency, compact: true })}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
            contentStyle={{
              borderRadius: "0.75rem",
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              boxShadow: "0 18px 45px -24px rgba(15, 23, 42, 0.28)"
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            formatter={(value: number) => [formatMetricValue(value, format, { currency }), tooltipName]}
            labelFormatter={(label) => String(label ?? "")}
          />
          <Bar dataKey={dataKey} fill={color} radius={[8, 8, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}
