import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext, ACTIVE_ORG_COOKIE, ACTIVE_STORE_COOKIE } from "@/lib/auth/session";

// POST /api/settings/active-org
// Body: { orgId: string }
//
// Sets the active-org cookie so a user who belongs to more than one
// organization can switch between them (the OrgSwitcher calls this).
//
// SECURITY: the caller may only switch to an org they are a member of —
// we verify a Membership row exists before writing the cookie, otherwise
// a user could point their session at another tenant's org.

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/active-org?orgId=…  — link form of the switch.
 *
 * Same membership check as POST, then sets the cookies and redirects to
 * /dashboard. Exists so a partner stuck in an empty org can be handed ONE
 * link that lands them in the right org — no switcher UI, no cookie
 * surgery. (Take a Nap, 1 Sep 2026: the top bar showed no switcher for an
 * owner of two orgs and there was nothing else to click.)
 */
export async function GET(request: Request) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  const orgId = new URL(request.url).searchParams.get("orgId")?.trim() ?? "";
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.redirect(`${appUrl}/signin?next=${encodeURIComponent(`/api/settings/active-org?orgId=${orgId}`)}`);
  }
  try {
    if (!orgId) throw new AppError("orgId is required.", 400);
    const db = getDb();
    const membership = await db.membership.findFirst({
      where: { orgId, userId: auth.userId },
      select: { id: true }
    });
    if (!membership) throw new AppError("You don't belong to that organization.", 403);
    const response = NextResponse.redirect(`${appUrl}/dashboard`);
    setActiveOrgCookies(response, orgId);
    return response;
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

function setActiveOrgCookies(response: NextResponse, orgId: string) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  // Drop the active-store cookie — it points at a store in the PREVIOUS
  // org. Clearing it lets getAuthContext re-default to the new org's
  // first store (a stale cross-org store would just be ignored anyway).
  response.cookies.set(ACTIVE_STORE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { orgId?: string };
    const orgId = body.orgId?.trim();
    if (!orgId) throw new AppError("orgId is required.", 400);

    const db = getDb();
    const membership = await db.membership.findFirst({
      where: { orgId, userId: auth.userId },
      select: { id: true }
    });
    if (!membership) {
      throw new AppError("You don't belong to that organization.", 403);
    }

    const response = NextResponse.json({ ok: true, orgId });
    setActiveOrgCookies(response, orgId);
    return response;
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

