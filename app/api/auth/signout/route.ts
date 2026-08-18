import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";

// POST /api/auth/signout — clear Supabase auth cookies and redirect to
// the login page. Wired to a button in the user menu.
//
// Redirects are anchored on APP_URL, never request.url: behind Render's
// proxy the request origin is the internal address (localhost:10000) and
// building an absolute redirect from it leaks that host to the browser.

export async function POST(request: Request) {
  const supabase = await createRouteHandlerSupabaseClient();
  await supabase.auth.signOut();
  const base = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  return NextResponse.redirect(new URL("/login", base), 303);
}
