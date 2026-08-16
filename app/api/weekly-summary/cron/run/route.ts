import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { lastCompletedWeekRange, previousMonthRange } from "@/lib/server/reporting-date-range";
import { buildWeeklyReportBundle, persistWeeklyReport } from "@/lib/services/weekly-report-service";
import { listActiveRecipientEmails } from "@/lib/services/weekly-report-recipient-service";
import { buildMonthlyMetaSynthesis } from "@/lib/services/monthly-report-synthesis-service";
import { renderPdfFromUrl } from "@/lib/server/pdf-renderer";
import { sendWeeklyReportEmail } from "@/lib/server/weekly-report-mailer";
import { getInternalBaseUrl } from "@/lib/server/base-url";
import { requireCronSecret } from "@/lib/auth/require-cron-secret";

// Cron-triggered endpoint. Runs the weekly + monthly auto-reports for every
// store that has at least one active recipient configured. Idempotent —
// safe to call multiple times within the same period; only the first call
// for a given (store, period) writes a row and sends emails.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — PDF rendering + AI insights can be slow

interface RunBody {
  weekly?: boolean;
  monthly?: boolean;
}

// Week/month windows are computed PER STORE in the store's own timezone
// via lastCompletedWeekRange / previousMonthRange. The old local helpers
// picked the weekday in Asia/Jerusalem but set the day boundaries with
// setUTCHours — a 3-hour skew vs the store's actual calendar days, which
// then disagreed with the print page (store-TZ boundaries) rendering the
// attached PDF. One convention now: store timezone everywhere.
async function getStoreTimeZoneById(storeId: string): Promise<string> {
  try {
    const db = getDb() as any;
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { timezone: true }
    });
    return store?.timezone || "UTC";
  } catch {
    return "UTC";
  }
}

async function findReportForPeriod(
  storeId: string,
  kind: "weekly" | "monthly",
  start: Date,
  end: Date
): Promise<{ id: string } | null> {
  const db = getDb() as any;
  return db.weeklyReport.findFirst({
    where: {
      storeId,
      kind,
      periodStart: start,
      periodEnd: end
    },
    select: { id: true }
  });
}

async function runForStore(
  storeId: string,
  kind: "weekly" | "monthly",
  start: Date,
  end: Date,
  baseUrl: string
): Promise<{ ok: boolean; reason: string; reportId?: string }> {
  const existing = await findReportForPeriod(storeId, kind, start, end);
  if (existing) return { ok: true, reason: "already-ran", reportId: existing.id };

  const recipients = await listActiveRecipientEmails(storeId);
  if (recipients.length === 0) {
    return { ok: false, reason: "no-recipients" };
  }

  const bundle = await buildWeeklyReportBundle({ storeId, start, end, locale: "he" });
  // For monthly reports, augment the bundle with the cross-week synthesis
  // that reads the prior 4-5 stored weekly reports. This is what gives
  // monthly its distinct value over "just a wider weekly".
  if (kind === "monthly") {
    const synthesis = await buildMonthlyMetaSynthesis(storeId, end, "he").catch(() => null);
    if (synthesis) {
      (bundle as any).monthlySynthesis = synthesis;
    }
  }
  const persisted = await persistWeeklyReport({ bundle, kind });

  // Render PDF using the same internal print URL the on-demand export uses.
  const printUrl = new URL("/print/meta-ads-weekly", baseUrl);
  printUrl.searchParams.set("from", bundle.periodStart);
  printUrl.searchParams.set("to", bundle.periodEnd);
  printUrl.searchParams.set("storeId", storeId);
  printUrl.searchParams.set("locale", "he");

  const pdf = await renderPdfFromUrl({ url: printUrl.toString() });

  const send = await sendWeeklyReportEmail({
    to: recipients,
    bundle,
    pdf,
    kind
  });

  const db = getDb() as any;
  await db.weeklyReport.update({
    where: { id: persisted.id },
    data: {
      sentAt: send.ok ? new Date() : null,
      sentToJson: recipients,
      errorMessage: send.ok ? null : send.error ?? "Send failed."
    }
  });

  return { ok: send.ok, reason: send.ok ? "sent" : send.error ?? "send-failed", reportId: persisted.id };
}

export async function POST(request: Request) {
  const cronAuth = requireCronSecret(request);
  if (cronAuth) return cronAuth;

  try {
    const body: RunBody = await request.json().catch(() => ({}));
    const baseUrl = getInternalBaseUrl(request);
    const db = getDb() as any;

    // Find every store that has at least one active recipient. No active
    // recipients = nothing to send, no work to do.
    const stores = await db.weeklyReportRecipient.findMany({
      where: { active: true },
      select: { storeId: true },
      distinct: ["storeId"]
    });

    const ran: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const { storeId } of stores) {
      const timeZone = await getStoreTimeZoneById(storeId);
      if (body.weekly) {
        const period = lastCompletedWeekRange(timeZone);
        const result = await runForStore(storeId, "weekly", period.start, period.end, baseUrl).catch(
          (e) => ({ ok: false, reason: e instanceof Error ? e.message : "error" })
        );
        if (result.reason === "sent") ran.push(`weekly:${storeId}`);
        else if (result.reason === "already-ran") skipped.push(`weekly:${storeId}`);
        else errors.push(`weekly:${storeId}:${result.reason}`);
      }
      if (body.monthly) {
        const period = previousMonthRange(timeZone);
        const result = await runForStore(storeId, "monthly", period.start, period.end, baseUrl).catch(
          (e) => ({ ok: false, reason: e instanceof Error ? e.message : "error" })
        );
        if (result.reason === "sent") ran.push(`monthly:${storeId}`);
        else if (result.reason === "already-ran") skipped.push(`monthly:${storeId}`);
        else errors.push(`monthly:${storeId}:${result.reason}`);
      }
    }

    return NextResponse.json({ ok: true, ran, skipped, errors });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
