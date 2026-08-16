"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const RetentionChart = dynamic(
  () => import("./retention-chart-impl").then((m) => m.RetentionChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);
