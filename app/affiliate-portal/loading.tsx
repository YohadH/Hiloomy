import { Skeleton, SkeletonSection } from "@/components/ui/skeleton";

export default function AffiliatePortalLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {/* Narrative banner */}
      <Skeleton className="h-24 w-full rounded-2xl" />
      {/* Portal nav */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
      {/* 5 KPI tiles */}
      <SkeletonSection tiles={5} />
      {/* Chart + active program cards */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
      {/* Top-affiliate tables */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}
