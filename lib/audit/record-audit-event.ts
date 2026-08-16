// Append a row to the audit log. Fire-and-forget — never throw to the
// caller; audit failures shouldn't block the real action that triggered
// them. Errors are logged so they don't disappear silently.
//
// Use this from any service that mutates security-relevant state:
//
//   await recordAuditEvent({
//     orgId,
//     actorUserId,
//     eventType: "team.invite_sent",
//     description: `Invited ${email} as ${role}`,
//     targetType: "invitation",
//     targetId: invitation.id
//   });

import { getDb } from "@/lib/server/db";

export interface AuditEventInput {
  orgId: string;
  actorUserId: string | null;
  eventType: string;
  description: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const db = getDb();
    await db.auditEvent.create({
      data: {
        orgId: input.orgId,
        actorUserId: input.actorUserId ?? null,
        eventType: input.eventType,
        description: input.description,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? undefined
      }
    });
  } catch (err) {
    console.error("[audit] Failed to record event:", input.eventType, err);
  }
}
