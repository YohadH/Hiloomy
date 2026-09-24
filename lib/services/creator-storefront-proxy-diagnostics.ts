// App-proxy smoke test for Creator Storefronts (Phase 4 gate, owner 2026-09-24).
//
// Until the Dev Dashboard proxy (apps / go → /api/shopify/app-proxy) exists we
// cannot verify what Shopify forwards. These two responses make the first
// verification observable from a browser on the store domain:
//
//   /apps/go/test    → plain HTML echo: decoded path, query params, signature
//                      result, headers we received. Proves the request reaches
//                      Hiloomy and the signature validates.
//   /apps/go/@test   → Content-Type: application/liquid. Shopify renders it
//                      inside the live theme layout, so the page proves the "@"
//                      segment survives, Liquid objects resolve (shop, cart,
//                      template, request), theme layout/header/footer wrap the
//                      body and the shopper's cart session is intact.
//
// Both are noindex, no-store and reveal nothing about any store data beyond
// what the storefront already shows publicly.

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const DIAG_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow"
} as const;

export interface ProxyEcho {
  segments: string[];
  rawPath: string;
  query: Record<string, string>;
  signatureValid: boolean;
  shop: string | null;
  loggedInCustomerId: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
}

export function buildProxyEcho(request: Request, segments: string[], signatureValid: boolean): ProxyEcho {
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) query[k] = k === "signature" ? `${v.slice(0, 6)}…` : v;
  return {
    segments,
    rawPath: url.pathname,
    query,
    signatureValid,
    shop: url.searchParams.get("shop"),
    loggedInCustomerId: url.searchParams.get("logged_in_customer_id"),
    forwardedFor: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent")
  };
}

// Plain HTML (not Liquid) — what Hiloomy saw, nothing rendered by Shopify.
export function renderDiagnosticsHtml(echo: ProxyEcho): string {
  const rows = [
    ["Reached Hiloomy", "yes"],
    ["Proxy signature valid", echo.signatureValid ? "yes" : "NO"],
    ["Path segments (decoded)", echo.segments.join(" / ")],
    ["Raw path", echo.rawPath],
    ["shop", echo.shop],
    ["logged_in_customer_id", echo.loggedInCustomerId ?? "(anonymous)"],
    ["Query params", JSON.stringify(echo.query)],
    ["X-Forwarded-For", echo.forwardedFor],
    ["User-Agent", echo.userAgent]
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Hiloomy proxy check</title>
<style>body{font-family:system-ui;padding:2rem;max-width:56rem;margin:auto}table{border-collapse:collapse;width:100%}td{padding:.4rem .6rem;border-bottom:1px solid #ddd;vertical-align:top}td:first-child{font-weight:600;white-space:nowrap}</style></head>
<body><h1>Hiloomy app proxy · plain echo</h1><p>This response is HTML, not Liquid, so Shopify passes it through untouched. Compare with <code>/apps/go/@test</code>.</p>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table></body></html>`;
}

// Liquid — Shopify renders this inside layout/theme.liquid.
export function renderDiagnosticsLiquid(echo: ProxyEcho): string {
  const echoJson = esc(JSON.stringify({ segments: echo.segments, query: echo.query, signatureValid: echo.signatureValid }));
  return `{% comment %} Hiloomy creator-storefront proxy smoke test {% endcomment %}
<div class="page-width" style="max-width:56rem;margin:2rem auto;padding:0 1rem;font-family:inherit">
  <meta name="robots" content="noindex, nofollow">
  <h1 style="font-size:1.6rem">Hiloomy app proxy · Liquid render check</h1>
  <p>If you can see this store's header and footer around this box, Shopify rendered Hiloomy's Liquid inside the live theme.</p>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Reached Hiloomy</td><td style="padding:.4rem;border-bottom:1px solid #ddd">yes</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Proxy signature valid</td><td style="padding:.4rem;border-bottom:1px solid #ddd">${echo.signatureValid ? "yes" : "NO"}</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Path segments Hiloomy received</td><td style="padding:.4rem;border-bottom:1px solid #ddd"><code>${esc(echo.segments.join(" / "))}</code> (first must be <code>@test</code>)</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Query params received</td><td style="padding:.4rem;border-bottom:1px solid #ddd"><code>${esc(JSON.stringify(echo.query))}</code></td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Liquid: shop.name</td><td style="padding:.4rem;border-bottom:1px solid #ddd">{{ shop.name }}</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Liquid: template</td><td style="padding:.4rem;border-bottom:1px solid #ddd">{{ template }}</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Liquid: request.path</td><td style="padding:.4rem;border-bottom:1px solid #ddd">{{ request.path }}</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Liquid: cart.item_count (session intact if it matches your cart)</td><td style="padding:.4rem;border-bottom:1px solid #ddd">{{ cart.item_count }}</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Liquid: customer</td><td style="padding:.4rem;border-bottom:1px solid #ddd">{% if customer %}{{ customer.id }}{% else %}anonymous{% endif %}</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Liquid: theme</td><td style="padding:.4rem;border-bottom:1px solid #ddd">{{ theme.name }} · schema {{ theme.schema_name }} {{ theme.schema_version }}</td></tr>
    <tr><td style="padding:.4rem;border-bottom:1px solid #ddd;font-weight:600">Liquid: all_products test</td><td style="padding:.4rem;border-bottom:1px solid #ddd">{% assign p = collections.all.products.first %}{% if p %}{{ p.title }} — {{ p.price | money }}{% else %}no product found{% endif %}</td></tr>
  </table>
  <script>window.__hiloomyProxyEcho = ${echoJson};</script>
</div>`;
}
