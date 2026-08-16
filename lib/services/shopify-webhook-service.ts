import crypto from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { reconcileAffiliateAttributionOrphans } from "@/lib/services/affiliate-attribution-reconciler";
import {
  buildAffiliateTrackingMethod,
  extractTrackingNoteAttribute,
  extractTrackingQueryValue,
  resolveAffiliateSourcePlatform,
  safeTrackingString
} from "@/lib/services/affiliate-attribution-source";

// The Partner-app client secret may live in the DB (SystemConfig, pasted via
// Settings → Shopify connection) instead of env. Cache it briefly so webhook
// bursts don't hit the DB per delivery.
let dbClientSecretCache: { value: string | null; loadedAt: number } | null = null;
const DB_SECRET_CACHE_TTL_MS = 60 * 1000;

async function getDbStoredClientSecret(): Promise<string | null> {
  if (dbClientSecretCache && Date.now() - dbClientSecretCache.loadedAt < DB_SECRET_CACHE_TTL_MS) {
    return dbClientSecretCache.value;
  }
  let secret: string | null = null;
  try {
    const db = getDb();
    const row = await db?.systemConfig?.findFirst({
      where: { key: "shopify_partner_client_secret" },
      select: { value: true, encrypted: true }
    });
    if (row?.value) {
      const { decryptSecret } = await import("@/lib/security/encryption");
      const raw = row.encrypted ? decryptSecret(row.value) : row.value;
      secret = raw.trim() || null;
    }
  } catch {
    secret = null;
  }
  dbClientSecretCache = { value: secret, loadedAt: Date.now() };
  return secret;
}

export async function verifyShopifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const provided = Buffer.from(signature);
  const matches = (secret: string) => {
    const digest = Buffer.from(crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
    // timingSafeEqual throws on length mismatch — treat that as a plain reject.
    return digest.length === provided.length && crypto.timingSafeEqual(digest, provided);
  };

  // Webhooks registered through the Admin API (our OAuth install flow) are
  // signed with the app's CLIENT SECRET, not a store-level webhook secret.
  // Try SHOPIFY_WEBHOOK_SECRET (manually-created webhooks) and
  // SHOPIFY_CLIENT_SECRET first; the DB-stored partner client secret (the
  // Settings-UI configuration path never sets env vars) is only fetched
  // when the env secrets don't match.
  const envSecrets = Array.from(
    new Set(
      [process.env.SHOPIFY_WEBHOOK_SECRET, process.env.SHOPIFY_CLIENT_SECRET]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
  if (envSecrets.some(matches)) return true;

  const dbSecret = await getDbStoredClientSecret();
  if (dbSecret && !envSecrets.includes(dbSecret) && matches(dbSecret)) return true;

  if (!envSecrets.length && !dbSecret) {
    throw new AppError(
      "No webhook secret available. Set SHOPIFY_WEBHOOK_SECRET or SHOPIFY_CLIENT_SECRET, or save the Partner app credentials in Settings → Shopify connection.",
      500
    );
  }
  return false;
}

export async function recordWebhookEvent(input: {
  storeId: string;
  platform: string;
  topic: string;
  externalId?: string | null;
  status?: string;
  payload: unknown;
  errorMessage?: string | null;
  processedAt?: string | null;
}) {
  const db = getDb();
  if (!db?.webhookEvent) return null;
  return db.webhookEvent.create({ data: { storeId: input.storeId, platform: input.platform, topic: input.topic, externalId: input.externalId ?? null, status: input.status ?? "received", payload: input.payload ?? {}, errorMessage: input.errorMessage ?? null, processedAt: input.processedAt ? new Date(input.processedAt) : null } });
}

async function updateWebhookEventStatus(webhookEventId: string | null, status: string, errorMessage?: string | null) {
  const db = getDb();
  if (!db?.webhookEvent || !webhookEventId) return;
  await db.webhookEvent.update({ where: { id: webhookEventId }, data: { status, errorMessage: errorMessage ?? null, processedAt: new Date() } });
}

// Shopify's order "name" is the human-readable order number ("#1001");
// order_number is the bare integer. Normalized to a leading "#" to match the
// convention on AffiliateAttribution.externalOrderNumber (the reconciler
// strips the "#" on both sides when linking orphans to Orders).
export function normalizeExternalOrderNumber(name?: unknown, orderNumber?: unknown): string | null {
  const fromName = safeTrackingString(name)?.trim();
  const raw = fromName || (orderNumber != null ? String(orderNumber) : null);
  if (!raw) return null;
  return raw.startsWith("#") ? raw : `#${raw}`;
}

export async function processShopifyOrderWebhook(shopDomain: string, payload: any, topic: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  const store = await db.store.findUnique({ where: { domain: shopDomain } });
  if (!store) throw new AppError("Store was not found for the webhook shop domain.", 404);

  const webhookEvent = await recordWebhookEvent({
    storeId: store.id,
    platform: "shopify",
    topic,
    externalId: safeTrackingString(payload?.id) ?? String(payload?.id ?? ""),
    payload,
    status: "received"
  });

  try {
    const landingSite = safeTrackingString(payload?.landing_site);
    const referringSite = safeTrackingString(payload?.referring_site);
    const clickId = extractTrackingNoteAttribute(payload, "agent_click_id")
      ?? extractTrackingQueryValue(landingSite, "agent_click_id")
      ?? extractTrackingQueryValue(landingSite, "click_id");
    const bgRefCode = extractTrackingNoteAttribute(payload, "bg_ref")
      ?? extractTrackingQueryValue(landingSite, "bg_ref")
      ?? extractTrackingQueryValue(referringSite, "bg_ref");
    const refCode = extractTrackingNoteAttribute(payload, "ref")
      ?? bgRefCode
      ?? extractTrackingQueryValue(landingSite, "ref")
      ?? extractTrackingQueryValue(referringSite, "ref");
    const couponCode = payload?.discount_codes?.[0]?.code
      ?? extractTrackingQueryValue(landingSite, "coupon")
      ?? extractTrackingNoteAttribute(payload, "coupon");

    const session = clickId && db.attributionSession ? await db.attributionSession.findUnique({ where: { clickId } }).catch(() => null) : null;
    let affiliate = session?.affiliateMemberId && db.affiliateMember ? await db.affiliateMember.findUnique({ where: { id: session.affiliateMemberId } }).catch(() => null) : null;

    if (!affiliate && db.affiliateMember) {
      // Exact match first (the unique constraint is case-sensitive, so case
      // variants can coexist and the exact code must win), then a
      // case-insensitive fallback for BixGrow/CSV-imported lowercase codes.
      const exactFilters = [
        couponCode ? { couponCode: String(couponCode) } : null,
        refCode ? { affiliateCode: String(refCode) } : null
      ].filter(Boolean);
      const insensitiveFilters = [
        couponCode ? { couponCode: { equals: String(couponCode), mode: "insensitive" } } : null,
        refCode ? { affiliateCode: { equals: String(refCode), mode: "insensitive" } } : null
      ].filter(Boolean);
      if (exactFilters.length) {
        affiliate = await db.affiliateMember.findFirst({ where: { storeId: store.id, OR: exactFilters } }).catch(() => null);
        if (!affiliate) {
          affiliate = await db.affiliateMember.findFirst({ where: { storeId: store.id, OR: insensitiveFilters } }).catch(() => null);
        }
      }
    }

    if (affiliate && db.affiliateAttribution) {
      const internalOrder = db.order ? await db.order.findUnique({ where: { storeId_shopifyOrderId: { storeId: store.id, shopifyOrderId: String(payload?.id) } } }).catch(() => null) : null;
      const salesAmount = Number(payload?.current_total_price ?? payload?.total_price ?? 0);
      // Honor the member's override / program rate; 10% only as last resort.
      const program = db.affiliateProgram && affiliate.programId
        ? await db.affiliateProgram.findUnique({ where: { id: affiliate.programId } }).catch(() => null)
        : null;
      const commissionRate = Number(affiliate.commissionRateOverride ?? program?.commissionRate ?? 0.1);
      const commissionAmount = salesAmount * commissionRate;
      const sourcePlatform = resolveAffiliateSourcePlatform({
        sourcePlatform: session?.sourcePlatform ?? null,
        sourceUrl: session?.sourceUrl ?? null,
        landingSite,
        referringSite,
        bgRefCode
      });
      const hasLinkSignal = Boolean(clickId || refCode);
      const trackingMethod = buildAffiliateTrackingMethod({
        hasClickSignal: hasLinkSignal,
        hasCouponSignal: Boolean(couponCode),
        sourcePlatform
      });
      const sourceType = hasLinkSignal ? "link" : "coupon";
      const sourceUrl = landingSite ?? referringSite;

      // Shopify's order "name" is the human-readable order number ("#1001").
      // Stored on the attribution row so the cron reconciler can link it to
      // the internal Order once the 2h sync pulls it — the webhook usually
      // fires long before that sync.
      const externalOrderNumber = normalizeExternalOrderNumber(payload?.name, payload?.order_number);
      // Malformed created_at ('' or garbage) must not become an Invalid
      // Date — Prisma would reject it and 500 the delivery into a retry loop.
      const parsedCreatedAt = new Date(payload?.created_at ?? Date.now());
      const occurredAt = isNaN(parsedCreatedAt.getTime()) ? new Date() : parsedCreatedAt;
      const attributionData = {
        sourceType,
        trackingMethod,
        sourceUrl,
        contentTitle: null,
        salesAmount,
        commissionAmount,
        ordersCount: 1,
        couponCode: couponCode ? String(couponCode) : null,
        externalOrderNumber,
        occurredAt
      };

      if (internalOrder) {
        // A pre-sync delivery may have left an orphan row (orderId null) for
        // this same order — link/absorb it FIRST so the upsert below updates
        // that row instead of creating a duplicate that double-counts the
        // member's totals. (Same pattern as the BixGrow webhook handler.)
        if (externalOrderNumber) {
          await reconcileAffiliateAttributionOrphans(store.id, { orderNumber: externalOrderNumber }).catch(() => null);
        }
        await db.affiliateAttribution.upsert({
          where: { affiliateMemberId_orderId: { affiliateMemberId: affiliate.id, orderId: internalOrder.id } },
          update: attributionData,
          create: { storeId: store.id, affiliateMemberId: affiliate.id, orderId: internalOrder.id, ...attributionData }
        });
      } else {
        // No internal Order row yet. The compound unique (affiliateMemberId,
        // orderId) can't upsert on a null orderId, so dedupe orphans by the
        // external order number instead (orders/create + orders/updated both
        // hit this path); the reconciler links them to the Order later.
        const orphan = externalOrderNumber
          ? await db.affiliateAttribution.findFirst({
              where: { storeId: store.id, affiliateMemberId: affiliate.id, orderId: null, externalOrderNumber },
              select: { id: true }
            }).catch(() => null)
          : null;
        if (orphan) {
          await db.affiliateAttribution.update({ where: { id: orphan.id }, data: attributionData });
        } else {
          await db.affiliateAttribution.create({
            data: { storeId: store.id, affiliateMemberId: affiliate.id, orderId: null, ...attributionData }
          });
        }
      }

      if (session && db.attributionSession) {
        await db.attributionSession.update({ where: { id: session.id }, data: { convertedAt: occurredAt } });
      }

      const rows = await db.affiliateAttribution.findMany({ where: { storeId: store.id, affiliateMemberId: affiliate.id } });
      const salesTotal = rows.reduce((sum: number, row: any) => sum + Number(row.salesAmount ?? 0), 0);
      const commissionTotal = rows.reduce((sum: number, row: any) => sum + Number(row.commissionAmount ?? 0), 0);
      const ordersTotal = rows.reduce((sum: number, row: any) => sum + Number(row.ordersCount ?? 0), 0);
      // approvedBalance = money still owed; paid/cancelled/refunded rows
      // must not resurrect into it (commissionTotal stays lifetime).
      const approvedBalance = rows
        .filter((row: any) => row.payoutStatus === "unpaid" || row.payoutStatus === "approved")
        .reduce((sum: number, row: any) => sum + Number(row.commissionAmount ?? 0), 0);
      await db.affiliateMember.update({ where: { id: affiliate.id }, data: { salesTotal, commissionTotal, approvedBalance, ordersTotal } });
    }

    await updateWebhookEventStatus(webhookEvent?.id ?? null, "processed");
    return { ok: true, storeId: store.id };
  } catch (error) {
    await updateWebhookEventStatus(webhookEvent?.id ?? null, "error", error instanceof Error ? error.message : "Webhook processing failed.");
    throw error;
  }
}
