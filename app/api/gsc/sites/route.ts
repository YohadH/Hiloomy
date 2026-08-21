import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import {
  listGscSites,
  setGscSiteUrl,
  getGscSelectedSiteUrl
} from "@/lib/services/gsc-service";
import { toErrorMessage } from "@/lib/server/errors";

// GSC property picker for an existing connection.
//   GET  → verified properties the connected Google account can read, plus
//          the current selection (null = cron falls back to the Shopify
//          domain — usually wrong for stores on *.myshopify.com).
//   POST {siteUrl} → select the property the sync should read. Validated
//          server-side against the account's own property list.

export const dynamic = "force-dynamic";

function resolveStoreId(auth: { storeId: string | null }, requested: string | null): string | null {
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
    const [sites, selected] = await Promise.all([
      listGscSites(storeId),
      getGscSelectedSiteUrl(storeId)
    ]);
    return NextResponse.json({ ok: true, sites, selectedSiteUrl: selected });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { storeId?: string; siteUrl?: string };
  const storeId = resolveStoreId(auth, body.storeId ?? null);
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "Store not resolved for this session." }, { status: 403 });
  }
  try {
    await setGscSiteUrl(storeId, body.siteUrl ?? "");
    return NextResponse.json({ ok: true, siteUrl: body.siteUrl });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 502 });
  }
}
