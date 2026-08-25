// Affiliate-facing session tokens (HLA-12/B8).
//
// Affiliates are NOT app users — no Supabase account, no org. They get a
// separate, minimal credential: an HMAC-signed token carrying only
// (memberId, storeId, purpose, expiry). Two purposes:
//   "login"   — 15-minute single-shot magic-link token (emailed / copied)
//   "session" — 30-day cookie set after a login token is redeemed (or
//               immediately after signup)
//
// Signing secret: AFFILIATE_SESSION_SECRET when set, else the
// boot-required SHOPIFY_CREDENTIALS_ENCRYPTION_KEY — so the feature works
// with zero new env vars, and rotating the dedicated var invalidates all
// affiliate sessions without touching anything else.

import crypto from "node:crypto";

export const AFFILIATE_SESSION_COOKIE = "aff_portal_session";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AffiliateTokenPayload {
  memberId: string;
  storeId: string;
  purpose: "login" | "session";
  exp: number; // epoch ms
}

function secret(): string {
  const value =
    process.env.AFFILIATE_SESSION_SECRET?.trim() ||
    process.env.SHOPIFY_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new Error(
      "No signing secret available for affiliate sessions (AFFILIATE_SESSION_SECRET / SHOPIFY_CREDENTIALS_ENCRYPTION_KEY)."
    );
  }
  return value;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

function encode(payload: AffiliateTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function createAffiliateLoginToken(memberId: string, storeId: string): string {
  return encode({ memberId, storeId, purpose: "login", exp: Date.now() + LOGIN_TOKEN_TTL_MS });
}

export function createAffiliateSessionToken(memberId: string, storeId: string): string {
  return encode({ memberId, storeId, purpose: "session", exp: Date.now() + SESSION_TTL_MS });
}

export function verifyAffiliateToken(
  token: string | null | undefined,
  purpose: AffiliateTokenPayload["purpose"]
): { memberId: string; storeId: string } | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = sign(data);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as AffiliateTokenPayload;
    if (payload.purpose !== purpose) return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.memberId !== "string" || typeof payload.storeId !== "string") return null;
    return { memberId: payload.memberId, storeId: payload.storeId };
  } catch {
    return null;
  }
}

export const AFFILIATE_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_MS / 1000
};
