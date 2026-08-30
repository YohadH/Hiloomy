import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getGrowthFindings } from "@/lib/services/growth-agent-service";
import { resolveScopedStoreId } from "@/lib/auth/guards";
import { getAuthContext } from "@/lib/auth/session";

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const url = new URL(request.url);
    const storeId = await resolveScopedStoreId(url.searchParams.get("storeId"));
    const findings = await getGrowthFindings(storeId);
    return NextResponse.json({ ok: true, findings });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
