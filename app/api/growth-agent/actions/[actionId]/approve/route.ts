import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { approveGrowthAction } from "@/lib/services/growth-agent-action-engine";
import { getAuthContext } from "@/lib/auth/session";

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required to approve a Growth Agent action.", 400);
    }
    const { actionId } = await context.params;
    const result = await approveGrowthAction(actionId, body.approvedBy ?? "merchant", body.storeId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
