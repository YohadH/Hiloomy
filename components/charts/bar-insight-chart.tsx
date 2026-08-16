// Lazy wrapper — see affiliate-trend-chart.tsx for the pattern.
//
// This chart is generic over the row type via <T extends object>, so we
// need a small helper to make next/dynamic play with the generic while
// keeping the wrapper callable as `<BarInsightChart<Row> ...>`.

"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { BarInsightChart as BarInsightChartImpl } from "./bar-insight-chart-impl";

const LazyBarInsightChart = dynamic(
  () => import("./bar-insight-chart-impl").then((m) => m.BarInsightChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BarInsightChart<T extends object>(props: ComponentProps<typeof BarInsightChartImpl<T>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <LazyBarInsightChart {...(props as any)} />;
}
