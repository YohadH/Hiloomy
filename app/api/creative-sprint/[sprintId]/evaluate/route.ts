// Manual force-evaluation of a cascade stage. Useful for the launcher
// UI's "evaluate now" override button (e.g. you don't want to wait the
// full 6h for the first kill round). Pass ?stage=N as a query param.
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { evaluateSprintNow } from "@/lib/services/creative-sprint/sprint-service";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ sprintId: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const { sprintId } = await ctx.params;
    const url = new URL(req.url);
    const stageParam = url.searchParams.get("stage");
    const stage = stageParam ? Number(stageParam) : 1;
    if (!Number.isFinite(stage) || stage < 1) {
      throw new AppError("?stage must be a positive integer.", 400);
    }
    const result = await evaluateSprintNow(sprintId, stage);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
