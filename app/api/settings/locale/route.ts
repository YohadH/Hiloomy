import { NextResponse } from "next/server";
import { APP_LOCALE_COOKIE, isValidLocale } from "@/lib/i18n";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";

// Language switch. Writes BOTH stores of truth (2026-08-23 fix):
//
//   1. the `app-locale` cookie — what getAppLocale() reads, i.e. every
//      screen rendered through AppShell, and
//   2. User.locale in the DB — what auth.locale reads: /billing,
//      /settings/account, /settings/organization, /settings/audit-log,
//      the BI chat, AND every transactional email (trial-ending, team
//      invites, billing receipts).
//
// Previously only the cookie was written, so switching to Hebrew left
// those pages — and all outgoing email — stuck in the old language
// forever. The two could never converge because nothing wrote the DB.

export async function POST(request: Request) {
  const body = await request.json();
  const locale = typeof body?.locale === "string" ? body.locale : "";

  if (!isValidLocale(locale)) {
    return NextResponse.json({ ok: false, error: "Invalid locale." }, { status: 400 });
  }

  // Best-effort DB persist — a signed-out/preview caller still gets the
  // cookie set, which is all an anonymous visitor needs.
  try {
    const auth = await getAuthContext();
    if (auth.userId) {
      await getDb().user.update({
        where: { id: auth.userId },
        data: { locale }
      });
    }
  } catch (err) {
    console.error("[locale] failed to persist User.locale:", err);
  }

  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set(APP_LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });

  return response;
}
