// Lightweight Resend wrapper for all transactional emails.
//
// Centralizes:
//   - Lazy singleton client (so importing types doesn't error if RESEND_API_KEY is missing)
//   - From-address resolution (REPORT_FROM_EMAIL env var)
//   - Soft-fail mode: when RESEND_API_KEY is missing, every send() logs
//     instead of throwing. Lets dev/staging run without email config.
//
// Templates are plain function calls that return { subject, html } —
// see lib/email/templates.ts. Keep templates fully self-contained
// (no external CSS, all styles inline) since most email clients
// strip <style> blocks.

import { Resend } from "resend";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  // Optional reply-to address (defaults to support inbox in future).
  replyTo?: string;
}

let cached: Resend | null = null;

function getResendClient(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

function getFromAddress(): string {
  return process.env.REPORT_FROM_EMAIL ?? "Hiloomy <noreply@brandzp.co.il>";
}

/**
 * Send a single transactional email. Returns true on success, false when
 * either the SDK is unconfigured or the send fails. Never throws — caller
 * shouldn't be blocked from completing its operation just because an email
 * couldn't go out.
 */
export async function sendTransactionalEmail(args: SendArgs): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.warn(
      `[email] Skipping send to ${args.to} — RESEND_API_KEY not set. Subject: ${args.subject}`
    );
    return false;
  }
  try {
    const result = await client.emails.send({
      from: getFromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      ...(args.replyTo ? { replyTo: args.replyTo } : {})
    });
    if (result.error) {
      console.error(`[email] Resend rejected: ${result.error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] Send failed for ${args.to}:`, err);
    return false;
  }
}
