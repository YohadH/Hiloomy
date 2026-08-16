import { NextResponse } from "next/server";
import { checkMetaAdsTokenExpiry } from "@/lib/services/meta-ads-monitor-service";

// Daily cron: scan all MetaAdsConnections for tokens that are NULL or
// within 7 days of expiry. Raises an in-app Alert (Command Center) and
// fires an email notification (Resend) when an issue is detected.
//
// Authentication: the CRON_SECRET / x-cron-secret middleware gate
// (middleware.ts → requireCronSecret) covers all /api/cron/* routes.
// When CRON_SECRET is set the request MUST carry a matching x-cron-secret
// header; when unset (local dev) the check is skipped.
//
// Render Cron config: schedule "0 9 * * *" (09:00 UTC daily) → POST to
// /api/cron/meta-ads-token-check.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handler() {
  try {
    const result = await checkMetaAdsTokenExpiry();

    console.log(
      `[meta-ads-token-check] scanned=${result.scanned} healthy=${result.healthy}` +
        ` issues=${result.issues.length} alertsUpserted=${result.alertsUpserted}` +
        ` alertsResolved=${result.alertsResolved} emailsSent=${result.emailsSent}`
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[meta-ads-token-check] Unexpected error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
