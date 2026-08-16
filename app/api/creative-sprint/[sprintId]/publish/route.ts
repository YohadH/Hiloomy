// Publish a sprint to Meta. Takes the targeting config (page, pixel,
// link, audience) in the body and persists it before publishing.
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { configureTargetingAndPublish } from "@/lib/services/creative-sprint/sprint-service";
import type { SprintTargetingConfig } from "@/lib/services/creative-sprint/sprint-publisher";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 100 ads × ~3 Meta calls each, bounded concurrency 5

export async function POST(req: Request, ctx: { params: Promise<{ sprintId: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const { sprintId } = await ctx.params;
    const targeting = (await req.json()) as SprintTargetingConfig;
    if (!targeting.pageId || !targeting.pixelId || !targeting.linkUrl) {
      throw new AppError("targeting.pageId, pixelId, and linkUrl are required.", 400);
    }
    const result = await configureTargetingAndPublish({ sprintId, targeting });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
