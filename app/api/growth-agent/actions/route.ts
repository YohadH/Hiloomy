import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getGrowthActions } from "@/lib/services/growth-agent-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getAuthContext } from "@/lib/auth/session";

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId") ?? undefined;
    if (storeId) await assertStoreInActiveOrg(storeId);
    const actions = await getGrowthActions(storeId);
    return NextResponse.json({ ok: true, actions });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
