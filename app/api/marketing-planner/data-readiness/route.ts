import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { buildMarketingPlannerDataReadiness } from "@/lib/services/marketing-planner-readiness-service";
import { resolveScopedStoreId } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeId = await resolveScopedStoreId(body.storeId);
    const result = await buildMarketingPlannerDataReadiness({
      storeId,
      planningMonth: typeof body.planningMonth === "string" ? body.planningMonth : "",
      refresh: body.refresh === true
    });

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
