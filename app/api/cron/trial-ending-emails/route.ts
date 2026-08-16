import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { sendTransactionalEmail } from "@/lib/email/email-client";
import { trialEndingEmail } from "@/lib/email/templates";
import { billingEnabled } from "@/lib/billing/billing-flag";

// Daily cron: find orgs whose trial ends in exactly 3 days, email the
// owner. Idempotent over the day: we use a deterministic check (today
// + 3 days, within a single 24h bucket).
//
// Safe to invoke twice on the same day — Resend will dedupe via the
// (to, subject) tuple at higher tiers; on the free tier, two emails go
// out which is annoying but not destructive.
//
// Render Cron config: schedule "0 10 * * *" (10:00 UTC daily) → POST to
// /api/cron/trial-ending-emails. Authenticate via env-var-shared secret
// in production; for now the route is public (in middleware allowlist).

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function runHandler() {
  // Trial-end emails are pointless without billing on — if BILLING_ENABLED
  // is false everyone is treated as "paid" and trials don't expire.
  if (!billingEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "billing disabled" });
  }

  const db = getDb();

  // Target: orgs whose trialEndsAt is between (now+3d) and (now+3d+1d)
  // — i.e. trial ends sometime tomorrow-but-three-days-from-now.
  const now = new Date();
  const threeDays = new Date(now);
  threeDays.setUTCDate(threeDays.getUTCDate() + 3);
  threeDays.setUTCHours(0, 0, 0, 0);
  const fourDays = new Date(threeDays);
  fourDays.setUTCDate(fourDays.getUTCDate() + 1);

  const orgs = (await db.organization.findMany({
    where: {
      plan: "trial",
      stripeSubscriptionId: null,
      trialEndsAt: { gte: threeDays, lt: fourDays }
    },
    select: {
      id: true,
      memberships: {
        where: { role: "owner" },
        select: { user: { select: { email: true, displayName: true, locale: true } } },
        take: 1
      }
    }
  })) as Array<{
    id: string;
    memberships: Array<{ user: { email: string; displayName: string | null; locale: string } }>;
  }>;

  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  let sent = 0;
  let failed = 0;
  for (const org of orgs) {
    const owner = org.memberships[0]?.user;
    if (!owner?.email) continue;
    const locale = owner.locale === "en" ? "en" : "he";
    const template = trialEndingEmail({
      displayName: owner.displayName,
      appUrl,
      daysLeft: 3,
      locale: locale as "he" | "en"
    });
    const ok = await sendTransactionalEmail({
      to: owner.email,
      subject: template.subject,
      html: template.html
    });
    if (ok) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({ ok: true, scanned: orgs.length, sent, failed });
}

export const GET = runHandler;
export const POST = runHandler;
