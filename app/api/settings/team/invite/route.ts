import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/server/db";
import { requireOrgAdmin } from "@/lib/auth/guards";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { sendTransactionalEmail } from "@/lib/email/email-client";
import { teamInvitationEmail } from "@/lib/email/templates";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { assertPlanAllowsAction } from "@/lib/billing/plan-limits";

// POST /api/settings/team/invite
// body: { email: string, role: "admin" | "member" }
//
// Creates an Invitation row, generates a one-time token, emails the
// recipient an accept link: /accept-invite?token=<token>
//
// Plan-limit check is the caller's responsibility (deferred — would
// gate via assertPlanAllowsAction once limits are enforced).

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await requireOrgAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      role?: string;
    };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      throw new AppError("Valid email is required.", 400);
    }
    const role = body.role === "admin" ? "admin" : "member";

    const db = getDb();

    // Plan limit check — refuse if at teammate cap.
    await assertPlanAllowsAction(orgId, "invite_teammate");

    // Already a member?
    const existingMember = await db.membership.findFirst({
      where: { orgId, user: { email } },
      select: { id: true }
    });
    if (existingMember) {
      throw new AppError("That email is already a member of this organization.", 409);
    }

    // Rotate any prior pending invitation to the same email — issuing a new
    // one cancels the old.
    await db.invitation.deleteMany({ where: { orgId, email } });

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const invitation = await db.invitation.create({
      data: { orgId, email, role, invitedById: userId, token, expiresAt },
      select: { id: true }
    });
    await recordAuditEvent({
      orgId,
      actorUserId: userId,
      eventType: "team.invite_sent",
      description: `Invited ${email} as ${role}`,
      targetType: "invitation",
      targetId: invitation.id
    });

    // Send email
    const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
    const inviter = (await db.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true, locale: true }
    })) as { displayName: string | null; email: string; locale: string } | null;
    const org = (await db.organization.findUnique({
      where: { id: orgId },
      select: { name: true }
    })) as { name: string } | null;
    const locale = inviter?.locale === "en" ? "en" : "he";
    const template = teamInvitationEmail({
      inviterName: inviter?.displayName ?? inviter?.email ?? "A teammate",
      orgName: org?.name ?? "Hiloomy",
      acceptUrl: `${appUrl}/accept-invite?token=${token}`,
      locale: locale as "he" | "en"
    });
    await sendTransactionalEmail({
      to: email,
      subject: template.subject,
      html: template.html
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
