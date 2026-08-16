import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { approveAmazonSupplierOrderDraft } from "@/lib/services/amazon-supplier-order-service";
import { getAuthContext } from "@/lib/auth/session";

export async function POST(_request: Request, context: { params: Promise<{ draftId: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const { draftId } = await context.params;
    const result = await approveAmazonSupplierOrderDraft(draftId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}