// Daily-report cron endpoint.
// Called by the in-process daily-report-cron.ts at ~08:00 Asia/Jerusalem.
//
// For each store in the DB (currently just the one owner store), this:
//   1. Builds yesterday's metrics via buildDailyReport().
//   2. Renders the /print/daily-summary page to a PDF via Playwright.
//   3. Sends the PDF as a Telegram Document to the owner's chat.
//
// Idempotent: if no TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID is configured, logs
// a warning and returns ok:true (no-op) rather than failing noisily — so a
// Render env without Telegram wired does not block the cron from running
// after it is configured.
//
// Delivery is owner-level (single Telegram chat), not per-store, so we do not
// need a per-store recipient table.

import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { buildDailyReport } from "@/lib/services/daily-report-service";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";
import { sendTelegramDocument } from "@/lib/server/telegram";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { requireCronSecret } from "@/lib/auth/require-cron-secret";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const cronAuth = requireCronSecret(request);
  if (cronAuth) return cronAuth;

  try {
    const baseUrl = getInternalBaseUrl(request);
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";

    if (!botToken || !chatId) {
      console.warn(
        "[daily-report-cron] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — PDF generated but not delivered."
      );
    }

    const db = getDb();
    // Find all active stores. For the current single-tenant setup this is just
    // the owner's store; the loop future-proofs for multi-tenant.
    const stores = await db.store.findMany({
      select: { id: true, name: true }
    });

    const ran: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    const now = new Date();

    for (const store of stores as Array<{ id: string; name: string }>) {
      try {
        const bundle = await buildDailyReport(store.id, now);

        if (bundle.freshness.stale && bundle.today.orders === 0 && bundle.today.revenue === 0) {
          // No data at all AND stale sync — nothing to report.
          skipped.push(store.id);
          continue;
        }

        // Render the print page to PDF.
        const printUrl = new URL("/print/daily-summary", baseUrl);
        printUrl.searchParams.set("storeId", store.id);
        printUrl.searchParams.set("date", bundle.reportDate);
        const pdf = await renderPdfFromUrl({ url: printUrl.toString() });

        const dateLabel = bundle.reportDate; // YYYY-MM-DD
        const filename = `daily-report-${dateLabel}.pdf`;
        const storeName = store.name || "החנות";
        const caption =
          `📊 דוח יומי — ${storeName}\n` +
          `📅 ${dateLabel}\n` +
          `💰 הכנסות: ₪${Math.round(bundle.today.revenue).toLocaleString("en-US")} | ` +
          `📦 הזמנות: ${bundle.today.orders}` +
          (bundle.meta ? ` | 📣 Meta: ₪${Math.round(bundle.meta.spend).toLocaleString("en-US")}` : "");

        if (botToken && chatId) {
          await sendTelegramDocument({ botToken, chatId, pdfBuffer: pdf, filename, caption });
          console.log(`[daily-report-cron] sent to Telegram: ${filename}`);
        } else {
          // Log what would have been sent so it's visible in Render logs.
          console.log(`[daily-report-cron] Telegram not configured — PDF generated (${pdf.length} bytes): ${filename}`);
          console.log(`[daily-report-cron] Caption would have been: ${caption}`);
        }

        ran.push(store.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[daily-report-cron] error for store ${store.id}: ${msg}`);
        errors.push(`${store.id}:${msg}`);
      }
    }

    return NextResponse.json({ ok: true, ran, skipped, errors });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
