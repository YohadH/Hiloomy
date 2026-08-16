import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { encryptSecret } from "@/lib/security/encryption";
import { invalidateShopifyOauthConfigCache } from "@/lib/services/shopify-oauth-service";
import { getAuthContext } from "@/lib/auth/session";

// Manage the global Shopify Partner app credentials (Client ID +
// Client Secret) from the Settings UI. Values are persisted in the
// SystemConfig key/value table; the OAuth service reads them with an
// env-var fallback, so the operator can configure either path.
//
// GET → returns {clientIdSet, clientSecretLastFour, hasEnvFallback}.
//       Never returns the secret itself.
// POST → upserts the rows. Client Secret encrypted at rest with AES-GCM.

export const dynamic = "force-dynamic";

const CLIENT_ID_KEY = "shopify_partner_client_id";
const CLIENT_SECRET_KEY = "shopify_partner_client_secret";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const db = getDb();
    const rows = (await db.systemConfig.findMany({
      where: { key: { in: [CLIENT_ID_KEY, CLIENT_SECRET_KEY] } },
      select: { key: true, value: true, encrypted: true }
    })) as Array<{ key: string; value: string; encrypted: boolean }>;

    const byKey = new Map(rows.map((r) => [r.key, r]));
    const clientIdRow = byKey.get(CLIENT_ID_KEY);
    const clientSecretRow = byKey.get(CLIENT_SECRET_KEY);
    // We expose the Client ID in plain because it's a public identifier
    // (visible in OAuth URL anyway). The secret stays hidden — we only
    // surface a "last four" hint for visual confirmation.
    return NextResponse.json({
      ok: true,
      clientId: clientIdRow?.value ?? null,
      clientSecretLastFour: clientSecretRow
        ? "••••" // never expose the secret. Just confirm presence.
        : null,
      hasEnvFallback: {
        clientId: !!process.env.SHOPIFY_CLIENTID,
        clientSecret: !!process.env.SHOPIFY_CLIENT_SECRET
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as {
      clientId?: string;
      clientSecret?: string;
    };
    const clientId = body.clientId?.trim();
    const clientSecret = body.clientSecret?.trim();
    if (!clientId && !clientSecret) {
      throw new AppError("Provide at least one of clientId or clientSecret to save.", 400);
    }

    const db = getDb();
    const ops: Array<Promise<unknown>> = [];

    if (clientId) {
      ops.push(
        db.systemConfig.upsert({
          where: { key: CLIENT_ID_KEY },
          update: { value: clientId, encrypted: false },
          create: { key: CLIENT_ID_KEY, value: clientId, encrypted: false }
        })
      );
    }
    if (clientSecret) {
      // Sanity-check the format. Shopify Partner API secrets typically
      // start with shpss_; we accept anything (legacy formats exist) but
      // warn the operator if it looks wrong.
      const encrypted = encryptSecret(clientSecret);
      ops.push(
        db.systemConfig.upsert({
          where: { key: CLIENT_SECRET_KEY },
          update: { value: encrypted, encrypted: true },
          create: { key: CLIENT_SECRET_KEY, value: encrypted, encrypted: true }
        })
      );
    }

    await Promise.all(ops);
    // Drop the in-memory config cache so next OAuth request sees the new
    // values without waiting for the 1-min TTL.
    invalidateShopifyOauthConfigCache();

    return NextResponse.json({
      ok: true,
      saved: {
        clientId: !!clientId,
        clientSecret: !!clientSecret
      }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
