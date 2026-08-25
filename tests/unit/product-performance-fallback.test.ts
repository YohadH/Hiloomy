// buildProductPerformance must never drop a sold line (F-019/F-024/F-032):
// lines with a null productId, or a productId whose Product row is missing,
// fall back to the line's own title instead of silently vanishing — the
// "table empty while the totals are populated" symptom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductPerformance } from "@/lib/server/analytics";
import type { Order } from "@/lib/domain/types";

function order(id: string, lineItems: Order["lineItems"]): Order {
  return {
    id,
    customerId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    orderNumber: id,
    isRefunded: false,
    refundAmount: 0,
    lineItems
  };
}

const line = (over: Partial<Order["lineItems"][number]>): Order["lineItems"][number] => ({
  productId: null,
  title: null,
  quantity: 1,
  unitPrice: 100,
  discountAmount: 0,
  estimatedCost: 30,
  refundedQuantity: 0,
  refundedSubtotal: 0,
  ...over
});

test("known product groups under its productId", () => {
  const lookup = new Map([["p1", { title: "Molecule 50", collection: "Perfumes" }]]);
  const rows = buildProductPerformance([order("o1", [line({ productId: "p1", quantity: 2 })])], lookup);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productId, "p1");
  assert.equal(rows[0].productTitle, "Molecule 50");
  assert.equal(rows[0].revenue, 200);
});

test("null productId falls back to the line title instead of being dropped", () => {
  const rows = buildProductPerformance(
    [order("o1", [line({ title: "מארז בודי מיסט" })])],
    new Map()
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productTitle, "מארז בודי מיסט");
  assert.equal(rows[0].revenue, 100);
});

test("productId with no Product row falls back to the title, revenue preserved", () => {
  const rows = buildProductPerformance(
    [
      order("o1", [
        line({ productId: "deleted", title: "Ghost product" }),
        line({ productId: "deleted", title: "Ghost product", quantity: 3 })
      ])
    ],
    new Map()
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].revenue, 400);
  assert.equal(rows[0].unitsSold, 4);
});

test("total revenue is preserved across mixed known/unknown lines", () => {
  const lookup = new Map([["p1", { title: "Known", collection: "" }]]);
  const rows = buildProductPerformance(
    [order("o1", [line({ productId: "p1" }), line({ title: "Unknown A" }), line({})])],
    lookup
  );
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  assert.equal(total, 300);
});
