// Dev-only browser login for the local-QA auth bypass.
//
// Visiting /api/dev/qa-login?token=<DEV_QA_BYPASS_TOKEN> sets the
// gg_qa_bypass cookie and redirects to the dashboard, so a human can
// enter the app locally without Supabase credentials (same mechanism the
// Playwright harness uses — see lib/auth/session.ts).
//
// Same triple lock as the bypass itself: NODE_ENV must not be production,
// DEV_QA_BYPASS_TOKEN must be set, and the ?token= query must match it.
// In production (or with the env var unset) the route 404s.
//
// /api/dev/qa-login?clear=1 removes the cookie (local "sign out").

import { NextResponse, type NextRequest } from "next/server";
import { QA_BYPASS_COOKIE } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const token =
    process.env.NODE_ENV !== "production"
      ? process.env.DEV_QA_BYPASS_TOKEN?.trim()
      : undefined;
  if (!token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (req.nextUrl.searchParams.get("clear") === "1") {
    const res = NextResponse.redirect(new URL("/welcome", req.url));
    res.cookies.delete(QA_BYPASS_COOKIE);
    return res;
  }

  if (req.nextUrl.searchParams.get("token")?.trim() !== token) {
    return NextResponse.json({ error: "Bad token" }, { status: 401 });
  }

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(QA_BYPASS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return res;
}
