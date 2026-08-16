import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";

// POST /api/auth/signout — clear Supabase auth cookies and redirect to
// the sign-in page. Wired to a button in the user menu.

export async function POST(request: Request) {
  const supabase = await createRouteHandlerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/signin", request.url));
}
