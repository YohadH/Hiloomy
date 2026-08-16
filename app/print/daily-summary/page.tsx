// Print-only daily digest. Server-rendered, no client JS.
// Captured to PDF by Playwright from the daily-report cron.
//
// URL: /print/daily-summary?storeId=...&date=YYYY-MM-DD
//
// Layout (Hebrew/RTL, A4):
//   • Header — title, date, freshness stamp
//   • KPI tiles — revenue, orders, AOV, refunds, new/returning
//   • Delta row — vs day before (▲/▼)
//   • Top products table
//   • Meta Ads section (spend, attributed purchases, blended ROAS)
//   • Footer

export const dynamic = "force-dynamic";

import { buildDailyReport, getDailyReportDates, type DailyReportBundle } from "@/lib/services/daily-report-service";
import { getDb } from "@/lib/server/db";

interface SearchParams {
  storeId?: string;
  date?: string;
}

function fmtILS(v: number): string {
  return `₪${Math.round(v).toLocaleString("en-US")}`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jerusalem"
  }).format(d);
}

function delta(today: number, prior: number): { sign: "up" | "down" | "flat"; pct: string } {
  if (prior === 0) return { sign: "flat", pct: "—" };
  const d = (today - prior) / prior;
  const sign = d > 0.001 ? "up" : d < -0.001 ? "down" : "flat";
  return { sign, pct: `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%` };
}

export default async function DailySummaryPrintPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Resolve storeId — URL param is required for headless rendering.
  let storeId = params.storeId?.trim() ?? null;
  if (!storeId) {
    const db = getDb();
    const store = await db.store.findFirst({ select: { id: true } }).catch(() => null);
    storeId = store?.id ?? null;
  }

  let bundle: DailyReportBundle | null = null;
  let error: string | null = null;

  if (!storeId) {
    error = "לא נמצאה חנות פעילה";
  } else {
    // If a specific date is passed, use it; otherwise use "yesterday".
    const now = params.date
      ? new Date(`${params.date}T12:00:00Z`) // noon so yesterday calc is stable
      : new Date();
    bundle = await buildDailyReport(storeId, now).catch((e) => {
      error = e instanceof Error ? e.message : "שגיאה בטעינת הנתונים";
      return null;
    });
  }

  const dates = getDailyReportDates(
    params.date ? new Date(`${params.date}T12:00:00Z`) : new Date()
  );
  const reportDateLabel = fmtDate(dates.reportDateStr);

  const css = `
    .dr-root {
      direction: rtl;
      min-height: 100vh;
      padding: 24px 28px 40px;
      background: #ffffff;
      color: #0f172a;
      font-family: "Segoe UI", "Noto Sans Hebrew", "Heebo", "Helvetica Neue", Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .dr-report { max-width: 700px; margin: 0 auto; }
    .dr-hero {
      padding: 0 0 16px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 18px;
    }
    .dr-eyebrow {
      margin: 0 0 4px;
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #64748b;
    }
    .dr-title { margin: 0 0 4px; font-size: 26px; font-weight: 800; color: #0f172a; }
    .dr-date-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
    .dr-date-badge {
      display: inline-block;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .dr-freshness {
      font-size: 10px;
      color: #64748b;
    }
    .dr-freshness-stale { color: #b45309; font-weight: 600; }
    .dr-section { margin-top: 20px; }
    .dr-section-title {
      margin: 0 0 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #0f172a;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0f172a;
      font-weight: 700;
    }
    .dr-kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .dr-kpi {
      padding: 9px 11px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .dr-kpi-label {
      margin: 0 0 2px;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #64748b;
    }
    .dr-kpi-value { margin: 0; font-size: 17px; font-weight: 800; color: #0f172a; }
    .dr-kpi-delta { margin: 3px 0 0; font-size: 10px; }
    .dr-delta-up   { color: #15803d; }
    .dr-delta-down { color: #b91c1c; }
    .dr-delta-flat { color: #64748b; }
    .dr-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 6px;
    }
    .dr-table thead th {
      text-align: right;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #475569;
      padding: 5px 8px;
      border-bottom: 2px solid #0f172a;
      background: #f1f5f9;
      font-weight: 700;
    }
    .dr-table tbody td {
      padding: 5px 8px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .dr-table tbody tr:last-child td { border-bottom: 1px solid #0f172a; }
    .dr-table tbody tr:nth-child(even) td { background: #fafafa; }
    .dr-meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .dr-warning {
      margin-top: 12px;
      padding: 10px 12px;
      background: #fef9c3;
      border: 1px solid #ca8a04;
      border-radius: 4px;
      color: #713f12;
      font-size: 11px;
      line-height: 1.5;
    }
    .dr-error {
      padding: 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
      color: #7f1d1d;
      font-size: 12px;
    }
    .dr-footer {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 9px;
      color: #64748b;
    }
    @media print {
      @page { size: A4; margin: 12mm 10mm; }
      body { background: #ffffff !important; }
      .dr-root { padding: 0; min-height: 0; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="dr-root">
        <div className="dr-report">
          <header className="dr-hero">
            <p className="dr-eyebrow">דוח יומי — Hiloomy</p>
            <h1 className="dr-title">סיכום אתמול</h1>
            <div className="dr-date-row">
              <span className="dr-date-badge">{reportDateLabel}</span>
              {bundle?.freshness && (
                <span className={bundle.freshness.stale ? "dr-freshness dr-freshness-stale" : "dr-freshness"}>
                  {bundle.freshness.stale
                    ? "⚠ נתונים ישנים — סנכרון לא רץ מאז אתמול"
                    : `עודכן: ${bundle.freshness.syncedAt ? new Date(bundle.freshness.syncedAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}`}
                </span>
              )}
            </div>
          </header>

          {error ? (
            <div className="dr-error">{error}</div>
          ) : bundle ? (
            <>
              {/* KPI TILES */}
              <section className="dr-section">
                <h2 className="dr-section-title">ביצועי מכירות</h2>
                <div className="dr-kpi-grid">
                  <KpiTile
                    label="הכנסות נטו"
                    value={fmtILS(bundle.today.revenue)}
                    d={delta(bundle.today.revenue, bundle.prior.revenue)}
                  />
                  <KpiTile
                    label="הזמנות"
                    value={String(bundle.today.orders)}
                    d={delta(bundle.today.orders, bundle.prior.orders)}
                  />
                  <KpiTile
                    label="AOV (ממוצע להזמנה)"
                    value={fmtILS(bundle.today.aov)}
                    d={delta(bundle.today.aov, bundle.prior.aov)}
                  />
                  <KpiTile
                    label="החזרות"
                    value={fmtILS(bundle.today.refundAmount)}
                    d={delta(bundle.today.refundAmount, bundle.prior.refundAmount)}
                    invertColor
                  />
                </div>
                <div className="dr-kpi-grid" style={{ marginTop: 8 }}>
                  <KpiTile
                    label="שיעור החזרות"
                    value={fmtPct(bundle.today.returnRate)}
                    d={delta(bundle.today.returnRate, bundle.prior.returnRate)}
                    invertColor
                  />
                  <KpiTile
                    label="לקוחות חדשים"
                    value={String(bundle.today.newCustomers)}
                    d={delta(bundle.today.newCustomers, bundle.prior.newCustomers)}
                  />
                  <KpiTile
                    label="לקוחות חוזרים"
                    value={String(bundle.today.returningCustomers)}
                    d={delta(bundle.today.returningCustomers, bundle.prior.returningCustomers)}
                  />
                  <KpiTile
                    label="הזמנות אורח"
                    value={String(bundle.today.guestOrders)}
                    d={delta(bundle.today.guestOrders, bundle.prior.guestOrders)}
                  />
                </div>
              </section>

              {/* TOP PRODUCTS */}
              {bundle.topProducts.length > 0 ? (
                <section className="dr-section">
                  <h2 className="dr-section-title">מוצרים מובילים (יחידות)</h2>
                  <table className="dr-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>שם מוצר</th>
                        <th>יחידות</th>
                        <th>הכנסה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.topProducts.map((p, i) => (
                        <tr key={i}>
                          <td style={{ color: "#64748b", width: 24 }}>{i + 1}</td>
                          <td>{p.title}</td>
                          <td style={{ fontWeight: 700 }}>{p.units}</td>
                          <td>{fmtILS(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : (
                <section className="dr-section">
                  <h2 className="dr-section-title">מוצרים מובילים</h2>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>אין הזמנות לתאריך זה.</p>
                </section>
              )}

              {/* META ADS */}
              {bundle.meta ? (
                <section className="dr-section">
                  <h2 className="dr-section-title">Meta Ads</h2>
                  <div className="dr-meta-grid">
                    <KpiTile label="הוצאה" value={fmtILS(bundle.meta.spend)} />
                    <KpiTile
                      label="ROAS משוקלל"
                      value={
                        bundle.meta.blendedRoas != null
                          ? `${bundle.meta.blendedRoas.toFixed(2)}x`
                          : "—"
                      }
                    />
                    <KpiTile
                      label="רכישות מיוחסות (Meta)"
                      value={String(bundle.meta.attributedPurchases)}
                    />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 10, color: "#64748b" }}>
                    ROAS משוקלל = הכנסות Shopify ÷ הוצאה Meta (blended, לא Meta-attributed).
                  </p>
                </section>
              ) : (
                <section className="dr-section">
                  <h2 className="dr-section-title">Meta Ads</h2>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>אין נתוני Meta Ads לתאריך זה.</p>
                </section>
              )}

              {bundle.freshness.stale && (
                <div className="dr-warning">
                  ⚠ הסנכרון האחרון הצליח לפני אתמול. הנתונים עלולים להיות חלקיים.{" "}
                  {bundle.freshness.syncedAt
                    ? `סנכרון אחרון: ${new Date(bundle.freshness.syncedAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`
                    : "לא בוצע סנכרון כלל."}
                </div>
              )}
            </>
          ) : null}

          <p className="dr-footer">
            נוצר אוטומטית · Hiloomy
            {bundle ? ` · ${reportDateLabel}` : ""}
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Component helpers ───────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  d,
  invertColor = false
}: {
  label: string;
  value: string;
  d?: { sign: "up" | "down" | "flat"; pct: string };
  invertColor?: boolean;
}) {
  let deltaClass = "dr-delta-flat";
  if (d) {
    if (d.sign === "up") deltaClass = invertColor ? "dr-delta-down" : "dr-delta-up";
    else if (d.sign === "down") deltaClass = invertColor ? "dr-delta-up" : "dr-delta-down";
  }

  return (
    <div className="dr-kpi">
      <p className="dr-kpi-label">{label}</p>
      <p className="dr-kpi-value">{value}</p>
      {d && d.sign !== "flat" && (
        <p className={`dr-kpi-delta ${deltaClass}`}>
          {d.sign === "up" ? "▲" : "▼"} {d.pct} לעומת שלשום
        </p>
      )}
    </div>
  );
}
