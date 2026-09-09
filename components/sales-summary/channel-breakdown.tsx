import { SALES_CHANNEL_LABEL } from "@/lib/domain/sales-channel";
import type { SalesByChannel, ProductChannelRow } from "@/lib/services/sales-channel-service";
import { StyledTable, MobileRowFacts } from "@/components/dashboard-v2/styled-table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

// "Where the orders came from" for the selected window — online store, POS,
// manual — straight from Shopify's own source stamp on each order. Shown at
// the top of the online/offline page so the manager knows which sales are
// already in Hiloomy before uploading anything.
export function ChannelBreakdown({ data, currency, locale, rangeLabel }: { data: SalesByChannel; currency: string; locale: Locale; rangeLabel: string }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const shown = data.channels.filter((c) => c.orders > 0);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{t("מאיפה הגיעו ההזמנות", "Where the orders came from")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            `${rangeLabel} · לפי חותמת המקור של Shopify על כל הזמנה. מכירות מקופת Shopify כבר נמצאות כאן — אין צורך להעלות אותן.`,
            `${rangeLabel} · from Shopify's source stamp on every order. Shopify POS sales are already here — no upload needed for them.`
          )}
        </p>
      </div>
      {data.totalOrders === 0 ? (
        <p className="border-y border-border py-3 text-sm text-muted-foreground">{t("אין הזמנות בחלון הזה.", "No orders in this window.")}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
          {shown.map((c) => (
            <div key={c.channel} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{SALES_CHANNEL_LABEL[c.channel][locale]}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{formatCurrency(c.netSales, currency)}</dd>
              <dd className="text-xs text-muted-foreground">
                {Math.round(c.share * 100)}% · {formatNumber(c.orders)} {t("הזמנות", "orders")}
                {c.channel === "online" && c.sources.length > 1 ? ` · ${c.sources.map((s) => s.sourceName).join(", ")}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {!data.hasPos && data.totalOrders > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "לא נמצאו הזמנות קופה (POS) בחלון הזה. אם יש לכם חנות פיזית שלא עוברת דרך Shopify POS, המכירות שלה נכנסות רק דרך העלאת הקובץ למטה.",
            "No POS orders in this window. If you run a physical store that does not go through Shopify POS, its sales enter only through the upload below."
          )}
        </p>
      ) : null}
    </section>
  );
}

export function PosVsOnlineTable({ rows, currency, locale }: { rows: ProductChannelRow[]; currency: string; locale: Locale }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{t("קופה מול אונליין, לפי מוצר", "POS vs online, by product")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("מה נמכר בחנות ומה נמכר באתר, מאותן הזמנות Shopify. ממוין לפי סך המכירות.", "What sells in the shop versus on the site, from the same Shopify orders. Sorted by total sales.")}
        </p>
      </div>
      <StyledTable
        locale={locale}
        rows={rows}
        rowKey={(r) => r.productId ?? r.productTitle}
        emptyMessage={t("אין מוצרים עם מכירות בחלון הזה.", "No products with sales in this window.")}
        mobileRender={(r) => (
          <div>
            <p className="text-sm font-semibold">{r.productTitle}</p>
            <MobileRowFacts
              facts={[
                { label: t("אונליין", "Online"), value: `${formatCurrency(r.onlineSales, currency)} · ${formatNumber(r.onlineUnits)}` },
                { label: t("קופה", "POS"), value: `${formatCurrency(r.posSales, currency)} · ${formatNumber(r.posUnits)}` },
                { label: t("חלק הקופה", "POS share"), value: `${Math.round(r.posShare * 100)}%` }
              ]}
            />
          </div>
        )}
        columns={[
          { key: "productTitle", label: t("מוצר", "Product") },
          { key: "onlineUnits", label: t("יח׳ אונליין", "Online units"), align: "end", render: (r) => formatNumber(r.onlineUnits) },
          { key: "onlineSales", label: t("מכירות אונליין", "Online sales"), align: "end", render: (r) => formatCurrency(r.onlineSales, currency) },
          { key: "posUnits", label: t("יח׳ קופה", "POS units"), align: "end", render: (r) => formatNumber(r.posUnits) },
          { key: "posSales", label: t("מכירות קופה", "POS sales"), align: "end", render: (r) => formatCurrency(r.posSales, currency) },
          {
            key: "posShare",
            label: t("חלק הקופה", "POS share"),
            align: "end",
            render: (r) => <span className={cn(r.posShare >= 0.5 ? "font-semibold" : "")}>{Math.round(r.posShare * 100)}%</span>
          }
        ]}
      />
    </section>
  );
}
