// Meta ad-account pin — locks a store to ONE ad account.
//
// Why: the OAuth callback auto-picks "the first active ad account" the
// Facebook login can see. For an owner whose login reaches several
// businesses, every re-connect or token renewal could silently move a store
// from its own account (Take a Nap) to a sibling's (aftershower, 7 Sep 2026).
// A pinned store refuses any write that would change its ad account — OAuth,
// the picker, the manual form — until the owner explicitly unlocks it.
//
// Stored in SystemConfig (no migration): key `meta_ad_account_pin:<storeId>`.

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";

const KEY = (storeId: string) => `meta_ad_account_pin:${storeId}`;

export function normalizeMetaAdAccountId(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

export async function getMetaAdAccountPin(storeId: string): Promise<string | null> {
  const db = getDb() as any;
  const row = await db.systemConfig.findUnique({ where: { key: KEY(storeId) }, select: { value: true } }).catch(() => null);
  const value = typeof row?.value === "string" ? row.value.trim() : "";
  return value ? normalizeMetaAdAccountId(value) : null;
}

export async function setMetaAdAccountPin(storeId: string, adAccountId: string | null): Promise<void> {
  const db = getDb() as any;
  const key = KEY(storeId);
  if (!adAccountId) {
    await db.systemConfig.deleteMany({ where: { key } }).catch(() => null);
    return;
  }
  const value = normalizeMetaAdAccountId(adAccountId);
  await db.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
}

// Throws 409 when the store is pinned to a different account. Callers that
// only refresh the token for the SAME account pass straight through.
export async function assertMetaAdAccountAllowed(storeId: string, adAccountId: string): Promise<void> {
  const pinned = await getMetaAdAccountPin(storeId);
  if (!pinned) return;
  if (normalizeMetaAdAccountId(adAccountId) === pinned) return;
  throw new AppError(
    `This store's Meta ad account is locked to ${pinned}. Unlock it in Settings before switching to ${normalizeMetaAdAccountId(adAccountId)}.`,
    409
  );
}
