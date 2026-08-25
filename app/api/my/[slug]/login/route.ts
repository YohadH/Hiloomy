// POST /api/my/{slug}/login — send an affiliate a magic login link (B8).
// Response is identical whether or not the email exists (no enumeration).

import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { isSignupRateLimited, issueLoginLink } from "@/lib/services/affiliate-signup-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isSignupRateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: "יותר מדי ניסיונות — נסו שוב בעוד כמה דקות." },
        { status: 429 }
      );
    }
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    await issueLoginLink({ slug, email: body.email ?? "" }).catch(() => ({ sent: false }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
