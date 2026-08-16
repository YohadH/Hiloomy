// Edge middleware — runs on every request before the page handler.
//
// Three jobs:
//   1. Refresh the Supabase Auth session (rotates JWT in cookies, keeps
//      the user signed in across server-component renders).
//   2. Gate protected routes — anything outside the public allowlist
//      requires a signed-in user. Unauthenticated users get redirected
//      to /signin with `?next=<original_url>` so they land back where
//      they started after sign in.
//   3. Lazy-provision User + default Org for first-time signed-in users
//      who haven't completed the callback handler (e.g. magic link came
//      in another browser).
//
// Public routes (no auth required):
//   - / (marketing landing; will move to /app for the dashboard later)
//   - /signin, /signup, /forgot-password, /reset-password
//   - /privacy, /terms
//   - /api/auth/callback (Supabase verification redirect)
//   - /api/webhooks/* (Shopify, BixGrow, etc — auth via signature)
//   - /api/cron/* (cron self-pings — locked behind CRON_SECRET; see
//     requireCronSecret below. These routes ALWAYS require a matching
//     x-cron-secret header. When CRON_SECRET is absent the guard returns
//     401 (fail-closed) — CRON_SECRET must be set in all environments.)
//   - /api/meta/data-deletion (Meta deletion callback protocol)
//
// Static assets (_next, favicon, robots, etc) bypass middleware via
// the `matcher` config below.

import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/auth/supabase-server";

// Run the middleware on the Node.js runtime (not the default Edge runtime).
// Supabase SSR (@supabase/ssr → @supabase/supabase-js) touches Node-only APIs
// such as `process.version`, which the Edge runtime does not support and which
// breaks the Render production build ("A Node.js API is used (process.version)
// which is not supported in the Edge Runtime"). Node.js middleware is stable in
// Next.js 15.2+, so we pin it here. Do NOT remove without making supabase-server
// edge-compatible first.
export const runtime = "nodejs";

// Note: "/" is intentionally NOT public — that's the Command Center
// dashboard. When the marketing site lands (Phase 4) we'll either move
// the dashboard to `/app` or host the marketing site on a separate
// subdomain. Until then anonymous "/" hits get bounced to /signin.
const PUBLIC_PATHS = new Set([
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/security",
  // Public marketing landing — pre-signup.
  "/welcome",
  // /accept-invite handles its own auth gate — it redirects to /signin
  // with the right `next` if the user isn't signed in. Treat as public.
  "/accept-invite",
  // Public marketing comparison page (Hebrew) — HEB-CONTENT-DEV-01.
  "/compare-he"
]);

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/webhooks/",
  "/api/cron/",
  "/api/meta/data-deletion",
  // Stripe sends webhooks server-to-server; they're authenticated by
  // signature, not session cookies. Treating this as public lets the
  // signature-verifying handler run.
  "/api/billing/webhook"
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

// Cron routes are session-less (the in-process schedulers self-ping them, and
// an external scheduler may hit them too). To stop anyone on the internet from
// triggering a full sync / email blast, gate /api/cron/* behind a shared
// secret: the request MUST carry a matching `x-cron-secret` header.
// CRON_SECRET MUST be set in all environments (local dev and production).
// When CRON_SECRET is absent the guard returns 401 (fail-closed, not fail-open).
//
// Returns a 401 NextResponse to short-circuit with, or null to allow through.
function requireCronSecret(req: NextRequest): NextResponse | null {
  if (!req.nextUrl.pathname.startsWith("/api/cron/")) return null;

  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); // fail-closed: deny when CRON_SECRET is not configured

  const provided = req.headers.get("x-cron-secret")?.trim();
  if (provided && provided === expected) return null; // authorized

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function middleware(req: NextRequest) {
  // Cron lock — reject unauthorized /api/cron/* hits before doing any other
  // work. Runs ahead of the public-route short-circuit so the CRON_SECRET
  // gate is not bypassed by /api/cron/ being in PUBLIC_PREFIXES.
  const cronReject = requireCronSecret(req);
  if (cronReject) return cronReject;

  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");

  // ───────── /api/* SHORT-CIRCUIT ─────────
  // API routes get a bare NextResponse.next() with NO Supabase auth call,
  // NO cookie writes, NO header rewrites. Reasoning: the Next.js 15
  // nodejs-runtime middleware body-lock bug has at least four observed
  // triggers (header rewrite, req.cookies.set, res.cookies.set during
  // Supabase rotation, and apparently just supabase.auth.getUser() itself
  // under certain code paths — possibly the rate-limit retry logic).
  // Disarming triggers one-by-one was whack-a-mole; the cleanest fix is
  // to keep middleware OUT of every API request entirely.
  //
  // What we lose: middleware-level auth gating for /api/*. Route handlers
  // already self-auth via getAuthContext() / resolveActiveStoreId() so
  // protected routes still return 401/400 on no-user; an API redirect to
  // /signin was the wrong response anyway (clients want JSON, not HTML).
  // Session refresh continues to work: page routes still call Supabase
  // below and rotate the JWT cookie on every page nav, so the user stays
  // signed in for as long as they navigate pages.
  if (isApiRoute) {
    return NextResponse.next();
  }

  // ───────── PAGE ROUTES ─────────
  // Stamp the current pathname onto a request header so server components
  // downstream (especially AppShell's paywall gate) can read it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // Local-QA auth bypass — same triple lock as lib/auth/session.ts
  // (non-production + DEV_QA_BYPASS_TOKEN set + matching cookie). Lets the
  // local Playwright harness reach authenticated pages without Supabase.
  const qaToken = process.env.NODE_ENV !== "production" ? process.env.DEV_QA_BYPASS_TOKEN?.trim() : undefined;
  if (qaToken && req.cookies.get("gg_qa_bypass")?.value === qaToken) {
    return res;
  }

  // Refresh the Supabase session.
  let user: { id: string } | null = null;
  try {
    const supabase = createMiddlewareSupabaseClient(req, res);
    const { data } = await supabase.auth.getUser();
    user = data?.user ? { id: data.user.id } : null;
  } catch {
    // Supabase env not configured (e.g. CI) OR rate-limited (429). Treat
    // as anonymous — the user will hit the signin redirect below. The
    // 429 catch path used to render the entire app unusable when Supabase
    // got slow; now it just adds one extra signin round-trip.
    user = null;
  }

  const { pathname, search } = req.nextUrl;

  // Public routes — let everything through.
  if (isPublic(pathname)) {
    // Bonus: signed-in users hitting /signin or /signup should be sent
    // home instead of seeing the form again.
    if (user && (pathname === "/signin" || pathname === "/signup")) {
      const home = req.nextUrl.clone();
      home.pathname = "/";
      home.search = "";
      return NextResponse.redirect(home);
    }
    return res;
  }

  // Protected routes — gate behind auth.
  if (!user) {
    const signin = req.nextUrl.clone();
    signin.pathname = "/signin";
    signin.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(signin);
  }

  // Note: trial-expiry paywall enforcement lives in `lib/billing/trial-gate.ts`
  // and runs as a server-component check inside AppShell. Doing it here in
  // middleware would require importing Prisma into the edge runtime, which
  // is not supported.

  return res;
}

export const config = {
  matcher: [
    // Run on every request EXCEPT:
    //   _next/static, _next/image, /favicon.ico, /robots.txt, /sitemap.xml,
    //   files with extensions (images, fonts, etc.)
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"
  ]
};
