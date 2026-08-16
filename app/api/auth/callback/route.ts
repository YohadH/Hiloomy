import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";
import { ensureUserProvisioned } from "@/lib/auth/session";
import { sendTransactionalEmail } from "@/lib/email/email-client";
import { welcomeEmail } from "@/lib/email/templates";
import { getDb } from "@/lib/server/db";

// Supabase Auth email verification + OAuth callback handler.
//
// Flow:
//   1. Supabase emails the user a magic verification link that hits this URL
//      with a one-time `code` parameter.
//   2. We exchange `code` → session (Supabase sets the auth cookies).
//   3. We ensure our `User` + default `Organization` rows exist for this
//      Supabase user (lazy provisioning on first verified sign-in).
//   4. Redirect to `next` (usually the app home).

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/signin?error=missing_code", url));
  }

  const supabase = await createRouteHandlerSupabaseClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(exchangeError.message)}`, url)
    );
  }

  // Pull the freshly-signed-in user and provision them if needed.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    let isNewUser = false;
    try {
      // Detect "this is the first time we've seen this Supabase user"
      // by checking if our User row already exists. We do this BEFORE
      // ensureUserProvisioned creates it.
      const db = getDb();
      const existing = await db.user.findUnique({
        where: { authUserId: user.id },
        select: { id: true }
      });
      isNewUser = !existing;
      await ensureUserProvisioned({
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
      });
    } catch (err) {
      console.error("[auth callback] provisioning failed:", err);
      // Continue anyway — user can still hit pages; provisioning will be
      // retried on the next authenticated request.
    }

    // Welcome email — fire-and-forget. Email failures don't block sign-in.
    if (isNewUser && user.email) {
      const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
      const locale = (user.user_metadata?.["locale"] as string | undefined) === "en" ? "en" : "he";
      const template = welcomeEmail({
        displayName: (user.user_metadata?.["display_name"] as string | undefined) ?? null,
        appUrl,
        locale: locale as "he" | "en"
      });
      sendTransactionalEmail({
        to: user.email,
        subject: template.subject,
        html: template.html
      }).catch((err) => console.error("[auth callback] welcome email failed:", err));
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
