"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const EnrichedRevenueChart = dynamic(
  () => import("./enriched-revenue-chart-impl").then((m) => m.EnrichedRevenueChart),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> }
);
