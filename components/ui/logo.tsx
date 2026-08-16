import { cn } from "@/lib/utils";

// Hiloomy brand assets. The mark is a green "H" whose right stem is an
// orange up-arrow; the wordmark is dark forest green with an orange
// period. Static copies live at public/hiloomy-mark.svg (emails, print)
// and app/icon.svg (favicon) — keep the three in sync.

export function HiloomyMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={cn("h-8 w-8 shrink-0", className)}
    >
      <rect x="9.5" y="17" width="9" height="19.5" rx="2.8" fill="#16A34A" />
      <rect x="17" y="24.3" width="11.2" height="5.4" fill="#16A34A" />
      <rect x="27.2" y="19.5" width="7.8" height="17" rx="2.2" fill="#F97316" />
      <path d="M31.1 10.5L38.05 21.3H24.15L31.1 10.5Z" fill="#F97316" />
    </svg>
  );
}

export function HiloomyLogo({
  className,
  markClassName,
  textClassName
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <HiloomyMark className={markClassName} />
      <span
        className={cn(
          "text-base font-semibold tracking-tight text-[#1B4332] dark:text-foreground",
          textClassName
        )}
      >
        Hiloomy<span className="text-[#F97316]">.</span>
      </span>
    </span>
  );
}
