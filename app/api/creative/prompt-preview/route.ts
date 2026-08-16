import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { buildPrompt } from "@/lib/services/creative-prompt-templates";
import { craftPromptWithCreativeAgent } from "@/lib/services/creative-prompt-agent-service";
import {
  isCreativeAspectRatio,
  isCreativeType,
  type CreativeAspectRatio,
  type CreativeBrief,
  type CreativeType
} from "@/lib/domain/creative-types";
import { getAuthContext } from "@/lib/auth/session";

// Build and return the would-be AI prompt for a wizard configuration without
// running generation. The wizard's "Preview prompt" button hits this so users
// can see exactly what text we're going to send to gpt-image-1 / Gemini
// before paying for a generation.
//
// When `useAgent: true`, we additionally call the Creative agent to write a
// polished prompt and substitute it into the brief.customPrompt slot before
// wrapping with the deterministic template (same flow the live generate
// path uses). Surfaces the actual final text — including the agent's
// contribution — instead of just the bare template.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      creativeType?: string;
      aspectRatio?: string;
      brief?: CreativeBrief;
      referenceLabels?: string[];
      // Structured per-image role breakdown — preferred when caller can
      // supply it (the wizard knows each upload's role from the file-role
      // chips). Older callers can still pass referenceLabels alone.
      images?: Array<{ role?: "product" | "reference"; label?: string | null }>;
      index?: number;
      useAgent?: boolean;
      hasReferenceImage?: boolean;
    };

    const creativeType: CreativeType = isCreativeType(body.creativeType)
      ? (body.creativeType as CreativeType)
      : "PACKSHOT";
    const aspectRatio: CreativeAspectRatio = isCreativeAspectRatio(body.aspectRatio)
      ? (body.aspectRatio as CreativeAspectRatio)
      : "1:1";

    let brief: CreativeBrief | null = body.brief ?? null;
    let agentPrompt: string | null = null;
    let agentError: string | null = null;

    if (body.useAgent) {
      try {
        // Map the wizard's per-file role array into the agent's structured
        // shape. Only forward known roles; default unknowns to "reference"
        // so a stray client value can't accidentally claim "product".
        const structuredImages = Array.isArray(body.images)
          ? body.images.map((img) => ({
              role: img.role === "product" ? ("product" as const) : ("reference" as const),
              label: typeof img.label === "string" ? img.label : null
            }))
          : undefined;
        agentPrompt = await craftPromptWithCreativeAgent({
          creativeType,
          aspectRatio,
          brief,
          images: structuredImages,
          referenceLabels: Array.isArray(body.referenceLabels) ? body.referenceLabels : [],
          hasReferenceImage: Boolean(body.hasReferenceImage)
        });
        if (agentPrompt) {
          // Substitute the agent prompt into the customPrompt slot — same
          // place the live generate path injects it — so the template wrap
          // matches what the model will actually receive.
          brief = { ...(brief ?? {}), customPrompt: agentPrompt };
        } else {
          agentError = "Agent returned no prompt (not configured, disabled, or empty response).";
        }
      } catch (err) {
        agentError = err instanceof Error ? err.message : String(err);
      }
    }

    const built = buildPrompt({
      creativeType,
      aspectRatio,
      brief,
      referenceLabels: Array.isArray(body.referenceLabels) ? body.referenceLabels : [],
      index: typeof body.index === "number" ? body.index : 0
    });

    return NextResponse.json({
      ok: true,
      prompt: built.prompt,
      negativePrompt: built.negativePrompt,
      agentPrompt,
      agentError
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
