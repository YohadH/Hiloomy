import { cn } from "@/lib/utils";

// A quiet label. No uppercase, no letter-spacing — a badge should read as a
// word, not a component. Pill shape is kept because badges ARE statuses.
export function Badge({
  className,
  children,
  title
}: {
  className?: string;
  children: React.ReactNode;
  /** Native tooltip — used to keep a raw enum/status value visible on hover. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground", className)}
    >
      {children}
    </span>
  );
}
