import {
  ArrowDownRight,
  ArrowUpRight,
  Crown,
  Flame,
  Lightbulb,
  type LucideIcon,
  Minus,
  Package2,
  ShieldAlert,
  TrendingUp
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import type { KPI } from "@/lib/domain/types";
import { formatKpiValue } from "@/lib/formatters";
import { cn, formatSignedPercent } from "@/lib/utils";

function explainKpi(label: string): { hint: string; tooltip: string } {
  const k = label.toLowerCase();
  if (k.includes("revenue")) {
    return {
      hint: "Total money your store made before refunds and fees.",
      tooltip: "Sum of every order's gross total in the selected window."
    };
  }
  if (k.includes("profit")) {
    return {
      hint: "What you keep after discounts, refunds, and product cost.",
      tooltip:
        "Revenue − discounts − refunds − configured product cost. Approximation until real COGS lands."
    };
  }
  if (k.includes("returning") || k.includes("repeat")) {
    return {
      hint: "Share of orders coming from existing customers — higher = stickier brand.",
      tooltip:
        "Orders where the customer had at least one prior order, divided by total orders."
    };
  }
  if (k.includes("order value") || k.includes("aov")) {
    return {
      hint: "Average dollars per checkout — useful for upsell decisions.",
      tooltip: "Total revenue ÷ total orders in this window."
    };
  }
  if (k.includes("discount")) {
    return {
      hint: "How much of each sale is lost to promo codes — keep it low.",
      tooltip: "Total discount amount ÷ revenue, averaged across days."
    };
  }
  if (k.includes("refund")) {
    return {
      hint: "How much revenue you had to give back — investigate when it climbs.",
      tooltip: "Refunded amount ÷ revenue, averaged across days."
    };
  }
  return { hint: "", tooltip: "" };
}

function defaultIcon(label: string): LucideIcon {
  const k = label.toLowerCase();
  if (k.includes("revenue")) return Crown;
  if (k.includes("profit")) return TrendingUp;
  if (k.includes("returning") || k.includes("repeat")) return Flame;
  if (k.includes("refund")) return ShieldAlert;
  if (k.includes("discount")) return Lightbulb;
  return Package2;
}

export function KpiTile({
  kpi,
  currency,
  hint: hintOverride,
  tooltip: tooltipOverride,
  icon: IconOverride,
  href
}: {
  kpi: KPI;
  currency: string;
  hint?: string;
  tooltip?: string;
  icon?: LucideIcon;
  /** Optional drill-down link. When provided, the tile becomes a clickable link. */
  href?: string;
}) {
  const auto = explainKpi(kpi.label);
  const Icon = IconOverride ?? defaultIcon(kpi.label);
  const hint = hintOverride ?? auto.hint;
  const tooltip = tooltipOverride ?? auto.tooltip;
  const hasChange = typeof kpi.change === "number";
  const change = kpi.change ?? 0;
  const positive = change > 0;
  const negative = change < 0;
  const ChangeIcon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  const inner = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {hasChange ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              positive && "bg-emerald-500/10 text-emerald-700",
              negative && "bg-rose-500/10 text-rose-700",
              !positive && !negative && "bg-muted text-muted-foreground"
            )}
          >
            <ChangeIcon className="h-3 w-3" />
            {formatSignedPercent(change)}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {kpi.label}
        </p>
        {tooltip ? <HelpTip>{tooltip}</HelpTip> : null}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        {formatKpiValue(kpi, currency)}
      </p>
      {hint ? (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{hint}</p>
      ) : null}
      {href ? (
        <p className="mt-2 text-[10px] font-medium text-indigo-500 uppercase tracking-wide">
          פירוט &rarr;
        </p>
      ) : null}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href as Parameters<typeof Link>[0]["href"]} className="group block">
        <Card className="transition-shadow hover:shadow-lg group-hover:border-indigo-200">
          {inner}
        </Card>
      </Link>
    );
  }

  return (
    <Card className="transition-shadow hover:shadow-lg">
      {inner}
    </Card>
  );
}

/**
 * Generic stat tile — for plain values that aren't KPIs (no change %).
 */
/**
 * Visual health indicator for a KPI stat tile.
 * "good" = green, "warn" = red/amber, undefined = no badge.
 */
export type StatTileStatus = "good" | "warn" | undefined;

const STATUS_BADGE: Record<NonNullable<StatTileStatus>, { className: string; label: string }> = {
  good: { className: "bg-emerald-500/10 text-emerald-700", label: "✓" },
  warn: { className: "bg-rose-500/10 text-rose-700", label: "!" }
};

export function StatTile({
  label,
  value,
  hint,
  tooltip,
  icon: Icon = Package2,
  status
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tooltip?: string;
  icon?: LucideIcon;
  /** Optional health status badge. "good" = green, "warn" = red. */
  status?: StatTileStatus;
}) {
  const badge = status ? STATUS_BADGE[status] : null;
  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {badge ? (
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                badge.className
              )}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {tooltip ? <HelpTip>{tooltip}</HelpTip> : null}
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
        {hint ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
