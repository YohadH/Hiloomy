// Shopify App Proxy resolver for short links on the STORE's own domain:
//   {store-domain}/apps/go/{token}  ->  Shopify proxies to
//   {APP_URL}/api/shopify/app-proxy/{token}?shop=...&signature=...
//
// This is the store-domain twin of /l/{token}: it runs the SAME click-capture
// + coupon logic, but because the response is served under the store's own
// domain the affiliate cookie is FIRST-PARTY (stronger attribution, no
// third-party-cookie blocking). We verify Shopify's proxy signature (per-shop
// app secret) first, then browser-redirect to the store's /discount page.
//
// Requires an App Proxy configured on the store's app:
//   Subpath prefix: apps · Subpath: go · Proxy URL: {APP_URL}/api/shopify/app-proxy
//
// Router (Creator Storefronts, 2026-09-24 — the subpath stays "go"):
//   /apps/go/{token}            short link (below, unchanged)
//   /apps/go/@{creatorSlug}     creator storefront (Liquid, rendered in the theme)
//   /apps/go/@test              proxy smoke test (Liquid) · /apps/go/test plain echo
// Short-link tokens are base62, so a first segment starting with "@" can never
// be a token. Shopify forwards the path decoded ("%40" arrives as "@").

import { NextResponse } from "next/server";
import { DIAG_HEADERS, buildProxyEcho, renderDiagnosticsHtml, renderDiagnosticsLiquid } from "@/lib/services/creator-storefront-proxy-diagnostics";
import { resolveAffiliateShortLink } from "@/lib/services/affiliate-short-link-service";
import { verifyAppProxySignature } from "@/lib/services/shopify-oauth-service";
import {
  buildTrackedDestinationUrl,
  createAffiliateRedirectSession
} from "@/lib/services/affiliate-link-tracking-service";

export const dynamic = "force-dynamic";

// Return an HTML page that redirects the BROWSER (not Shopify's proxy) to the
// destination, and carries the first-party cookie. A meta refresh + script
// covers both JS-on and JS-off; the <a> is the last-resort manual fallback.
function browserRedirect(target: string, cookie?: { name: string; value: string }): NextResponse {
  const safe = target.replace(/"/g, "&quot;");
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${safe}">
<script>window.location.replace(${JSON.stringify(target)});</script>
<title>Redirecting…</title></head>
<body style="font-family:system-ui;padding:2rem;text-align:center">
Redirecting… <a href="${safe}">Continue</a></body></html>`;
  const response = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
  if (cookie) {
    // Served under the store domain via the proxy → first-party cookie.
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  }
  return response;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ rest: string[] }> }
) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const { rest } = await params;
  const segments = (rest ?? []).map((s) => decodeURIComponent(s).trim()).filter(Boolean);
  const first = segments[0] ?? "";

  // 1. Authenticate the proxy request (fail closed on a bad/missing signature).
  const signatureValid = await verifyAppProxySignature(url.searchParams);
  // The plain echo is the ONE response allowed through with a bad signature: it
  // says so in its body and exists precisely to debug proxy setup. It leaks no data.
  if (first === "test" && segments.length === 1) {
    return new NextResponse(renderDiagnosticsHtml(buildProxyEcho(request, segments, signatureValid)), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...DIAG_HEADERS }
    });
  }
  if (!signatureValid) {
    return new NextResponse("Invalid app proxy signature.", { status: 401 });
  }

  // 2. Creator storefront namespace: "@{slug}".
  if (first.startsWith("@")) {
    const slug = first.slice(1).toLowerCase();
    if (slug === "test") {
      return new NextResponse(renderDiagnosticsLiquid(buildProxyEcho(request, segments, signatureValid)), {
        status: 200,
        headers: { "Content-Type": "application/liquid; charset=utf-8", ...DIAG_HEADERS }
      });
    }
    // Storefront rendering lands in Phase 5. Until then every creator page is
    // "not available" — a theme-styled Liquid body, never a raw error.
    return new NextResponse(
      `<div class="page-width" style="max-width:40rem;margin:4rem auto;padding:0 1rem;text-align:center"><h1>{{ shop.name }}</h1><p>העמוד הזה עדיין לא זמין.</p><p><a href="/">{{ 'general.continue_shopping' | t | default: 'Continue shopping' }}</a></p></div>`,
      { status: 200, headers: { "Content-Type": "application/liquid; charset=utf-8", ...DIAG_HEADERS } }
    );
  }

  // 3. Short link (existing behaviour): the token is the last segment.
  const token = (rest?.[rest.length - 1] ?? "").trim();
  const link = await resolveAffiliateShortLink(token).catch(() => null);

  // Unknown token: still deliver the shopper to the storefront home.
  if (!link) {
    return browserRedirect(shop ? `https://${shop}/` : "/");
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

    let redirectUrl = trackedUrl;
    if (link.couponCode) {
      const tracked = new URL(trackedUrl);
      redirectUrl = `https://${link.storeDomain}/discount/${encodeURIComponent(
        link.couponCode
      )}?redirect=${encodeURIComponent(`${tracked.pathname}${tracked.search}`)}`;
    }
    return browserRedirect(redirectUrl, { name: "aff_click_id", value: session.clickId });
  } catch {
    const fallback = link.couponCode
      ? `https://${link.storeDomain}/discount/${encodeURIComponent(link.couponCode)}?redirect=${encodeURIComponent(link.destinationPath)}`
      : `https://${link.storeDomain}${link.destinationPath}`;
    return browserRedirect(fallback);
  }
}
