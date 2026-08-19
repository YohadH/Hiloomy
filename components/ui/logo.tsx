import { cn } from "@/lib/utils";

// Hiloomy brand assets. The mark is a green "H" whose right stem is an
// orange up-arrow rising above the letter; in the full logo the mark IS
// the "H" of the wordmark: [mark]iloomy. — dark forest green with an
// orange period. Static copies live at public/hiloomy-mark.svg (emails,
// print) and app/icon.svg (favicon) — keep the three in sync.

export function HiloomyMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={cn("h-8 w-8 shrink-0", className)}
    >
      <rect x="11.5" y="17" width="6.2" height="19.5" rx="2.8" fill="#16A34A" />
      <rect x="16.5" y="24.5" width="11.5" height="4.4" fill="#16A34A" />
      <rect x="27.5" y="18.2" width="6.2" height="18.3" rx="2.6" fill="#F97316" />
      <path d="M30.6 10.2L37.6 18.8H23.6L30.6 10.2Z" fill="#F97316" />
    </svg>
  );
}

// Tightly-cropped copy of the mark used inside the wordmark lockup so the
// "H" sits flush against "iloomy" with a shared baseline (the 48-viewBox
// mark carries padding that would push the letters apart).
function HiloomyMarkTight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="11 9.7 27 27.3"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect x="11.5" y="17" width="6.2" height="19.5" rx="2.8" fill="#16A34A" />
      <rect x="16.5" y="24.5" width="11.5" height="4.4" fill="#16A34A" />
      <rect x="27.5" y="18.2" width="6.2" height="18.3" rx="2.6" fill="#F97316" />
      <path d="M30.6 10.2L37.6 18.8H23.6L30.6 10.2Z" fill="#F97316" />
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
  // dir="ltr" pins the lockup order on RTL pages — a brand logo never
  // mirrors ([mark]iloomy. must not become .ymooli[mark]).
  //
  // Accessibility/crawlers: the visible text is only "iloomy." (the mark IS
  // the H), which made Google's brand verification read the site name as
  // "iloomy". The sr-only text carries the real name; the visual pieces are
  // aria-hidden so screen readers don't announce "Hiloomy iloomy".
  return (
    <span dir="ltr" aria-label="Hiloomy" className={cn("inline-flex items-end", className)}>
      <span className="sr-only">Hiloomy</span>
      <HiloomyMarkTight className={cn("h-[1.7em] w-auto", markClassName)} />
      <span
        aria-hidden="true"
        className={cn(
          "text-lg font-bold leading-none tracking-tight text-[#1B4332] dark:text-foreground",
          textClassName
        )}
        style={{ marginInlineStart: "-0.08em", marginBottom: "0.02em" }}
      >
        iloomy<span className="text-[#F97316]">.</span>
      </span>
    </span>
  );
}
