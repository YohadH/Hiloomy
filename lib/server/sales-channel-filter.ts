// Server-side predicates for the sales-channel filter. One definition of
// "is a POS order" feeds both the Prisma `where` objects and the raw SQL the
// parity layer runs, so the KPI grid, the daily series and the money
// snapshot cannot drift apart on what "online only" means.
//
// NULL / empty sourceName counts as NOT POS (it lands in "online"), matching
// classifySalesChannel + the offline comparison's `NOT IN ('pos', …)` rule.

import { POS_SOURCE_NAMES, POS_SOURCE_PREFIX, type SalesChannelFilter } from "@/lib/domain/sales-channel";

const POS_LIST_SQL = POS_SOURCE_NAMES.map((s) => `'${s}'`).join(",");

/**
 * SQL fragment to append inside an existing WHERE (starts with " AND ").
 * The prefix's underscore is escaped so LIKE matches a literal "pos_".
 * Constant text built only from the constants above — never from input —
 * so it is safe to splice with Prisma.raw / $queryRawUnsafe.
 */
export function orderChannelSqlText(filter: SalesChannelFilter, alias = "o"): string {
  if (filter === "all") return "";
  const isPos = `(${alias}."sourceName" IN (${POS_LIST_SQL}) OR ${alias}."sourceName" LIKE '${POS_SOURCE_PREFIX.replace("_", "\\_")}%')`;
  return filter === "pos" ? ` AND ${isPos}` : ` AND NOT COALESCE(${isPos}, false)`;
}

/** Prisma `where` fragment for the Order model. `{}` when unfiltered. */
export function orderChannelWhere(filter: SalesChannelFilter): Record<string, unknown> {
  if (filter === "all") return {};
  const pos = [{ sourceName: { in: [...POS_SOURCE_NAMES] } }, { sourceName: { startsWith: POS_SOURCE_PREFIX } }];
  if (filter === "pos") return { OR: pos };
  // NOT IN / NOT LIKE drop NULLs in SQL; keep them explicitly (they are not POS).
  return {
    OR: [
      { sourceName: null },
      { AND: [{ sourceName: { notIn: [...POS_SOURCE_NAMES] } }, { NOT: { sourceName: { startsWith: POS_SOURCE_PREFIX } } }] }
    ]
  };
}
