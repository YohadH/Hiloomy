import { NextResponse } from "next/server";
import { saveBixGrowConnection } from "@/lib/services/bixgrow-service";
import { toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    const result = await saveBixGrowConnection({
      portalDomain: body.portalDomain,
      apiKey: body.apiKey
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
