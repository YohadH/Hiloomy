import { NextResponse } from "next/server";
import { createAffiliate } from "@/lib/services/affiliate-portal-directory-service";
import { toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getAuthContext } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const body = await request.json();
    if (body.storeId) await assertStoreInActiveOrg(body.storeId);
    const result = await createAffiliate({
      storeId: body.storeId,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      country: body.country,
      source: body.source,
      status: body.status,
      affiliateCode: body.affiliateCode,
      couponCode: body.couponCode,
      instagramProfileUrl: body.instagramProfileUrl,
      referralLink: body.referralLink,
      shortLink: body.shortLink,
      programName: body.programName
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 400 });
  }
}
