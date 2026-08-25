// Returns intelligence screen (Insight Engine 3) — /profit/returns.
//
// Best/worst returners over the selected window, per-variant skew
// callouts ("one size keeps coming back"), and an honest coverage note
// when part of the window's refunds predate line-level refund sync.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { RefundBackfillButton } from "@/components/profit/refund-backfill-button";
import { getAppChromeData } from "@/lib/services/analytics-service";
import {
  buildReturnsIntelligence,
  type ProductReturnRow
} from "@/lib/services/returns-intelligence-service";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { getAppLocale } from "@/lib/i18n";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";

export const dynamic = "force-dynamic";

function RateBadge({ rate, avg }: { rate: number; avg: number }) {
  const pct = Math.round(rate * 100);
  const bad = avg > 0 ? rate >= avg * 2 : rate >= 0.12;
  const warm = !bad && avg > 0 && rate > avg;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
        bad ? "bg-red-100 text-red-800" : warm ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
      )}
    >
      {pct}%
    </span>
  );
}

function ReturnsTable({
  rows,
  avg,
  currency,
  isHe,
  emptyText
}: {
  rows: ProductReturnRow[];
  avg: number;
  currency: string;
  isHe: boolean;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-start font-semibold">{isHe ? "מוצר" : "Product"}</th>
            <th className="px-4 py-3 text-end font-semibold">{isHe ? "נמכרו" : "Sold"}</th>
            <th className="px-4 py-3 text-end font-semibold">{isHe ? "הוחזרו" : "Returned"}</th>
            <th className="px-4 py-3 text-end font-semibold">{isHe ? "שיעור החזרה" : "Return rate"}</th>
            <th className="px-4 py-3 text-end font-semibold">{isHe ? "₪ הוחזר" : "Refunded"}</th>
            <th className="px-4 py-3 text-start font-semibold">{isHe ? "וריאנט חריג" : "Variant outlier"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId} className="border-t border-border">
              <td className="max-w-[280px] px-4 py-3">
                <div className="truncate font-medium" title={r.title}>
                  {r.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isHe
                    ? `${(r.vsStoreAvg >= 0 ? "+" : "")}${Math.round(r.vsStoreAvg * 100)} נק׳ מול ממוצע החנות`
                    : `${(r.vsStoreAvg >= 0 ? "+" : "")}${Math.round(r.vsStoreAvg * 100)} pts vs store average`}
                </div>
              </td>
              <td className="px-4 py-3 text-end tabular-nums">{r.unitsSold}</td>
              <td className="px-4 py-3 text-end tabular-nums">{r.unitsReturned}</td>
              <td className="px-4 py-3 text-end">
                <RateBadge rate={r.returnRate} avg={avg} />
              </td>
              <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(r.refundedAmount, currency)}</td>
              <td className="px-4 py-3">
                {r.skewedVariant ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                    {r.skewedVariant.title} · {Math.round(r.skewedVariant.returnRate * 100)}%
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReturnsPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const [chrome, selection] = await Promise.all([
    getAppChromeData(),
    getReportingDateRangeSelection(locale === "he" ? "he" : "en")
  ]);
  const currency = chrome.store.currency;

  // The selection's instants are store-timezone day boundaries — the old
  // bare-UTC re-parse shifted the window 3 hours vs every other page.
  const report = await buildReturnsIntelligence({
    storeId: chrome.store.id,
    start: selection.start,
    end: selection.end
  }).catch(() => null);

  const avg = report?.storeAvgReturnRate ?? 0;
  const coverage = report?.lineRefundCoverage;
  // coverage === 0 means refunded MONEY exists (order level) but NONE of it
  // is attributed to products (line level). The per-product KPIs and
  // rankings are then structurally unknown — rendering them as literal
  // zeros produced the self-contradicting "0 units returned · ₪238
  // refunded" row and a ranking where every product tied at 0 (F-044/F-046).
  const lineDataUnknown = coverage === 0;

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <div className="space-y-3">
          <Link
            href="/profit"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className={`h-4 w-4 ${isHe ? "rotate-180" : ""}`} aria-hidden />
            {isHe ? "חזרה לרווחיות" : "Back to Profit"}
          </Link>
          <PageHead
            eyebrow={isHe ? "רווחיות" : "Profit"}
            title={isHe ? "אילו מוצרים חוזרים — ולמה" : "Which products come back — and why"}
            description={
              isHe
                ? "שיעור החזרה לכל מוצר מול ממוצע החנות, כולל זיהוי וריאנט חריג (מידה שחוזרת שוב ושוב). החזרות מגיעות באיחור — מומלץ חלון של 60 יום ומעלה."
                : "Per-product return rate vs the store average, including variant outliers (the one size that keeps coming back). Returns lag purchases — a 60-day-plus window works best."
            }
          />
        </div>

        {report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {/* The ₪ figure is order-level (always real); the three
                  unit/product KPIs are line-level and UNKNOWN while line
                  attribution is 0% — show "—", never a fake 0 (F-044). */}
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{isHe ? "שיעור החזרה ממוצע" : "Store return rate"}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {lineDataUnknown ? "—" : `${(avg * 100).toFixed(1)}%`}
                </p>
                {lineDataUnknown ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{isHe ? "לא זמין עד סנכרון היסטורי" : "Unavailable until backfill"}</p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{isHe ? "יחידות שהוחזרו" : "Units returned"}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {lineDataUnknown ? "—" : report.totalUnitsReturned}
                  <span className="ms-1 text-sm font-normal text-muted-foreground">/ {report.totalUnitsSold}</span>
                </p>
                {lineDataUnknown ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{isHe ? "לא זמין עד סנכרון היסטורי" : "Unavailable until backfill"}</p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{isHe ? "כסף שהוחזר" : "Money refunded"}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-red-700">
                  {formatCurrency(report.totalRefundedAmount, currency)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {isHe ? "נמדד ברמת ההזמנה — תמיד מלא" : "Order-level — always complete"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{isHe ? "מוצרים עם החזרות" : "Products with returns"}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {lineDataUnknown ? "—" : report.rows.filter((r) => r.unitsReturned > 0).length}
                </p>
                {lineDataUnknown ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{isHe ? "לא זמין עד סנכרון היסטורי" : "Unavailable until backfill"}</p>
                ) : null}
              </div>
            </div>

            {coverage != null && coverage < 0.85 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
                <p className="min-w-0 flex-1">
                  {isHe
                    ? `שימו לב: רק ${Math.round(coverage * 100)}% מסכום ההחזרים בחלון משויך למוצר ספציפי (החזרות ישנות סונכרנו ברמת הזמנה בלבד). הריצו סנכרון היסטורי כדי להשלים את התמונה.`
                    : `Note: only ${Math.round(coverage * 100)}% of the window's refunded money is attributed to specific products (older refunds synced at order level only). Run the historical backfill to complete the picture.`}
                </p>
                <RefundBackfillButton storeId={chrome.store.id} locale={isHe ? "he" : "en"} />
              </div>
            ) : null}

            {lineDataUnknown ? (
              // With 0% line attribution every product ties at zero, so a
              // "best/worst returners" ranking is an arbitrary list dressed
              // up as a finding. One honest message instead (F-046).
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                {isHe
                  ? "דירוג ההחזרות לפי מוצר יופיע אחרי שסנכרון ההחזרות ההיסטורי ישלים את שיוך ההחזרות לפריטים. עד אז אין לנו דרך לדעת אילו מוצרים חזרו — רק כמה כסף הוחזר בסך הכול."
                  : "Per-product return rankings appear once the historical backfill attributes refunds to line items. Until then we cannot know WHICH products came back — only how much money was refunded in total."}
              </div>
            ) : (
              <>
                <section className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    {isHe ? "החוזרים הגרועים" : "Worst returners"}
                  </h2>
                  <div className="rounded-2xl border border-border">
                    <ReturnsTable
                      rows={report.worst}
                      avg={avg}
                      currency={currency}
                      isHe={isHe}
                      emptyText={
                        isHe
                          ? "אין מוצרים עם החזרות בחלון הנבחר (או שאין מספיק נפח). נסו חלון רחב יותר."
                          : "No products with returns in the selected window (or not enough volume). Try a wider window."
                      }
                    />
                  </div>
                </section>

                <section className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    {isHe ? "החוזרים הטובים (הכי פחות החזרות)" : "Best performers (fewest returns)"}
                  </h2>
                  <div className="rounded-2xl border border-border">
                    <ReturnsTable
                      rows={report.best}
                      avg={avg}
                      currency={currency}
                      isHe={isHe}
                      emptyText={isHe ? "אין מספיק נתונים בחלון הנבחר." : "Not enough data in the selected window."}
                    />
                  </div>
                </section>
              </>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-background/70 p-8 text-center text-sm text-muted-foreground">
            {isHe ? "לא ניתן לטעון נתוני החזרות כרגע." : "Returns data is unavailable right now."}
          </div>
        )}
      </div>
    </AppShell>
  );
}
