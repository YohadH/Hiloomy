// Notification delivery for the auto-generated weekly/monthly digest.
//
// The weekly-report cron persists a WeeklyReport row (see
// weekly-report-service.persistWeeklyReport) and then asks this service to
// deliver a short digest to the store's configured recipients. The digest is
// a lightweight inbox teaser — the full PDF is delivered separately by
// lib/server/weekly-report-mailer.sendWeeklyReportEmail. This service exists
// so non-PDF channels (email teaser today; Slack / WhatsApp later) share one
// recipient-resolution + metric-extraction path.
//
// Channels:
//   • email     → IMPLEMENTED (Resend, via lib/email/email-client)
//   • slack     → stub (not_implemented)
//   • whatsapp  → stub (not_implemented)
//
// Email delivery is intentionally soft-fail: when RESEND_API_KEY is absent the
// underlying wrapper logs a warning and returns false WITHOUT throwing, so the
// cron never crashes just because email is unconfigured.

import { getDb } from "@/lib/server/db";
import { getWeeklyReport, type WeeklyReportBundle } from "@/lib/services/weekly-report-service";
import { sendTransactionalEmail } from "@/lib/email/email-client";

export type NotificationStatus =
  | "sent"
  | "skipped_no_key"
  | "skipped_no_recipients"
  | "skipped_not_found"
  | "send_failed"
  | "not_implemented";

export interface NotificationResult {
  channel: "email" | "slack" | "whatsapp";
  status: NotificationStatus;
  summaryId: string;
  recipients?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Email digest (IMPLEMENTED)
// ─────────────────────────────────────────────────────────────────────────

interface DigestMetrics {
  adSpend: number;
  purchases: number;
  roas: number | null;
  igAttributedSales: number;
  igAttributedOrders: number;
  topCreators: Array<{ name: string; sales: number; orders: number }>;
  restockFlagCount: number;
}

// Pull the headline numbers out of the heavy bundle. Revenue/orders for this
// app live in two places: Meta Ads spend/purchases (paid funnel) and the
// Instagram affiliate attribution (organic/influencer funnel). We surface both
// rather than inventing a single "revenue" the data model doesn't have.
// Exported so the email render can be unit-/smoke-tested without a DB or a
// live Resend key.
export function extractMetrics(bundle: WeeklyReportBundle): DigestMetrics {
  const totals = bundle.metaAds?.totals;
  // ROAS isn't a total on the bundle; take the primary brand's weighted ROAS
  // (brands[0] is the largest spender / the catch-all bucket).
  const primaryBrand = bundle.metaAds?.brands?.[0];

  const igAffiliates = bundle.instagram?.affiliates ?? [];
  const igAttributedSales = igAffiliates.reduce((sum, a) => sum + (a.attributedSales || 0), 0);
  const igAttributedOrders = igAffiliates.reduce((sum, a) => sum + (a.attributedOrders || 0), 0);

  const topCreators = (bundle.instagram?.topCreators ?? [])
    .slice()
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 3)
    .map((c) => ({ name: c.name, sales: c.sales, orders: c.orders }));

  return {
    adSpend: totals?.spend ?? 0,
    purchases: totals?.purchases ?? 0,
    roas: primaryBrand?.kpis?.purchaseRoas ?? null,
    igAttributedSales,
    igAttributedOrders,
    topCreators,
    restockFlagCount: bundle.restockAlerts?.flags?.length ?? 0
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtCurrency(value: number, locale: "he" | "en"): string {
  const n = Math.round(value);
  // ILS shekel sign; Hebrew uses he-IL grouping, English uses en-US.
  return `₪${n.toLocaleString(locale === "he" ? "he-IL" : "en-US")}`;
}

function fmtRoas(roas: number | null): string {
  return roas != null ? `${roas.toFixed(2)}x` : "—";
}

// Bilingual when the org/store locale is Hebrew: every label shows the Hebrew
// term with the English term beneath it. For an English store we render a
// single-language English email. Keep all CSS inline — email clients strip
// <style> blocks.
export function buildDigestEmail(
  bundle: WeeklyReportBundle,
  metrics: DigestMetrics
): { subject: string; html: string } {
  const he = bundle.locale === "he";
  const dir = he ? "rtl" : "ltr";
  const lang = he ? "he" : "en";
  const align = he ? "right" : "left";

  // Bilingual label helper. In Hebrew mode show "<he> / <en>", else just <en>.
  const L = (heText: string, enText: string) => (he ? `${heText} / ${enText}` : enText);

  const storeName = bundle.storeName ? escapeHtml(bundle.storeName) : null;
  const period = `${bundle.periodStart} – ${bundle.periodEnd}`;

  const title = L("הסיכום השבועי שלך", "Your Weekly Summary");
  const subject = `${he ? "סיכום שבועי" : "Weekly Summary"} · ${period}${
    storeName ? " · " + bundle.storeName : ""
  }`;

  const metricCard = (label: string, value: string) => `
    <td style="padding:10px 8px;border:1px solid #e2e8f0;border-radius:6px;text-align:center;background:#ffffff;">
      <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">${label}</div>
      <div style="font-size:18px;font-weight:800;color:#0f172a;">${value}</div>
    </td>`;

  const creatorRows =
    metrics.topCreators.length > 0
      ? metrics.topCreators
          .map(
            (c, i) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">
            <span style="display:inline-block;width:20px;color:#94a3b8;font-weight:700;">${i + 1}.</span>${escapeHtml(c.name)}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;text-align:${he ? "left" : "right"};white-space:nowrap;">
            ${fmtCurrency(c.sales, bundle.locale)} · ${c.orders} ${he ? "הזמנות" : "orders"}
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="2" style="padding:10px;font-size:13px;color:#94a3b8;">${L(
          "אין נתוני יוצרים לשבוע זה",
          "No creator data for this week"
        )}</td></tr>`;

  const restockBanner =
    metrics.restockFlagCount > 0
      ? `
    <tr>
      <td style="padding:0 24px 4px;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 14px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#7f1d1d;">
            🚩 ${metrics.restockFlagCount} ${L("מוצרים חזרו למלאי — דורש פעולה", "product(s) restocked — needs action")}
          </p>
        </div>
      </td>
    </tr>`
      : "";

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<body style="font-family:Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px;margin:0;color:#0f172a;text-align:${align};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <tr>
      <td style="padding:24px;border-bottom:2px solid #0f172a;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">${L(
          "דוח אוטומטי",
          "Automated report"
        )}</p>
        <h1 style="margin:0;font-size:22px;color:#0f172a;">${title}</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#475569;">${escapeHtml(period)}</p>
        ${storeName ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${storeName}</p>` : ""}
      </td>
    </tr>
    ${restockBanner}
    <tr>
      <td style="padding:18px 24px 8px;">
        <p style="margin:0 0 10px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">${L(
          "מדדים מרכזיים",
          "Key metrics"
        )}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="6">
          <tr>
            ${metricCard(L("הוצאת פרסום", "Ad spend"), fmtCurrency(metrics.adSpend, bundle.locale))}
            ${metricCard(L("רכישות", "Orders"), String(metrics.purchases))}
            ${metricCard("ROAS", fmtRoas(metrics.roas))}
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 4px;">
        <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">${L(
          "הכנסה מיוחסת — אינסטגרם",
          "Attributed revenue — Instagram"
        )}</p>
        <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">
          ${fmtCurrency(metrics.igAttributedSales, bundle.locale)}
          <span style="font-size:12px;font-weight:400;color:#64748b;"> · ${metrics.igAttributedOrders} ${
            he ? "הזמנות" : "orders"
          }</span>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 24px 4px;">
        <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">${L(
          "יוצרים מובילים",
          "Top creators"
        )}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1f5f9;border-radius:6px;overflow:hidden;">
          ${creatorRows}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;margin-top:8px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#475569;">${L(
          "הדוח המלא (PDF) נשלח בנפרד וכולל את פירוט הקמפיינים, המודעות והמשפיענים.",
          "The full PDF report is delivered separately and includes the campaign, ad, and influencer breakdown."
        )}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/**
 * Resolve the active email recipients configured for a store.
 * Mirrors the recipient model used by the PDF mailer.
 */
async function resolveRecipients(storeId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.weeklyReportRecipient.findMany({
    where: { storeId, active: true },
    select: { email: true }
  });
  return rows
    .map((r: { email: string }) => (r.email ?? "").trim())
    .filter((e: string) => e.length > 0);
}

/**
 * Build and send the weekly email digest for a persisted WeeklyReport.
 *
 * Never throws — every failure path (no key, no recipients, missing report,
 * Resend rejection) is reported via the returned status so the cron can log
 * it and move on. This is what `sendEmailDigestPlaceholder` used to stub.
 *
 * @param summaryId  WeeklyReport.id of a persisted report bundle.
 */
export async function sendEmailDigest(summaryId: string): Promise<NotificationResult> {
  // Guard: missing Resend config should warn and short-circuit, NOT crash the
  // cron. We check here so we never even bother loading the report when email
  // can't be sent at all.
  if (!(process.env.RESEND_API_KEY ?? "").trim()) {
    console.warn(
      `[notification] Email digest skipped for ${summaryId} — RESEND_API_KEY is not set. ` +
        "Set RESEND_API_KEY (and REPORT_FROM_EMAIL) to enable weekly digest delivery."
    );
    return { channel: "email", status: "skipped_no_key", summaryId };
  }

  let bundle: WeeklyReportBundle | null;
  try {
    bundle = await getWeeklyReport(summaryId);
  } catch (err) {
    console.error(`[notification] Failed to load report ${summaryId}:`, err);
    return { channel: "email", status: "skipped_not_found", summaryId };
  }
  if (!bundle) {
    console.warn(`[notification] Email digest skipped — no WeeklyReport row for ${summaryId}.`);
    return { channel: "email", status: "skipped_not_found", summaryId };
  }

  let recipients: string[] = [];
  try {
    recipients = await resolveRecipients(bundle.storeId);
  } catch (err) {
    console.error(`[notification] Failed to resolve recipients for ${summaryId}:`, err);
  }
  if (recipients.length === 0) {
    console.warn(
      `[notification] Email digest skipped for ${summaryId} — no active recipients for store ${bundle.storeId}.`
    );
    return { channel: "email", status: "skipped_no_recipients", summaryId };
  }

  const metrics = extractMetrics(bundle);
  const { subject, html } = buildDigestEmail(bundle, metrics);

  // sendTransactionalEmail is itself soft-fail (logs + returns false, never
  // throws), so a Resend outage cannot take down the cron.
  let anySent = false;
  for (const to of recipients) {
    const ok = await sendTransactionalEmail({ to, subject, html });
    anySent = anySent || ok;
  }

  if (!anySent) {
    return { channel: "email", status: "send_failed", summaryId, recipients: recipients.length };
  }
  return { channel: "email", status: "sent", summaryId, recipients: recipients.length };
}

// Backwards-compatible alias for the original stub name. New callers should
// use sendEmailDigest. Kept so any existing import path keeps compiling.
export const sendEmailDigestPlaceholder = sendEmailDigest;

// ─────────────────────────────────────────────────────────────────────────
// Slack / WhatsApp — intentionally still stubs (out of scope for SA-HIGH-04).
// ─────────────────────────────────────────────────────────────────────────

export async function sendSlackDigestPlaceholder(summaryId: string): Promise<NotificationResult> {
  // TODO: Add Slack notification delivery integration.
  return { channel: "slack", status: "not_implemented", summaryId };
}

export async function sendWhatsAppDigestPlaceholder(summaryId: string): Promise<NotificationResult> {
  // TODO: Add WhatsApp notification delivery integration.
  return { channel: "whatsapp", status: "not_implemented", summaryId };
}
