import { NextResponse } from "next/server";
import { saveInstagramConnection } from "@/lib/services/instagram-service";
import { toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    // Multi-tenant: attach to the session's active store.
    const result = await saveInstagramConnection(body.accessToken, auth.storeId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
