"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const RevenueProfitChart = dynamic(
  () => import("./revenue-profit-chart-impl").then((m) => m.RevenueProfitChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);
