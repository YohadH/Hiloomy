// Resend-backed email sender for the weekly + monthly reports.
//
// Each call sends ONE email with the PDF attached. The caller already
// generated the PDF buffer (via renderPdfFromUrl) and the data bundle (for
// composing a personalised subject line). We just hand off to Resend.
//
// Why Resend: generous free tier, native attachment support, no SMTP
// credential management, ships with a typed Node SDK.
//
// Config required:
//   RESEND_API_KEY     — generated at https://resend.com/api-keys
//   REPORT_FROM_EMAIL  — sender address (e.g. "Weekly Report <reports@yourdomain.com>")
//                        Must be a verified domain in your Resend account.

import type { WeeklyReportBundle } from "@/lib/services/weekly-report-service";

export interface SendReportInput {
  to: string[];
  bundle: WeeklyReportBundle;
  pdf: Buffer;
  kind: "weekly" | "monthly";
}

export interface SendReportResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDateHe(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

// Render a small Hebrew email body that includes:
//   • Hookline insight (the AI-generated one, so the recipient sees value
//     before opening the PDF)
//   • Headline KPIs
//   • Instagram hookline if available
//   • A note saying the PDF is attached.
// Keep it short — the PDF carries the rest.
function buildHtmlBody(bundle: WeeklyReportBundle, kind: "weekly" | "monthly"): string {
  const kindTitle = kind === "monthly" ? "סיכום חודשי" : "סיכום שבועי";
  const start = formatDateHe(bundle.periodStart);
  const end = formatDateHe(bundle.periodEnd);
  const brand = bundle.metaAds?.brands[0];
  const metaInsights = brand ? bundle.metaAdsInsightsByBrand[brand.name] : null;
  const igInsights = bundle.instagramInsights;
  const kpis = brand?.kpis;
  const restockFlags = bundle.restockAlerts?.flags ?? [];
  // Competitor threats — rivals that opened or deepened a promo this week.
  const competitorThreats = (bundle.competitorWeek?.competitors ?? []).filter(
    (c) => c.change.kind === "opened_promo" || c.change.kind === "deepened_discount"
  );

  return `<!doctype html>
<html lang="he" dir="rtl">
<body style="font-family:Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px;margin:0;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:24px;border-bottom:2px solid #0f172a;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#64748b;">דוח אוטומטי</p>
        <h1 style="margin:0;font-size:24px;color:#0f172a;">${escapeHtml(kindTitle)}</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#475569;">${escapeHtml(`${start} – ${end}`)}</p>
        ${bundle.storeName ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${escapeHtml(bundle.storeName)}</p>` : ""}
      </td>
    </tr>
    ${
      restockFlags.length > 0
        ? `
    <tr>
      <td style="padding:16px 24px 4px;">
        <div style="background:#fef2f2;border-left:4px solid #dc2626;border-right:1px solid #fecaca;border-top:1px solid #fecaca;border-bottom:1px solid #fecaca;border-radius:4px;padding:12px 14px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#7f1d1d;">🚩 ${restockFlags.length} מוצר${restockFlags.length === 1 ? "" : "ים"} שחזר${restockFlags.length === 1 ? "" : "ו"} למלאי — דורש פעולה השבוע</p>
          ${restockFlags
            .slice(0, 3)
            .map(
              (f) =>
                `<p style="margin:4px 0 0;font-size:12px;color:#450a0a;line-height:1.5;"><strong style="color:#7f1d1d;">${escapeHtml(f.title)}</strong> · הכנסה ב90 ימים שלפני: ₪${Math.round(f.priorRevenue).toLocaleString("en-US")} · יצא ${f.gapDays} ימים מהמלאי${f.currentInventory != null ? " · " + f.currentInventory + " יח׳ במלאי" : ""}</p>`
            )
            .join("")}
          ${restockFlags.length > 3 ? `<p style="margin:6px 0 0;font-size:11px;color:#7f1d1d;font-style:italic;">+ עוד ${restockFlags.length - 3} בדוח המלא</p>` : ""}
        </div>
      </td>
    </tr>`
        : ""
    }
    ${
      competitorThreats.length > 0
        ? `
    <tr>
      <td style="padding:16px 24px 4px;">
        <div style="background:#fff7ed;border-left:4px solid #ea580c;border-right:1px solid #fed7aa;border-top:1px solid #fed7aa;border-bottom:1px solid #fed7aa;border-radius:4px;padding:12px 14px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#7c2d12;">🔻 ${competitorThreats.length} מתחר${competitorThreats.length === 1 ? "ה פתח או העמיק" : "ים פתחו או העמיקו"} מבצע השבוע</p>
          ${competitorThreats
            .slice(0, 3)
            .map(
              (c) =>
                `<p style="margin:4px 0 0;font-size:12px;color:#431407;line-height:1.5;"><strong style="color:#7c2d12;">${escapeHtml(c.name)}</strong> · ${escapeHtml(c.change.summary.he)}</p>`
            )
            .join("")}
          <p style="margin:6px 0 0;font-size:11px;color:#7c2d12;font-style:italic;">פירוט מלא בסקשן "מה המתחרים עשו השבוע" בדוח.</p>
        </div>
      </td>
    </tr>`
        : ""
    }
    ${
      metaInsights
        ? `
    <tr>
      <td style="padding:18px 24px 4px;">
        <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">מסקנת השבוע</p>
        <p style="margin:0;font-size:15px;font-weight:600;line-height:1.5;color:#0f172a;">${escapeHtml(metaInsights.hookLine)}</p>
      </td>
    </tr>`
        : ""
    }
    ${
      kpis
        ? `
    <tr>
      <td style="padding:14px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px;border:1px solid #cbd5e1;border-radius:4px;text-align:center;width:33%;">
              <p style="margin:0 0 2px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">הוצאה</p>
              <p style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">₪${Math.round(kpis.spend).toLocaleString("he-IL")}</p>
            </td>
            <td style="width:6px;"></td>
            <td style="padding:8px;border:1px solid #cbd5e1;border-radius:4px;text-align:center;width:33%;">
              <p style="margin:0 0 2px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">רכישות</p>
              <p style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">${kpis.purchases}</p>
            </td>
            <td style="width:6px;"></td>
            <td style="padding:8px;border:1px solid #cbd5e1;border-radius:4px;text-align:center;width:33%;">
              <p style="margin:0 0 2px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">ROAS</p>
              <p style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">${kpis.purchaseRoas != null ? kpis.purchaseRoas.toFixed(2) + "x" : "—"}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
        : ""
    }
    ${
      igInsights
        ? `
    <tr>
      <td style="padding:6px 24px 18px;">
        <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">Instagram</p>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#0f172a;">${escapeHtml(igInsights.hookLine)}</p>
      </td>
    </tr>`
        : ""
    }
    <tr>
      <td style="padding:18px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#475569;">
          הדוח המלא מצורף כקובץ PDF. הוא כולל את כל הקמפיינים, המודעות, ופירוט המשפיענים.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendWeeklyReportEmail(input: SendReportInput): Promise<SendReportResult> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.REPORT_FROM_EMAIL ?? "").trim();
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured." };
  if (!from) return { ok: false, error: "REPORT_FROM_EMAIL not configured." };
  if (input.to.length === 0) return { ok: false, error: "No recipients." };

  let Resend: typeof import("resend").Resend;
  try {
    ({ Resend } = await import("resend"));
  } catch {
    return { ok: false, error: "Resend SDK is not installed. Run `npm install resend`." };
  }

  const client = new Resend(apiKey);

  const kindTitle = input.kind === "monthly" ? "Monthly Summary" : "Weekly Summary";
  // Red-flag prefix: if any heroes restocked this week, lead the subject
  // with that so the founder sees it in the inbox without opening anything.
  const flagCount = input.bundle.restockAlerts?.flags.length ?? 0;
  const flagPrefix =
    flagCount > 0
      ? `🚩 ${flagCount} hero${flagCount === 1 ? "" : "es"} restocked · `
      : "";
  // Competitor prefix: only when a rival's promo is deep enough to matter
  // (≥30% off) — the subject line is expensive real estate.
  const competitorTotals = input.bundle.competitorWeek?.totals;
  const rivalPrefix =
    competitorTotals &&
    competitorTotals.openedPromo > 0 &&
    competitorTotals.maxDiscountPct !== null &&
    competitorTotals.maxDiscountPct >= 30
      ? `🔻 rival at ${Math.round(competitorTotals.maxDiscountPct)}% off · `
      : "";
  const subject = `${flagPrefix}${rivalPrefix}${kindTitle} · ${input.bundle.periodStart} → ${input.bundle.periodEnd}${
    input.bundle.storeName ? " · " + input.bundle.storeName : ""
  }`;
  const filename = `${input.kind}-report-${input.bundle.periodStart}_${input.bundle.periodEnd}.pdf`;

  try {
    const result = await client.emails.send({
      from,
      to: input.to,
      subject,
      html: buildHtmlBody(input.bundle, input.kind),
      attachments: [
        {
          filename,
          content: input.pdf
        }
      ]
    } as any);
    // Resend SDK shape: { data: { id }, error: null } or { data: null, error: {...} }
    const data = (result as any)?.data;
    const error = (result as any)?.error;
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, messageId: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown send error." };
  }
}
