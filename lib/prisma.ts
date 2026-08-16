import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Minimum connection-pool size we will tolerate. Supabase's pooled (PgBouncer,
// port 6543) connection string is commonly documented with `connection_limit=1`,
// which starves the initial Shopify sync: it fires many sequential upserts (and
// the order path runs several queries per order), and any concurrent request
// then races for the single slot and dies with
//   "Timed out fetching a new connection from the connection pool
//    (Current connection pool timeout: 10, connection limit: 1)".
// We raise the pool to a small, PgBouncer-safe size and give the pool a longer
// fetch timeout so a brief burst queues instead of erroring (SA-FIX3).
const MIN_CONNECTION_LIMIT = 5;
const POOL_TIMEOUT_SECONDS = 20;

/**
 * Returns DATABASE_URL with the connection-pool params normalised so the app
 * never runs against a single-connection pool. We only ever RAISE the limit
 * (never lower an already-larger value an operator set on purpose) and we add a
 * generous `pool_timeout`. If DATABASE_URL is unset or unparseable we return it
 * untouched and let Prisma surface its own error.
 */
export function normalizeDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Not a parseable URL (shouldn't happen for a real DSN) — leave it alone.
    return rawUrl;
  }

  const currentLimit = Number(url.searchParams.get("connection_limit"));
  if (!Number.isFinite(currentLimit) || currentLimit < MIN_CONNECTION_LIMIT) {
    url.searchParams.set("connection_limit", String(MIN_CONNECTION_LIMIT));
  }

  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", String(POOL_TIMEOUT_SECONDS));
  }

  return url.toString();
}

function createPrismaClient(): PrismaClient {
  const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
  return new PrismaClient({
    log: ["warn", "error"],
    ...(url ? { datasources: { db: { url } } } : {})
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
