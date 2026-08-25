// GET  /api/my/{slug}/session?token=… — redeem a magic-link token: verify,
//      set the 30-day session cookie, stamp lastLoginAt, redirect to the
//      dashboard. (Pages can't set cookies; this route can.)
// POST /api/my/{slug}/session {action:"logout"} — clear the session.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { getProgramBySlug } from "@/lib/services/affiliate-signup-service";
import {
  AFFILIATE_SESSION_COOKIE,
  AFFILIATE_SESSION_COOKIE_OPTIONS,
  createAffiliateSessionToken,
  verifyAffiliateToken
} from "@/lib/server/affiliate-session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const context = await getProgramBySlug(slug).catch(() => null);
  if (!context) {
    return NextResponse.redirect(new URL("/", url.origin), { status: 307 });
  }
  const login = verifyAffiliateToken(url.searchParams.get("token"), "login");
  // Token invalid/expired, or minted for a different brand → back to the
  // login screen (without the token, so no redirect loop).
  if (!login || login.storeId !== context.store.id) {
    return NextResponse.redirect(new URL(`/my/${encodeURIComponent(slug)}`, url.origin), {
      status: 307
    });
  }

  // Best-effort: the member may have been deleted since the link was minted.
  const db = getDb();
  const member = await db?.affiliateMember
    ?.findFirst({ where: { id: login.memberId, storeId: context.store.id }, select: { id: true } })
    .catch(() => null);
  if (!member) {
    return NextResponse.redirect(new URL(`/my/${encodeURIComponent(slug)}`, url.origin), {
      status: 307
    });
  }
  await db?.affiliateMember
    ?.update({ where: { id: member.id }, data: { lastLoginAt: new Date() } })
    .catch(() => null);

  const response = NextResponse.redirect(
    new URL(`/my/${encodeURIComponent(slug)}/dashboard`, url.origin),
    { status: 307 }
  );
  response.cookies.set(
    AFFILIATE_SESSION_COOKIE,
    createAffiliateSessionToken(member.id, context.store.id),
    AFFILIATE_SESSION_COOKIE_OPTIONS
  );
  return response;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "logout") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true, redirect: `/my/${encodeURIComponent(slug)}` });
  response.cookies.set(AFFILIATE_SESSION_COOKIE, "", { ...AFFILIATE_SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
