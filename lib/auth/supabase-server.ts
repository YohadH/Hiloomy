// Server-side Supabase client for App Router server components, API routes,
// and middleware. Uses @supabase/ssr to bridge cookies between Supabase
// Auth and Next.js's request/response cycle.
//
// We expose three factories with slightly different cookie strategies:
//
//   1. `createServerSupabaseClient()` — for Server Components.
//      Reads cookies; cannot write (RSCs are render-time only).
//
//   2. `createRouteHandlerSupabaseClient()` — for /api routes + route
//      handlers (POST /signup etc). Reads AND writes cookies.
//
//   3. `createMiddlewareSupabaseClient(req, res)` — for middleware.ts.
//      Writes cookies onto the NextResponse it returns.
//
// All three share env vars `SUPABASE_URL` + `SUPABASE_ANON_KEY` (NOT the
// service_role key — we never use service role in user-context code; it
// would bypass RLS).

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

function envUrl(): string {
  const v = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set.");
  return v;
}
function envAnonKey(): string {
  const v = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is not set.");
  return v;
}

// ─── 1. Server Component client (read-only) ────────────────────────
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(envUrl(), envAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // RSC has no response object to set cookies on. Supabase calls
      // setAll() when it refreshes a token; in RSC we swallow it — the
      // middleware will re-fetch the session and write the cookie on
      // the next request.
      setAll: () => {}
    }
  });
}

// ─── 2. Route handler client (read+write) ─────────────────────────
export async function createRouteHandlerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(envUrl(), envAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options as CookieOptions);
          } catch {
            // set() throws if called outside a Server Action / Route
            // Handler context. Safe to swallow — middleware handles it.
          }
        }
      }
    }
  });
}

// ─── 3. Middleware client (request + response cookie bridge) ──────
export function createMiddlewareSupabaseClient(
  req: NextRequest,
  res: NextResponse,
  options: { dropSetAll?: boolean } = {}
) {
  return createServerClient(envUrl(), envAnonKey(), {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        // KNOWN BODY-LOCK TRIGGERS in Next.js 15 nodejs-runtime middleware:
        //   1. `req.cookies.set(...)` — request-cookie mutation. Removed
        //      below by NOT calling it.
        //   2. `NextResponse.next({ request: { headers } })` — request-
        //      header rewrite. Handled in middleware.ts (skipped for /api).
        //   3. `res.cookies.set(...)` — response-cookie mutation. This
        //      ALSO locks the request body, but only fires when Supabase
        //      rotates a JWT (sporadic — looks intermittent). For /api/*
        //      routes we don't need to write the rotated cookie back at
        //      all; the next page-route hit will rotate again. Page
        //      routes still need the write so the user stays signed in.
        //
        // When dropSetAll=true, swallow the rotation. Otherwise behave
        // as before and write the cookie onto `res`.
        if (options.dropSetAll) return;
        for (const { name, value, options: cookieOptions } of cookiesToSet) {
          res.cookies.set(name, value, cookieOptions as CookieOptions);
        }
      }
    }
  });
}
