// POST /api/my/{slug}/briefs/{briefId} — the creator marks her own brief as
// posted ("פרסמתי"), optionally with the post URL. Session-cookie gated and
// scoped to this slug's store; the service also checks the brief is hers.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getProgramBySlug } from "@/lib/services/affiliate-signup-service";
import { AFFILIATE_SESSION_COOKIE, verifyAffiliateToken } from "@/lib/server/affiliate-session";
import { markBriefPostedByMember } from "@/lib/services/affiliate-campaign-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; briefId: string }> }
) {
  try {
    const { slug, briefId } = await params;
    const context = await getProgramBySlug(slug).catch(() => null);
    if (!context) throw new AppError("Program not found.", 404);
    const cookieStore = await cookies();
    const session = verifyAffiliateToken(cookieStore.get(AFFILIATE_SESSION_COOKIE)?.value, "session");
    if (!session || session.storeId !== context.store.id) throw new AppError("Please sign in again.", 401);
    const body = (await request.json().catch(() => ({}))) as { postUrl?: string | null };
    const brief = await markBriefPostedByMember(session.memberId, context.store.id, briefId, body.postUrl ?? null);
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
