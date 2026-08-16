"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const RevenueChartV2 = dynamic(
  () => import("./revenue-chart-v2-impl").then((m) => m.RevenueChartV2),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> }
);
