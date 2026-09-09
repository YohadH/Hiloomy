// The middleware matcher keeps page routes and /api/cron/* (CRON_SECRET gate)
// and leaves every other API route alone — a nodejs-runtime middleware
// wrapped around a large POST altered the body (Gantt upload, 9 Sep 2026).
// Mirror of the regex in middleware.ts `config.matcher` (kept in sync by hand:
// importing middleware.ts here would pull Supabase into a unit test).

import { test } from "node:test";
import assert from "node:assert/strict";

const MATCHER = /^\/((?!api\/(?!cron\/)|_next\/static|_next\/image|favicon\.ico|robots\.txt|sitemap\.xml|.*\..*).*)$/;

test("pages and cron routes run the middleware", () => {
  for (const p of ["/", "/dashboard", "/today", "/marketing-planner", "/api/cron/refresh-all", "/api/cron/decision-inbox"]) {
    assert.ok(MATCHER.test(p), p);
  }
});

test("every other API route and static asset skips it", () => {
  for (const p of ["/api/gantt/upload", "/api/gantt/abc/plan", "/api/shopify/sync", "/api/decisions/x/decide", "/_next/static/chunk.js", "/favicon.ico", "/logo.png"]) {
    assert.ok(!MATCHER.test(p), p);
  }
});
