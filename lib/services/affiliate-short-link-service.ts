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

// Campaign suffix (ported from the Creators project): the same permanent
// token can be shared as {token}-{campaign} so clicks and orders carry the
// campaign. Codes are lowercase a-z0-9 and Hebrew letters, "-" separated.
export function normalizeCampaignCode(value: unknown): string | null {
  const code = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return code || null;
}

export function parseShortLinkToken(raw: string): { token: string; campaignCode: string | null } {
  let clean = String(raw ?? "").trim();
  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }
  clean = clean.toLowerCase();
  const dash = clean.indexOf("-");
  if (dash === -1) return { token: clean, campaignCode: null };
  return { token: clean.slice(0, dash), campaignCode: normalizeCampaignCode(clean.slice(dash + 1)) };
}

export function shortLinkUrl(token: string, campaignCode?: string | null): string {
  const code = normalizeCampaignCode(campaignCode);
  return `${appBaseUrl()}/l/${token}${code ? `-${code}` : ""}`;
}

/**
 * The SAME short link served on the store's OWN domain via the Shopify App
 * Proxy (subpath prefix "apps", subpath "go"). First-party cookie + branded
 * URL. Only resolves once the App Proxy is configured on that store's app;
 * until then use shortLinkUrl (hiloomy.com/l/{token}).
 */
export function appProxyShortLinkUrl(storeDomain: string, token: string, campaignCode?: string | null): string {
  const code = normalizeCampaignCode(campaignCode);
  return `https://${storeDomain}/apps/go/${token}${code ? `-${code}` : ""}`;
}

export async function createAffiliateShortLink(input: {
  storeId: string;
  affiliateId: string;
  couponCode?: string | null;
  destinationPath?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}): Promise<{ token: string; url: string; storeUrl: string; campaignUrl: string | null; storeCampaignUrl: string | null }> {
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
    select: { id: true, store: { select: { domain: true } } }
  });
  if (!member) throw new AppError("Affiliate was not found.", 404);
  const storeDomain: string = member.store?.domain ?? "";

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
      // With a UTM campaign the same token is also offered as {token}-{campaign},
      // so the click and the order carry the campaign (Creators-project port).
      const campaign = normalizeCampaignCode(input.utmCampaign);
      return {
        token,
        url: shortLinkUrl(token),
        storeUrl: storeDomain ? appProxyShortLinkUrl(storeDomain, token) : shortLinkUrl(token),
        campaignUrl: campaign ? shortLinkUrl(token, campaign) : null,
        storeCampaignUrl: campaign ? (storeDomain ? appProxyShortLinkUrl(storeDomain, token, campaign) : shortLinkUrl(token, campaign)) : null
      };
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
  // From the {token}-{campaign} suffix; null for a plain token.
  campaignCode: string | null;
  // Resolved AffiliateCampaign / AffiliateBrief when the suffix matched a
  // campaign of the link's store (ported from the Creators project).
  campaignId: string | null;
  briefId: string | null;
}

export async function resolveAffiliateShortLink(rawToken: string): Promise<ResolvedShortLink | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const { token, campaignCode } = parseShortLinkToken(rawToken);
  if (!db?.affiliateShortLink || !/^[a-z0-9]{4,16}$/.test(token)) return null;

  const row = await db.affiliateShortLink.findUnique({
    where: { token },
    include: {
      store: { select: { id: true, domain: true } },
      affiliateMember: { select: { id: true, affiliateCode: true } }
    }
  });
  if (!row?.store || !row.affiliateMember) return null;

  // A campaign code that names a real campaign of this store wins over the
  // link's own destination and coupon, and ties the click to the member's
  // brief in that campaign. Lazy import: the campaign service imports link
  // helpers from this module.
  let campaign: Awaited<ReturnType<typeof import("@/lib/services/affiliate-campaign-service").resolveCampaignForLink>> = null;
  if (campaignCode) {
    campaign = await import("@/lib/services/affiliate-campaign-service")
      .then((m) => m.resolveCampaignForLink(row.store.id, row.affiliateMember.id, campaignCode))
      .catch(() => null);
  }

  // Best-effort counter; AttributionSession is the canonical click record.
  db.affiliateShortLink
    .update({ where: { token }, data: { clicks: { increment: 1 } } })
    .catch(() => null);

  return {
    storeId: row.store.id,
    storeDomain: row.store.domain,
    affiliateCode: row.affiliateMember.affiliateCode,
    couponCode: campaign?.couponCode ?? row.couponCode ?? null,
    destinationPath: campaign?.destinationPath ?? sanitizeDestinationPath(row.destinationPath),
    utmSource: row.utmSource ?? null,
    utmMedium: row.utmMedium ?? null,
    // A campaign suffix also names the UTM campaign unless the link set one.
    utmCampaign: row.utmCampaign ?? campaignCode ?? null,
    campaignCode,
    campaignId: campaign?.campaignId ?? null,
    briefId: campaign?.briefId ?? null
  };
}
