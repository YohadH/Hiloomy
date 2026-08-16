// Meta Ads token expiry monitor.
//
// Scans every MetaAdsConnection and raises an alert (via the alert-writer
// push model) when:
//   - tokenExpiresAt is NULL     → token was never stamped / unknown expiry
//   - tokenExpiresAt is within WARN_WINDOW_DAYS of today → about to expire
//
// The token-refresh cron (meta-token-refresh-service) will already attempt
// to renew tokens that are within 7 days of expiry. This monitor is a
// separate safety net: even if renewal fails (e.g. token was revoked, the
// app secret changed, the Meta account was locked), an open alert will
// appear on the Command Center so the store owner knows to reconnect.
//
// Notification strategy: both channels are used when available.
//   1. In-app Alert row (always) — visible on the Command Center.
//   2. Email (Resend) — sent to the store's active WeeklyReportRecipients
//      when RESEND_API_KEY is configured.
//
// Called from /api/cron/meta-ads-token-check (daily).

import { getDb } from "@/lib/server/db";
import { upsertAlert, resolveAlertByFingerprint } from "@/lib/services/alert-writer-service";
import { sendTransactionalEmail } from "@/lib/email/email-client";

// Warn if expiry is within this many days.
const WARN_WINDOW_DAYS = 7;

// Alert type slug — used for grouping / rendering in the Command Center.
const ALERT_TYPE = "meta_token_expiry";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface TokenExpiryIssue {
  storeId: string;
  storeName: string | null;
  adAccountId: string;
  adAccountName: string | null;
  reason: "null_expiry" | "expiring_soon" | "already_expired";
  tokenExpiresAt: Date | null;
  daysUntilExpiry: number | null; // negative = already expired; null = unknown
}

export interface MetaAdsTokenCheckResult {
  scanned: number;
  healthy: number;
  issues: TokenExpiryIssue[];
  alertsUpserted: number;
  alertsResolved: number;
  emailsSent: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Email builder
// ─────────────────────────────────────────────────────────────────────────

function buildTokenExpiryEmail(issue: TokenExpiryIssue): { subject: string; html: string } {
  const storeName = issue.storeName ?? issue.storeId;
  const accountLabel = issue.adAccountName
    ? `${issue.adAccountName} (${issue.adAccountId})`
    : issue.adAccountId;

  let statusLine: string;
  if (issue.reason === "null_expiry") {
    statusLine = "The token expiry date was never set — the connection may need to be re-authorised.";
  } else if (issue.reason === "already_expired") {
    const days = issue.daysUntilExpiry != null ? Math.abs(issue.daysUntilExpiry) : "?";
    statusLine = `The token <strong>expired ${days} day(s) ago</strong>. Meta Ads data can no longer be synced.`;
  } else {
    const days = issue.daysUntilExpiry ?? "?";
    statusLine = `The token expires in <strong>${days} day(s)</strong>. Meta Ads syncing will stop when it expires.`;
  }

  const subject = `Action required: Meta Ads token expiry — ${storeName}`;
  const html = `<!doctype html>
<html lang="en">
<body style="font-family:Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px;margin:0;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <tr>
      <td style="padding:24px;border-bottom:2px solid #dc2626;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#dc2626;">
          Action Required — Hiloomy
        </p>
        <h1 style="margin:0;font-size:20px;color:#0f172a;">Meta Ads Token Expiry Warning</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#475569;">Store: ${storeName}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px;">
        <p style="margin:0 0 12px;font-size:14px;color:#0f172a;">
          The Meta Ads connection for ad account <strong>${accountLabel}</strong>
          requires attention.
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;">${statusLine}</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#7f1d1d;">
            To restore Meta Ads syncing, reconnect the account from the
            <em>Settings → Connections</em> page in your Hiloomy dashboard.
          </p>
        </div>
        <p style="margin:0;font-size:12px;color:#6b7280;">
          This alert was generated automatically by Hiloomy.
          If the connection has already been renewed, the alert will clear on the
          next daily check.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────
// Resolve recipients for a store (mirrors notification-service pattern)
// ─────────────────────────────────────────────────────────────────────────

async function resolveRecipients(storeId: string): Promise<string[]> {
  const db = getDb();
  const rows = await (db as any).weeklyReportRecipient.findMany({
    where: { storeId, active: true },
    select: { email: true }
  });
  return rows
    .map((r: { email: string }) => (r.email ?? "").trim())
    .filter((e: string) => e.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Main check — called by the cron route
// ─────────────────────────────────────────────────────────────────────────

/**
 * Scan all MetaAdsConnections and:
 *  - upsert an open Alert for every problematic token (null expiry or expiring soon)
 *  - resolve the Alert when the token is now healthy (e.g. it was renewed)
 *  - fire an email notification for each new/persisting issue
 *
 * Returns a summary the cron route can log and return as JSON.
 */
export async function checkMetaAdsTokenExpiry(): Promise<MetaAdsTokenCheckResult> {
  const db = getDb();

  const now = new Date();
  const warnThreshold = new Date(now);
  warnThreshold.setUTCDate(warnThreshold.getUTCDate() + WARN_WINDOW_DAYS);

  // Load every connection with just the fields we need.
  const connections = (await (db as any).metaAdsConnection.findMany({
    select: {
      storeId: true,
      adAccountId: true,
      adAccountName: true,
      tokenExpiresAt: true,
      store: {
        select: { name: true }
      }
    }
  })) as Array<{
    storeId: string;
    adAccountId: string;
    adAccountName: string | null;
    tokenExpiresAt: Date | null;
    store: { name: string } | null;
  }>;

  const result: MetaAdsTokenCheckResult = {
    scanned: connections.length,
    healthy: 0,
    issues: [],
    alertsUpserted: 0,
    alertsResolved: 0,
    emailsSent: 0
  };

  for (const conn of connections) {
    const storeName = conn.store?.name ?? null;
    const fingerprint = `meta_token_expiry:${conn.storeId}`;

    // ── Classify the token state ───────────────────────────────────────
    let issue: TokenExpiryIssue | null = null;

    if (conn.tokenExpiresAt === null) {
      issue = {
        storeId: conn.storeId,
        storeName,
        adAccountId: conn.adAccountId,
        adAccountName: conn.adAccountName,
        reason: "null_expiry",
        tokenExpiresAt: null,
        daysUntilExpiry: null
      };
    } else {
      const msUntilExpiry = conn.tokenExpiresAt.getTime() - now.getTime();
      const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 0) {
        issue = {
          storeId: conn.storeId,
          storeName,
          adAccountId: conn.adAccountId,
          adAccountName: conn.adAccountName,
          reason: "already_expired",
          tokenExpiresAt: conn.tokenExpiresAt,
          daysUntilExpiry
        };
      } else if (conn.tokenExpiresAt <= warnThreshold) {
        issue = {
          storeId: conn.storeId,
          storeName,
          adAccountId: conn.adAccountId,
          adAccountName: conn.adAccountName,
          reason: "expiring_soon",
          tokenExpiresAt: conn.tokenExpiresAt,
          daysUntilExpiry
        };
      }
    }

    // ── Handle healthy tokens ──────────────────────────────────────────
    if (!issue) {
      result.healthy += 1;
      // If there was previously an open alert for this store, resolve it.
      const resolved = await resolveAlertByFingerprint({
        storeId: conn.storeId,
        fingerprint,
        resolvedBy: "system:meta-ads-monitor"
      }).catch(() => ({ resolved: 0 }));
      result.alertsResolved += resolved.resolved;
      continue;
    }

    // ── Upsert in-app alert ────────────────────────────────────────────
    result.issues.push(issue);

    const accountLabel = issue.adAccountName
      ? `${issue.adAccountName} (${issue.adAccountId})`
      : issue.adAccountId;

    let title: string;
    let description: string;
    if (issue.reason === "null_expiry") {
      title = `Meta Ads token has no expiry set — ${storeName ?? issue.storeId}`;
      description =
        `Ad account ${accountLabel}: the OAuth token has no expiry date recorded. ` +
        "This usually means the token was set before expiry tracking was enabled, " +
        "or the account was connected with a short-lived token that may already be " +
        "invalid. Reconnect from Settings → Connections to issue a fresh long-lived token.";
    } else if (issue.reason === "already_expired") {
      const days = Math.abs(issue.daysUntilExpiry ?? 0);
      title = `Meta Ads token expired ${days}d ago — ${storeName ?? issue.storeId}`;
      description =
        `Ad account ${accountLabel}: the OAuth token expired ` +
        `${days} day(s) ago (${issue.tokenExpiresAt!.toISOString().slice(0, 10)}). ` +
        "Meta Ads data syncing has stopped. Reconnect from Settings → Connections.";
    } else {
      const days = issue.daysUntilExpiry ?? 0;
      title = `Meta Ads token expires in ${days}d — ${storeName ?? issue.storeId}`;
      description =
        `Ad account ${accountLabel}: the OAuth token expires on ` +
        `${issue.tokenExpiresAt!.toISOString().slice(0, 10)} (${days} day(s) from now). ` +
        "The auto-refresh cron will attempt renewal; if it fails, reconnect from " +
        "Settings → Connections before the token lapses.";
    }

    try {
      await upsertAlert({
        storeId: issue.storeId,
        type: ALERT_TYPE,
        fingerprint,
        severity: issue.reason === "null_expiry" ? "medium" : issue.reason === "already_expired" ? "high" : "medium",
        source: "Meta",
        detectedBy: "meta-ads-monitor-service",
        title,
        description,
        recommendedAction:
          "Go to Settings → Connections → Meta Ads and reconnect the account to issue a new OAuth token.",
        relatedEntityType: undefined,
        relatedEntityId: undefined,
        payloadJson: {
          adAccountId: issue.adAccountId,
          adAccountName: issue.adAccountName,
          tokenExpiresAt: issue.tokenExpiresAt?.toISOString() ?? null,
          daysUntilExpiry: issue.daysUntilExpiry,
          reason: issue.reason
        }
      });
      result.alertsUpserted += 1;
    } catch (err) {
      console.error(
        `[meta-ads-monitor] Failed to upsert alert for store ${issue.storeId}:`,
        err
      );
    }

    // ── Email notification ─────────────────────────────────────────────
    try {
      const recipients = await resolveRecipients(issue.storeId);
      if (recipients.length > 0) {
        const { subject, html } = buildTokenExpiryEmail(issue);
        for (const to of recipients) {
          const ok = await sendTransactionalEmail({ to, subject, html });
          if (ok) result.emailsSent += 1;
        }
      }
    } catch (err) {
      console.error(
        `[meta-ads-monitor] Failed to send email for store ${issue.storeId}:`,
        err
      );
    }
  }

  return result;
}
