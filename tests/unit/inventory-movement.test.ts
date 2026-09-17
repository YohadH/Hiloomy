// Inventory movement by location: a PO lands at the warehouse, is split to
// the stores, the stores sell. Derived "in" / "out" from snapshots + sales;
// unknown opening stays unknown (history starts later), never zero.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMovement, sumMovements } from "@/lib/domain/inventory-movement";

const locations = [
  { id: "wh", name: "מחסן לוגיסטי" },
  { id: "tlv", name: "סניף תל אביב" },
  { id: "rs", name: "סניף רמת השרון" }
];

test("PO at the warehouse split to two stores, stores sell: in / out / sold / closing per location and the total row", () => {
  const m = computeMovement({
    locations,
    opening: [
      { shopifyVariantId: "v1", shopifyLocationId: "wh", locationName: "מחסן לוגיסטי", available: 10 },
      { shopifyVariantId: "v1", shopifyLocationId: "tlv", locationName: "סניף תל אביב", available: 2 },
      { shopifyVariantId: "v1", shopifyLocationId: "rs", locationName: "סניף רמת השרון", available: 0 }
    ],
    // PO +100 at the warehouse, then 30 → TLV and 20 → RS.
    closing: [
      { shopifyVariantId: "v1", shopifyLocationId: "wh", locationName: "מחסן לוגיסטי", available: 60 },
      { shopifyVariantId: "v1", shopifyLocationId: "tlv", locationName: "סניף תל אביב", available: 25 },
      { shopifyVariantId: "v1", shopifyLocationId: "rs", locationName: "סניף רמת השרון", available: 14 }
    ],
    sold: [
      { shopifyVariantId: "v1", shopifyLocationId: "tlv", units: 7 },
      { shopifyVariantId: "v1", shopifyLocationId: "rs", units: 6 },
      { shopifyVariantId: "v1", shopifyLocationId: null, units: 3 } // online, no location yet
    ]
  });
  const v = m.get("v1")!;
  const wh = v.locations.find((l) => l.locationId === "wh")!;
  const tlv = v.locations.find((l) => l.locationId === "tlv")!;
  const rs = v.locations.find((l) => l.locationId === "rs")!;
  // Warehouse: 10 → 60 with 0 sold = net +50 (PO 100 minus 50 shipped out shows as +50 net).
  assert.deepEqual([wh.opening, wh.inbound, wh.sold, wh.outbound, wh.closing], [10, 50, 0, 0, 60]);
  // TLV: 2 → 25 with 7 sold = +30 in.
  assert.deepEqual([tlv.opening, tlv.inbound, tlv.sold, tlv.outbound, tlv.closing], [2, 30, 7, 0, 25]);
  assert.deepEqual([rs.opening, rs.inbound, rs.sold, rs.outbound, rs.closing], [0, 20, 6, 0, 14]);
  assert.deepEqual([v.total.opening, v.total.inbound, v.total.sold, v.total.outbound, v.total.closing], [12, 100, 16, 0, 99]);
  assert.equal(v.unlocatedSold, 3);
  assert.deepEqual(v.locations.map((l) => l.locationId), ["wh", "tlv", "rs"], "store order follows the location list");
});

test("a transfer out of the warehouse shows as 'out' there and 'in' at the store", () => {
  const m = computeMovement({
    locations,
    opening: [{ shopifyVariantId: "v1", shopifyLocationId: "wh", locationName: "w", available: 40 }],
    closing: [
      { shopifyVariantId: "v1", shopifyLocationId: "wh", locationName: "w", available: 25 },
      { shopifyVariantId: "v1", shopifyLocationId: "tlv", locationName: "t", available: 15 }
    ],
    sold: []
  });
  const v = m.get("v1")!;
  assert.equal(v.locations.find((l) => l.locationId === "wh")!.outbound, 15);
  assert.equal(v.locations.find((l) => l.locationId === "tlv")!.inbound, 15);
  assert.equal(v.locations.find((l) => l.locationId === "tlv")!.opening, 0, "missing from an existing snapshot = genuine zero");
});

test("no opening snapshot → opening, in and out are unknown (null), sold and closing still known", () => {
  const m = computeMovement({
    locations,
    opening: [],
    closing: [{ shopifyVariantId: "v1", shopifyLocationId: "tlv", locationName: "t", available: 9 }],
    sold: [{ shopifyVariantId: "v1", shopifyLocationId: "tlv", units: 4 }]
  });
  const l = m.get("v1")!.locations[0];
  assert.equal(l.opening, null);
  assert.equal(l.inbound, null);
  assert.equal(l.outbound, null);
  assert.equal(l.sold, 4);
  assert.equal(l.closing, 9);
  assert.equal(m.get("v1")!.total.opening, null);
});

test("sumMovements folds a product's variants per location, and the total row carries unlocated sales", () => {
  const m = computeMovement({
    locations,
    opening: [
      { shopifyVariantId: "v1", shopifyLocationId: "tlv", locationName: "t", available: 5 },
      { shopifyVariantId: "v2", shopifyLocationId: "tlv", locationName: "t", available: 3 }
    ],
    closing: [
      { shopifyVariantId: "v1", shopifyLocationId: "tlv", locationName: "t", available: 2 },
      { shopifyVariantId: "v2", shopifyLocationId: "tlv", locationName: "t", available: 1 }
    ],
    sold: [
      { shopifyVariantId: "v1", shopifyLocationId: "tlv", units: 3 },
      { shopifyVariantId: "v2", shopifyLocationId: "tlv", units: 2 },
      { shopifyVariantId: "v2", shopifyLocationId: null, units: 1 }
    ]
  });
  const p = sumMovements([m.get("v1")!, m.get("v2")!]);
  assert.equal(p.locations.length, 1);
  assert.deepEqual([p.locations[0].opening, p.locations[0].sold, p.locations[0].closing], [8, 5, 3]);
  assert.equal(p.total.sold, 6);
  assert.equal(p.unlocatedSold, 1);
});
