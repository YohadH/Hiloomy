import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { processShopifyOrderWebhook, verifyShopifyWebhookSignature } from "@/lib/services/shopify-webhook-service";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256");
    const shopDomain = request.headers.get("x-shopify-shop-domain");
    const topic = request.headers.get("x-shopify-topic") ?? "orders/create";

    if (!shopDomain) {
      return NextResponse.json({ ok: false, error: "Missing shop domain header." }, { status: 400 });
    }
    if (!(await verifyShopifyWebhookSignature(rawBody, signature))) {
      return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const result = await processShopifyOrderWebhook(shopDomain, payload, topic);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
