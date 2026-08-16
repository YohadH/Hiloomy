// Kill switch — pauses all live adsets + marks the sprint cancelled.
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { cancelSprint } from "@/lib/services/creative-sprint/sprint-service";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ sprintId: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const { sprintId } = await ctx.params;
    await cancelSprint(sprintId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
