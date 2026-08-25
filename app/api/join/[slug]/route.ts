// POST /api/join/{slug} — public affiliate signup (HLA-12/B2).
// Creates the member (status per the program's autoApprove), sets the
// affiliate session cookie (auto-login, confirmed call #5), and for an
// email that's already registered, sends a magic login link instead of
// erroring.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import {
  isSignupRateLimited,
  issueLoginLink,
  registerAffiliate
} from "@/lib/services/affiliate-signup-service";
import {
  AFFILIATE_SESSION_COOKIE,
  AFFILIATE_SESSION_COOKIE_OPTIONS
} from "@/lib/server/affiliate-session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      fullName?: string;
      email?: string;
      instagram?: string;
      website?: string; // honeypot
    };

    // Honeypot filled → bot. Answer success so it learns nothing.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({ ok: true, mode: "created" });
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isSignupRateLimited(ip)) {
      throw new AppError("יותר מדי ניסיונות — נסו שוב בעוד כמה דקות.", 429);
    }

    const result = await registerAffiliate({
      slug,
      fullName: body.fullName,
      email: body.email,
      instagram: body.instagram
    });

    if (result.mode === "existing") {
      // Returning affiliate — hand them a login link (best-effort email;
      // the response is identical either way to avoid email enumeration).
      await issueLoginLink({ slug, email: body.email ?? "" }).catch(() => ({ sent: false }));
      return NextResponse.json({ ok: true, mode: "existing" });
    }

    const response = NextResponse.json({
      ok: true,
      mode: "created",
      status: result.status,
      affiliateCode: result.affiliateCode
    });
    if (result.sessionToken) {
      response.cookies.set(AFFILIATE_SESSION_COOKIE, result.sessionToken, AFFILIATE_SESSION_COOKIE_OPTIONS);
    }
    return response;
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
