// hiloomy.com/r/{slug}/{code} — the short tracked affiliate link (HLA-13/B3).
//
// This is the URL affiliates put in bios and say aloud in stories. It
// resolves the brand by slug, records the click through the EXISTING
// click-capture machinery (AttributionSession + aff_click_id cookie), and
// 307s the visitor to the storefront with ref/utm parameters intact.
//
// Visitor-first failure policy: if the affiliate code is unknown we still
// send the visitor to the store (unattributed) — a broken link must never
// cost the brand a sale.

import { NextResponse } from "next/server";
import { getProgramBySlug } from "@/lib/services/affiliate-signup-service";
import {
  buildTrackedDestinationUrl,
  createAffiliateRedirectSession,
  sanitizeDestinationPath
} from "@/lib/services/affiliate-link-tracking-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const context = await getProgramBySlug(slug).catch(() => null);
  if (!context) {
    return NextResponse.json({ ok: false, error: "Unknown link." }, { status: 404 });
  }

  const url = new URL(request.url);
  const destinationPath = sanitizeDestinationPath(url.searchParams.get("to"));
  const utmSource = url.searchParams.get("utm_source") ?? "affiliate";
  const utmMedium = url.searchParams.get("utm_medium") ?? "referral";
  const utmCampaign = url.searchParams.get("utm_campaign");
  // Optional coupon auto-apply (?coupon=X15): the redirect goes through
  // Shopify's /discount/{code} endpoint, which stores the code for checkout.
  // Restricted charset — the value lands in a URL path.
  const rawCoupon = url.searchParams.get("coupon")?.trim() ?? "";
  const coupon = /^[A-Za-z0-9._-]{1,64}$/.test(rawCoupon) ? rawCoupon : null;

  try {
    const session = await createAffiliateRedirectSession({
      storeId: context.store.id,
      affiliateCode: decodeURIComponent(code),
      couponCode: coupon,
      destinationPath,
      sourceUrl: request.headers.get("referer"),
      utmSource,
      utmMedium,
      utmCampaign,
      visitorToken: request.headers.get("x-forwarded-for"),
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent")
    });

    const trackedUrl = buildTrackedDestinationUrl({
      shopDomain: context.store.domain,
      destinationPath,
      couponCode: coupon,
      affiliateCode: session.affiliate.affiliateCode,
      clickId: session.clickId,
      utmSource,
      utmMedium,
      utmCampaign
    });
    // With a coupon, hop via /discount/{code}. The tracked path (ref +
    // agent_click_id + UTMs) rides INSIDE the redirect param, so it reaches
    // the landing URL no matter which query params Shopify itself forwards.
    let redirectUrl = trackedUrl;
    if (coupon) {
      const tracked = new URL(trackedUrl);
      redirectUrl = `https://${context.store.domain}/discount/${encodeURIComponent(
        coupon
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
    // Unknown code / DB blip — deliver the visitor to the store anyway,
    // still applying the promised coupon (unattributed beats broken).
    const fallback = coupon
      ? `https://${context.store.domain}/discount/${encodeURIComponent(coupon)}?redirect=${encodeURIComponent(destinationPath)}`
      : `https://${context.store.domain}${destinationPath}`;
    return NextResponse.redirect(fallback, { status: 307 });
  }
}
