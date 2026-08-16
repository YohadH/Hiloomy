import { NextResponse } from "next/server";
import { updateAffiliateInstagramProfile } from "@/lib/services/affiliate-portal-directory-service";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ affiliateId: string }> }
) {
  try {
    const [{ affiliateId }, body] = await Promise.all([params, request.json().catch(() => ({}))]);
    // The caller's org-scoped active store wins — the page chrome sends the
    // globally-newest store's id, which 403s for any org that doesn't own
    // it. body.storeId is only a fallback, and whichever id is used must
    // pass the org check.
    const storeId: string | null =
      (await resolveActiveStoreId())
        ?? (typeof body.storeId === "string" && body.storeId ? body.storeId : null);
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    const result = await updateAffiliateInstagramProfile({
      storeId,
      affiliateId,
      instagramProfileUrl: typeof body.instagramProfileUrl === "string" ? body.instagramProfileUrl : ""
    });

    return NextResponse.json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
