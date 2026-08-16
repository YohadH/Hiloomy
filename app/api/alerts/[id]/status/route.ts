import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

// POST /api/alerts/[id]/status
// Body: { status: "acknowledged" | "resolved" | "ignored" }
//
// Updates an alert's status. Multi-tenant safe: the alert must belong to the
// caller's active store. The Command Center calls this when the founder
// clicks Approve / Ignore / Remind-me-later on an alert card.

export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set(["acknowledged", "resolved", "ignored", "open"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    const status = body.status;
    if (!status || !ALLOWED_STATUS.has(status)) {
      throw new AppError(
        `status must be one of: ${Array.from(ALLOWED_STATUS).join(", ")}`,
        400
      );
    }

    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);

    const db = getDb();
    const existing = await db.alert.findUnique({
      where: { id },
      select: { id: true, storeId: true, status: true }
    });
    if (!existing || existing.storeId !== storeId) {
      // Don't leak whether the id exists for a different tenant.
      throw new AppError("Alert not found.", 404);
    }

    const isClosing = status !== "open";
    await db.alert.update({
      where: { id },
      data: {
        status,
        resolvedAt: isClosing ? new Date() : null,
        resolvedBy: isClosing ? "user" : null
      }
    });
    return NextResponse.json({ ok: true, id, status });
  } catch (error) {
    const code = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: code });
  }
}
