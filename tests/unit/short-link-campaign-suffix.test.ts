// Campaign-aware short links (ported from the Creators project, 2026-09-26):
// {token}-{campaignCode}. The token is unchanged; the suffix names a campaign
// that rides on the click session and onto the order attribution.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCampaignCode, parseShortLinkToken, shortLinkUrl, appProxyShortLinkUrl } from "@/lib/services/affiliate-short-link-service";

test("a plain token has no campaign", () => {
  assert.deepEqual(parseShortLinkToken("k7m2pq"), { token: "k7m2pq", campaignCode: null });
});

test("the first dash splits token and campaign; the campaign is normalized", () => {
  assert.deepEqual(parseShortLinkToken("k7m2pq-Summer"), { token: "k7m2pq", campaignCode: "summer" });
  assert.deepEqual(parseShortLinkToken("k7m2pq-rosh-hashana-2026"), { token: "k7m2pq", campaignCode: "rosh-hashana-2026" });
  assert.deepEqual(parseShortLinkToken("k7m2pq-%D7%A7%D7%99%D7%A5"), { token: "k7m2pq", campaignCode: "קיץ" });
});

test("normalization: lowercase, a-z0-9 and Hebrew only, dashes collapsed, max 24 chars", () => {
  assert.equal(normalizeCampaignCode(" Summer Sale!! 2026 "), "summer-sale-2026");
  assert.equal(normalizeCampaignCode("---"), null);
  assert.equal(normalizeCampaignCode("x".repeat(40))?.length, 24);
  assert.equal(normalizeCampaignCode(null), null);
});

test("URL builders append the suffix only when a campaign is given", () => {
  assert.match(shortLinkUrl("k7m2pq"), /\/l\/k7m2pq$/);
  assert.match(shortLinkUrl("k7m2pq", "Summer"), /\/l\/k7m2pq-summer$/);
  assert.equal(appProxyShortLinkUrl("brand.myshopify.com", "k7m2pq", "summer"), "https://brand.myshopify.com/apps/go/k7m2pq-summer");
  assert.equal(appProxyShortLinkUrl("brand.myshopify.com", "k7m2pq", ""), "https://brand.myshopify.com/apps/go/k7m2pq");
});
