import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveAffiliateSourcePlatform } from "@/lib/services/affiliate-attribution-source";
import {
  buildTrackedDestinationUrl,
  createAffiliateRedirectSession,
  sanitizeDestinationPath
} from "@/lib/services/affiliate-link-tracking-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const affiliateCode = url.searchParams.get("affiliate") ?? url.searchParams.get("ref") ?? url.searchParams.get("bg_ref");
    if (!affiliateCode) {
      return NextResponse.json({ ok: false, error: "affiliate code is required" }, { status: 400 });
    }

    const couponCode = url.searchParams.get("coupon");
    const destinationPath = sanitizeDestinationPath(url.searchParams.get("destination"));
    const productId = url.searchParams.get("product") ?? url.searchParams.get("productId");
    const sourcePlatform = resolveAffiliateSourcePlatform({
      sourcePlatform: url.searchParams.get("sourcePlatform"),
      sourceUrl: url.searchParams.get("sourceUrl"),
      bgRefCode: url.searchParams.get("bg_ref")
    });
    // Multi-tenant disambiguation: without a store hint this public route
    // falls back to the base store, which is wrong the moment a second
    // tenant connects. Links can append &shop=<store>.myshopify.com.
    const shopParam = url.searchParams.get("shop") ?? url.searchParams.get("store");
    let storeId: string | undefined;
    if (shopParam) {
      const { getDb } = await import("@/lib/server/db");
      const store = await getDb()?.store.findFirst({
        where: { domain: shopParam.trim().toLowerCase() },
        select: { id: true }
      });
      if (!store) {
        return NextResponse.json({ ok: false, error: "Unknown store." }, { status: 404 });
      }
      storeId = store.id;
    }

    const session = await createAffiliateRedirectSession({
      storeId,
      affiliateCode,
      couponCode,
      destinationPath,
      productId,
      sourcePlatform,
      sourceUrl: url.searchParams.get("sourceUrl"),
      utmSource: url.searchParams.get("utm_source"),
      utmMedium: url.searchParams.get("utm_medium"),
      utmCampaign: url.searchParams.get("utm_campaign"),
      visitorToken: request.headers.get("x-forwarded-for") ?? null,
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null
    });

    const redirectUrl = buildTrackedDestinationUrl({
      shopDomain: session.store.domain,
      destinationPath,
      couponCode,
      affiliateCode: session.affiliate.affiliateCode,
      clickId: session.clickId,
      sourcePlatform,
      utmSource: url.searchParams.get("utm_source"),
      utmMedium: url.searchParams.get("utm_medium"),
      utmCampaign: url.searchParams.get("utm_campaign")
    });

    const response = NextResponse.redirect(redirectUrl, { status: 307 });
    // First-party session cookie so a later conversion can be matched back to
    // this click even if the storefront localStorage snippet never runs.
    // Keyed on clickId (the AttributionSession.clickId / agent_click_id value).
    response.cookies.set("aff_click_id", session.clickId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });
    return response;
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: statusCode });
  }
}
