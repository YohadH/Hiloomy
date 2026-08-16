// Kick brief generation for a sprint. Takes the product + store context
// in the body so the brief generator can ground the LLM in the right
// brand voice + product detail.
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { generateBriefsForSprint } from "@/lib/services/creative-sprint/sprint-service";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 10 parallel LLM calls usually finish in ~10-20s

export async function POST(req: Request, ctx: { params: Promise<{ sprintId: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const { sprintId } = await ctx.params;
    const body = (await req.json()) as {
      store: { brandName: string; voice?: string | null; language: "he" | "en" };
      product: { title: string; description?: string | null; priceDisplay?: string | null; tagline?: string | null; imageUrl?: string | null };
    };
    if (!body.store?.brandName || !body.product?.title) {
      throw new AppError("store.brandName and product.title are required.", 400);
    }
    const result = await generateBriefsForSprint({
      sprintId,
      store: { brandName: body.store.brandName, voice: body.store.voice ?? null, language: body.store.language ?? "he" },
      product: body.product
    });
    return NextResponse.json({ ok: true, count: result.count });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
