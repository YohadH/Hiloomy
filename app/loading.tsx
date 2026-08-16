// Root loading skeleton — shown while the Overview page's server
// components resolve. Mirrors the shape the page renders (narrative
// banner, KPI tile row, chart, table) so the layout doesn't shift on
// paint.

import { SkeletonSection, Skeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <SkeletonSection tiles={4} />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <SkeletonSection tiles={3} />
    </div>
  );
}
