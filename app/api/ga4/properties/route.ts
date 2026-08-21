import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import {
  listGa4Properties,
  setGa4Property,
  getGa4SelectedProperty
} from "@/lib/services/ga4-service";
import { toErrorMessage } from "@/lib/server/errors";

// GA4 property picker for an existing connection — same contract as the
// GSC sites route: GET lists what the connected Google account can read
// plus the current selection; POST selects (validated server-side).

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
    const [properties, selected] = await Promise.all([
      listGa4Properties(storeId),
      getGa4SelectedProperty(storeId)
    ]);
    return NextResponse.json({ ok: true, properties, selectedProperty: selected });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { storeId?: string; property?: string };
  const storeId = resolveStoreId(auth, body.storeId ?? null);
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "Store not resolved for this session." }, { status: 403 });
  }
  try {
    await setGa4Property(storeId, body.property ?? "");
    return NextResponse.json({ ok: true, property: body.property });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 502 });
  }
}
