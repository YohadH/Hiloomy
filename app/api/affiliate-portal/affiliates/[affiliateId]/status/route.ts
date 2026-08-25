// POST /api/affiliate-portal/affiliates/{id}/status — owner approves /
// rejects / re-pends an affiliate (HLA-12/B5). On approval, best-effort
// welcome email carrying a magic login link to their dashboard.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getDb } from "@/lib/server/db";
import { issueLoginLink } from "@/lib/services/affiliate-signup-service";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["approved", "denied", "pending"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ affiliateId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const { affiliateId } = await params;
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    if (!body.status || !ALLOWED.has(body.status)) {
      throw new AppError(`status must be one of: ${[...ALLOWED].join(", ")}.`, 400);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getDb() as any;
    const member = await db.affiliateMember.findFirst({
      where: { id: affiliateId, storeId },
      select: { id: true, email: true, program: { select: { signupSlug: true } } }
    });
    if (!member) throw new AppError("Affiliate not found for this store.", 404);

    await db.affiliateMember.update({
      where: { id: member.id },
      data: { status: body.status }
    });

    // Welcome the newly-approved affiliate with a direct door to their
    // dashboard (best-effort; requires Resend + a signup slug).
    if (body.status === "approved" && member.program?.signupSlug) {
      await issueLoginLink({ slug: member.program.signupSlug, email: member.email }).catch(() => null);
    }

    return NextResponse.json({ ok: true, status: body.status });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
