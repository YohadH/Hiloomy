// PATCH a single SprintAd's brief. Used by the brief-edit modal in the
// matrix board — the operator can tweak headline / body / CTA / visualPrompt
// before approving the batch. Only safe while sprint.status is in the
// awaiting_brief_approval phase (the service layer enforces that the
// SprintAd row exists; we don't re-gate by sprint status here because
// the operator might want to fix copy mid-flow).
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { updateSprintBrief } from "@/lib/services/creative-sprint/sprint-service";
import type { SprintBrief } from "@/lib/services/creative-sprint/brief-generator";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ sprintId: string; slot: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const { sprintId, slot } = await ctx.params;
    const slotIndex = Number(slot);
    if (!Number.isInteger(slotIndex) || slotIndex < 1) {
      throw new AppError("slot must be a positive integer.", 400);
    }
    const body = (await req.json()) as Partial<SprintBrief>;
    // Whitelist the fields we let the operator edit — variantLabel + angle
    // stay locked to preserve the matrix's logical organization.
    const allowed: Partial<SprintBrief> = {};
    if (typeof body.headline === "string") allowed.headline = body.headline;
    if (typeof body.body === "string") allowed.body = body.body;
    if (typeof body.cta === "string") allowed.cta = body.cta;
    if (typeof body.visualPrompt === "string") allowed.visualPrompt = body.visualPrompt;
    if (body.assetType === "image" || body.assetType === "video") {
      allowed.assetType = body.assetType;
    }
    if (Object.keys(allowed).length === 0) {
      throw new AppError("No editable fields in request body.", 400);
    }
    await updateSprintBrief(sprintId, slotIndex, allowed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
