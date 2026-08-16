import net from "node:net";
import { AppError } from "@/lib/server/errors";

const DB_RETRY_COOLDOWN_MS = 30_000;
const LOCAL_DB_PROBE_TIMEOUT_MS = 250;

let dbUnavailableUntil = 0;
let localDbReachabilityPromise: Promise<boolean> | null = null;

function getLocalDatabaseEndpoint() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") return null;
    if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return null;

    return {
      host: parsed.hostname,
      port: Number(parsed.port || "5432")
    };
  } catch {
    return null;
  }
}

export function isPrismaUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };

  const code = typeof candidate.code === "string" ? candidate.code : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    name === "PrismaClientInitializationError" ||
    code === "P1001" ||
    code === "P1008" ||
    code === "P2021" ||
    code === "P2022" ||
    message.includes("Can't reach database server")
  );
}

export function toDatabaseUnavailableError(error: unknown, message: string) {
  if (!isPrismaUnavailableError(error)) return null;
  dbUnavailableUntil = Date.now() + DB_RETRY_COOLDOWN_MS;
  return new AppError(message, 503);
}

export async function shouldBypassPrismaForUnavailableLocalDb() {
  if (Date.now() < dbUnavailableUntil) return true;

  const endpoint = getLocalDatabaseEndpoint();
  if (!endpoint) return false;
  if (localDbReachabilityPromise) {
    const reachable = await localDbReachabilityPromise;
    if (!reachable) dbUnavailableUntil = Date.now() + DB_RETRY_COOLDOWN_MS;
    return !reachable;
  }

  localDbReachabilityPromise = new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(LOCAL_DB_PROBE_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(endpoint.port, endpoint.host);
  }).finally(() => {
    localDbReachabilityPromise = null;
  });

  const reachable = await localDbReachabilityPromise;
  if (!reachable) dbUnavailableUntil = Date.now() + DB_RETRY_COOLDOWN_MS;
  return !reachable;
}
