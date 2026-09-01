import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";

// POST /api/auth/auto-confirm  { email }
//
// Confirms a Supabase auth user's email WITHOUT the confirmation mail — but
// only for people we invited: an open Invitation row, or a design-partner
// StoreOnboarding.invitedEmail. Email confirmation exists to stop someone
// registering another person's address and then, say, accepting that
// person's invite; restricting auto-confirm to addresses WE addressed keeps
// that guarantee while removing the dependency on outbound email, which is
// not configured (1 Sep 2026: two partners and a teammate locked out with
// "Email not confirmed", the Supabase dashboard down, no way to confirm).
//
// Called by the signup form right after signUp (then the client signs in),
// and by the sign-in form when Supabase answers "Email not confirmed".
// Writes auth.users directly with the app's DB role (same as the ops script).

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  }
  try {
    const db = getDb() as any;
    const [invitation, onboarding] = await Promise.all([
      db.invitation.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, expiresAt: { gt: new Date() } },
        select: { id: true }
      }),
      db.storeOnboarding
        ? db.storeOnboarding.findFirst({ where: { invitedEmail: { equals: email, mode: "insensitive" } }, select: { id: true } })
        : null
    ]);
    // Also: a User row that already exists and is a member somewhere (e.g. an
    // invite consumed earlier, or a member added by the ops script) is ours.
    const knownMember = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, memberships: { some: {} } },
      select: { id: true }
    });
    if (!invitation && !onboarding && !knownMember) {
      return NextResponse.json({ ok: true, confirmed: false, reason: "not_invited" });
    }
    const updated = (await db.$executeRaw`
      UPDATE auth.users
      SET email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
      WHERE lower(email) = ${email}`) as number;
    return NextResponse.json({ ok: true, confirmed: updated > 0, reason: updated > 0 ? "invited" : "no_auth_user" });
  } catch (error) {
    console.error("[auth/auto-confirm]", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "auto-confirm failed" }, { status: 500 });
  }
}
