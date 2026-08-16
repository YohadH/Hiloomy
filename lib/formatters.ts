import type { KPI } from "@/lib/domain/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

export function formatKpiValue(kpi: KPI, currency = "USD") {
  if (kpi.format === "currency") return formatCurrency(kpi.value, currency);
  if (kpi.format === "percent") return formatPercent(kpi.value);
  return formatNumber(kpi.value);
}

export function formatMetricValue(
  value: number,
  format: KPI["format"],
  options?: { currency?: string; compact?: boolean }
) {
  if (format === "currency") {
    if (options?.compact && Math.abs(value) >= 1000) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: options.currency ?? "USD",
        notation: "compact",
        maximumFractionDigits: 1
      }).format(value);
    }

    return formatCurrency(value, options?.currency);
  }

  if (format === "percent") return formatPercent(value);
  return formatNumber(value);
}
