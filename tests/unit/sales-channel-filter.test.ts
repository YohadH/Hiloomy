// Command Center channel filter: one definition of "POS order" feeds the
// Prisma where objects and the raw SQL, and "online" = everything that is
// not POS (including orders with no source), matching the offline comparison.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySalesChannel, parseSalesChannelFilter } from "@/lib/domain/sales-channel";
import { orderChannelSqlText, orderChannelWhere } from "@/lib/server/sales-channel-filter";

test("parse: only online / pos are filters; anything else is all", () => {
  assert.equal(parseSalesChannelFilter("online"), "online");
  assert.equal(parseSalesChannelFilter("POS"), "pos");
  assert.equal(parseSalesChannelFilter(["pos", "online"]), "pos");
  assert.equal(parseSalesChannelFilter("web"), "all");
  assert.equal(parseSalesChannelFilter(undefined), "all");
});

test("all = no predicate at all (historical numbers unchanged)", () => {
  assert.equal(orderChannelSqlText("all"), "");
  assert.deepEqual(orderChannelWhere("all"), {});
});

test("sql: pos matches exact and prefixed sources; online negates with NULL kept", () => {
  const pos = orderChannelSqlText("pos", "o");
  assert.match(pos, /^ AND \(o\."sourceName" IN \('pos','shopify_pos'\) OR o\."sourceName" LIKE 'pos\\_%'\)$/);
  assert.ok(pos.includes("LIKE 'pos\\_%'"), "underscore must be escaped so LIKE matches a literal pos_ prefix");
  const online = orderChannelSqlText("online", "x");
  assert.ok(online.startsWith(" AND NOT COALESCE("));
  assert.ok(online.includes('x."sourceName"'));
  assert.ok(online.endsWith(", false)"));
});

test("where: online keeps NULL sourceName, pos does not", () => {
  const online = orderChannelWhere("online") as { OR: unknown[] };
  assert.deepEqual(online.OR[0], { sourceName: null });
  const pos = orderChannelWhere("pos") as { OR: Array<Record<string, unknown>> };
  assert.equal(pos.OR.length, 2);
  assert.ok(!pos.OR.some((c) => c.sourceName === null));
});

test("the SQL rule agrees with classifySalesChannel on the known sources", () => {
  for (const src of ["pos", "shopify_pos", "pos_ipad"]) assert.equal(classifySalesChannel(src), "pos");
  for (const src of ["web", "buy_button", "shopify_draft_order", "iphone", "12345", ""]) assert.notEqual(classifySalesChannel(src), "pos");
});
