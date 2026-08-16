// Shared skeleton primitive. Used by app-router loading.tsx files and
// inline placeholders in client components.
//
// Deliberately simple: a rounded rectangle with a subtle shimmer that
// respects `prefers-reduced-motion`. No prop for shape — compose sizes
// via Tailwind height/width classes at the call site.

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        "motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

// Common composed skeletons for scan-once patterns.

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export function SkeletonTile({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-2xl border border-border p-4", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

export function SkeletonSection({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-64" />
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))` }}
      >
        {Array.from({ length: tiles }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    </div>
  );
}
