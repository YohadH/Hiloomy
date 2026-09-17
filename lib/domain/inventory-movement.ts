// Inventory movement by location over a period — the ledger a manager
// reads after a purchase order lands at the warehouse and is split to the
// stores (owner, 17 Sep 2026):
//
//   opening (snapshot before the period)
//   + in    (received at the warehouse, or transferred in to a store)
//   − sold  (orders taken at / fulfilled from the location)
//   − out   (transferred out — the warehouse's split to the stores)
//   = closing (snapshot at the end of the period, or the live level)
//
// Shopify exposes no inventory history and no PO / transfer log to us, so
// "in" and "out" are DERIVED: net = closing − opening + sold; positive net
// is stock that arrived, negative net is stock that left. A receipt and a
// transfer-in look the same at a store; a PO and a return look the same at
// the warehouse. The UI says "in" / "out", never "PO" / "transfer".
//
// Pure; tested in tests/unit/inventory-movement.test.ts.

export interface LevelPoint {
  shopifyVariantId: string;
  shopifyLocationId: string;
  locationName: string;
  available: number;
}

export interface SoldPoint {
  shopifyVariantId: string;
  shopifyLocationId: string | null; // null = order without a location (online, not yet fulfilled / not synced)
  units: number;
}

export interface LocationMovement {
  locationId: string;
  locationName: string;
  opening: number | null; // null = no snapshot before the period (history starts later)
  inbound: number | null; // derived; null when opening is unknown
  sold: number;
  outbound: number | null; // derived; null when opening is unknown
  closing: number;
}

export interface VariantMovement {
  shopifyVariantId: string;
  locations: LocationMovement[];
  total: LocationMovement; // across locations; sold includes orders without a location
  unlocatedSold: number; // units sold on orders that carry no location
}

export interface MovementInput {
  opening: LevelPoint[]; // snapshot at the period start (may be empty)
  closing: LevelPoint[]; // snapshot at the period end, or the live levels
  sold: SoldPoint[];
  // Locations known to the store, so a location with zero everywhere still
  // appears in the right order.
  locations: Array<{ id: string; name: string }>;
}

const key = (v: string, l: string) => `${v}|${l}`;

export function computeMovement(input: MovementInput): Map<string, VariantMovement> {
  const openingBy = new Map(input.opening.map((p) => [key(p.shopifyVariantId, p.shopifyLocationId), p]));
  const closingBy = new Map(input.closing.map((p) => [key(p.shopifyVariantId, p.shopifyLocationId), p]));
  const soldBy = new Map<string, number>();
  const unlocated = new Map<string, number>();
  for (const s of input.sold) {
    if (s.shopifyLocationId) soldBy.set(key(s.shopifyVariantId, s.shopifyLocationId), (soldBy.get(key(s.shopifyVariantId, s.shopifyLocationId)) ?? 0) + s.units);
    else unlocated.set(s.shopifyVariantId, (unlocated.get(s.shopifyVariantId) ?? 0) + s.units);
  }
  const variants = new Set<string>([...input.opening, ...input.closing].map((p) => p.shopifyVariantId).concat(input.sold.map((s) => s.shopifyVariantId)));
  const hasOpeningSnapshot = input.opening.length > 0;
  const locationOrder = new Map(input.locations.map((l, i) => [l.id, i]));
  const nameOf = new Map(input.locations.map((l) => [l.id, l.name]));
  for (const p of [...input.opening, ...input.closing]) if (!nameOf.has(p.shopifyLocationId)) nameOf.set(p.shopifyLocationId, p.locationName);

  const out = new Map<string, VariantMovement>();
  for (const v of variants) {
    const locIds = new Set<string>();
    for (const p of input.opening) if (p.shopifyVariantId === v) locIds.add(p.shopifyLocationId);
    for (const p of input.closing) if (p.shopifyVariantId === v) locIds.add(p.shopifyLocationId);
    for (const s of input.sold) if (s.shopifyVariantId === v && s.shopifyLocationId) locIds.add(s.shopifyLocationId);
    const locations: LocationMovement[] = [...locIds]
      .sort((a, b) => (locationOrder.get(a) ?? 999) - (locationOrder.get(b) ?? 999) || (nameOf.get(a) ?? a).localeCompare(nameOf.get(b) ?? b))
      .map((l) => {
        const o = openingBy.get(key(v, l));
        const c = closingBy.get(key(v, l));
        const sold = soldBy.get(key(v, l)) ?? 0;
        const closing = c?.available ?? 0;
        // A location missing from the opening snapshot while a snapshot
        // exists is a genuine zero; with no snapshot at all it is unknown.
        const opening = o ? o.available : hasOpeningSnapshot ? 0 : null;
        const net = opening === null ? null : closing - opening + sold;
        return { locationId: l, locationName: nameOf.get(l) ?? l, opening, inbound: net === null ? null : Math.max(0, net), sold, outbound: net === null ? null : Math.max(0, -net), closing };
      });
    const unloc = unlocated.get(v) ?? 0;
    const sum = (f: (m: LocationMovement) => number | null): number | null => locations.reduce<number | null>((n, m) => (n === null || f(m) === null ? null : n + (f(m) as number)), 0);
    const total: LocationMovement = {
      locationId: "*",
      locationName: "*",
      opening: sum((m) => m.opening),
      inbound: sum((m) => m.inbound),
      sold: locations.reduce((n, m) => n + m.sold, 0) + unloc,
      outbound: sum((m) => m.outbound),
      closing: locations.reduce((n, m) => n + m.closing, 0)
    };
    out.set(v, { shopifyVariantId: v, locations, total, unlocatedSold: unloc });
  }
  return out;
}

// Sum a set of variant movements (one product) into per-location rows.
export function sumMovements(items: VariantMovement[]): { locations: LocationMovement[]; total: LocationMovement; unlocatedSold: number } {
  const byLoc = new Map<string, LocationMovement>();
  const add = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
  for (const it of items) {
    for (const m of it.locations) {
      const cur = byLoc.get(m.locationId);
      byLoc.set(m.locationId, cur ? { ...cur, opening: add(cur.opening, m.opening), inbound: add(cur.inbound, m.inbound), sold: cur.sold + m.sold, outbound: add(cur.outbound, m.outbound), closing: cur.closing + m.closing } : { ...m });
    }
  }
  const locations = [...byLoc.values()];
  const total: LocationMovement = {
    locationId: "*",
    locationName: "*",
    opening: locations.reduce<number | null>((n, m) => add(n, m.opening), 0),
    inbound: locations.reduce<number | null>((n, m) => add(n, m.inbound), 0),
    sold: items.reduce((n, it) => n + it.total.sold, 0),
    outbound: locations.reduce<number | null>((n, m) => add(n, m.outbound), 0),
    closing: locations.reduce((n, m) => n + m.closing, 0)
  };
  return { locations, total, unlocatedSold: items.reduce((n, it) => n + it.unlocatedSold, 0) };
}
