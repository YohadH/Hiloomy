import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/encryption";
import { toErrorMessage } from "@/lib/server/errors";
import { assertMetaAdAccountAllowed, getMetaAdAccountPin, setMetaAdAccountPin } from "@/lib/services/meta-ads-account-pin";
import { listMetaAdAccounts } from "@/lib/services/meta-ads-accounts";
import { clearMetaPendingConnection, getMetaPendingConnection } from "@/lib/services/meta-ads-pending-connection";
import { saveMetaAdsConnection } from "@/lib/services/meta-ads-service";

// Ad-account picker — the ONLY place an ad account gets attached to a store.
//
//   GET  /api/meta-ads/accounts?storeId=…
//        Every ad account the token can see, with its business portfolio.
//        The token is the parked Facebook login (mode "pending") when the
//        store has not chosen an account yet, else the saved connection's.
//   POST /api/meta-ads/accounts {storeId, adAccountId}
//        mode "pending"   → create the connection from the parked login with
//                           THIS account and lock the store to it.
//        mode "connected" → switch an UNLOCKED store to this account and lock
//                           it (a locked store answers 409 — unlock first).
//
// The client's choice is always validated against the token's own account
// list server-side; an id the login cannot see is rejected.

export const dynamic = "force-dynamic";

function resolveStoreId(auth: { storeId: string | null }, requested: string | null): string | null {
  // The session's active store is the authority; a mismatched storeId in the
  // request is rejected rather than honored (multi-tenant guard).
  if (!auth.storeId) return null;
  if (requested && requested !== auth.storeId) return null;
  return auth.storeId;
}

async function storeName(storeId: string): Promise<string | null> {
  const db = getDb() as any;
  const row = await db.store.findUnique({ where: { id: storeId }, select: { name: true } }).catch(() => null);
  return row?.name ?? null;
}

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const url = new URL(request.url);
  const storeId = resolveStoreId(auth, url.searchParams.get("storeId"));
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "Store not resolved for this session." }, { status: 403 });
  }

  try {
    const db = getDb() as any;
    const connection = await db.metaAdsConnection.findUnique({ where: { storeId } });
    const pending = await getMetaPendingConnection(storeId);
    if (!pending && !connection) throw new Error("Meta Ads is not connected for this store.");

    const accessToken = pending ? pending.accessToken : decryptSecret(connection.accessTokenEnc);
    const accounts = await listMetaAdAccounts(accessToken);
    return NextResponse.json({
      ok: true,
      mode: pending ? "pending" : "connected",
      storeName: await storeName(storeId),
      selectedAdAccountId: connection?.adAccountId ?? null,
      pinned: await getMetaAdAccountPin(storeId),
      accounts
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { storeId?: string; adAccountId?: string };
  const storeId = resolveStoreId(auth, body.storeId ?? null);
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "Store not resolved for this session." }, { status: 403 });
  }
  const requestedId = (body.adAccountId ?? "").trim();
  if (!requestedId) {
    return NextResponse.json({ ok: false, error: "adAccountId is required." }, { status: 400 });
  }

  try {
    const db = getDb() as any;
    const pending = await getMetaPendingConnection(storeId);

    if (pending) {
      const accounts = await listMetaAdAccounts(pending.accessToken);
      const picked = accounts.find((a) => a.id === requestedId);
      if (!picked) {
        return NextResponse.json(
          { ok: false, error: "That ad account is not accessible with the Facebook login you used." },
          { status: 400 }
        );
      }
      // Creates (or replaces) the connection; the save service locks the
      // store to the account it writes, so this choice is final until the
      // owner unlocks it in Settings.
      const result = await saveMetaAdsConnection({
        storeId,
        accessToken: pending.accessToken,
        adAccountId: picked.id,
        appId: pending.appId,
        appSecret: process.env.META_ADS_CLIENT_SECRET?.trim() || null,
        exchangeToken: false
      });
      await clearMetaPendingConnection(storeId);
      return NextResponse.json({
        ok: true,
        created: true,
        adAccountId: result.connection.adAccountId,
        adAccountName: result.connection.adAccountName ?? result.connection.adAccountId,
        pinned: true
      });
    }

    const connection = await db.metaAdsConnection.findUnique({ where: { storeId } });
    if (!connection) throw new Error("Meta Ads is not connected for this store.");
    const accounts = await listMetaAdAccounts(decryptSecret(connection.accessTokenEnc));
    const picked = accounts.find((a) => a.id === requestedId);
    if (!picked) {
      return NextResponse.json(
        { ok: false, error: "That ad account is not accessible with the connected Meta login." },
        { status: 400 }
      );
    }

    // A locked store cannot be switched here — unlock first (409).
    await assertMetaAdAccountAllowed(storeId, picked.id);

    await db.metaAdsConnection.update({
      where: { storeId },
      data: {
        adAccountId: picked.id,
        adAccountName: picked.name ?? null,
        accountStatus: picked.accountStatus,
        currency: picked.currency,
        timezoneName: picked.timezoneName,
        // The account changed — prior sync bookkeeping refers to the old one.
        syncStatus: "idle",
        lastSyncError: null
      }
    });
    // Purge insight rows from any OTHER ad account for this store, so the
    // dashboard can never show the previous account's campaigns after a
    // switch (the stale-JulyPromotions bug, 2 Sep 2026).
    if (db.metaAdsCampaignInsight?.deleteMany) {
      await db.metaAdsCampaignInsight
        .deleteMany({ where: { storeId, adAccountId: { not: picked.id } } })
        .catch(() => null);
    }
    // An explicit choice is intent — lock the store to it.
    await setMetaAdAccountPin(storeId, picked.id);
    return NextResponse.json({
      ok: true,
      created: false,
      adAccountId: picked.id,
      adAccountName: picked.name ?? picked.id,
      pinned: true
    });
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) || 502 : 502;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
