import { cn } from "@/lib/utils";

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
      className={cn("inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground", className)}
    >
      {children}
    </span>
  );
}
