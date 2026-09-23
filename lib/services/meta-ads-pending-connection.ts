// A Facebook login that is NOT yet tied to an ad account.
//
// The OAuth callback used to auto-pick "the first active ad account" the
// login could see. For an owner whose login reaches several businesses that
// silently put a store on a sibling brand's account (Bumpers / hbosem ended
// up on aftershower's, Sep 2026). Now the callback only parks the token
// here; the owner then picks the business + ad account explicitly in the
// picker, which creates the connection AND locks the store to that account
// in one step. Nothing syncs from a parked login — there is no connection
// row to sync.
//
// Stored in SystemConfig (no migration): key `meta_pending_connection:<storeId>`.
// A parked login expires after 24h so a stale token never lingers.

import { getDb } from "@/lib/server/db";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

const KEY = (storeId: string) => `meta_pending_connection:${storeId}`;
const TTL_MS = 24 * 60 * 60 * 1000;

interface StoredPending {
  accessTokenEnc: string;
  appId: string | null;
  createdAt: string;
}

export interface MetaPendingConnection {
  accessToken: string;
  appId: string | null;
  createdAt: string;
  expiresAt: string;
}

async function readRow(storeId: string): Promise<StoredPending | null> {
  const db = getDb() as any;
  const row = await db.systemConfig.findUnique({ where: { key: KEY(storeId) }, select: { value: true } }).catch(() => null);
  if (!row || typeof row.value !== "string") return null;
  try {
    const parsed = JSON.parse(row.value) as StoredPending;
    if (!parsed?.accessTokenEnc || !parsed?.createdAt) return null;
    if (Date.now() - new Date(parsed.createdAt).getTime() > TTL_MS) {
      await clearMetaPendingConnection(storeId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setMetaPendingConnection(
  storeId: string,
  input: { accessToken: string; appId?: string | null }
): Promise<void> {
  const db = getDb() as any;
  const value = JSON.stringify({
    accessTokenEnc: encryptSecret(input.accessToken),
    appId: input.appId ?? null,
    createdAt: new Date().toISOString()
  } satisfies StoredPending);
  const key = KEY(storeId);
  await db.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function getMetaPendingConnection(storeId: string): Promise<MetaPendingConnection | null> {
  const row = await readRow(storeId);
  if (!row) return null;
  return {
    accessToken: decryptSecret(row.accessTokenEnc),
    appId: row.appId,
    createdAt: row.createdAt,
    expiresAt: new Date(new Date(row.createdAt).getTime() + TTL_MS).toISOString()
  };
}

// Cheap presence check for pages — no decryption.
export async function hasMetaPendingConnection(storeId: string): Promise<boolean> {
  return (await readRow(storeId)) !== null;
}

export async function clearMetaPendingConnection(storeId: string): Promise<void> {
  const db = getDb() as any;
  await db.systemConfig.deleteMany({ where: { key: KEY(storeId) } }).catch(() => null);
}
