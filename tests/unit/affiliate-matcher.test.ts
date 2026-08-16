// Unit tests for matchAffiliateMemberForOrder — the coupon/ref matcher the
// 2h cron backfill runs unattended. The substring regression here is the
// one that attributed unrelated store-wide promos to affiliates.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:9/hermetic-test";

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchAffiliateMemberForOrder } from "@/lib/services/affiliate-portal-admin-service";

const members = [
  { id: "m-ana", affiliateCode: "ANA", couponCode: "ANA15" },
  { id: "m-dana", affiliateCode: "DANA", couponCode: "DANA20" },
  { id: "m-nocoupon", affiliateCode: "VIP", couponCode: null }
];
const coupons = [{ id: "c1", affiliateMemberId: "m-dana", code: "extra-dana" }];

test("matches by the member's own coupon code (exact, case-normalized input)", () => {
  const match = matchAffiliateMemberForOrder({ members, coupons, orderCodes: ["ANA15"] });
  assert.equal(match?.id, "m-ana");
});

test("matches by an assigned coupon from the coupon table", () => {
  const match = matchAffiliateMemberForOrder({ members, coupons, orderCodes: ["EXTRA-DANA"] });
  assert.equal(match?.id, "m-dana");
});

test("matches by exact affiliate code used as a discount code", () => {
  const match = matchAffiliateMemberForOrder({ members, coupons, orderCodes: ["VIP"] });
  assert.equal(match?.id, "m-nocoupon");
});

test("does NOT substring-match an unrelated promo code (regression)", () => {
  // 'ANA' is inside 'BANANA10' and 'VIP' is inside 'VIP20' — the old
  // includes() matcher attributed every such order to the affiliate.
  assert.equal(matchAffiliateMemberForOrder({ members, coupons, orderCodes: ["BANANA10"] }), null);
  assert.equal(matchAffiliateMemberForOrder({ members, coupons, orderCodes: ["VIP20"] }), null);
  assert.equal(matchAffiliateMemberForOrder({ members, coupons, orderCodes: ["SUMMERSALE10"] }), null);
});

test("matches by ref code case-insensitively", () => {
  const match = matchAffiliateMemberForOrder({ members, coupons, orderCodes: [], refCode: "dana" });
  assert.equal(match?.id, "m-dana");
});

test("returns null when nothing matches", () => {
  assert.equal(matchAffiliateMemberForOrder({ members, coupons, orderCodes: ["WELCOME10"] }), null);
  assert.equal(matchAffiliateMemberForOrder({ members, coupons, orderCodes: [], refCode: null }), null);
  assert.equal(matchAffiliateMemberForOrder({ members: [], coupons: [], orderCodes: ["ANA15"] }), null);
});
