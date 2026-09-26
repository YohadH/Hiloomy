// PATCH  /api/affiliate-portal/campaigns/briefs/{briefId} — status / post URL / due date.
// DELETE /api/affiliate-portal/campaigns/briefs/{briefId}

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { deleteBrief, updateBrief } from "@/lib/services/affiliate-campaign-service";
import type { BriefStatus } from "@/lib/domain/affiliate-campaign";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ briefId: string }> };

async function storeIdOrThrow() {
  const storeId = await resolveActiveStoreId();
  if (!storeId) throw new AppError("No active store.", 400);
  await assertStoreInActiveOrg(storeId);
  return storeId;
}

function fail(error: unknown) {
  const status = error instanceof AppError ? error.statusCode : 500;
  return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { briefId } = await params;
    const storeId = await storeIdOrThrow();
    const body = (await request.json().catch(() => ({}))) as {
      status?: BriefStatus;
      postUrl?: string | null;
      dueDate?: string | null;
      title?: string | null;
      instructions?: string | null;
    };
    return NextResponse.json({ ok: true, brief: await updateBrief(storeId, briefId, body) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { briefId } = await params;
    const storeId = await storeIdOrThrow();
    await deleteBrief(storeId, briefId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
