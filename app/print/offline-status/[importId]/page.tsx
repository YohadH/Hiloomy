import { notFound } from "next/navigation";
import {
  getOfflineSalesSummary,
  resolveActiveStoreId
} from "@/lib/services/offline-sales-service";
import {
  measureOutcomesForResolvedAlerts,
  getRecentlyResolvedWithOutcomes
} from "@/lib/services/alert-outcome-service";
import { getAppLocale } from "@/lib/i18n";

// Standalone print page for the Offline Status report. Same architecture as
// /print/meta-ads-weekly — Playwright navigates to this URL, captures it to
// PDF. Always Hebrew RTL, B&W aesthetic, prefixed class names so the styles
// don't leak into the rest of the app.
//
// URL: /print/offline-status/<importId>?storeId=...&locale=he

export const dynamic = "force-dynamic";

interface SearchParams {
  storeId?: string;
  locale?: string;
}

const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmtCurrency(value: number, currency: string | null): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₪";
  return `${symbol}${Math.round(value).toLocaleString("en-US")}`;
}

function fmtNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function fmtPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export default async function OfflineStatusPrintPage({
  params,
  searchParams
}: {
  params: Promise<{ importId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { importId } = await params;
  const sp = await searchParams;
  const cookieLocale = await getAppLocale();
  const locale: "he" | "en" = sp.locale === "he" || sp.locale === "en" ? sp.locale : cookieLocale;
  const isHe = locale === "he";
  const direction: "rtl" | "ltr" = isHe ? "rtl" : "ltr";

  const storeId = sp.storeId?.trim() || (await resolveActiveStoreId());
  if (!storeId) return notFound();
  const summary = await getOfflineSalesSummary(importId, storeId, locale);
  if (!summary) return notFound();

  // Closed-loop: measure any pending outcomes, then pull recently-resolved
  // alerts with outcomes so we can show "what happened after you acted"
  // right at the top of the report.
  await measureOutcomesForResolvedAlerts({ storeId }).catch(() => null);
  const closedLoop = await getRecentlyResolvedWithOutcomes({
    storeId,
    lookbackDays: 14,
    limit: 5
  }).catch(() => []);

  const months = isHe ? MONTHS_HE : MONTHS_EN;
  const periodLabel = `${months[summary.import.periodMonth - 1] ?? summary.import.periodMonth} ${summary.import.periodYear}`;
  const currency = summary.import.currency ?? "ILS";

  const t = isHe
    ? {
        eyebrow: "סיכום אופליין + אונליין",
        title: "מצב אופליין",
        subtitle: `${periodLabel} · ${summary.import.fileName}`,
        bottomLine: "השורה התחתונה",
        agentEyebrow: "מה הסוכן רואה בתקופה הזו",
        closedLoopEyebrow: "מה קרה אחרי הפעולה שלכם",
        closedLoopHint: (wins: number, misses: number) =>
          `${wins} פעולות עבדו · ${misses} לא — המקום הכי שווה ללמוד ממנו.`,
        onlineSales: "מכירות אונליין",
        offlineSales: "מכירות אופליין",
        combined: "סה״כ",
        unitsOnline: "יחידות (Shopify)",
        unitsOffline: "יחידות (אופליין)",
        unitsTotal: "סה״כ יחידות",
        shareTotal: "מסך הכל",
        matched: "שורות שהתאמו",
        unmatched: "שורות ללא ברקוד",
        stockRisk: (n: number, days: number) => `${n} SKU בסיכון אזילה (≤ ${days} ימים)`,
        storeHeroes: "מוצרי חנות פיזית — דומיננטיים אופליין",
        storeHeroesHint: "מוצרים שבהם ≥80% מההכנסה הגיעה מהמכירה בחנות הפיזית. לרוב לא יופיעו בדוחות Shopify Analytics.",
        webHeroes: "מוצרי e-commerce — דומיננטיים אונליין",
        webHeroesHint: "מוצרים שבהם ≥80% מההכנסה הגיעה מShopify. רוב המוצרים נמכרים בשני הערוצים ולא יופיעו כאן.",
        topOnline: "10 המוצרים המובילים באונליין (Shopify)",
        topOnlineHint: "תואם לTotal sales by product בShopify Analytics. ללא קשר לחלוקת ערוצים — כל מוצר שנמכר בShopify מופיע כאן לפי הכנסה.",
        breakdown: "פירוט לפי מוצר",
        breakdownHint: "השוואה בין מכירות אונליין ואופליין לכל מוצר. SKU בסיכון אזילה (≤14 ימים) מוצגים בראש.",
        barcode: "ברקוד",
        offlineCol: "אופליין",
        onlineCol: "אונליין",
        mixCol: "תמהיל ערוצים",
        totalCol: "סה״כ",
        daysOfStockCol: "ימי מלאי",
        offRisk: "בסיכון אזילה",
        offUnits: "יחידות",
        product: "מוצר",
        revenue: "הכנסה",
        viaOffline: "אופליין",
        viaOnline: "אונליין",
        unmatchedTitle: "שורות שלא הותאמו",
        unmatchedHint: "שורות מהקובץ שלא נמצאו בShopify לפי ברקוד — עדיין נספרות בסך הכולל.",
        item: "שם פריט",
        quantity: "כמות",
        affiliateTitle: "השפעה לא ישירה של משפיענים",
        affiliateHint: "השוואה בין מכירות אונליין של משפיענים לבין מכירות אופליין באותם מוצרים.",
        affiliateName: "משפיען/ית",
        couponCode: "קוד",
        onlineRevenue: "מכירות אונליין",
        haloRevenue: "השפעה אופליין",
        haloRatio: "יחס הילה",
        footer: "נוצר אוטומטית",
        sourceFile: "קובץ מקור"
      }
    : {
        eyebrow: "OFFLINE + ONLINE SUMMARY",
        title: "Offline Status",
        subtitle: `${periodLabel} · ${summary.import.fileName}`,
        bottomLine: "Bottom line",
        agentEyebrow: "What the agent sees this period",
        closedLoopEyebrow: "What happened after you acted",
        closedLoopHint: (wins: number, misses: number) =>
          `${wins} actions worked · ${misses} didn't — failures are where the learning is.`,
        onlineSales: "Online sales",
        offlineSales: "Offline sales",
        combined: "Combined",
        unitsOnline: "units (Shopify)",
        unitsOffline: "units (offline)",
        unitsTotal: "total units",
        shareTotal: "of total",
        matched: "rows matched",
        unmatched: "rows without barcode match",
        stockRisk: (n: number, days: number) => `${n} SKUs at stock-out risk (≤ ${days} days)`,
        storeHeroes: "Brick-and-mortar dominant — ≥80% offline",
        storeHeroesHint: "Products where ≥80% of revenue came from in-store sales. These won't appear in Shopify Analytics.",
        webHeroes: "E-commerce dominant — ≥80% online",
        webHeroesHint: "Products where ≥80% of revenue came from Shopify. Most products sell on both channels and won't qualify.",
        topOnline: "Top 10 products online (matches Shopify)",
        topOnlineHint: "Mirrors Shopify Analytics' 'Total sales by product' chart. Every product with Shopify sales appears here ranked by revenue — channel-mix independent.",
        breakdown: "Per-product breakdown",
        breakdownHint: "Online vs offline comparison per product. Stock-risk SKUs (≤14 days) are pinned to the top.",
        barcode: "Barcode",
        offlineCol: "Offline",
        onlineCol: "Online",
        mixCol: "Channel mix",
        totalCol: "Total",
        daysOfStockCol: "Days of stock",
        offRisk: "stock risk",
        offUnits: "units",
        product: "Product",
        revenue: "Revenue",
        viaOffline: "via offline",
        viaOnline: "via online",
        unmatchedTitle: "Unmatched rows",
        unmatchedHint: "Rows that didn't match any Shopify product by barcode — still counted in totals.",
        item: "Item",
        quantity: "Qty",
        affiliateTitle: "Affiliate halo effect",
        affiliateHint: "Affiliate-driven online sales vs offline sales on the same products.",
        affiliateName: "Affiliate",
        couponCode: "Code",
        onlineRevenue: "Online sales",
        haloRevenue: "Offline halo",
        haloRatio: "Halo ratio",
        footer: "Auto-generated",
        sourceFile: "Source file"
      };

  // Scoped CSS — prefixed `ofp-` to avoid leaking into the rest of the app.
  // Same B&W aesthetic as the Meta Ads weekly report.
  const css = `
    .ofp-root {
      direction: ${direction};
      min-height: 100vh;
      padding: 28px 28px 40px;
      background: #ffffff;
      color: #0f172a;
      font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, "Noto Sans Hebrew", "Heebo", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .ofp-report { max-width: 760px; margin: 0 auto; }
    .ofp-hero { padding-bottom: 18px; border-bottom: 2px solid #0f172a; margin-bottom: 18px; }
    .ofp-eyebrow { margin: 0 0 6px; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #64748b; }
    .ofp-title { margin: 0 0 4px; font-size: 28px; font-weight: 800; }
    .ofp-subtitle { margin: 0; font-size: 12px; color: #475569; }
    .ofp-section { margin-top: 22px; }
    .ofp-section-title { margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid #0f172a; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; }
    .ofp-block-title { margin: 14px 0 4px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; }
    .ofp-kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .ofp-kpi { padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 4px; }
    .ofp-kpi-label { margin: 0 0 4px; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
    .ofp-kpi-value { margin: 0; font-size: 20px; font-weight: 800; }
    .ofp-kpi-hint { margin: 4px 0 0; font-size: 10px; color: #475569; }
    .ofp-callout { padding: 14px 16px; border: 1px solid #0f172a; border-radius: 4px; background: #f8fafc; margin-top: 10px; }
    .ofp-callout p { margin: 0; font-size: 13px; line-height: 1.6; }
    .ofp-callout-eyebrow { margin: 0 0 6px; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b; }
    .ofp-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    .ofp-table thead th {
      text-align: ${isHe ? "right" : "left"};
      font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #475569;
      padding: 6px 8px; border-bottom: 2px solid #0f172a; background: #f1f5f9; font-weight: 700;
    }
    .ofp-table tbody td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .ofp-table tbody tr:last-child td { border-bottom: 1px solid #0f172a; }
    .ofp-table tbody tr:nth-child(even) td { background: #fafafa; }
    .ofp-matchline { margin-top: 14px; padding: 10px 12px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 4px; font-size: 11px; color: #713f12; }
    .ofp-footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #64748b; }
    @media print {
      @page { size: A4; margin: 14mm 12mm; }
      body { background: #ffffff !important; }
      .ofp-root { padding: 0; }
    }
  `;

  const totals = summary.totals;
  const onlinePct = totals.totalSales > 0 ? (totals.onlineSales / totals.totalSales) * 100 : 0;
  const offlinePct = totals.totalSales > 0 ? (totals.offlineSales / totals.totalSales) * 100 : 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="ofp-root">
        <div className="ofp-report">
          <header className="ofp-hero">
            <p className="ofp-eyebrow">{t.eyebrow}</p>
            <h1 className="ofp-title">{t.title}</h1>
            <p className="ofp-subtitle">{t.subtitle}</p>
          </header>

          {/* Agent narrative — the same insight banner that's on the UI.
              The body comes back as a single string with multiple sentences
              joined by spaces. We split on a sentence boundary so the PDF
              shows each insight as its own bullet — much easier to scan
              than a wall of text. */}
          {summary.narrative ? (
            <div className="ofp-callout">
              <p className="ofp-callout-eyebrow">{t.agentEyebrow}</p>
              <p style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>{summary.narrative.headline}</p>
              {(() => {
                // Split on period-followed-by-space (Hebrew or English),
                // keep the period attached. Drop empty fragments.
                const sentences = summary.narrative.body
                  .split(/(?<=[.!?])\s+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (sentences.length <= 1) {
                  return (
                    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#475569" }}>
                      {summary.narrative.body}
                    </p>
                  );
                }
                return (
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none"
                    }}
                  >
                    {sentences.map((s, i) => (
                      <li
                        key={`narr-${i}`}
                        style={{
                          position: "relative",
                          paddingInlineStart: 16,
                          marginTop: i === 0 ? 0 : 6,
                          fontSize: 12,
                          lineHeight: 1.6,
                          color: "#0f172a"
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            insetInlineStart: 0,
                            top: 2,
                            color: "#475569",
                            fontWeight: 700
                          }}
                        >
                          •
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          ) : null}

          {/* Closed-loop block — "you acted last week, here's what happened." */}
          {closedLoop.length > 0 ? (
            <div
              className="ofp-callout"
              style={{
                background: "#f8fafc",
                borderInlineStart: "3px solid #475569",
                marginTop: 12
              }}
            >
              <p className="ofp-callout-eyebrow">{t.closedLoopEyebrow}</p>
              <p style={{ marginBottom: 8, fontSize: 11, color: "#64748b" }}>
                {t.closedLoopHint(
                  closedLoop.filter((c) => c.outcome.verdict === "win").length,
                  closedLoop.filter((c) => c.outcome.verdict === "miss").length
                )}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {closedLoop.map((c, i) => {
                  const v = c.outcome.verdict;
                  const marker = v === "win" ? "✅" : v === "miss" ? "❌" : "•";
                  const color = v === "win" ? "#047857" : v === "miss" ? "#b91c1c" : "#475569";
                  return (
                    <li
                      key={c.id}
                      style={{
                        position: "relative",
                        paddingInlineStart: 18,
                        marginTop: i === 0 ? 0 : 6,
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: "#0f172a"
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          insetInlineStart: 0,
                          top: 0,
                          color,
                          fontWeight: 700
                        }}
                      >
                        {marker}
                      </span>
                      {isHe ? c.outcome.summary.he : c.outcome.summary.en}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Bottom line — 3 KPI tiles matching the UI */}
          <section className="ofp-section">
            <h2 className="ofp-section-title">{t.bottomLine}</h2>
            <div className="ofp-kpi-row">
              <div className="ofp-kpi">
                <p className="ofp-kpi-label">{t.onlineSales}</p>
                <p className="ofp-kpi-value">{fmtCurrency(totals.onlineSales, currency)}</p>
                <p className="ofp-kpi-hint">
                  {fmtNumber(totals.onlineQuantity)} {t.unitsOnline} · {fmtPct(onlinePct)} {t.shareTotal}
                </p>
              </div>
              <div className="ofp-kpi">
                <p className="ofp-kpi-label">{t.offlineSales}</p>
                <p className="ofp-kpi-value">{fmtCurrency(totals.offlineSales, currency)}</p>
                <p className="ofp-kpi-hint">
                  {fmtNumber(totals.offlineQuantity)} {t.unitsOffline} · {fmtPct(offlinePct)} {t.shareTotal}
                </p>
              </div>
              <div className="ofp-kpi">
                <p className="ofp-kpi-label">{t.combined}</p>
                <p className="ofp-kpi-value">{fmtCurrency(totals.totalSales, currency)}</p>
                <p className="ofp-kpi-hint">
                  {fmtNumber(totals.totalQuantity)} {t.unitsTotal}
                </p>
              </div>
            </div>

            {/* Match status line */}
            <div className="ofp-matchline">
              {fmtNumber(summary.matchedRows)} {t.matched}
              {summary.unmatchedRows > 0 ? ` · ${fmtNumber(summary.unmatchedRows)} ${t.unmatched}` : ""}
              {summary.stockRisk.count > 0 ? ` · ${t.stockRisk(summary.stockRisk.count, summary.stockRisk.threshold)}` : ""}
            </div>
          </section>

          {/* Per-product breakdown — full comparison, stock-risk pinned to top */}
          {summary.rows.length > 0 ? (
            <section className="ofp-section">
              <h2 className="ofp-section-title">{t.breakdown}</h2>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b" }}>{t.breakdownHint}</p>
              <table className="ofp-table">
                <thead>
                  <tr>
                    <th>{t.product}</th>
                    <th>{t.barcode}</th>
                    <th>{t.offlineCol}</th>
                    <th>{t.onlineCol}</th>
                    <th>{t.mixCol}</th>
                    <th>{t.totalCol}</th>
                    <th>{t.daysOfStockCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...summary.rows]
                    // Stock-risk SKUs pinned to top, then sort by total sales desc.
                    .sort((a, b) => {
                      if (a.stockRisk !== b.stockRisk) return a.stockRisk ? -1 : 1;
                      return b.totalSales - a.totalSales;
                    })
                    .slice(0, 80)
                    .map((row, i) => {
                      const onlinePct = row.totalSales > 0 ? (row.onlineSales / row.totalSales) * 100 : 0;
                      const offlinePct = row.totalSales > 0 ? (row.offlineSales / row.totalSales) * 100 : 0;
                      // Render channel mix as a tiny two-segment bar inline.
                      return (
                        <tr key={`row-${i}`}>
                          <td style={{ maxWidth: 200, wordBreak: "break-word" }}>
                            {row.matchedProductTitle ?? row.itemName}
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: 10 }}>{row.barcode ?? "—"}</td>
                          <td>
                            {fmtCurrency(row.offlineSales, currency)}
                            <div style={{ fontSize: 10, color: "#64748b" }}>
                              {fmtNumber(row.offlineQuantity)} {t.offUnits}
                            </div>
                          </td>
                          <td>
                            {fmtCurrency(row.onlineSales, currency)}
                            <div style={{ fontSize: 10, color: "#64748b" }}>
                              {fmtNumber(row.onlineQuantity)} {t.offUnits}
                            </div>
                          </td>
                          <td style={{ minWidth: 110 }}>
                            {row.totalSales > 0 ? (
                              <>
                                <div
                                  style={{
                                    display: "flex",
                                    height: 6,
                                    borderRadius: 3,
                                    overflow: "hidden",
                                    border: "1px solid #cbd5e1"
                                  }}
                                >
                                  <div style={{ width: `${onlinePct}%`, background: "#475569" }} />
                                  <div style={{ width: `${offlinePct}%`, background: "#94a3b8" }} />
                                </div>
                                <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                                  {fmtPct(onlinePct)} {t.viaOnline} · {fmtPct(offlinePct)} {t.viaOffline}
                                </div>
                              </>
                            ) : "—"}
                          </td>
                          <td style={{ fontWeight: 700 }}>{fmtCurrency(row.totalSales, currency)}</td>
                          <td>
                            {row.daysOfStock != null ? (
                              <>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: row.stockRisk ? "#991b1b" : row.daysOfStock < 30 ? "#92400e" : "#047857"
                                  }}
                                >
                                  {row.daysOfStock} {isHe ? "ימים" : "days"}
                                </span>
                                {row.stockRisk ? (
                                  <div style={{ fontSize: 9, color: "#991b1b", fontWeight: 700 }}>● {t.offRisk}</div>
                                ) : null}
                                {row.inventoryQuantity != null ? (
                                  <div style={{ fontSize: 9, color: "#64748b" }}>
                                    {fmtNumber(row.inventoryQuantity)} {t.offUnits} · {row.dailyBurn.toFixed(1)}/{isHe ? "יום" : "day"}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {summary.rows.length > 80 ? (
                <p style={{ marginTop: 6, fontSize: 10, color: "#64748b" }}>
                  {isHe
                    ? `מוצגים 80 המוצרים המובילים מתוך ${summary.rows.length}.`
                    : `Showing top 80 of ${summary.rows.length} products.`}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Store heroes */}
          {summary.storeHeroes.length > 0 ? (
            <section className="ofp-section">
              <h2 className="ofp-section-title">{t.storeHeroes}</h2>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b" }}>{t.storeHeroesHint}</p>
              <table className="ofp-table">
                <thead>
                  <tr>
                    <th>{t.product}</th>
                    <th>{t.revenue}</th>
                    <th>{t.shareTotal}</th>
                    <th>{t.quantity}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.storeHeroes.map((row, i) => (
                    <tr key={`store-${i}`}>
                      <td>{row.matchedProductTitle ?? row.itemName}</td>
                      <td>{fmtCurrency(row.totalSales, currency)}</td>
                      <td>{fmtPct(row.offlinePct)} {t.viaOffline}</td>
                      <td>{fmtNumber(row.offlineQuantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* Top 10 products by online revenue — matches Shopify Analytics
              "Total sales by product" chart, regardless of channel mix.
              This is the sanity-check section the founder uses to verify
              our numbers reconcile with Shopify directly. */}
          {summary.topOnlineProducts.length > 0 ? (
            <section className="ofp-section">
              <h2 className="ofp-section-title">{t.topOnline}</h2>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b" }}>{t.topOnlineHint}</p>
              <table className="ofp-table">
                <thead>
                  <tr>
                    <th>{t.product}</th>
                    <th>{t.revenue}</th>
                    <th>{t.quantity}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topOnlineProducts.map((row, i) => (
                    <tr key={`top-online-${i}`}>
                      <td>{row.productTitle}</td>
                      <td>{fmtCurrency(row.revenue, currency)}</td>
                      <td>{fmtNumber(row.units)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* Web heroes — channel-mix dominant only */}
          {summary.webHeroes.length > 0 ? (
            <section className="ofp-section">
              <h2 className="ofp-section-title">{t.webHeroes}</h2>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b" }}>{t.webHeroesHint}</p>
              <table className="ofp-table">
                <thead>
                  <tr>
                    <th>{t.product}</th>
                    <th>{t.revenue}</th>
                    <th>{t.shareTotal}</th>
                    <th>{t.quantity}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.webHeroes.map((row, i) => (
                    <tr key={`web-${i}`}>
                      <td>{row.matchedProductTitle ?? row.itemName}</td>
                      <td>{fmtCurrency(row.totalSales, currency)}</td>
                      <td>{fmtPct(row.onlinePct)} {t.viaOnline}</td>
                      <td>{fmtNumber(row.onlineQuantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* Unmatched rows */}
          {summary.unmatched.length > 0 ? (
            <section className="ofp-section">
              <h2 className="ofp-section-title">{t.unmatchedTitle}</h2>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b" }}>{t.unmatchedHint}</p>
              <table className="ofp-table">
                <thead>
                  <tr>
                    <th>{t.item}</th>
                    <th>{t.quantity}</th>
                    <th>{t.revenue}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.unmatched.slice(0, 50).map((row, i) => (
                    <tr key={`unmatched-${i}`}>
                      <td>{row.itemName}</td>
                      <td>{fmtNumber(row.quantity)}</td>
                      <td>{fmtCurrency(row.sales, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* Affiliate halo */}
          {summary.affiliateHalo && summary.affiliateHalo.affiliates.length > 0 ? (
            <section className="ofp-section">
              <h2 className="ofp-section-title">{t.affiliateTitle}</h2>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b" }}>{t.affiliateHint}</p>
              <table className="ofp-table">
                <thead>
                  <tr>
                    <th>{t.affiliateName}</th>
                    <th>{t.couponCode}</th>
                    <th>{t.onlineRevenue}</th>
                    <th>{t.haloRevenue}</th>
                    <th>{t.haloRatio}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.affiliateHalo.affiliates.slice(0, 12).map((a, i) => (
                    <tr key={`aff-${i}`}>
                      <td>{a.affiliateName}</td>
                      <td>{a.couponCodes.join(", ") || "—"}</td>
                      <td>{fmtCurrency(a.onlineSales, currency)}</td>
                      <td>{fmtCurrency(a.haloOfflineSales, currency)}</td>
                      <td>{a.haloRatio.toFixed(2)}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <p className="ofp-footer">
            {t.footer} · {t.sourceFile}: {summary.import.fileName}
          </p>
        </div>
      </div>
    </>
  );
}
