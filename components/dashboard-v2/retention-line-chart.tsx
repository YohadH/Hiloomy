"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const RetentionLineChartV2 = dynamic(
  () => import("./retention-line-chart-impl").then((m) => m.RetentionLineChartV2),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);
