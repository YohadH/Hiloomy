// Cross-tenant probes for the BI tool cache.
//
// Caching is where an isolation guarantee usually dies. The tool layer is
// careful — storeId comes from the session and never from the model — but a
// cache keyed on (toolName, args) alone would happily hand store B the
// margin figures computed for store A, and nothing in the tool layer would
// notice. These tests pin the key shape so that regression is loud.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildCacheKey, hashToolArgs, isCacheableTool } from "../../lib/services/bi-tool-cache";

const ARGS = { days: 30 };

test("two stores never share a cache key for identical tool and args", () => {
  const a = buildCacheKey("store_aaa", "get_profit_summary", ARGS);
  const b = buildCacheKey("store_bbb", "get_profit_summary", ARGS);

  assert.notDeepEqual(a, b, "identical tool+args across stores must not collide");
  assert.equal(a.storeId, "store_aaa");
  assert.equal(b.storeId, "store_bbb");
  // The hash covers arguments only, so storeId must carry the separation.
  assert.equal(a.argsHash, b.argsHash);
  assert.notEqual(a.storeId, b.storeId);
});

test("the key always carries a storeId component", () => {
  const key = buildCacheKey("store_aaa", "get_kpi_trend", { days: 90 });
  assert.ok("storeId" in key, "cache key lost its storeId component");
  assert.ok(key.storeId.length > 0);
});

test("an empty storeId is refused rather than silently shared", () => {
  // A falsy storeId must never produce a usable key — that row would be
  // readable by any other caller that also passed an empty storeId.
  assert.throws(() => buildCacheKey("", "get_profit_summary", ARGS), /storeId is required/);
});

test("same store, same args, any key order hits one entry", () => {
  const one = hashToolArgs({ days: 30, granularity: "week" });
  const two = hashToolArgs({ granularity: "week", days: 30 });
  assert.equal(one, two, "argument ordering must not fragment the cache");
});

test("different args produce different entries", () => {
  assert.notEqual(hashToolArgs({ days: 30 }), hashToolArgs({ days: 60 }));
});

test("undefined values do not fragment the cache", () => {
  assert.equal(hashToolArgs({ days: 30 }), hashToolArgs({ days: 30, limit: undefined }));
});

test("time-sensitive tools are not cached", () => {
  // A merchant asking "any alerts?" twice expects the second answer to be
  // current, not a copy of the first.
  assert.equal(isCacheableTool("get_open_alerts"), false);
  assert.equal(isCacheableTool("get_competitor_week"), false);
  assert.equal(isCacheableTool("get_profit_summary"), true);
});

test("an unknown tool is never cached", () => {
  // New tools must opt in explicitly, so one added later isn't cached with
  // assumptions about its freshness that were never considered.
  assert.equal(isCacheableTool("get_something_new"), false);
});
