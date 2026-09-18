// Inventory flow by location — the owner's acceptance cases (18 Sep 2026)
// plus the hardening cases: external receipt vs transfer-in, in-transit for
// partial transfers, classified residuals (probable internal transfer vs
// unclassified increase/decrease), gross vs returns vs net sales, and the
// business identity that must close EXACTLY in every scenario:
//   opening + external + unclassified increase + returns + adjustments
//   − net sold − unclassified decrease = on hand + in transit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLedger, saleEvents, sumLedgers, type BusinessLedger, type LevelPoint, type MovementEvent } from "@/lib/domain/inventory-movement";

const locations = [
  { id: "wh", name: "Main Warehouse" },
  { id: "tlv", name: "Tel Aviv" },
  { id: "rishon", name: "Rishon" },
  { id: "ashkelon", name: "Ashkelon" }
];
const lvl = (v: string, l: string, available: number): LevelPoint => ({ shopifyVariantId: v, shopifyLocationId: l, locationName: locations.find((x) => x.id === l)!.name, available });
const transfer = (v: string, from: string, to: string, shipped: number, received: number, id: string): MovementEvent[] => [
  { shopifyVariantId: v, locationId: from, type: "TRANSFER_OUT", quantity: shipped, occurredAt: "2026-09-05T10:00:00Z", sourceType: "SHOPIFY_TRANSFER", sourceId: `${id}:out`, precision: "exact", reference: id },
  ...(received > 0 ? [{ shopifyVariantId: v, locationId: to, type: "TRANSFER_IN" as const, quantity: received, occurredAt: "2026-09-06T10:00:00Z", sourceType: "SHOPIFY_TRANSFER" as const, sourceId: `${id}:in`, precision: "exact" as const, reference: id }] : [])
];
const po = (v: string, l: string, qty: number): MovementEvent => ({ shopifyVariantId: v, locationId: l, type: "PO_RECEIPT", quantity: qty, occurredAt: "2026-09-03T08:00:00Z", sourceType: "HILOOMY_PO", sourceId: `PO-1042:${v}`, precision: "exact", reference: "PO 1042" });
const sale = (v: string, l: string | null, units: number, returned = 0, channel: "pos" | "fulfillment" | "unknown" = "pos") => saleEvents([{ shopifyVariantId: v, locationId: l, channel, units, returned, occurredAt: "2026-09-10T00:00:00Z" }]);

// The identity every scenario must satisfy when the opening is known.
const reconciles = (t: BusinessLedger) => {
  if (t.opening === null) return;
  assert.equal(t.reconciliationGap, 0, `ledger must close: gap ${t.reconciliationGap}`);
  assert.equal(t.inventory, t.onHand + t.inTransit);
};

test("ACCEPTANCE — Sep 1–18: PO +100 at the warehouse, 30/20/20 transferred, 12/8/4 sold", () => {
  const opening = locations.map((l) => lvl("A", l.id, 0));
  const closing = [lvl("A", "wh", 30), lvl("A", "tlv", 18), lvl("A", "rishon", 12), lvl("A", "ashkelon", 16)];
  const events: MovementEvent[] = [po("A", "wh", 100), ...transfer("A", "wh", "tlv", 30, 30, "T1"), ...transfer("A", "wh", "rishon", 20, 20, "T2"), ...transfer("A", "wh", "ashkelon", 20, 20, "T3"), ...sale("A", "tlv", 12), ...sale("A", "rishon", 8), ...sale("A", "ashkelon", 4)];
  const v = computeLedger({ opening, closing, events, locations }).get("A")!;
  const at = (id: string) => v.locations.find((l) => l.locationId === id)!;
  const wh = at("wh");
  assert.deepEqual([wh.opening, wh.receivedExternal, wh.transferIn, wh.sold, wh.transferOut, wh.adjustments, wh.residual, wh.closing], [0, 100, 0, 0, 70, 0, 0, 30]);
  const tlv = at("tlv");
  assert.deepEqual([tlv.opening, tlv.receivedExternal, tlv.transferIn, tlv.sold, tlv.soldPos, tlv.transferOut, tlv.residual, tlv.closing], [0, 0, 30, 12, 12, 0, 0, 18]);
  assert.deepEqual([at("rishon").transferIn, at("rishon").sold, at("rishon").closing], [20, 8, 12]);
  assert.deepEqual([at("ashkelon").transferIn, at("ashkelon").sold, at("ashkelon").closing], [20, 4, 16]);
  // BUSINESS TOTAL: external received 100, transfers cancel, 70 redistributed.
  assert.deepEqual([v.total.opening, v.total.receivedExternal, v.total.receivedUnclassified, v.total.sold, v.total.adjustments, v.total.onHand], [0, 100, 0, 24, 0, 76]);
  assert.equal(v.total.redistributed, 70);
  assert.equal(v.total.inTransit, 0);
  assert.equal(v.total.inventory, 76);
  reconciles(v.total);
  assert.equal(v.locations.map((l) => l.locationId).join(","), "wh,tlv,rishon,ashkelon");
});

test("external receipt is never merged with transfer-in: a store that received a transfer shows 0 external", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "wh", 100), lvl("A", "tlv", 0)], closing: [lvl("A", "wh", 70), lvl("A", "tlv", 30)], events: transfer("A", "wh", "tlv", 30, 30, "T1") }).get("A")!;
  const tlv = v.locations.find((l) => l.locationId === "tlv")!;
  assert.equal(tlv.receivedExternal, 0);
  assert.equal(tlv.transferIn, 30);
  assert.equal(v.total.receivedExternal, 0, "a transfer is not new stock for the business");
  reconciles(v.total);
});

test("IN TRANSIT — the warehouse shipped 30, Tel Aviv received 20: 10 are in transit and the business total keeps them", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "wh", 100), lvl("A", "tlv", 0)], closing: [lvl("A", "wh", 70), lvl("A", "tlv", 20)], events: transfer("A", "wh", "tlv", 30, 20, "T1") }).get("A")!;
  assert.equal(v.locations.find((l) => l.locationId === "wh")!.transferOut, 30);
  assert.equal(v.locations.find((l) => l.locationId === "tlv")!.transferIn, 20);
  assert.equal(v.total.onHand, 90);
  assert.equal(v.total.inTransit, 10);
  assert.equal(v.total.inventory, 100, "physical 90 + in transit 10 = business inventory 100");
  reconciles(v.total);
});

test("a transfer the events missed is PAIRED as a probable internal transfer (medium), not two adjustments, and does not become 'received'", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "wh", 100), lvl("A", "tlv", 0)], closing: [lvl("A", "wh", 70), lvl("A", "tlv", 30)], events: [] }).get("A")!;
  const wh = v.locations.find((l) => l.locationId === "wh")!;
  const tlv = v.locations.find((l) => l.locationId === "tlv")!;
  assert.equal(wh.residual, -30);
  assert.equal(wh.probableTransferOut, 30);
  assert.equal(wh.unclassifiedDecrease, 0);
  assert.equal(tlv.probableTransferIn, 30);
  assert.equal(tlv.receivedUnclassified, 0);
  assert.equal(wh.transferOut, 0, "never presented as an exact transfer");
  assert.deepEqual(v.total.probableTransfers, [{ fromLocationId: "wh", fromLocationName: "Main Warehouse", toLocationId: "tlv", toLocationName: "Tel Aviv", quantity: 30, confidence: "medium" }]);
  assert.equal(v.total.probableRedistributed, 30);
  assert.equal(v.total.receivedUnclassified, 0);
  reconciles(v.total);
});

test("UNCLASSIFIED INCREASE — 100 units arrived at the warehouse with no PO recorded: counted as received into the business, flagged as unidentified", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "wh", 0)], closing: [lvl("A", "wh", 100)], events: [] }).get("A")!;
  const wh = v.locations[0];
  assert.equal(wh.receivedExternal, 0);
  assert.equal(wh.receivedUnclassified, 100);
  assert.equal(v.total.receivedUnclassified, 100);
  assert.equal(v.total.receivedExternal + v.total.receivedUnclassified, 100, "the business knows 100 came in");
  reconciles(v.total);
});

test("partial pairing: −30 at the warehouse, +20 at the store → probable transfer of 20 (low) and an unclassified decrease of 10", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "wh", 100), lvl("A", "tlv", 0)], closing: [lvl("A", "wh", 70), lvl("A", "tlv", 20)], events: [] }).get("A")!;
  const wh = v.locations.find((l) => l.locationId === "wh")!;
  assert.equal(wh.probableTransferOut, 20);
  assert.equal(wh.unclassifiedDecrease, 10);
  assert.equal(v.total.probableTransfers[0].confidence, "low");
  assert.equal(v.total.unclassifiedDecrease, 10);
  reconciles(v.total);
});

test("an unexplained loss at one location is an unclassified decrease and it reaches the business total", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "wh", 50)], closing: [lvl("A", "wh", 44)], events: [] }).get("A")!;
  assert.equal(v.locations[0].unclassifiedDecrease, 6);
  assert.equal(v.locations[0].receivedUnclassified, 0);
  assert.equal(v.total.unclassifiedDecrease, 6);
  reconciles(v.total);
});

test("GROSS / RETURNS / NET — 10 sold, 2 returned: sold is 8 net, gross and returns are kept", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "tlv", 20)], closing: [lvl("A", "tlv", 12)], events: sale("A", "tlv", 10, 2) }).get("A")!;
  const tlv = v.locations[0];
  assert.deepEqual([tlv.soldGross, tlv.returns, tlv.sold], [10, 2, 8]);
  assert.equal(tlv.residual, 0, "a restocked return is back on the shelf");
  assert.deepEqual([v.total.soldGross, v.total.returns, v.total.sold], [10, 2, 8]);
  reconciles(v.total);
});

test("a return that was NOT restocked shows as an unclassified decrease, not as a sale", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "tlv", 20)], closing: [lvl("A", "tlv", 10)], events: sale("A", "tlv", 10, 2) }).get("A")!;
  assert.equal(v.locations[0].sold, 8);
  assert.equal(v.locations[0].unclassifiedDecrease, 2);
  reconciles(v.total);
});

test("POS store sale vs online order fulfilled from the store; unlocated sales in the total only", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "tlv", 20)], closing: [lvl("A", "tlv", 13)], events: [...sale("A", "tlv", 5, 0, "pos"), ...sale("A", "tlv", 2, 0, "fulfillment"), ...sale("A", null, 3, 0, "unknown")] }).get("A")!;
  const tlv = v.locations[0];
  assert.deepEqual([tlv.sold, tlv.soldPos, tlv.soldFulfilled, tlv.residual], [7, 5, 2, 0]);
  assert.equal(v.total.sold, 10);
  assert.equal(v.total.unlocatedSold, 3);
  reconciles(v.total);
});

test("exact adjustments (damage) stay separate from the unclassified residual", () => {
  const v = computeLedger({ locations, opening: [lvl("A", "wh", 50)], closing: [lvl("A", "wh", 45)], events: [{ shopifyVariantId: "A", locationId: "wh", type: "DAMAGE", quantity: 3, occurredAt: "2026-09-04T00:00:00Z", sourceType: "SHOPIFY_INVENTORY_HISTORY", sourceId: "adj1", precision: "exact" }] }).get("A")!;
  assert.equal(v.locations[0].adjustments, -3);
  assert.equal(v.locations[0].unclassifiedDecrease, 2);
  reconciles(v.total);
});

test("no opening snapshot → opening, residual and the reconciliation are unknown (null); exact events and closing still show", () => {
  const v = computeLedger({ locations, opening: [], closing: [lvl("A", "tlv", 9)], events: [...transfer("A", "wh", "tlv", 10, 10, "T9"), ...sale("A", "tlv", 4)] }).get("A")!;
  const tlv = v.locations.find((l) => l.locationId === "tlv")!;
  assert.equal(tlv.opening, null);
  assert.equal(tlv.residual, null);
  assert.equal(tlv.receivedUnclassified, 0);
  assert.equal(tlv.transferIn, 10);
  assert.equal(v.total.reconciliationGap, null);
});

test("sumLedgers folds variants per location and the business row still reconciles", () => {
  const ledgers = computeLedger({
    locations,
    opening: [lvl("A", "wh", 10), lvl("B", "wh", 5), lvl("A", "tlv", 0), lvl("B", "tlv", 0)],
    closing: [lvl("A", "wh", 5), lvl("B", "wh", 2), lvl("A", "tlv", 3), lvl("B", "tlv", 2)],
    events: [...transfer("A", "wh", "tlv", 5, 5, "T1"), ...transfer("B", "wh", "tlv", 3, 3, "T2"), ...sale("A", "tlv", 2), ...sale("B", "tlv", 1), ...sale("B", null, 1)]
  });
  const p = sumLedgers([ledgers.get("A")!, ledgers.get("B")!]);
  const wh = p.locations.find((l) => l.locationId === "wh")!;
  assert.deepEqual([wh.opening, wh.transferOut, wh.closing], [15, 8, 7]);
  assert.deepEqual([p.total.opening, p.total.receivedExternal, p.total.sold, p.total.unlocatedSold, p.total.redistributed, p.total.onHand], [15, 0, 4, 1, 8, 12]);
  reconciles(p.total);
});
