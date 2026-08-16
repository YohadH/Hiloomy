// Lazy wrapper. Defers the Recharts bundle (~120 KB gz) so it loads on
// demand when this chart actually renders, instead of shipping with every
// dashboard route's first-paint. Implementation lives in `-impl.tsx`.
//
// Next.js 15 requires `"use client"` on any module that uses
// `next/dynamic({ ssr: false })` — this file is a Client Component boundary
// so consuming server pages import a client-safe reference.

"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const AffiliateTrendChart = dynamic(
  () => import("./affiliate-trend-chart-impl").then((m) => m.AffiliateTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
