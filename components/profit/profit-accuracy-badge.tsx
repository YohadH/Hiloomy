// Measured-vs-estimated label for profit numbers (Launch-QA P0). A profit
// figure is only as true as its cost data — this pill says how much of it is
// backed by REAL COGS vs the default-ratio estimate, so a merchant never
// reads an estimate with the same authority as a measured number.
//
// Presentational + hook-free, so it renders in server or client components.

import { ShieldCheck, TriangleAlert, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfitAccuracyBadge({
  coverage,
  isHe,
  className
}: {
  /** 0–1 share of revenue backed by a real cost (contribution-margin costCoverage). */
  coverage: number;
  isHe: boolean;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, coverage)) * 100);
  const tier = coverage >= 0.9 ? "measured" : coverage >= 0.6 ? "partial" : "estimated";

  const meta = {
    measured: {
      Icon: ShieldCheck,
      cls: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
      label: isHe ? "רווח מדוד" : "Measured profit",
      title: isHe
        ? `${pct}% מההכנסה מגובה בעלות מוצר אמיתית.`
        : `${pct}% of revenue is backed by real product cost.`
    },
    partial: {
      Icon: CircleDashed,
      cls: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      label: isHe ? `רווח מדוד חלקית · ${pct}%` : `Partly measured · ${pct}%`,
      title: isHe
        ? `רק ${pct}% מההכנסה מגובה בעלות אמיתית; השאר מוערך לפי יחס ברירת מחדל.`
        : `Only ${pct}% of revenue is backed by real cost; the rest is estimated from the default ratio.`
    },
    estimated: {
      Icon: TriangleAlert,
      cls: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
      label: isHe ? `רווח מוערך · ${pct}% מבוסס עלות` : `Estimated · ${pct}% cost-backed`,
      title: isHe
        ? `רק ${pct}% מההכנסה מגובה בעלות אמיתית — רוב הרווח מוערך. הוסיפו עלויות מוצר כדי לדייק.`
        : `Only ${pct}% of revenue is backed by real cost — most of this profit is estimated. Add product costs to make it accurate.`
    }
  }[tier];

  const { Icon } = meta;
  return (
    <span
      title={meta.title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        meta.cls,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {meta.label}
    </span>
  );
}
