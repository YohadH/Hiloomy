import { NextResponse } from "next/server";
import { APP_LOCALE_COOKIE, isValidLocale } from "@/lib/i18n";

export async function POST(request: Request) {
  const body = await request.json();
  const locale = typeof body?.locale === "string" ? body.locale : "";

  if (!isValidLocale(locale)) {
    return NextResponse.json({ ok: false, error: "Invalid locale." }, { status: 400 });
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
