import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { reconcileAffiliateAttributionOrphans } from "@/lib/services/affiliate-attribution-reconciler";

// Per-brand BixGrow webhook receiver.
//
//   POST /api/webhooks/bixgrow/<brand-slug>
//
// Each Store has a unique `bixgrowSlug` (configurable on the Settings page).
// The merchant configures a BixGrow webhook pointing at this URL; BixGrow
// POSTs one order at a time with the affiliate-attributed sale.
//
// Payload (matches the reference questionnairesApp project):
// {
//   order: {
//     date: "2026-06-08 10:00:00",
//     order: "#31701",
//     affiliate_name: "Dana",
//     affiliate_email: "dana@example.com",
//     affiliate_id: "AFF-123",
//     total: 198.5,
//     commissionable_sales: 198.5,
//     coupons: "DANA15",
//     status: "approved",
//     tracking_by: "coupon",
//     level: ""
//   }
// }
//
// We:
//   1. Resolve the slug → storeId. If the slug doesn't exist, return 404.
//   2. Upsert an AffiliateMember on (storeId, email).
//   3. Look up the matching Shopify Order by orderNumber if present.
//   4. Upsert an AffiliateAttribution row.
//
// Idempotency: the AffiliateAttribution table has a unique constraint on
// (affiliateMemberId, orderId), so re-deliveries of the same order
// safely update rather than duplicate.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface BixGrowOrderPayload {
  date?: string;
  order?: string;
  affiliate_name?: string;
  affiliate_email?: string;
  affiliate_id?: string;
  total?: number | string;
  commissionable_sales?: number | string;
  commission?: number | string;
  coupons?: string;
  status?: string;
  tracking_by?: string;
  level?: string;
}

function parseAmount(value: number | string | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { firstName: "Affiliate", lastName: "" };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function stripOrderHash(value: string): string {
  return value.replace(/^#/, "").trim();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ storeSlug: string }> }
) {
  const db = getDb();
  const { storeSlug } = await context.params;

  // 1. Resolve slug → storeId (validates the URL is bound to a real brand)
  const store = await db.store.findUnique({
    where: { bixgrowSlug: storeSlug },
    select: { id: true }
  });
  if (!store) {
    return NextResponse.json(
      { ok: false, error: "Unknown brand slug." },
      { status: 404 }
    );
  }

  // 2. Parse the order payload. BixGrow nests under .order; we tolerate
  // both shapes (with and without the wrapper) for resilience.
  let raw: any = null;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }
  const order: BixGrowOrderPayload = raw?.order ?? raw;
  if (!order?.affiliate_email || !order?.order) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields: affiliate_email, order." },
      { status: 400 }
    );
  }

  const affiliateEmail = String(order.affiliate_email).toLowerCase().trim();
  const orderNumberRaw = String(order.order);
  const orderNumber = stripOrderHash(orderNumberRaw);
  const total = parseAmount(order.total);
  const commission = parseAmount((order as any).commission ?? 0);
  const occurredAt = parseDate(order.date);
  const couponCode = (order.coupons ?? "").trim() || null;
  const sourceType = couponCode ? "coupon" : "link";
  const trackingMethod = (order.tracking_by ?? "").trim() || null;

  // 3. Upsert AffiliateMember by (storeId, email)
  const { firstName, lastName } = splitName(order.affiliate_name ?? "");
  const affiliateCode =
    (order.affiliate_id ?? "").trim() ||
    `${affiliateEmail.replace(/[^a-z0-9]/g, "")}-${firstName.slice(0, 6)}`;

  const member = await db.affiliateMember.upsert({
    where: { storeId_email: { storeId: store.id, email: affiliateEmail } },
    update: {
      // Track the most recent coupon we've seen for them
      ...(couponCode ? { couponCode } : {}),
      // Keep affiliate_id-derived code stable; don't overwrite an existing one
    },
    create: {
      storeId: store.id,
      firstName,
      lastName,
      email: affiliateEmail,
      status: "approved",
      source: "bixgrow_webhook",
      affiliateCode,
      couponCode
    },
    select: { id: true }
  });

  // 4. Best-effort match to a Shopify Order by orderNumber. BixGrow sends
  // the order id without our store's hash prefix; we try both forms.
  const orderRow = await db.order.findFirst({
    where: {
      storeId: store.id,
      OR: [{ orderNumber }, { orderNumber: `#${orderNumber}` }]
    },
    select: { id: true }
  });

  // If the order DOES match, run the reconciler for THIS order number
  // before we upsert. Closes the BixGrow re-delivery duplicate bug:
  //   - First delivery (order not yet in Shopify) → created orphan
  //   - Order syncs from Shopify
  //   - BixGrow re-delivers → reconciler now links the orphan in place,
  //     so the upsert below finds an existing matched row to update
  //     instead of creating a duplicate.
  if (orderRow) {
    await reconcileAffiliateAttributionOrphans(store.id, {
      orderNumber: `#${orderNumber}`
    }).catch((err) => {
      console.error("[bixgrow webhook] reconcile failed:", err);
    });
  }

  // 5. Upsert AffiliateAttribution. The unique key is (affiliateMemberId,
  // orderId) — if orderId is null (no Shopify match yet) we still record
  // the attribution but can't dedupe by order. For null-order rows we
  // dedupe by (date + amount + member).
  if (!orderRow) {
    const existingUnmatched = await db.affiliateAttribution.findFirst({
      where: {
        storeId: store.id,
        affiliateMemberId: member.id,
        orderId: null,
        occurredAt,
        salesAmount: total
      },
      select: { id: true }
    });
    if (existingUnmatched) {
      await db.affiliateAttribution.update({
        where: { id: existingUnmatched.id },
        data: {
          sourceType,
          trackingMethod,
          salesAmount: total,
          commissionAmount: commission
        }
      });
      return NextResponse.json({ ok: true, action: "updated_unmatched", orderNumber });
    }
    await db.affiliateAttribution.create({
      data: {
        storeId: store.id,
        affiliateMemberId: member.id,
        orderId: null,
        externalOrderNumber: `#${orderNumber}`,
        couponCode,
        sourceType,
        trackingMethod,
        salesAmount: total,
        commissionAmount: commission,
        ordersCount: 1,
        occurredAt
      }
    });
    return NextResponse.json({ ok: true, action: "created_unmatched", orderNumber });
  }

  // Order matched — upsert via the composite unique key
  await db.affiliateAttribution.upsert({
    where: {
      affiliateMemberId_orderId: {
        affiliateMemberId: member.id,
        orderId: orderRow.id
      }
    },
    update: {
      externalOrderNumber: `#${orderNumber}`,
      couponCode,
      sourceType,
      trackingMethod,
      salesAmount: total,
      commissionAmount: commission,
      occurredAt
    },
    create: {
      storeId: store.id,
      affiliateMemberId: member.id,
      orderId: orderRow.id,
      externalOrderNumber: `#${orderNumber}`,
      couponCode,
      sourceType,
      trackingMethod,
      salesAmount: total,
      commissionAmount: commission,
      ordersCount: 1,
      occurredAt
    }
  });

  return NextResponse.json({ ok: true, action: "upserted_matched", orderNumber });
}

// GET = health check + reflects the storeSlug so the merchant can quickly
// verify their URL is wired correctly from a browser.
export async function GET(
  _request: Request,
  context: { params: Promise<{ storeSlug: string }> }
) {
  const db = getDb();
  const { storeSlug } = await context.params;
  const store = await db.store.findUnique({
    where: { bixgrowSlug: storeSlug },
    select: { id: true, name: true }
  });
  if (!store) {
    return NextResponse.json({ ok: false, error: "Unknown brand slug." }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    brand: store.name,
    storeSlug,
    method: "POST",
    expects: "BixGrow order payload — see /SHOPIFY_CONNECT.md for the schema."
  });
}
