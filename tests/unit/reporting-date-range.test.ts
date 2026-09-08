// "Last N days" must mean what Shopify Analytics means (its default view,
// "Include today" on): N full days before today, plus today. On 8 Sep,
// "Last 7 days" is 1–8 Sep in both tools. Regression for the 8 Sep 2026
// gap the owner found when Hiloomy showed 2–8 Sep.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePreset, lastNDaysRange, formatDateInTimeZone } from "@/lib/server/reporting-date-range";

const TZ = "Asia/Jerusalem";
// 8 Sep 2026, 12:39 Israel time (09:39Z).
const NOW = new Date("2026-09-08T09:39:00Z");

test("last_7 on 8 Sep is 1–8 Sep (8 calendar days, like Shopify)", () => {
  const r = resolvePreset("last_7", TZ, NOW);
  assert.equal(formatDateInTimeZone(r.start, TZ), "2026-09-01");
  assert.equal(formatDateInTimeZone(r.end, TZ), "2026-09-08");
});

test("last_30 on 8 Sep starts 9 Aug (30 full days + today)", () => {
  const r = resolvePreset("last_30", TZ, NOW);
  assert.equal(formatDateInTimeZone(r.start, TZ), "2026-08-09");
  assert.equal(formatDateInTimeZone(r.end, TZ), "2026-09-08");
});

test("last_90 on 8 Sep starts 10 Jun", () => {
  const r = resolvePreset("last_90", TZ, NOW);
  assert.equal(formatDateInTimeZone(r.start, TZ), "2026-06-10");
});

test("lastNDaysRange matches the picker presets exactly", () => {
  for (const [days, preset] of [
    [7, "last_7"],
    [30, "last_30"],
    [90, "last_90"]
  ] as const) {
    const a = lastNDaysRange(days, TZ, NOW);
    const b = resolvePreset(preset, TZ, NOW);
    assert.equal(a.start.getTime(), b.start.getTime(), `${preset} start`);
    assert.equal(a.end.getTime(), b.end.getTime(), `${preset} end`);
  }
});

test("window boundaries are store-timezone midnights, not UTC", () => {
  const r = resolvePreset("last_7", TZ, NOW);
  // 1 Sep 00:00 Israel (UTC+3 in September) = 31 Aug 21:00Z.
  assert.equal(r.start.toISOString(), "2026-08-31T21:00:00.000Z");
  // 8 Sep 23:59:59.999 Israel = 8 Sep 20:59:59.999Z.
  assert.equal(r.end.toISOString(), "2026-09-08T20:59:59.999Z");
});

test("today and yesterday are single days", () => {
  const t = resolvePreset("today", TZ, NOW);
  assert.equal(formatDateInTimeZone(t.start, TZ), "2026-09-08");
  assert.equal(formatDateInTimeZone(t.end, TZ), "2026-09-08");
  const y = resolvePreset("yesterday", TZ, NOW);
  assert.equal(formatDateInTimeZone(y.start, TZ), "2026-09-07");
  assert.equal(formatDateInTimeZone(y.end, TZ), "2026-09-07");
});
