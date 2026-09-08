// The action console must never render an action whose only reason is a
// competitor. Regression for the 8 Sep 2026 logic audit ("Byredo runs 288
// ads → move budget from Paz to 702"): the driver has to be a store number.

import { test } from "node:test";
import assert from "node:assert/strict";
import { __testing } from "@/lib/services/competitor-brief-service";

const { isGroundedAction, groundAnswer } = __testing;
const COMPETITORS = ["Byredo", "Sacara", "Le Labo"];

test("a store-number driver is grounded", () => {
  assert.equal(isGroundedAction({ action: "Move budget toward 702", driver: "702 returns ₪10.4 per ₪1 vs ₪4.4 on Paz" }, COMPETITORS), true);
});

test("a competitor-only driver is rejected", () => {
  assert.equal(isGroundedAction({ action: "Reallocate spend", driver: "Byredo runs 288 active ads without a homepage promotion" }, COMPETITORS), false);
});

test("a competitor named next to a store metric is allowed", () => {
  assert.equal(
    isGroundedAction({ action: "Hold price", driver: "Sacara cut 40% but your margin is 42%, so matching erodes profit" }, COMPETITORS),
    true
  );
});

test("a driver without any number is rejected", () => {
  assert.equal(isGroundedAction({ action: "Feature rising fragrances", driver: "Rising products deserve visibility" }, COMPETITORS), false);
});

test("legacy `why` is accepted as the driver", () => {
  assert.equal(isGroundedAction({ action: "Restock", why: "Amber & Tonka has 17 units and sells 13 a week" }, COMPETITORS), true);
});

test("groundAnswer drops ungrounded actions and normalizes levels", () => {
  const out = groundAnswer(
    {
      today: [
        { action: "A", driver: "Byredo has 288 ads", impact: "HIGH" as never },
        { action: "B", driver: "702 ROAS 10.4 vs Paz 4.4", impact: "High" as never, confidence: "medium", connected: ["Meta", " Shopify "] }
      ],
      thisWeek: [{ action: "C", driver: "no numbers here" }]
    },
    COMPETITORS
  );
  assert.ok(out);
  assert.equal(out!.today.length, 1);
  assert.equal(out!.today[0].action, "B");
  assert.equal(out!.today[0].impact, "high");
  assert.deepEqual(out!.today[0].connected, ["Meta", "Shopify"]);
  assert.equal(out!.thisWeek.length, 0);
});

test("groundAnswer returns null when nothing for today survives", () => {
  assert.equal(groundAnswer({ today: [{ action: "A", driver: "Byredo has 288 ads" }], thisWeek: [] }, COMPETITORS), null);
});
