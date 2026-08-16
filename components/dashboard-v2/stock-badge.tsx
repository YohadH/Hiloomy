import { AlertTriangle, CheckCircle2, Flame, HelpCircle, ShieldAlert } from "lucide-react";
import type { StockFlag } from "@/lib/domain/types";
import type { AppLocale } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/utils";

export const STOCK_THRESHOLDS = { critical: 5, red: 20, yellow: 50 } as const;

export function classifyStock(quantity: number | null | undefined): StockFlag {
  if (quantity === null || quantity === undefined) return "unknown";
  if (quantity < STOCK_THRESHOLDS.critical) return "critical";
  if (quantity < STOCK_THRESHOLDS.red) return "red";
  if (quantity < STOCK_THRESHOLDS.yellow) return "yellow";
  return "green";
}

const FLAG_STYLE: Record<StockFlag, string> = {
  critical: "bg-rose-600/15 text-rose-800 border-rose-400",
  red: "bg-rose-500/10 text-rose-700 border-rose-200",
  yellow: "bg-amber-500/10 text-amber-700 border-amber-200",
  green: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  unknown: "bg-muted text-muted-foreground border-border"
};

const FLAG_ICON: Record<StockFlag, typeof AlertTriangle> = {
  critical: Flame,
  red: ShieldAlert,
  yellow: AlertTriangle,
  green: CheckCircle2,
  unknown: HelpCircle
};

export function StockBadge({
  quantity,
  flag: providedFlag,
  size = "sm",
  showCount = true,
  locale = "en"
}: {
  quantity: number | null | undefined;
  flag?: StockFlag;
  size?: "sm" | "md";
  showCount?: boolean;
  locale?: AppLocale;
}) {
  const flag = providedFlag ?? classifyStock(quantity);
  const Icon = FLAG_ICON[flag];
  const sizing =
    size === "md"
      ? "px-2.5 py-1 text-xs"
      : "px-2 py-0.5 text-[11px]";

  const label =
    flag === "unknown"
      ? locale === "he"
        ? "לא במעקב"
        : "Not tracked"
      : showCount && quantity !== null && quantity !== undefined
        ? formatNumber(quantity)
        : flag === "critical"
          ? locale === "he"
            ? "אזעקה"
            : "Emergency"
          : flag === "red"
            ? locale === "he"
              ? "קריטי"
              : "Critical"
            : flag === "yellow"
              ? locale === "he"
                ? "נמוך"
                : "Low"
              : locale === "he"
                ? "תקין"
                : "Healthy";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums",
        sizing,
        FLAG_STYLE[flag]
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
