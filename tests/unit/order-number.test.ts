// Unit tests for normalizeExternalOrderNumber — the value the reconciler
// uses to link webhook-created orphan attributions to synced Orders.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:9/hermetic-test";

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeExternalOrderNumber } from "@/lib/services/shopify-webhook-service";

test("keeps an already-hashed order name", () => {
  assert.equal(normalizeExternalOrderNumber("#1001", 1001), "#1001");
});

test("adds the leading # to a bare name", () => {
  assert.equal(normalizeExternalOrderNumber("1001", null), "#1001");
});

test("falls back to order_number when name is missing", () => {
  assert.equal(normalizeExternalOrderNumber(undefined, 1001), "#1001");
  assert.equal(normalizeExternalOrderNumber(null, 1001), "#1001");
});

test("falls back to order_number when name is an empty or blank string", () => {
  assert.equal(normalizeExternalOrderNumber("", 1001), "#1001");
  assert.equal(normalizeExternalOrderNumber("   ", 1001), "#1001");
});

test("ignores non-string names (partial payloads)", () => {
  assert.equal(normalizeExternalOrderNumber(12345 as unknown, 1001), "#1001");
});

test("returns null when neither field is present", () => {
  assert.equal(normalizeExternalOrderNumber(undefined, undefined), null);
  assert.equal(normalizeExternalOrderNumber(null, null), null);
  assert.equal(normalizeExternalOrderNumber("", null), null);
});

test("order_number 0 is still a usable number", () => {
  assert.equal(normalizeExternalOrderNumber(null, 0), "#0");
});
