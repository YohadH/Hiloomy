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

/**
 * Bilingual KPI recognition.
 *
 * The tiles used to be matched on English substrings only (`k.includes("revenue")`),
 * which silently broke the moment the app started rendering Hebrew KPI labels
 * ("סך מכירות", "רווח תרומה", ...) — every lookup fell through to the empty
 * default and Hebrew users got no hints or tooltips at all. Each metric now
 * carries its key terms in BOTH languages, and Hebrew terms are stored as stems
 * so plural/definite forms still match ("הנח" → "הנחה"/"הנחות",
 * "החזר" → "החזרים"/"החזרות", "חוזר" → "חוזרים").
 *
 * Order matters: the first metric whose terms hit the label wins, mirroring the
 * original if/else chain.
 */
type KpiMetric = "revenue" | "profit" | "returning" | "aov" | "discount" | "refund";

const KPI_TERMS: readonly { metric: KpiMetric; terms: readonly string[] }[] = [
  { metric: "revenue", terms: ["revenue", "total sales", "gross sales", "מכירות", "הכנסות", "הכנסה"] },
  { metric: "profit", terms: ["profit", "margin", "רווח"] },
  { metric: "returning", terms: ["returning", "repeat", "חוזר"] },
  { metric: "aov", terms: ["order value", "aov", "ערך הזמנה", "ערך עסקה"] },
  { metric: "discount", terms: ["discount", "הנח"] },
  { metric: "refund", terms: ["refund", "החזר"] }
];

function matchKpiMetric(label: string): KpiMetric | null {
  const k = label.toLowerCase();
  for (const { metric, terms } of KPI_TERMS) {
    if (terms.some((term) => k.includes(term))) return metric;
  }
  return null;
}

function explainKpi(label: string, isHe: boolean): { hint: string; tooltip: string } {
  const lang = (he: string, en: string) => (isHe ? he : en);
  switch (matchKpiMetric(label)) {
    case "revenue":
      return {
        hint: lang(
          "סך הכסף שהחנות הכניסה, לפני החזרים ועמלות.",
          "Total money your store made before refunds and fees."
        ),
        tooltip: lang(
          "סכום הברוטו של כל ההזמנות בטווח שנבחר.",
          "Sum of every order's gross total in the selected window."
        )
      };
    case "profit":
      return {
        hint: lang(
          "מה שנשאר לכם אחרי הנחות, החזרים ועלות המוצר.",
          "What you keep after discounts, refunds, and product cost."
        ),
        tooltip: lang(
          "מכירות − הנחות − החזרים − עלות המוצר שהוגדרה. הערכה בלבד עד שייכנסו נתוני עלות אמיתיים.",
          "Revenue − discounts − refunds − configured product cost. Approximation until real COGS lands."
        )
      };
    case "returning":
      return {
        hint: lang(
          "חלק ההזמנות שמגיעות מלקוחות קיימים — גבוה יותר = מותג דביק יותר.",
          "Share of orders coming from existing customers — higher = stickier brand."
        ),
        tooltip: lang(
          "הזמנות שבהן ללקוח הייתה לפחות הזמנה קודמת אחת, חלקי סך ההזמנות.",
          "Orders where the customer had at least one prior order, divided by total orders."
        )
      };
    case "aov":
      return {
        hint: lang(
          "ממוצע הכסף לכל רכישה — שימושי להחלטות אפסייל.",
          "Average dollars per checkout — useful for upsell decisions."
        ),
        tooltip: lang(
          "סך המכירות ÷ סך ההזמנות בטווח הזה.",
          "Total revenue ÷ total orders in this window."
        )
      };
    case "discount":
      return {
        hint: lang(
          "כמה מכל מכירה נשחק על ידי קודי הנחה — כדאי לשמור על זה נמוך.",
          "How much of each sale is lost to promo codes — keep it low."
        ),
        tooltip: lang(
          "סך ההנחות ÷ מכירות, בממוצע על פני הימים.",
          "Total discount amount ÷ revenue, averaged across days."
        )
      };
    case "refund":
      return {
        hint: lang(
          "כמה הכנסה נאלצתם להחזיר — שווה בדיקה כשזה מטפס.",
          "How much revenue you had to give back — investigate when it climbs."
        ),
        tooltip: lang(
          "סכום ההחזרים ÷ מכירות, בממוצע על פני הימים.",
          "Refunded amount ÷ revenue, averaged across days."
        )
      };
    default:
      return { hint: "", tooltip: "" };
  }
}

// Shares the bilingual matcher above, so Hebrew-labelled tiles get their real
// icon instead of every one of them falling back to Package2. AOV keeps the
// Package2 fallback it has always had — the old English chain had no AOV case.
const METRIC_ICON: Record<KpiMetric, LucideIcon> = {
  revenue: Crown,
  profit: TrendingUp,
  returning: Flame,
  aov: Package2,
  discount: Lightbulb,
  refund: ShieldAlert
};

function defaultIcon(label: string): LucideIcon {
  const metric = matchKpiMetric(label);
  return metric ? METRIC_ICON[metric] : Package2;
}

export function KpiTile({
  kpi,
  currency,
  hint: hintOverride,
  tooltip: tooltipOverride,
  icon: IconOverride,
  href,
  locale = "he"
}: {
  kpi: KPI;
  currency: string;
  hint?: string;
  tooltip?: string;
  icon?: LucideIcon;
  /** Optional drill-down link. When provided, the tile becomes a clickable link. */
  href?: string;
  /** Hebrew-first: auto hints/tooltips render in Hebrew unless told otherwise. */
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const auto = explainKpi(kpi.label, isHe);
  const Icon = IconOverride ?? defaultIcon(kpi.label);
  const hint = hintOverride ?? auto.hint;
  const tooltip = tooltipOverride ?? auto.tooltip;
  const hasChange = typeof kpi.change === "number";
  const change = kpi.change ?? 0;
  const positive = change > 0;
  const negative = change < 0;
  const ChangeIcon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  // Hovering the % chip reveals the comparison period's REAL value and the
  // absolute delta — a bare percentage forces mental math (F-009).
  const previousTitle =
    typeof kpi.previousValue === "number"
      ? (() => {
          const prevFmt = formatKpiValue({ ...kpi, value: kpi.previousValue as number }, currency);
          const deltaFmt = formatKpiValue(
            { ...kpi, value: Math.abs(kpi.value - (kpi.previousValue as number)) },
            currency
          );
          const sign = kpi.value - (kpi.previousValue as number) >= 0 ? "+" : "-";
          return isHe
            ? `תקופת ההשוואה: ${prevFmt} · שינוי: ${sign}${deltaFmt}`
            : `Comparison period: ${prevFmt} · change: ${sign}${deltaFmt}`;
        })()
      : undefined;

  const inner = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {hasChange ? (
          <span
            title={previousTitle}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              previousTitle && "cursor-help",
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
        <p className="mt-2 text-[10px] font-medium text-emerald-500 uppercase tracking-wide">
          {isHe ? "פירוט" : "Details"} &rarr;
        </p>
      ) : null}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href as Parameters<typeof Link>[0]["href"]} className="group block">
        <Card className="transition-shadow hover:shadow-lg group-hover:border-emerald-200">
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
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
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
