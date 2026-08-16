import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { createMarketingPlannerDiscountInShopify } from "@/lib/services/marketing-planner-shopify-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const storeId = typeof body?.storeId === "string" ? body.storeId : "";
    if (storeId) await assertStoreInActiveOrg(storeId);
    const code = typeof body?.code === "string" ? body.code : "";
    const title = typeof body?.title === "string" ? body.title : "";
    const valueType = body?.valueType === "percent" || body?.valueType === "fixed" ? body.valueType : null;
    const value = Number(body?.value);
    const startDate = typeof body?.startDate === "string" ? body.startDate : "";
    const endDate = typeof body?.endDate === "string" ? body.endDate : null;
    const appliesOncePerCustomer = Boolean(body?.appliesOncePerCustomer);
    const combinePolicy = typeof body?.combinePolicy === "object" && body.combinePolicy
      ? body.combinePolicy
      : undefined;

    if (!storeId) {
      throw new AppError("Store id is required before creating a Shopify discount.", 400);
    }

    if (!valueType || !Number.isFinite(value) || value <= 0) {
      throw new AppError("Planner could not detect a valid discount value for Shopify creation.", 400);
    }

    if (!startDate) {
      throw new AppError("Planner could not detect a valid start date for Shopify creation.", 400);
    }

    const created = await createMarketingPlannerDiscountInShopify({
      storeId,
      code,
      title,
      valueType,
      value,
      startsAt: startDate,
      endsAt: endDate,
      appliesOncePerCustomer,
      combinePolicy
    });

    return NextResponse.json(created);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
