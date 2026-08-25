// Product costs (COGS) editor — moved from /profit/costs to /products/costs
// per the owner (F-041); the old path 308-redirects here so existing links
// and bookmarks keep working.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { ProductCostsEditor } from "@/components/profit/product-costs-editor";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { listProductCosts } from "@/lib/services/product-cost-service";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ProductCostsPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const [chrome, storeId, selection] = await Promise.all([
    getAppChromeData(),
    resolveActiveStoreId(),
    getReportingDateRangeSelection(locale === "he" ? "he" : "en")
  ]);
  const currency = chrome.store.currency;

  // The units-sold / coverage figures follow the page's own date picker —
  // the selection's Date instants are store-TZ day boundaries, so the window
  // matches what the picker displays (F-039: this page used to show
  // lifetime figures under a 12-day picker).
  const data = storeId
    ? await listProductCosts(storeId, { start: selection.start, end: selection.end }).catch(() => null)
    : null;

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <div className="space-y-3">
          <Link
            href="/profit"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className={`h-4 w-4 ${isHe ? "rotate-180" : ""}`} aria-hidden />
            {isHe ? "לניתוח הרווחיות" : "To profit analytics"}
          </Link>
          <PageHead
            eyebrow={isHe ? "מוצרים" : "Products"}
            title={isHe ? "עלויות מוצרים (COGS / Cost of Goods Sold)" : "Product costs (COGS / Cost of Goods Sold)"}
            description={
              isHe
                ? "הזינו עלות אמיתית ליחידה לכל מוצר כדי שמספרי הרווח יהיו מדויקים ולא הערכה לפי יחס. אפשר גם לייבא קובץ CSV."
                : "Enter the true cost per unit for each product so profit figures are accurate instead of a ratio estimate. You can also import a CSV."
            }
          />
        </div>

        {data ? (
          <ProductCostsEditor
            initialRows={data.rows}
            summary={data.summary}
            currency={currency}
            locale={isHe ? "he" : "en"}
          />
        ) : (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
            {isHe
              ? "אין חנות פעילה או שלא נטענו מוצרים. חברו את Shopify והריצו סנכרון תחילה."
              : "No active store or products loaded. Connect Shopify and run a sync first."}
          </div>
        )}
      </div>
    </AppShell>
  );
}
