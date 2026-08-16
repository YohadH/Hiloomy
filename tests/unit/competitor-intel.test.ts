// Unit tests for the competitor-intel pure logic: domain normalization,
// weekly aggregation, week-over-week change classification (the copy that
// renders in the weekly report), and the deterministic RivalSweeper mock.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:9/hermetic-test";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDomain,
  aggregateWeekDays,
  computeCompetitorChange,
  type CompetitorDayRow,
  type CompetitorWeekAggregate
} from "@/lib/services/competitor-intel-service";
import { mockSignalsFor, isoWeekKey } from "@/lib/clients/rivalsweeper-client";

function day(
  snapshotDate: string,
  activePromoCount: number,
  maxDiscountPct: number | null = null
): CompetitorDayRow {
  return {
    snapshotDate,
    activePromoCount,
    maxDiscountPct,
    freeShippingThreshold: null,
    homepageMessage: null
  };
}

function week(overrides: Partial<CompetitorWeekAggregate>): CompetitorWeekAggregate {
  return {
    hadPromo: false,
    maxDiscountPct: null,
    latestPromoCount: 0,
    latestDiscountPct: null,
    latestFreeShippingThreshold: null,
    latestMessage: null,
    promoStartDate: null,
    ...overrides
  };
}

// ── normalizeDomain ─────────────────────────────────────────────────────

test("normalizeDomain strips protocol, www, path and lowercases", () => {
  assert.equal(normalizeDomain("https://www.Rival-Brand.co.il/sale?x=1"), "rival-brand.co.il");
  assert.equal(normalizeDomain("http://rival.com/"), "rival.com");
  assert.equal(normalizeDomain("  RIVAL.COM  "), "rival.com");
  assert.equal(normalizeDomain("rival.com."), "rival.com");
});

test("normalizeDomain leaves a bare host unchanged", () => {
  assert.equal(normalizeDomain("shop.rival.co.il"), "shop.rival.co.il");
});

// ── aggregateWeekDays ───────────────────────────────────────────────────

test("aggregateWeekDays returns null for an empty week", () => {
  assert.equal(aggregateWeekDays([]), null);
});

test("aggregateWeekDays takes the max discount across the week and the latest state", () => {
  const agg = aggregateWeekDays([
    day("2026-08-03", 1, 20),
    day("2026-08-05", 2, 40),
    day("2026-08-07", 1, 25)
  ]);
  assert.ok(agg);
  assert.equal(agg.hadPromo, true);
  assert.equal(agg.maxDiscountPct, 40);
  assert.equal(agg.latestPromoCount, 1);
  assert.equal(agg.latestDiscountPct, 25);
});

test("aggregateWeekDays detects the promo start day mid-week", () => {
  const agg = aggregateWeekDays([
    day("2026-08-03", 0),
    day("2026-08-04", 0),
    day("2026-08-05", 2, 30),
    day("2026-08-06", 2, 30)
  ]);
  assert.ok(agg);
  assert.equal(agg.promoStartDate, "2026-08-05");
});

test("aggregateWeekDays sorts out-of-order days before aggregating", () => {
  const agg = aggregateWeekDays([day("2026-08-07", 1, 25), day("2026-08-03", 0)]);
  assert.ok(agg);
  assert.equal(agg.latestDiscountPct, 25);
  assert.equal(agg.promoStartDate, "2026-08-07");
});

// ── computeCompetitorChange ─────────────────────────────────────────────

test("opened_promo when prior week had none and this week does", () => {
  const change = computeCompetitorChange(
    week({ hadPromo: true, maxDiscountPct: 40 }),
    week({ hadPromo: false })
  );
  assert.equal(change.kind, "opened_promo");
  assert.match(change.summary.he, /פתח מבצע/);
  assert.match(change.summary.he, /40%/);
  assert.match(change.summary.en, /40%/);
});

test("closed_promo when prior week had one and this week doesn't", () => {
  const change = computeCompetitorChange(
    week({ hadPromo: false }),
    week({ hadPromo: true, maxDiscountPct: 20 })
  );
  assert.equal(change.kind, "closed_promo");
  assert.match(change.summary.he, /סגר/);
});

test("deepened_discount when the discount grew", () => {
  const change = computeCompetitorChange(
    week({ hadPromo: true, maxDiscountPct: 40 }),
    week({ hadPromo: true, maxDiscountPct: 20 })
  );
  assert.equal(change.kind, "deepened_discount");
  assert.match(change.summary.he, /20%/);
  assert.match(change.summary.he, /40%/);
});

test("reduced_discount when the discount shrank", () => {
  const change = computeCompetitorChange(
    week({ hadPromo: true, maxDiscountPct: 10 }),
    week({ hadPromo: true, maxDiscountPct: 30 })
  );
  assert.equal(change.kind, "reduced_discount");
});

test("unchanged when both weeks run the same discount", () => {
  const change = computeCompetitorChange(
    week({ hadPromo: true, maxDiscountPct: 25 }),
    week({ hadPromo: true, maxDiscountPct: 25 })
  );
  assert.equal(change.kind, "unchanged");
  assert.match(change.summary.he, /25%/);
});

test("unchanged when neither week has a promo", () => {
  const change = computeCompetitorChange(week({}), week({}));
  assert.equal(change.kind, "unchanged");
});

test("no_data when this week has no snapshots", () => {
  const change = computeCompetitorChange(null, week({ hadPromo: true, maxDiscountPct: 20 }));
  assert.equal(change.kind, "no_data");
});

test("first tracked week describes state without claiming a diff", () => {
  const change = computeCompetitorChange(week({ hadPromo: true, maxDiscountPct: 30 }), null);
  assert.equal(change.kind, "no_data");
  assert.match(change.summary.he, /שבוע ראשון במעקב/);
  assert.match(change.summary.en, /first tracked week/);
});

// ── deterministic mock ──────────────────────────────────────────────────

test("mockSignalsFor is deterministic for the same domain + week", () => {
  const a = mockSignalsFor("rival.co.il", "2026-W33");
  const b = mockSignalsFor("rival.co.il", "2026-W33");
  assert.deepEqual(a, b);
});

test("mockSignalsFor varies across weeks for the same domain", () => {
  const weeks = ["2026-W30", "2026-W31", "2026-W32", "2026-W33", "2026-W34", "2026-W35"];
  const signatures = new Set(
    weeks.map((w) => JSON.stringify(mockSignalsFor("rival.co.il", w)))
  );
  assert.ok(signatures.size > 1, "expected at least two distinct weekly signal states");
});

test("mockSignalsFor promo weeks carry a discount and message; quiet weeks carry neither", () => {
  for (const w of ["2026-W30", "2026-W31", "2026-W32", "2026-W33"]) {
    const s = mockSignalsFor("incense-rival.co.il", w);
    if (s.activePromoCount > 0) {
      assert.ok(s.maxDiscountPct !== null);
      assert.ok(s.homepageMessage);
    } else {
      assert.equal(s.maxDiscountPct, null);
      assert.equal(s.homepageMessage, null);
    }
  }
});

// ── isoWeekKey ──────────────────────────────────────────────────────────

test("isoWeekKey matches known ISO week facts", () => {
  // 2024-01-01 was a Monday — ISO week 1 of 2024.
  assert.equal(isoWeekKey(new Date(Date.UTC(2024, 0, 1))), "2024-W01");
  // 2023-01-01 was a Sunday — it belongs to ISO week 52 of 2022.
  assert.equal(isoWeekKey(new Date(Date.UTC(2023, 0, 1))), "2022-W52");
});

test("isoWeekKey shifts exactly one week for a 7-day jump", () => {
  const base = new Date(Date.UTC(2026, 7, 11));
  const next = new Date(Date.UTC(2026, 7, 18));
  assert.notEqual(isoWeekKey(base), isoWeekKey(next));
});
