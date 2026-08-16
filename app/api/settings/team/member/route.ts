import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { requireOrgAdmin } from "@/lib/auth/guards";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

// Member management for the active org.
//
// DELETE /api/settings/team/member?membershipId=...
//   Remove a member from the org. Cannot remove the last owner.
//
// PATCH /api/settings/team/member
//   body: { membershipId, role: "admin" | "member" | "owner" }
//   Change a member's role. Cannot demote the last owner.

export const dynamic = "force-dynamic";

async function requireMembershipInActiveOrg(membershipId: string, orgId: string) {
  const db = getDb();
  const m = (await db.membership.findUnique({
    where: { id: membershipId },
    select: { id: true, orgId: true, role: true, userId: true }
  })) as { id: string; orgId: string; role: string; userId: string } | null;
  if (!m) throw new AppError("Member not found.", 404);
  if (m.orgId !== orgId) {
    throw new AppError("Member is in a different organization.", 403);
  }
  return m;
}

async function ensureNotLastOwner(orgId: string, demotingMembershipId?: string) {
  const db = getDb();
  const owners = (await db.membership.findMany({
    where: { orgId, role: "owner" },
    select: { id: true }
  })) as Array<{ id: string }>;
  const otherOwners = owners.filter((m) => m.id !== demotingMembershipId);
  if (otherOwners.length === 0) {
    throw new AppError(
      "Cannot remove or demote the last owner. Transfer ownership first.",
      400
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { orgId, userId } = await requireOrgAdmin();
    const url = new URL(request.url);
    const membershipId = url.searchParams.get("membershipId");
    if (!membershipId) throw new AppError("membershipId is required.", 400);

    const target = await requireMembershipInActiveOrg(membershipId, orgId);
    if (target.role === "owner") {
      await ensureNotLastOwner(orgId, target.id);
    }

    const db = getDb();
    const targetUser = (await db.user.findUnique({
      where: { id: target.userId },
      select: { email: true }
    })) as { email: string } | null;

    await db.membership.delete({ where: { id: target.id } });
    await recordAuditEvent({
      orgId,
      actorUserId: userId,
      eventType: "team.member_removed",
      description: `Removed ${targetUser?.email ?? "member"} from organization`,
      targetType: "membership",
      targetId: target.id
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const { orgId, userId } = await requireOrgAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      membershipId?: string;
      role?: string;
    };
    if (!body.membershipId) throw new AppError("membershipId is required.", 400);
    if (!body.role) throw new AppError("role is required.", 400);
    const role = body.role === "owner" || body.role === "admin" ? body.role : "member";

    const target = await requireMembershipInActiveOrg(body.membershipId, orgId);
    if (target.role === "owner" && role !== "owner") {
      await ensureNotLastOwner(orgId, target.id);
    }

    const db = getDb();
    const targetUser = (await db.user.findUnique({
      where: { id: target.userId },
      select: { email: true }
    })) as { email: string } | null;

    await db.membership.update({ where: { id: target.id }, data: { role } });
    await recordAuditEvent({
      orgId,
      actorUserId: userId,
      eventType: "team.member_role_changed",
      description: `Changed ${targetUser?.email ?? "member"} role from ${target.role} to ${role}`,
      targetType: "membership",
      targetId: target.id
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
