// Short share links (owner request 2026-08-26): hiloomy.com/l/{token}.
//
// A token row stores everything the /r/{slug}/{code} redirect takes as
// query params (coupon, destination path, UTMs), so the URL an affiliate
// actually shares stays tiny. The resolver feeds the SAME click-capture
// machinery (createAffiliateRedirectSession) as /r — a short link is just
// an address, never a second tracking pipeline.

import crypto from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { appBaseUrl } from "@/lib/services/affiliate-signup-service";
import { sanitizeDestinationPath } from "@/lib/services/affiliate-link-tracking-service";

// Lowercase + digits: case-ambiguity-free when read aloud or retyped from
// a story screenshot. 36^6 ≈ 2.2B tokens — collisions are retried anyway.
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 6;

function newToken(): string {
  const bytes = crypto.randomBytes(TOKEN_LENGTH);
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i += 1) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

function cleanUtm(value: unknown): string | null {
  const trimmed = String(value ?? "").trim().slice(0, 120);
  return trimmed || null;
}

export function shortLinkUrl(token: string): string {
  return `${appBaseUrl()}/l/${token}`;
}

export async function createAffiliateShortLink(input: {
  storeId: string;
  affiliateId: string;
  couponCode?: string | null;
  destinationPath?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}): Promise<{ token: string; url: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  if (!db?.affiliateShortLink) {
    throw new AppError(
      "Short-link table is missing. Apply prisma/migrations/20260826_affiliate_short_links.",
      500
    );
  }

  const member = await db.affiliateMember.findFirst({
    where: { id: input.affiliateId, storeId: input.storeId },
    select: { id: true }
  });
  if (!member) throw new AppError("Affiliate was not found.", 404);

  const rawCoupon = String(input.couponCode ?? "").trim();
  const couponCode = /^[A-Za-z0-9._-]{1,64}$/.test(rawCoupon) ? rawCoupon : null;
  const destinationPath = sanitizeDestinationPath(input.destinationPath);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = newToken();
    try {
      await db.affiliateShortLink.create({
        data: {
          storeId: input.storeId,
          affiliateMemberId: member.id,
          token,
          couponCode,
          destinationPath,
          utmSource: cleanUtm(input.utmSource),
          utmMedium: cleanUtm(input.utmMedium),
          utmCampaign: cleanUtm(input.utmCampaign)
        }
      });
      return { token, url: shortLinkUrl(token) };
    } catch (error) {
      // P2002 = token collision — redraw. Anything else is real.
      if ((error as { code?: string })?.code !== "P2002") throw error;
    }
  }
  throw new AppError("Could not allocate a short-link token — try again.", 500);
}

export interface ResolvedShortLink {
  storeId: string;
  storeDomain: string;
  affiliateCode: string;
  couponCode: string | null;
  destinationPath: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export async function resolveAffiliateShortLink(token: string): Promise<ResolvedShortLink | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  if (!db?.affiliateShortLink || !/^[a-z0-9]{4,16}$/.test(token)) return null;

  const row = await db.affiliateShortLink.findUnique({
    where: { token },
    include: {
      store: { select: { id: true, domain: true } },
      affiliateMember: { select: { affiliateCode: true } }
    }
  });
  if (!row?.store || !row.affiliateMember) return null;

  // Best-effort counter; AttributionSession is the canonical click record.
  db.affiliateShortLink
    .update({ where: { token }, data: { clicks: { increment: 1 } } })
    .catch(() => null);

  return {
    storeId: row.store.id,
    storeDomain: row.store.domain,
    affiliateCode: row.affiliateMember.affiliateCode,
    couponCode: row.couponCode ?? null,
    destinationPath: sanitizeDestinationPath(row.destinationPath),
    utmSource: row.utmSource ?? null,
    utmMedium: row.utmMedium ?? null,
    utmCampaign: row.utmCampaign ?? null
  };
}
