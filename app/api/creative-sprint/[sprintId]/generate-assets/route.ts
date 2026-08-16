// Triggers Higgsfield asset generation for every approved brief. Runs
// inline (bounded concurrency 5). With Higgsfield's typical 30-60s
// generation time per image and 5 parallel, 100 assets ~= 10-20 min,
// which exceeds maxDuration. For the MVP we still call inline and let
// the client poll; if it times out we surface partial state. Later move
// to background creative-job-service.
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { generateAssetsForSprintInline } from "@/lib/services/creative-sprint/sprint-service";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 min hard ceiling; tune if Higgsfield is slow

export async function POST(_req: Request, ctx: { params: Promise<{ sprintId: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const { sprintId } = await ctx.params;
    const result = await generateAssetsForSprintInline(sprintId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
