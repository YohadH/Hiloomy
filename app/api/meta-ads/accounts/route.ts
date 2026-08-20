import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/encryption";
import { toErrorMessage } from "@/lib/server/errors";

// Ad-account picker for an existing Meta Ads connection.
//
//   GET  /api/meta-ads/accounts?storeId=…   → every ad account the SAVED
//        token can see, with the owning business name — so the founder can
//        pick the right one instead of trusting the OAuth auto-pick.
//   POST /api/meta-ads/accounts {storeId, adAccountId} → switch the
//        connection to that account (validated against the token's own
//        account list server-side; the client's choice is never trusted).
//
// Both reuse the stored encrypted token — no re-auth, no pasted tokens.

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v19.0";

interface GraphAdAccount {
  id: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  business?: { name?: string };
}

async function loadConnection(storeId: string) {
  const db = getDb() as any;
  const connection = await db.metaAdsConnection.findUnique({ where: { storeId } });
  if (!connection) throw new Error("Meta Ads is not connected for this store.");
  return connection;
}

async function listAccounts(accessToken: string): Promise<GraphAdAccount[]> {
  const url = new URL(`${GRAPH}/me/adaccounts`);
  url.searchParams.set("fields", "id,name,account_status,currency,timezone_name,business{name}");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.error) {
    throw new Error(payload?.error?.message ?? `Meta Graph request failed (${res.status}).`);
  }
  return (payload?.data ?? []) as GraphAdAccount[];
}

function resolveStoreId(auth: { storeId: string | null }, requested: string | null): string | null {
  // The session's active store is the authority; a mismatched storeId in the
  // request is rejected rather than honored (multi-tenant guard).
  if (!auth.storeId) return null;
  if (requested && requested !== auth.storeId) return null;
  return auth.storeId;
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
    const connection = await loadConnection(storeId);
    const accounts = await listAccounts(decryptSecret(connection.accessTokenEnc));
    return NextResponse.json({
      ok: true,
      selectedAdAccountId: connection.adAccountId,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
        businessName: a.business?.name ?? null,
        active: a.account_status === 1,
        currency: a.currency ?? null
      }))
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
    const connection = await loadConnection(storeId);
    const accounts = await listAccounts(decryptSecret(connection.accessTokenEnc));
    const picked = accounts.find((a) => a.id === requestedId);
    if (!picked) {
      return NextResponse.json(
        { ok: false, error: "That ad account is not accessible with the connected Meta login." },
        { status: 400 }
      );
    }

    const db = getDb() as any;
    await db.metaAdsConnection.update({
      where: { storeId },
      data: {
        adAccountId: picked.id,
        adAccountName: picked.name ?? null,
        accountStatus: picked.account_status ?? null,
        currency: picked.currency ?? null,
        timezoneName: picked.timezone_name ?? null,
        // The account changed — prior sync bookkeeping refers to the old one.
        syncStatus: "idle",
        lastSyncError: null
      }
    });
    return NextResponse.json({
      ok: true,
      adAccountId: picked.id,
      adAccountName: picked.name ?? picked.id
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 502 });
  }
}
