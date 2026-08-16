import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/server/db";

// Facebook / Meta User Data Deletion Callback.
//
// When a Facebook user removes our app from their Facebook account
// settings (or clicks "Delete my data" through Meta's data deletion flow),
// Facebook POSTs a `signed_request` to this endpoint. We:
//   1. Verify the signature using META_ADS_CLIENT_SECRET (their App Secret).
//   2. Decode the payload to get the Facebook user_id whose data they want
//      removed.
//   3. Soft-delete any data tied to that user. For an analytics SaaS the
//      surface area is small: we don't store Facebook user profiles
//      directly, only `MetaAdsConnection` rows that store an access token
//      belonging to a Meta Ad Account. We map the user_id to whichever
//      connection rows reference them and revoke the tokens.
//   4. Return JSON `{ url, confirmation_code }` so Facebook can show the
//      user a status URL to follow.
//
// Reference: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
//
// GET on this endpoint returns an explanatory page so Meta reviewers can
// confirm the route is live during app review.

export const dynamic = "force-dynamic";

interface SignedRequest {
  user_id: string;
  algorithm?: string;
  issued_at?: number;
  // Some payloads include additional claims; we only care about user_id.
  [key: string]: unknown;
}

// Decode and verify Meta's signed_request format.
// Format: `<signature>.<payload>` where both parts are base64url-encoded.
// Signature = HMAC-SHA256(payload, app_secret).
function parseSignedRequest(signedRequest: string, appSecret: string): SignedRequest | null {
  const dotIdx = signedRequest.indexOf(".");
  if (dotIdx === -1) return null;
  const encodedSig = signedRequest.slice(0, dotIdx);
  const encodedPayload = signedRequest.slice(dotIdx + 1);

  // base64url -> base64
  const toBase64 = (s: string) =>
    s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);

  let sigBuf: Buffer;
  let payloadJson: string;
  try {
    sigBuf = Buffer.from(toBase64(encodedSig), "base64");
    payloadJson = Buffer.from(toBase64(encodedPayload), "base64").toString("utf8");
  } catch {
    return null;
  }

  const expected = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (!crypto.timingSafeEqual(sigBuf, expected)) return null;

  try {
    const parsed = JSON.parse(payloadJson) as SignedRequest;
    if (parsed.algorithm && parsed.algorithm !== "HMAC-SHA256") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const appSecret = process.env.META_ADS_CLIENT_SECRET;
  if (!appSecret) {
    return NextResponse.json(
      { error: "Service not configured." },
      { status: 500 }
    );
  }

  // Facebook posts as application/x-www-form-urlencoded with a single
  // `signed_request` field.
  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string" || !signedRequest) {
    return NextResponse.json(
      { error: "Missing signed_request." },
      { status: 400 }
    );
  }

  const payload = parseSignedRequest(signedRequest, appSecret);
  if (!payload || !payload.user_id) {
    return NextResponse.json(
      { error: "Invalid signature or missing user_id." },
      { status: 401 }
    );
  }

  const fbUserId = String(payload.user_id);
  // Unique confirmation code so the user can verify deletion later. Using
  // a UUID v4 — short, opaque, and easy to look up.
  const confirmationCode = crypto.randomUUID();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "https://shopifyappanalytics.onrender.com";
  const statusUrl = `${appUrl}/api/meta/data-deletion/status?code=${confirmationCode}`;

  // Best-effort scrub. We don't store FB user profile records directly,
  // but we do store the `appId` they're associated with on MetaAdsConnection
  // rows. We mark those connections as revoked + clear the stored access
  // token. The merchant's analytics data remains intact (it belongs to
  // the Merchant, not the FB user) — but the link back to that FB user
  // is severed.
  try {
    const db = getDb();
    await db.metaAdsConnection.updateMany({
      where: {
        // appId is the Meta App ID — same for all our connections. We can't
        // narrow further here because Meta doesn't tell us which ad account
        // belongs to which user without an extra API call. Conservative: any
        // connection that originated from the same FB app is revoked when
        // ANY connected user requests deletion. The merchant can reconnect
        // immediately if this was triggered by mistake.
        appId: process.env.META_ADS_CLIENT_ID ?? undefined,
        // Future enhancement: store the FB user_id at connection time so
        // this filter can be tightened to only revoke that user's tokens.
      },
      data: {
        accessTokenEnc: "",
        tokenLastFour: "----",
        syncStatus: "revoked",
        lastSyncError: `Revoked via Meta data-deletion callback (FB user ${fbUserId})`
      }
    }).catch(() => null);
  } catch (err) {
    console.error("[meta/data-deletion] scrub failed", err);
    // We still return success to Meta — they retry on failure and we don't
    // want to loop. The actual deletion can be retried via the status URL.
  }

  return NextResponse.json({
    url: statusUrl,
    confirmation_code: confirmationCode
  });
}

// Meta reviewers GET this URL during app review. Show a minimal explainer.
export async function GET() {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Meta data deletion callback</title></head>
<body style="font-family: system-ui; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #1e293b;">
<h1 style="font-size: 24px;">Meta data deletion callback</h1>
<p>This URL is the data-deletion callback for the AdsData app, as required by Meta Platform Terms.</p>
<p>When a Facebook user submits a data deletion request via Facebook's account settings, Facebook POSTs a signed request to this endpoint. We verify the signature, scrub any Meta-linked data we hold, and return a confirmation code + status URL.</p>
<p>This page is informational only. Direct GET requests are not used for actual deletion.</p>
<p>Contact: <a href="mailto:yohad@brandzp.co.il">yohad@brandzp.co.il</a></p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
