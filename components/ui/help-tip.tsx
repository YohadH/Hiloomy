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

// LOGICAL alignment (2026-08-23). These were physical `left-0`/`right-0`,
// so on RTL pages the tooltip anchored to the wrong edge and pushed the
// panel off-screen — measured horizontal page overflow of 1446-1497px on
// /retention, /affiliate-portal and /growth-agent. `start`/`end` flip with
// direction; the centered case needs no translate because start-0 + end-0
// lets the box center itself within the trigger.
const alignClasses: Record<Side, Record<Align, string>> = {
  top: {
    start: "start-0",
    center: "start-1/2 -translate-x-1/2 rtl:translate-x-1/2",
    end: "end-0"
  },
  bottom: {
    start: "start-0",
    center: "start-1/2 -translate-x-1/2 rtl:translate-x-1/2",
    end: "end-0"
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
  // Hebrew-first default: nearly every caller omits `locale`, and with an
  // "en" default the aria-label leaked English on every Hebrew page.
  locale = "he"
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
