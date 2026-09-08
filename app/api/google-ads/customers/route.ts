import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getGoogleAdsSelectedCustomer, listGoogleAdsCustomers, setGoogleAdsCustomer } from "@/lib/services/google-ads-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";

// Ad-account picker for an existing Google Ads connection — GA4-properties
// contract: GET lists what the login can read + the selection; POST selects.

export const dynamic = "force-dynamic";

function resolveStoreId(auth: { storeId: string | null }, requested: string | null): string | null {
  if (!auth.storeId) return null;
  if (requested && requested !== auth.storeId) return null;
  return auth.storeId;
}

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const storeId = resolveStoreId(auth, new URL(request.url).searchParams.get("storeId"));
  if (!storeId) return NextResponse.json({ ok: false, error: "Store not resolved for this session." }, { status: 403 });
  try {
    const [customers, selected] = await Promise.all([listGoogleAdsCustomers(storeId), getGoogleAdsSelectedCustomer(storeId)]);
    return NextResponse.json({ ok: true, customers, selectedCustomerId: selected?.customerId ?? null });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 502;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { storeId?: string; customerId?: string };
  const storeId = resolveStoreId(auth, body.storeId ?? null);
  if (!storeId) return NextResponse.json({ ok: false, error: "Store not resolved for this session." }, { status: 403 });
  try {
    await setGoogleAdsCustomer(storeId, body.customerId ?? "");
    return NextResponse.json({ ok: true, customerId: body.customerId });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 502;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
