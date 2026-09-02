// The Homepage Slot Score (HSS) is the Idea Engine's first product-level
// scorer. These tests pin the ranking math so a weight change or a guard
// regression is caught before it reaches a merchant's homepage recommendation.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  computeHomepageScores,
  type MerchandiserCandidate
} from "../../lib/services/homepage-merchandiser-service";

const base: MerchandiserCandidate = {
  productId: "p",
  title: "P",
  handle: "p",
  price: 100,
  effectiveUnitCost: 60,
  marginPct: 40,
  unitsCurrent: 10,
  unitsPrior: 10,
  revenueCurrent: 1000,
  inventoryQuantity: 1000,
  windowDays: 28
};

test("empty input yields no scores", () => {
  assert.deepEqual(computeHomepageScores([]), []);
});

test("higher margin + demand + momentum ranks first", () => {
  const strong: MerchandiserCandidate = {
    ...base,
    productId: "strong",
    price: 200,
    effectiveUnitCost: 60, // margin 140
    revenueCurrent: 5000,
    unitsCurrent: 40,
    unitsPrior: 10 // +30 momentum
  };
  const weak: MerchandiserCandidate = {
    ...base,
    productId: "weak",
    price: 100,
    effectiveUnitCost: 90, // margin 10
    revenueCurrent: 200,
    unitsCurrent: 5,
    unitsPrior: 10 // declining
  };
  const scored = computeHomepageScores([weak, strong]);
  assert.equal(scored[0].productId, "strong");
  assert.equal(scored[1].productId, "weak");
  assert.ok(scored[0].hss > scored[1].hss);
  assert.equal(scored[0].move, "promote");
});

test("out-of-stock is forced to 0 and marked remove regardless of margin", () => {
  const richButEmpty: MerchandiserCandidate = {
    ...base,
    productId: "oos",
    price: 500,
    effectiveUnitCost: 50, // huge margin
    revenueCurrent: 9999,
    inventoryQuantity: 0
  };
  const ok: MerchandiserCandidate = { ...base, productId: "ok" };
  const scored = computeHomepageScores([richButEmpty, ok]);
  const oos = scored.find((s) => s.productId === "oos")!;
  assert.equal(oos.hss, 0);
  assert.equal(oos.flags.outOfStock, true);
  assert.equal(oos.move, "remove");
  assert.match(oos.reason.en, /out of stock/i);
});

test("stock cover below the hero floor caps the score and removes", () => {
  // 200 units on hand but ~20 units/day → ~10 days of cover, under the 14d floor.
  const thin: MerchandiserCandidate = {
    ...base,
    productId: "thin",
    price: 300,
    effectiveUnitCost: 30,
    revenueCurrent: 8000,
    unitsCurrent: 560, // /28d = 20/day → 200/20 = 10d cover
    unitsPrior: 100,
    inventoryQuantity: 200
  };
  const ok: MerchandiserCandidate = { ...base, productId: "ok" };
  const scored = computeHomepageScores([thin, ok]);
  const t = scored.find((s) => s.productId === "thin")!;
  assert.ok(t.hss <= 35, `expected cap ≤35, got ${t.hss}`);
  assert.equal(t.flags.lowStock, true);
  assert.equal(t.move, "remove");
  assert.match(t.reason.en, /low stock/i);
});

test("unknown inventory is neutral, never treated as out of stock", () => {
  const unknown: MerchandiserCandidate = {
    ...base,
    productId: "unknown",
    inventoryQuantity: null
  };
  const scored = computeHomepageScores([unknown]);
  assert.equal(scored[0].stockCoverDays, null);
  assert.equal(scored[0].flags.outOfStock, false);
  assert.equal(scored[0].flags.lowStock, false);
});

test("a strong margin leader gets a margin reason", () => {
  const marginLeader: MerchandiserCandidate = {
    ...base,
    productId: "margin",
    price: 300,
    effectiveUnitCost: 30, // margin 270, dominant
    revenueCurrent: 300,
    unitsCurrent: 1,
    unitsPrior: 1
  };
  const other: MerchandiserCandidate = {
    ...base,
    productId: "other",
    price: 100,
    effectiveUnitCost: 95,
    revenueCurrent: 100
  };
  const scored = computeHomepageScores([marginLeader, other]);
  const m = scored.find((s) => s.productId === "margin")!;
  assert.match(m.reason.en, /margin/i);
});
