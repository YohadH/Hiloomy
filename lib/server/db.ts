import { prisma } from "@/lib/prisma";

type FallbackValue<T> = T | (() => T | Promise<T>);

const DATABASE_ERROR_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);
const DATABASE_ERROR_NAMES = new Set([
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError"
]);
const DATABASE_ERROR_MESSAGE_FRAGMENTS = [
  "can't reach database server",
  "connection refused",
  "connect econnrefused",
  "error querying the database",
  "failed to connect",
  "timed out fetching a new connection"
];

export function getDb() {
  return prisma as any;
}

function resolveFallback<T>(fallback: FallbackValue<T>) {
  return typeof fallback === "function" ? (fallback as () => T | Promise<T>)() : fallback;
}

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    cause?: unknown;
  };

  if (typeof record.code === "string" && DATABASE_ERROR_CODES.has(record.code)) {
    return true;
  }

  if (typeof record.name === "string" && DATABASE_ERROR_NAMES.has(record.name)) {
    return true;
  }

  if (typeof record.message === "string") {
    const message = record.message.toLowerCase();
    if (DATABASE_ERROR_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment))) {
      return true;
    }
  }

  return isDatabaseConnectionError(record.cause);
}

export async function withDatabaseFallback<T>(operation: () => Promise<T>, fallback: FallbackValue<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return await resolveFallback(fallback);
    }
    throw error;
  }
}

export async function withOptionalDb<T>(operation: (db: any) => Promise<T>, fallback: FallbackValue<T>): Promise<T> {
  const db = getDb();
  if (!db) {
    return await resolveFallback(fallback);
  }

  return withDatabaseFallback(() => operation(db), fallback);
}
