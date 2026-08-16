// Unit tests for the public redirect route's open-redirect guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDestinationPath } from "@/lib/services/affiliate-link-tracking-service";

test("defaults to / when destination is missing", () => {
  assert.equal(sanitizeDestinationPath(null), "/");
  assert.equal(sanitizeDestinationPath(undefined), "/");
  assert.equal(sanitizeDestinationPath(""), "/");
});

test("passes normal same-store paths through, including query strings", () => {
  assert.equal(sanitizeDestinationPath("/"), "/");
  assert.equal(sanitizeDestinationPath("/products/rose-oud"), "/products/rose-oud");
  assert.equal(
    sanitizeDestinationPath("/collections/summer?sort_by=price-ascending"),
    "/collections/summer?sort_by=price-ascending"
  );
});

test("keeps legitimate paths containing @ (the guard must not over-block)", () => {
  // With the host fixed and the path '/'-anchored, '@' can never reach the
  // URL authority — rewriting these to '/' silently broke campaign links.
  assert.equal(
    sanitizeDestinationPath("/pages/contact?email=support@brand.com"),
    "/pages/contact?email=support@brand.com"
  );
  assert.equal(sanitizeDestinationPath("/search?q=@handle"), "/search?q=@handle");
});

test("rewrites protocol-relative and absolute URLs to /", () => {
  assert.equal(sanitizeDestinationPath("//evil.com/phish"), "/");
  assert.equal(sanitizeDestinationPath("https://evil.com"), "/");
  assert.equal(sanitizeDestinationPath("http://evil.com"), "/");
});

test("rewrites backslash variants to / (WHATWG treats \\ like /)", () => {
  assert.equal(sanitizeDestinationPath("/\\evil.com"), "/");
  assert.equal(sanitizeDestinationPath("\\\\evil.com"), "/");
  assert.equal(sanitizeDestinationPath("/products\\..\\evil"), "/");
});

test("rewrites non-rooted values to /", () => {
  assert.equal(sanitizeDestinationPath("evil.com"), "/");
  assert.equal(sanitizeDestinationPath("javascript:alert(1)"), "/");
  assert.equal(sanitizeDestinationPath("@evil.com"), "/");
});

test("resulting URL host stays the store domain for every accepted path", () => {
  // Property check: whatever the guard lets through must never change the
  // host once concatenated onto the store domain.
  const samples = [
    "/",
    "/products/x",
    "/pages/contact?email=a@b.com",
    "/..@evil.com",
    "/a/../@evil.com",
    "/%2F%2Fevil.com"
  ];
  for (const raw of samples) {
    const path = sanitizeDestinationPath(raw);
    const url = new URL(`https://shop.myshopify.com${path}`);
    assert.equal(url.host, "shop.myshopify.com", `host escaped for input: ${raw}`);
  }
});
