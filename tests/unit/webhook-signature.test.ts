// Unit tests for verifyShopifyWebhookSignature — the gate every Shopify
// order webhook passes through. Run via `npm test` (node:test + tsx).
//
// DATABASE_URL is pointed at a closed local port BEFORE the module import so
// the DB-stored-secret fallback fails fast instead of touching a real DB
// (Prisma auto-loads .env, but it never overrides an already-set env var).
process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:9/hermetic-test";
process.env.DIRECT_URL = "postgresql://user:pass@127.0.0.1:9/hermetic-test";

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyShopifyWebhookSignature } from "@/lib/services/shopify-webhook-service";

const BODY = JSON.stringify({ id: 123, name: "#1001", total_price: "99.00" });

function sign(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

beforeEach(() => {
  delete process.env.SHOPIFY_WEBHOOK_SECRET;
  delete process.env.SHOPIFY_CLIENT_SECRET;
});

test("accepts a signature made with SHOPIFY_WEBHOOK_SECRET", async () => {
  process.env.SHOPIFY_WEBHOOK_SECRET = "manual-webhook-secret";
  assert.equal(await verifyShopifyWebhookSignature(BODY, sign(BODY, "manual-webhook-secret")), true);
});

test("accepts a signature made with the client secret (OAuth-registered webhooks)", async () => {
  process.env.SHOPIFY_CLIENT_SECRET = "partner-client-secret";
  assert.equal(await verifyShopifyWebhookSignature(BODY, sign(BODY, "partner-client-secret")), true);
});

test("accepts the client secret even when a different SHOPIFY_WEBHOOK_SECRET is also set", async () => {
  // The historical trap: webhook secret env set to the wrong value used to
  // 401 every delivery even though the client secret was correct.
  process.env.SHOPIFY_WEBHOOK_SECRET = "stale-wrong-secret";
  process.env.SHOPIFY_CLIENT_SECRET = "partner-client-secret";
  assert.equal(await verifyShopifyWebhookSignature(BODY, sign(BODY, "partner-client-secret")), true);
});

test("rejects a signature made with the wrong secret", async () => {
  process.env.SHOPIFY_CLIENT_SECRET = "partner-client-secret";
  assert.equal(await verifyShopifyWebhookSignature(BODY, sign(BODY, "attacker-secret")), false);
});

test("rejects a tampered body", async () => {
  process.env.SHOPIFY_CLIENT_SECRET = "partner-client-secret";
  const signature = sign(BODY, "partner-client-secret");
  assert.equal(await verifyShopifyWebhookSignature(BODY + "x", signature), false);
});

test("rejects a malformed/truncated signature without throwing", async () => {
  // crypto.timingSafeEqual throws on length mismatch — the verifier must
  // treat that as a plain reject (401), not a 500.
  process.env.SHOPIFY_CLIENT_SECRET = "partner-client-secret";
  assert.equal(await verifyShopifyWebhookSignature(BODY, "garbage"), false);
  assert.equal(await verifyShopifyWebhookSignature(BODY, ""), false);
});

test("returns false when the signature header is missing", async () => {
  process.env.SHOPIFY_CLIENT_SECRET = "partner-client-secret";
  assert.equal(await verifyShopifyWebhookSignature(BODY, null), false);
});

test("throws when no secret is configured anywhere", async () => {
  await assert.rejects(
    () => verifyShopifyWebhookSignature(BODY, sign(BODY, "whatever")),
    /No webhook secret available/
  );
});
