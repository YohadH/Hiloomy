// Result cache for the BI analyst's data tools.
//
// A conversation asks the same rollup repeatedly — "what was profit last
// month?" then "and the month before?" then "why did margin drop?" all hit
// get_profit_summary. Those rollups scan orders and cannot change between
// two questions a minute apart, so recomputing them burns both database
// time and ~7,500 tokens of tool payload per round.
//
// ── The isolation rule ─────────────────────────────────────────────────
// storeId is the FIRST component of the cache key, always. A cache keyed on
// (toolName, args) alone would serve one merchant's margin to another — it
// would reintroduce, through an optimisation, exactly the cross-tenant leak
// the tool layer is designed to prevent. There is no code path here that
// builds a key without a storeId, and the argument is required and
// non-optional so one can't be forgotten.
// tests/unit/bi-tool-cache-isolation.test.ts pins this.

import { createHash } from "node:crypto";
import { getDb } from "@/lib/server/db";

// Short by design. Long enough to cover a conversation, short enough that a
// merchant who just fixed a product cost sees it reflected quickly.
const DEFAULT_TTL_SECONDS = 900; // 15 minutes

// Tools whose output is expensive AND stable within a conversation. Alerts
// and competitor data are deliberately absent — a merchant asking "any
// alerts?" twice expects the second answer to be current.
const CACHEABLE_TOOLS = new Set([
  "get_profit_summary",
  "get_kpi_trend",
  "get_channel_performance",
  "get_ad_performance",
  "get_discount_effectiveness",
  "get_traffic",
  "get_organic_search",
  "get_retention",
  "get_product_performance",
  "get_orders",
  "get_customers"
]);

export function isCacheableTool(toolName: string): boolean {
  return CACHEABLE_TOOLS.has(toolName);
}

// Canonicalise arguments so {days:30} and {days:30, extra:undefined} — and
// any key ordering — collapse to one entry. Undefined values are dropped
// rather than serialised, since JSON.stringify omits them inconsistently
// inside nested structures.
export function hashToolArgs(args: Record<string, unknown>): string {
  const canonical = Object.keys(args)
    .filter((k) => args[k] !== undefined)
    .sort()
    .map((k) => [k, args[k]] as const);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
}

/**
 * Build the cache key. Exported so the isolation test can assert that two
 * different stores never produce the same key for identical tool + args.
 */
export function buildCacheKey(storeId: string, toolName: string, args: Record<string, unknown>) {
  if (!storeId) throw new Error("bi-tool-cache: storeId is required — refusing to build a tenant-less key.");
  return { storeId, toolName, argsHash: hashToolArgs(args) };
}

export async function readCachedToolResult(
  storeId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  if (!isCacheableTool(toolName)) return null;
  const key = buildCacheKey(storeId, toolName, args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  try {
    const row = await db.biToolCache.findUnique({
      where: { storeId_toolName_argsHash: key },
      select: { payload: true, expiresAt: true }
    });
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() <= Date.now()) return null;
    return row.payload as string;
  } catch (err) {
    // A cache miss must never break an answer.
    console.error("[bi-tool-cache] read failed:", err);
    return null;
  }
}

export async function writeCachedToolResult(
  storeId: string,
  toolName: string,
  args: Record<string, unknown>,
  payload: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  if (!isCacheableTool(toolName)) return;
  const key = buildCacheKey(storeId, toolName, args);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  try {
    await db.biToolCache.upsert({
      where: { storeId_toolName_argsHash: key },
      create: { ...key, payload, expiresAt },
      update: { payload, expiresAt, createdAt: new Date() }
    });
  } catch (err) {
    console.error("[bi-tool-cache] write failed:", err);
  }
}

// Called opportunistically — expired rows are already ignored on read, this
// just stops the table growing without bound.
export async function purgeExpiredToolCache(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  try {
    const res = await db.biToolCache.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    return res.count as number;
  } catch {
    return 0;
  }
}
