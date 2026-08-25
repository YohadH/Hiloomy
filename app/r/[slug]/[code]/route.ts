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

  try {
    const session = await createAffiliateRedirectSession({
      storeId: context.store.id,
      affiliateCode: decodeURIComponent(code),
      destinationPath,
      sourceUrl: request.headers.get("referer"),
      utmSource,
      utmMedium,
      utmCampaign,
      visitorToken: request.headers.get("x-forwarded-for"),
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent")
    });

    const redirectUrl = buildTrackedDestinationUrl({
      shopDomain: context.store.domain,
      destinationPath,
      affiliateCode: session.affiliate.affiliateCode,
      clickId: session.clickId,
      utmSource,
      utmMedium,
      utmCampaign
    });
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
    // Unknown code / DB blip — deliver the visitor to the store anyway.
    return NextResponse.redirect(`https://${context.store.domain}${destinationPath}`, { status: 307 });
  }
}
