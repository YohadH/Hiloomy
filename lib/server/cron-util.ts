// Shared helpers for the in-process background crons (shopify-sync,
// creative-job, weekly-report). Centralises three stability concerns that all
// three crons need:
//
//   1. Opt-in enable gate (default OFF in development) so a dev server never
//      tight-loops self-fetches against routes that aren't ready / configured.
//   2. AbortController-backed fetch timeout so a hung connection can't pin a
//      tick "running" forever (the source of UND_ERR_HEADERS_TIMEOUT pile-ups).
//   3. Exponential backoff after consecutive failures so a failing cron does
//      not tight-loop and burn CPU / crash the process.

/**
 * Decide whether a given cron should start.
 *
 * Precedence (highest first):
 *   - `<PREFIX>_CRON_DISABLED=1`  → always OFF (hard kill switch, back-compat).
 *   - `ENABLE_<PREFIX>_CRON` set  → explicit on/off ("1"/"true" = on).
 *   - otherwise                   → ON in production, OFF in development/test.
 *
 * `prefix` is the upper-snake cron name, e.g. "SHOPIFY_SYNC".
 */
export function isCronEnabled(prefix: string): boolean {
  if (process.env[`${prefix}_CRON_DISABLED`] === "1") return false;

  const explicit = process.env[`ENABLE_${prefix}_CRON`];
  if (explicit !== undefined && explicit !== "") {
    const v = explicit.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }

  // Default: only auto-start outside development so local `next dev` is quiet.
  return process.env.NODE_ENV === "production";
}

/**
 * fetch() with an AbortController timeout. Rejects with an Error whose message
 * mentions the timeout when the deadline is hit, so callers log something
 * actionable instead of a bare AbortError.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Headers to attach to an in-process cron self-fetch so it can pass the
 * middleware CRON_SECRET gate (see middleware.ts). When `CRON_SECRET` is set
 * the middleware 401s any `/api/cron/*` request whose `x-cron-secret` header
 * doesn't match it; the in-process crons self-ping those routes, so they must
 * send the header. When `CRON_SECRET` is unset (e.g. local dev) this returns
 * an empty object and the middleware skips the check — dev keeps working.
 */
export function cronSecretHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET?.trim();
  return secret ? { "x-cron-secret": secret } : {};
}

/**
 * Exponential backoff (capped) for N consecutive failures. Returns the extra
 * delay to skip ticks for. failures<=0 → 0 (no backoff while healthy).
 */
export function computeBackoffMs(
  failures: number,
  baseMs: number,
  maxMs = 15 * 60 * 1000
): number {
  if (failures <= 0) return 0;
  const delay = baseMs * 2 ** (failures - 1);
  return Math.min(delay, maxMs);
}
