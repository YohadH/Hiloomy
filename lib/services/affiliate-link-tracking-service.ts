import crypto from "node:crypto";
import { getDb, isDatabaseConnectionError } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { isBixGrowSourcePlatform, normalizeAffiliateSourcePlatform } from "@/lib/services/affiliate-attribution-source";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

function hashInput(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Open-redirect guard for the PUBLIC redirect route. The destination is
// concatenated onto the store domain, so only same-store relative paths are
// allowed: a single leading "/" and no backslashes anywhere. With the host
// fixed and the path "/"-anchored, a later "@" can never reach the URL
// authority — legit paths like /pages/contact?email=a@b.com must pass.
export function sanitizeDestinationPath(raw: string | null | undefined): string {
  const value = raw ?? "/";
  return /^\/(?![\/\\])/.test(value) && !value.includes("\\") ? value : "/";
}

async function getStoreOrThrow(storeId?: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  try {
    const store = storeId
      ? await db.store.findUnique({ where: { id: storeId } })
      : await resolveOrCreateBaseStore();
    if (!store) throw new AppError("Store was not found.", 404);
    return { db, store };
  } catch (error) {
    throw error;
  }
}

export async function createAffiliateRedirectSession(input: {
  storeId?: string;
  affiliateCode: string;
  couponCode?: string | null;
  destinationPath?: string;
  destinationUrl?: string;
  productId?: string | null;
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  visitorToken?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const { db, store } = await getStoreOrThrow(input.storeId);
  // Exact match first — the schema's unique is case-sensitive, so case
  // variants ("SARA"/"sara") can coexist and the exact code must win.
  // Insensitive only as a fallback for retyped links and lowercase codes
  // from BixGrow/CSV imports.
  const affiliate =
    (await db.affiliateMember?.findFirst({
      where: { storeId: store.id, affiliateCode: input.affiliateCode }
    }))
    ?? (await db.affiliateMember?.findFirst({
      where: { storeId: store.id, affiliateCode: { equals: input.affiliateCode, mode: "insensitive" } }
    }));
  if (!affiliate) throw new AppError("Affiliate was not found for the redirect link.", 404);

  const clickId = crypto.randomUUID();
  const destinationUrl = input.destinationUrl ?? `https://${store.domain}${input.destinationPath ?? "/"}`;

  if (db.attributionSession) {
    await db.attributionSession.create({
      data: {
        storeId: store.id,
        affiliateMemberId: affiliate.id,
        clickId,
        visitorToken: input.visitorToken ?? null,
        sourcePlatform: normalizeAffiliateSourcePlatform(input.sourcePlatform),
        sourceUrl: input.sourceUrl ?? null,
        destinationUrl,
        landingPath: input.destinationPath ?? "/",
        productId: input.productId ?? null,
        couponCode: input.couponCode ?? null,
        affiliateCode: affiliate.affiliateCode,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        ipHash: input.ipAddress ? hashInput(input.ipAddress) : null,
        userAgent: input.userAgent ?? null
      }
    });
  }

  return {
    clickId,
    store,
    affiliate,
    destinationUrl
  };
}

export function buildTrackedDestinationUrl(input: {
  shopDomain: string;
  destinationPath?: string;
  destinationUrl?: string;
  couponCode?: string | null;
  affiliateCode: string;
  clickId: string;
  sourcePlatform?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}) {
  const baseDestination = input.destinationUrl ?? `https://${input.shopDomain}${input.destinationPath ?? "/"}`;
  const url = new URL(baseDestination);
  url.searchParams.set("ref", input.affiliateCode);
  if (isBixGrowSourcePlatform(input.sourcePlatform)) {
    // Preserve BixGrow's native marker so downstream orders can be recognized as BixGrow traffic.
    url.searchParams.set("bg_ref", input.affiliateCode);
  }
  url.searchParams.set("agent_click_id", input.clickId);
  if (input.couponCode) url.searchParams.set("coupon", input.couponCode);
  if (input.utmSource) url.searchParams.set("utm_source", input.utmSource);
  if (input.utmMedium) url.searchParams.set("utm_medium", input.utmMedium);
  if (input.utmCampaign) url.searchParams.set("utm_campaign", input.utmCampaign);
  return url.toString();
}

export async function getAttributionCoverageSignals(storeId?: string) {
  try {
    const { db, store } = await getStoreOrThrow(storeId);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessions = db.attributionSession
      ? await db.attributionSession.findMany({
          where: { storeId: store.id, createdAt: { gte: since } }
        }).catch(() => [])
      : [];
    const webhooks = db.webhookEvent
      ? await db.webhookEvent.findMany({
          where: { storeId: store.id, platform: "shopify", createdAt: { gte: since } }
        }).catch(() => [])
      : [];

    const totalSessions = sessions.length;
    const convertedSessions = sessions.filter((session: any) => session.convertedAt).length;
    const healthyWebhooks = webhooks.filter((event: any) => event.status === "processed").length;
    const webhookFailures = webhooks.filter((event: any) => event.status === "error").length;
    const sessionMatchRate = totalSessions ? convertedSessions / totalSessions : 0;
    const webhookSample = healthyWebhooks + webhookFailures;
    const webhookHealthRate = webhookSample ? healthyWebhooks / webhookSample : 0;
    const overallConfidence = totalSessions || webhookSample
      ? Math.min(1, Math.max(0, sessionMatchRate * 0.55 + webhookHealthRate * 0.45))
      : 0;

    return {
      totalSessions,
      convertedSessions,
      sessionMatchRate,
      webhookHealthRate,
      overallConfidence
    };
  } catch (error) {
    if (error instanceof AppError || isDatabaseConnectionError(error)) {
      return {
        totalSessions: 0,
        convertedSessions: 0,
        sessionMatchRate: 0,
        webhookHealthRate: 0,
        overallConfidence: 0
      };
    }
    throw error;
  }
}
