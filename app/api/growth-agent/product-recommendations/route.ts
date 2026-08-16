import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { runGrowthAgentProductRecommendationScan } from "@/lib/services/growth-agent-product-crawler-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required for Growth Agent product discovery.", 400);
    }
    await assertStoreInActiveOrg(body.storeId);
    const result = await runGrowthAgentProductRecommendationScan(body.storeId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}

