// hiloomy.com/l/{token} — the genuinely short affiliate link.
//
// The token row (AffiliateShortLink) carries what /r/{slug}/{code} takes
// as query params: coupon, destination, UTMs. Resolution feeds the SAME
// click-capture machinery as /r — AttributionSession + aff_click_id — and
// the same visitor-first failure policy: a broken link still delivers the
// visitor to the store.

import { NextResponse } from "next/server";
import { resolveAffiliateShortLink } from "@/lib/services/affiliate-short-link-service";
import {
  buildTrackedDestinationUrl,
  createAffiliateRedirectSession
} from "@/lib/services/affiliate-link-tracking-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const link = await resolveAffiliateShortLink(token).catch(() => null);
  if (!link) {
    return NextResponse.json({ ok: false, error: "Unknown link." }, { status: 404 });
  }

  const utmSource = link.utmSource ?? "affiliate";
  const utmMedium = link.utmMedium ?? "referral";

  try {
    const session = await createAffiliateRedirectSession({
      storeId: link.storeId,
      affiliateCode: link.affiliateCode,
      couponCode: link.couponCode,
      destinationPath: link.destinationPath,
      sourceUrl: request.headers.get("referer"),
      utmSource,
      utmMedium,
      utmCampaign: link.utmCampaign,
      visitorToken: request.headers.get("x-forwarded-for"),
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent")
    });

    const trackedUrl = buildTrackedDestinationUrl({
      shopDomain: link.storeDomain,
      destinationPath: link.destinationPath,
      couponCode: link.couponCode,
      affiliateCode: session.affiliate.affiliateCode,
      clickId: session.clickId,
      utmSource,
      utmMedium,
      utmCampaign: link.utmCampaign
    });
    // With a coupon, hop via /discount/{code}; the tracked path rides
    // INSIDE the redirect param so it reaches the landing URL regardless
    // of which query params Shopify itself forwards.
    let redirectUrl = trackedUrl;
    if (link.couponCode) {
      const tracked = new URL(trackedUrl);
      redirectUrl = `https://${link.storeDomain}/discount/${encodeURIComponent(
        link.couponCode
      )}?redirect=${encodeURIComponent(`${tracked.pathname}${tracked.search}`)}`;
    }
    const response = NextResponse.redirect(redirectUrl, { status: 307 });
    response.cookies.set("aff_click_id", session.clickId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  } catch {
    // DB blip — deliver the visitor to the store anyway, still applying
    // the promised coupon (unattributed beats broken).
    const fallback = link.couponCode
      ? `https://${link.storeDomain}/discount/${encodeURIComponent(link.couponCode)}?redirect=${encodeURIComponent(link.destinationPath)}`
      : `https://${link.storeDomain}${link.destinationPath}`;
    return NextResponse.redirect(fallback, { status: 307 });
  }
}
