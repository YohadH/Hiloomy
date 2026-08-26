// POST /api/affiliate-portal/short-links — mint a hiloomy.com/l/{token}
// short link for an affiliate (coupon + destination + UTMs stored server-
// side). Owner-authenticated: links are per-store assets.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { createAffiliateShortLink } from "@/lib/services/affiliate-short-link-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      affiliateId?: string;
      couponCode?: string | null;
      destinationPath?: string | null;
      utmSource?: string | null;
      utmMedium?: string | null;
      utmCampaign?: string | null;
    };
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);
    if (!body.affiliateId) throw new AppError("affiliateId is required.", 400);

    const result = await createAffiliateShortLink({
      storeId,
      affiliateId: body.affiliateId,
      couponCode: body.couponCode,
      destinationPath: body.destinationPath,
      utmSource: body.utmSource,
      utmMedium: body.utmMedium,
      utmCampaign: body.utmCampaign
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
