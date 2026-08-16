import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { requireOrgAdmin } from "@/lib/auth/guards";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

// POST /api/settings/team/revoke
// body: { invitationId }
// Cancels a pending invitation. Owner/admin only.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await requireOrgAdmin();
    const body = (await request.json().catch(() => ({}))) as { invitationId?: string };
    if (!body.invitationId) throw new AppError("invitationId is required.", 400);

    const db = getDb();
    const inv = (await db.invitation.findUnique({
      where: { id: body.invitationId },
      select: { orgId: true, email: true }
    })) as { orgId: string; email: string } | null;
    if (!inv) throw new AppError("Invitation not found.", 404);
    if (inv.orgId !== orgId) {
      throw new AppError("You can't revoke invitations for another organization.", 403);
    }
    await db.invitation.delete({ where: { id: body.invitationId } });
    await recordAuditEvent({
      orgId,
      actorUserId: userId,
      eventType: "team.invite_revoked",
      description: `Revoked invitation to ${inv.email}`,
      targetType: "invitation",
      targetId: body.invitationId
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
