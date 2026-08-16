import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import type { GrowthProductRecommendation } from "@/lib/domain/growth-agent-types";
import { importGrowthAgentRecommendationToShopify } from "@/lib/services/growth-agent-product-crawler-service";
import { getAuthContext } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const body = await request.json();
    const recommendation = body?.recommendation as GrowthProductRecommendation | undefined;
    if (typeof body?.storeId !== "string" || !body.storeId) {
      throw new AppError("Store id is required to import a Growth Agent recommendation.", 400);
    }

    if (!recommendation?.title || !recommendation?.sourceUrl || !recommendation?.sourceDomain) {
      throw new AppError("Recommendation payload is incomplete.", 400);
    }

    const result = await importGrowthAgentRecommendationToShopify(recommendation, body?.storeId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
