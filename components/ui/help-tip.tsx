import * as React from "react";
import { HelpCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

export interface HelpTipProps {
  children: React.ReactNode;
  label?: string;
  side?: Side;
  align?: Align;
  variant?: "help" | "info";
  className?: string;
  iconClassName?: string;
  width?: "sm" | "md" | "lg";
  locale?: AppLocale;
}

const sideClasses: Record<Side, string> = {
  top: "bottom-full mb-2",
  bottom: "top-full mt-2",
  left: "right-full me-2 top-1/2 -translate-y-1/2",
  right: "left-full ms-2 top-1/2 -translate-y-1/2"
};

const alignClasses: Record<Side, Record<Align, string>> = {
  top: {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0"
  },
  bottom: {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0"
  },
  left: { start: "", center: "", end: "" },
  right: { start: "", center: "", end: "" }
};

const widthClasses = {
  sm: "w-48",
  md: "w-64",
  lg: "w-80"
};

export function HelpTip({
  children,
  label,
  side = "top",
  align = "center",
  variant = "help",
  className,
  iconClassName,
  width = "md",
  locale = "en"
}: HelpTipProps) {
  const Icon = variant === "info" ? Info : HelpCircle;
  const positionClass = side === "left" || side === "right"
    ? sideClasses[side]
    : cn(sideClasses[side], alignClasses[side][align]);
  const defaultLabel = locale === "he" ? "הצגת מידע נוסף" : "Show more info";

  return (
    <span className={cn("group/tip relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label ?? defaultLabel}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:text-foreground"
      >
        <Icon className={cn("h-3.5 w-3.5", iconClassName)} aria-hidden />
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 rounded-lg border border-border/70 bg-foreground px-3 py-2 text-xs font-normal leading-5 text-background shadow-soft",
          "whitespace-normal text-start",
          "opacity-0 translate-y-1 transition-[opacity,transform] duration-150",
          "group-hover/tip:opacity-100 group-hover/tip:translate-y-0",
          "group-focus-within/tip:opacity-100 group-focus-within/tip:translate-y-0",
          widthClasses[width],
          positionClass
        )}
      >
        {children}
      </span>
    </span>
  );
}
