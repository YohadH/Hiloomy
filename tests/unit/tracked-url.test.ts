// Unit tests for buildTrackedDestinationUrl — the URL shoppers are 307'd to
// from the public affiliate redirect.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:9/hermetic-test";

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrackedDestinationUrl } from "@/lib/services/affiliate-link-tracking-service";

test("carries ref, click id, and coupon onto the storefront URL", () => {
  const url = new URL(
    buildTrackedDestinationUrl({
      shopDomain: "shop.myshopify.com",
      destinationPath: "/products/rose-oud",
      couponCode: "SARA15",
      affiliateCode: "SARA",
      clickId: "click-123"
    })
  );
  assert.equal(url.host, "shop.myshopify.com");
  assert.equal(url.pathname, "/products/rose-oud");
  assert.equal(url.searchParams.get("ref"), "SARA");
  assert.equal(url.searchParams.get("agent_click_id"), "click-123");
  assert.equal(url.searchParams.get("coupon"), "SARA15");
  assert.equal(url.searchParams.get("bg_ref"), null);
});

test("preserves existing query params on the destination", () => {
  const url = new URL(
    buildTrackedDestinationUrl({
      shopDomain: "shop.myshopify.com",
      destinationPath: "/collections/summer?sort_by=price-ascending",
      affiliateCode: "SARA",
      clickId: "click-123"
    })
  );
  assert.equal(url.searchParams.get("sort_by"), "price-ascending");
  assert.equal(url.searchParams.get("ref"), "SARA");
});

test("adds bg_ref only for BixGrow-platform sessions", () => {
  const bixgrow = new URL(
    buildTrackedDestinationUrl({
      shopDomain: "shop.myshopify.com",
      affiliateCode: "SARA",
      clickId: "click-123",
      sourcePlatform: "bixgrow"
    })
  );
  assert.equal(bixgrow.searchParams.get("bg_ref"), "SARA");

  const instagram = new URL(
    buildTrackedDestinationUrl({
      shopDomain: "shop.myshopify.com",
      affiliateCode: "SARA",
      clickId: "click-123",
      sourcePlatform: "instagram"
    })
  );
  assert.equal(instagram.searchParams.get("bg_ref"), null);
});

test("utm params pass through when present", () => {
  const url = new URL(
    buildTrackedDestinationUrl({
      shopDomain: "shop.myshopify.com",
      affiliateCode: "SARA",
      clickId: "click-123",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "launch"
    })
  );
  assert.equal(url.searchParams.get("utm_source"), "instagram");
  assert.equal(url.searchParams.get("utm_medium"), "social");
  assert.equal(url.searchParams.get("utm_campaign"), "launch");
});
