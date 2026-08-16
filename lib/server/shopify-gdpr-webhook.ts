// Shared handler factory for Shopify's mandatory compliance webhooks.
//
// Shopify's automated checks REQUIRE a 401 response when the HMAC is
// invalid or missing — anything else fails app review. Success must be a
// 2xx within 5 seconds; the processors are all fast DB operations.

import { NextResponse } from "next/server";
import { verifyShopifyWebhookSignature } from "@/lib/services/shopify-webhook-service";
import { toErrorMessage } from "@/lib/server/errors";

type GdprProcessor = (
  shopDomain: string,
  payload: Record<string, unknown>
) => Promise<{ ok: true; action: string; detail?: string }>;

export function createGdprWebhookHandler(processor: GdprProcessor) {
  return async function POST(request: Request) {
    const rawBody = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256");
    if (!(await verifyShopifyWebhookSignature(rawBody, signature))) {
      return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    const shopDomain =
      request.headers.get("x-shopify-shop-domain") ??
      (typeof payload["shop_domain"] === "string" ? (payload["shop_domain"] as string) : "");
    if (!shopDomain) {
      return NextResponse.json({ ok: false, error: "Missing shop domain." }, { status: 400 });
    }

    try {
      const result = await processor(shopDomain, payload);
      return NextResponse.json(result);
    } catch (error) {
      // Record-then-act means the ledger already holds the failure detail;
      // return 500 so Shopify retries the delivery.
      return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
    }
  };
}
