import { Skeleton, SkeletonSection } from "@/components/ui/skeleton";

export default function MarketingPlannerLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6" dir="rtl">
      <div className="space-y-2 text-end">
        <Skeleton className="me-0 ms-auto h-3 w-24" />
        <Skeleton className="me-0 ms-auto h-8 w-72" />
        <Skeleton className="me-0 ms-auto h-4 w-full max-w-lg" />
      </div>
      {/* Upload / sheet-picker card */}
      <Skeleton className="h-40 w-full rounded-2xl" />
      {/* Date-range banner */}
      <Skeleton className="h-14 w-full rounded-xl" />
      {/* Insights + brief buttons */}
      <SkeletonSection tiles={2} />
      {/* Calendar grid */}
      <div className="rounded-2xl border border-border p-4">
        <Skeleton className="mb-3 h-5 w-40" />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
