// Inventory flow by location over a period (owner, 17–18 Sep 2026).
//
// The business workflow: a PO lands at the warehouse → units are moved to
// the stores → the stores sell. Two ledgers, one set of events:
//
//   LOCATION   opening + receivedExternal + transferIn + returns + adjustments
//              − netSold − transferOut + residual                = closing
//   BUSINESS   opening + receivedExternal + receivedUnclassified + returns
//              + adjustments − netSold − unclassifiedDecrease    = onHand + inTransit
//
// Internal transfers cancel at the business level: the warehouse's 70 out
// and the stores' 70 in change the business total by ZERO. Units that left
// the origin and have not yet arrived are IN TRANSIT — still the business's
// stock, not on any shelf — so the business row reconciles on
// on-hand + in-transit, never on on-hand alone.
//
// Exact vs derived. A Shopify inventory transfer, a Hiloomy PO receipt and a
// sale at a known location are EXACT. Whatever the snapshots show that the
// events do not explain is the RESIDUAL. The residual is then CLASSIFIED,
// never hidden under "adjustment":
//   • a positive residual at one location paired with a negative residual of
//     the same variant elsewhere in the same period → PROBABLE INTERNAL
//     TRANSFER (derived, confidence medium when the quantities match, low
//     when one side is partial) — connected, not invented;
//   • an unpaired positive residual → UNCLASSIFIED STOCK INCREASE — stock
//     that entered the business from a source Hiloomy did not identify (an
//     un-recorded PO, an ERP adjustment). It counts as "received into the
//     business", flagged as unidentified;
//   • an unpaired negative residual → UNCLASSIFIED DECREASE (shrink, damage,
//     an un-recorded correction, or an unrestocked return).
// With no opening snapshot the residual is unknown (null), never zero.
//
// Sales: `soldGross` is units on order lines, `returns` the refunded units
// on those lines, `sold` the NET. The shelf follows the net (a restocked
// return is back on the shelf; an unrestocked one shows as an unclassified
// decrease). The UI must say "net" when it shows `sold` alone.
//
// Pure; tested in tests/unit/inventory-movement.test.ts.

export type MovementType = "PO_RECEIPT" | "TRANSFER_IN" | "TRANSFER_OUT" | "SALE" | "RETURN" | "POSITIVE_ADJUSTMENT" | "NEGATIVE_ADJUSTMENT" | "DAMAGE" | "DERIVED_IN" | "DERIVED_OUT";
export type MovementSource = "SHOPIFY_TRANSFER" | "SHOPIFY_ORDER" | "SHOPIFY_INVENTORY_HISTORY" | "HILOOMY_PO" | "SNAPSHOT_INFERENCE";
export type MovementPrecision = "exact" | "derived";
export type SaleChannel = "pos" | "fulfillment" | "unknown";

export interface MovementEvent {
  shopifyVariantId: string;
  locationId: string | null; // null = no location (an online sale not yet fulfilled)
  locationName?: string | null;
  type: MovementType;
  quantity: number; // always positive; the type carries the direction
  occurredAt: string; // ISO
  sourceType: MovementSource;
  sourceId: string;
  precision: MovementPrecision;
  channel?: SaleChannel; // SALE / RETURN only
  reference?: string | null; // PO number / transfer name — pairs a transfer's two legs
}

export interface LevelPoint {
  shopifyVariantId: string;
  shopifyLocationId: string;
  locationName: string;
  available: number;
}

export interface ProbableTransfer {
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  quantity: number;
  confidence: "medium" | "low"; // medium = both residuals match exactly; low = one side partial
}

export interface LocationLedger {
  locationId: string;
  locationName: string;
  opening: number | null; // null = no snapshot before the period
  receivedExternal: number; // exact PO receipts
  receivedUnclassified: number; // derived: positive residual with no pair — an unidentified source
  transferIn: number; // exact (Shopify transfer legs)
  probableTransferIn: number; // derived: paired residual
  soldGross: number;
  returns: number;
  sold: number; // net = gross − returns; soldPos + soldFulfilled
  soldPos: number;
  soldFulfilled: number;
  transferOut: number; // exact
  probableTransferOut: number; // derived: paired residual
  adjustments: number; // signed, EXACT only (sourced history / damage)
  unclassifiedDecrease: number; // derived: negative residual with no pair (shrink, un-recorded correction)
  residual: number | null; // the raw unexplained delta; null when opening unknown
  closing: number;
  exactEvents: number;
}

export interface BusinessLedger {
  opening: number | null;
  receivedExternal: number;
  receivedUnclassified: number;
  returns: number;
  adjustments: number;
  soldGross: number;
  sold: number; // net, includes unlocated
  unlocatedSold: number;
  unclassifiedDecrease: number;
  redistributed: number; // exact Σ transferOut — internal, not new stock
  probableRedistributed: number; // paired residuals
  probableTransfers: ProbableTransfer[];
  onHand: number; // Σ closing
  inTransit: number; // left an origin, not yet received (exact transfers)
  inventory: number; // onHand + inTransit
  // opening + receivedExternal + receivedUnclassified + adjustments − located net sold − unclassifiedDecrease − inventory
  // (returns are inside net sold and are never added twice)
  reconciliationGap: number | null; // 0 when the ledger closes; null when opening unknown
}

export interface VariantLedger {
  shopifyVariantId: string;
  locations: LocationLedger[];
  total: BusinessLedger;
}

export interface LedgerInput {
  opening: LevelPoint[]; // snapshot before the period start (may be empty = unknown)
  closing: LevelPoint[]; // snapshot at the period end, or the live levels
  events: MovementEvent[]; // everything that happened INSIDE the period
  locations: Array<{ id: string; name: string }>; // display order
}

const key = (v: string, l: string) => `${v}|${l}`;
const emptyLoc = (locationId: string, locationName: string, opening: number | null, closing: number): LocationLedger => ({
  locationId,
  locationName,
  opening,
  receivedExternal: 0,
  receivedUnclassified: 0,
  transferIn: 0,
  probableTransferIn: 0,
  soldGross: 0,
  returns: 0,
  sold: 0,
  soldPos: 0,
  soldFulfilled: 0,
  transferOut: 0,
  probableTransferOut: 0,
  adjustments: 0,
  unclassifiedDecrease: 0,
  residual: null,
  closing,
  exactEvents: 0
});

// Pair positive residuals with negative ones (largest first) into probable
// internal transfers; what stays unpaired is an unclassified change.
export function classifyResiduals(locations: LocationLedger[]): { locations: LocationLedger[]; probableTransfers: ProbableTransfer[] } {
  const known = locations.filter((l) => l.residual !== null);
  const sources = known.filter((l) => (l.residual as number) < 0).map((l) => ({ l, left: -(l.residual as number) })).sort((a, b) => b.left - a.left);
  const sinks = known.filter((l) => (l.residual as number) > 0).map((l) => ({ l, left: l.residual as number })).sort((a, b) => b.left - a.left);
  const out = new Map(locations.map((l) => [l.locationId, { ...l }]));
  const probable: ProbableTransfer[] = [];
  for (const sink of sinks) {
    for (const src of sources) {
      if (sink.left <= 0) break;
      if (src.left <= 0) continue;
      const q = Math.min(sink.left, src.left);
      const exact = sink.left === src.left;
      probable.push({ fromLocationId: src.l.locationId, fromLocationName: src.l.locationName, toLocationId: sink.l.locationId, toLocationName: sink.l.locationName, quantity: q, confidence: exact ? "medium" : "low" });
      out.get(src.l.locationId)!.probableTransferOut += q;
      out.get(sink.l.locationId)!.probableTransferIn += q;
      sink.left -= q;
      src.left -= q;
    }
    if (sink.left > 0) out.get(sink.l.locationId)!.receivedUnclassified += sink.left;
  }
  for (const src of sources) if (src.left > 0) out.get(src.l.locationId)!.unclassifiedDecrease += src.left;
  return { locations: locations.map((l) => out.get(l.locationId)!), probableTransfers: probable };
}

export function computeLedger(input: LedgerInput): Map<string, VariantLedger> {
  const openingBy = new Map(input.opening.map((p) => [key(p.shopifyVariantId, p.shopifyLocationId), p]));
  const closingBy = new Map(input.closing.map((p) => [key(p.shopifyVariantId, p.shopifyLocationId), p]));
  const hasOpening = input.opening.length > 0;
  const order = new Map(input.locations.map((l, i) => [l.id, i]));
  const nameOf = new Map(input.locations.map((l) => [l.id, l.name]));
  for (const p of [...input.opening, ...input.closing]) if (!nameOf.has(p.shopifyLocationId)) nameOf.set(p.shopifyLocationId, p.locationName);
  for (const e of input.events) if (e.locationId && e.locationName && !nameOf.has(e.locationId)) nameOf.set(e.locationId, e.locationName);

  const variants = new Set<string>();
  for (const p of input.opening) variants.add(p.shopifyVariantId);
  for (const p of input.closing) variants.add(p.shopifyVariantId);
  for (const e of input.events) variants.add(e.shopifyVariantId);

  const out = new Map<string, VariantLedger>();
  for (const v of variants) {
    const locIds = new Set<string>();
    for (const p of input.opening) if (p.shopifyVariantId === v) locIds.add(p.shopifyLocationId);
    for (const p of input.closing) if (p.shopifyVariantId === v) locIds.add(p.shopifyLocationId);
    for (const e of input.events) if (e.shopifyVariantId === v && e.locationId) locIds.add(e.locationId);
    const byLoc = new Map<string, LocationLedger>();
    for (const l of locIds) {
      const o = openingBy.get(key(v, l));
      const c = closingBy.get(key(v, l));
      byLoc.set(l, emptyLoc(l, nameOf.get(l) ?? l, o ? o.available : hasOpening ? 0 : null, c?.available ?? 0));
    }
    let unlocatedGross = 0;
    let unlocatedReturns = 0;
    // In transit: per transfer reference, shipped − received (exact legs only).
    const byRef = new Map<string, { out: number; in: number }>();
    for (const e of input.events) {
      if (e.shopifyVariantId !== v) continue;
      if (e.type === "TRANSFER_OUT" || e.type === "TRANSFER_IN") {
        const r = byRef.get(e.reference ?? e.sourceId) ?? { out: 0, in: 0 };
        if (e.type === "TRANSFER_OUT") r.out += e.quantity;
        else r.in += e.quantity;
        byRef.set(e.reference ?? e.sourceId, r);
      }
      if (!e.locationId) {
        if (e.type === "SALE") unlocatedGross += e.quantity;
        if (e.type === "RETURN") unlocatedReturns += e.quantity;
        continue;
      }
      const L = byLoc.get(e.locationId)!;
      if (e.precision === "exact") L.exactEvents += 1;
      switch (e.type) {
        case "PO_RECEIPT":
          L.receivedExternal += e.quantity;
          break;
        case "TRANSFER_IN":
          L.transferIn += e.quantity;
          break;
        case "TRANSFER_OUT":
          L.transferOut += e.quantity;
          break;
        case "SALE":
          L.soldGross += e.quantity;
          if (e.channel === "pos") L.soldPos += e.quantity;
          else L.soldFulfilled += e.quantity;
          break;
        case "RETURN":
          L.returns += e.quantity;
          break;
        case "POSITIVE_ADJUSTMENT":
          L.adjustments += e.quantity;
          break;
        case "NEGATIVE_ADJUSTMENT":
        case "DAMAGE":
          L.adjustments -= e.quantity;
          break;
        case "DERIVED_IN":
        case "DERIVED_OUT":
          break; // never fed in: the residual is computed below
      }
    }
    const raw = [...byLoc.values()]
      .map((L) => {
        const sold = L.soldGross - L.returns;
        // Returns reduce the net sale; the shelf shows the net.
        const explained = L.receivedExternal + L.transferIn + L.adjustments - sold - L.transferOut;
        return { ...L, sold, residual: L.opening === null ? null : L.closing - L.opening - explained };
      })
      .sort((a, b) => (order.get(a.locationId) ?? 999) - (order.get(b.locationId) ?? 999) || a.locationName.localeCompare(b.locationName));
    const { locations, probableTransfers } = classifyResiduals(raw);
    const inTransit = [...byRef.values()].reduce((n, r) => n + Math.max(0, r.out - r.in), 0);
    out.set(v, { shopifyVariantId: v, locations, total: businessTotal(locations, { unlocatedGross, unlocatedReturns, inTransit, probableTransfers }) });
  }
  return out;
}

export function businessTotal(locations: LocationLedger[], extra: { unlocatedGross: number; unlocatedReturns: number; inTransit: number; probableTransfers: ProbableTransfer[] }): BusinessLedger {
  const sum = (f: (l: LocationLedger) => number) => locations.reduce((n, l) => n + f(l), 0);
  const opening = locations.some((l) => l.opening === null) ? null : sum((l) => l.opening as number);
  const unlocatedSold = extra.unlocatedGross - extra.unlocatedReturns;
  const receivedExternal = sum((l) => l.receivedExternal);
  const receivedUnclassified = sum((l) => l.receivedUnclassified);
  const returns = sum((l) => l.returns) + extra.unlocatedReturns;
  const adjustments = sum((l) => l.adjustments);
  const soldGross = sum((l) => l.soldGross) + extra.unlocatedGross;
  const sold = sum((l) => l.sold) + unlocatedSold;
  const unclassifiedDecrease = sum((l) => l.unclassifiedDecrease);
  const onHand = sum((l) => l.closing);
  const inventory = onHand + extra.inTransit;
  // Identity: what came in minus what went out equals what the business
  // holds (on shelves + in transit). Unlocated sales are not on any shelf's
  // ledger, so they are excluded from the shelf identity.
  // Returns are inside the net sale (gross − returns): a restocked return is
  // back on the shelf, an unrestocked one surfaces as an unclassified
  // decrease. They are shown, never added a second time.
  const reconciliationGap = opening === null ? null : opening + receivedExternal + receivedUnclassified + adjustments - (sold - unlocatedSold) - unclassifiedDecrease - inventory;
  return {
    opening,
    receivedExternal,
    receivedUnclassified,
    returns,
    adjustments,
    soldGross,
    sold,
    unlocatedSold,
    unclassifiedDecrease,
    redistributed: sum((l) => l.transferOut),
    probableRedistributed: sum((l) => l.probableTransferOut),
    probableTransfers: extra.probableTransfers,
    onHand,
    inTransit: extra.inTransit,
    inventory,
    reconciliationGap
  };
}

// Fold several variants (one product, or the whole catalogue) per location.
export function sumLedgers(items: VariantLedger[]): { locations: LocationLedger[]; total: BusinessLedger } {
  const byLoc = new Map<string, LocationLedger>();
  const add = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
  for (const it of items) {
    for (const m of it.locations) {
      const cur = byLoc.get(m.locationId);
      if (!cur) {
        byLoc.set(m.locationId, { ...m });
        continue;
      }
      byLoc.set(m.locationId, {
        ...cur,
        opening: add(cur.opening, m.opening),
        receivedExternal: cur.receivedExternal + m.receivedExternal,
        receivedUnclassified: cur.receivedUnclassified + m.receivedUnclassified,
        transferIn: cur.transferIn + m.transferIn,
        probableTransferIn: cur.probableTransferIn + m.probableTransferIn,
        soldGross: cur.soldGross + m.soldGross,
        returns: cur.returns + m.returns,
        sold: cur.sold + m.sold,
        soldPos: cur.soldPos + m.soldPos,
        soldFulfilled: cur.soldFulfilled + m.soldFulfilled,
        transferOut: cur.transferOut + m.transferOut,
        probableTransferOut: cur.probableTransferOut + m.probableTransferOut,
        adjustments: cur.adjustments + m.adjustments,
        unclassifiedDecrease: cur.unclassifiedDecrease + m.unclassifiedDecrease,
        residual: add(cur.residual, m.residual),
        closing: cur.closing + m.closing,
        exactEvents: cur.exactEvents + m.exactEvents
      });
    }
  }
  const locations = [...byLoc.values()];
  // Unlocated sales / returns per variant = the business figure minus what
  // the located ledgers carry.
  const unlocatedGross = items.reduce((n, it) => n + (it.total.soldGross - it.locations.reduce((m, l) => m + l.soldGross, 0)), 0);
  const unlocatedReturns = items.reduce((n, it) => n + (it.total.returns - it.locations.reduce((m, l) => m + l.returns, 0)), 0);
  return {
    locations,
    total: businessTotal(locations, {
      unlocatedGross,
      unlocatedReturns,
      inTransit: items.reduce((n, it) => n + it.total.inTransit, 0),
      probableTransfers: items.flatMap((it) => it.total.probableTransfers)
    })
  };
}

// Sales as movement events, from order lines already grouped by the service.
// Gross units become SALE events, refunded units RETURN events at the same
// location; the ledger nets them.
export function saleEvents(rows: Array<{ shopifyVariantId: string; locationId: string | null; locationName?: string | null; channel: SaleChannel; units: number; returned?: number; occurredAt: string }>): MovementEvent[] {
  const out: MovementEvent[] = [];
  for (const r of rows) {
    const base = { shopifyVariantId: r.shopifyVariantId, locationId: r.locationId, locationName: r.locationName ?? null, occurredAt: r.occurredAt, sourceType: "SHOPIFY_ORDER" as const, precision: r.locationId ? ("exact" as const) : ("derived" as const), channel: r.channel };
    if (r.units > 0) out.push({ ...base, type: "SALE", quantity: r.units, sourceId: `sales:${r.shopifyVariantId}:${r.locationId ?? "none"}:${r.channel}` });
    if ((r.returned ?? 0) > 0) out.push({ ...base, type: "RETURN", quantity: r.returned as number, sourceId: `returns:${r.shopifyVariantId}:${r.locationId ?? "none"}:${r.channel}` });
  }
  return out;
}
