import { NextResponse } from "next/server";
import { createAffiliateCouponInShopify } from "@/lib/services/affiliate-portal-admin-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // This route creates a REAL discount on the store's Shopify — it must
    // never run unauthenticated. Resolve the target store (explicit body
    // storeId, else the caller's active store) and assert org ownership.
    const storeId: string | undefined =
      typeof body.storeId === "string" && body.storeId
        ? body.storeId
        : ((await resolveActiveStoreId()) ?? undefined);
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    const result = await createAffiliateCouponInShopify({
      storeId,
      affiliateId: body.affiliateId,
      code: body.code,
      title: body.title,
      creationMode: body.creationMode,
      discountType: body.discountType,
      value: Number(body.value),
      appliesOncePerCustomer: body.appliesOncePerCustomer,
      redirectPath: body.redirectPath,
      assignmentMode: body.assignmentMode,
      purchaseType: body.purchaseType,
      appliesToType: body.appliesToType,
      appliesToProductIds: Array.isArray(body.appliesToProductIds) ? body.appliesToProductIds : [],
      appliesToCollectionIds: Array.isArray(body.appliesToCollectionIds) ? body.appliesToCollectionIds : [],
      minimumRequirementType: body.minimumRequirementType,
      minimumSubtotal: body.minimumSubtotal == null ? null : Number(body.minimumSubtotal),
      minimumQuantity: body.minimumQuantity == null ? null : Number(body.minimumQuantity),
      customerEligibilityType: body.customerEligibilityType,
      customerSegmentIds: Array.isArray(body.customerSegmentIds) ? body.customerSegmentIds : [],
      usageLimit: body.usageLimit == null || body.usageLimit === "" ? null : Number(body.usageLimit),
      combinesWith: body.combinesWith
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
