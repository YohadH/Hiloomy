import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  createProject,
  generatePackshotSync,
  GenerationFailedError,
  listProjectsForStore,
  saveSourceUpload,
  setProjectTargetCount,
  updateProjectBrief
} from "@/lib/services/creative-project-service";
import { enqueueGenerateBatch } from "@/lib/services/creative-job-service";
import {
  DEFAULT_ASPECT_RATIO,
  isCreativeAspectRatio,
  isCreativeProvider,
  isCreativeType,
  type CreativeAspectRatio,
  type CreativeBrief,
  type CreativeProvider,
  type CreativeSourceRole,
  type CreativeSourceRoleEntry,
  type CreativeType
} from "@/lib/domain/creative-types";

export const dynamic = "force-dynamic";
// Allow plenty of headroom for the synchronous Replicate call.
export const maxDuration = 120;

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) {
      return NextResponse.json({ ok: true, projects: [] });
    }
    const projects = await listProjectsForStore(storeId);
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 500 });
  }
}

/**
 * M1 wizard endpoint. Combined upload + create + generate so the client can
 * fire one multipart POST and receive a finished asset. Will split into
 * separate upload / project / job endpoints in M2 when batches enter the mix.
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const formData = await request.formData();

    const storeIdField = formData.get("storeId");
    const storeId =
      typeof storeIdField === "string" && storeIdField.trim()
        ? storeIdField.trim()
        : await resolveActiveStoreId();
    if (!storeId) {
      throw new AppError("Connect a Shopify store before creating creative projects.", 400);
    }

    const nameField = formData.get("name");
    const name = typeof nameField === "string" && nameField.trim() ? nameField.trim() : "Untitled creative";

    const typeField = formData.get("creativeType");
    if (typeof typeField !== "string" || !isCreativeType(typeField)) {
      throw new AppError("creativeType must be one of PACKSHOT | INSTAGRAM_POST | UGC_VIDEO | META_AD.", 400);
    }
    const creativeType = typeField as CreativeType;

    const aspectField = formData.get("aspectRatio");
    const aspectRatio: CreativeAspectRatio =
      typeof aspectField === "string" && isCreativeAspectRatio(aspectField)
        ? (aspectField as CreativeAspectRatio)
        : DEFAULT_ASPECT_RATIO[creativeType];

    const providerField = formData.get("provider");
    const provider: CreativeProvider =
      typeof providerField === "string" && isCreativeProvider(providerField)
        ? (providerField as CreativeProvider)
        : "replicate";

    const targetCountField = formData.get("targetCount");
    const parsedCount = typeof targetCountField === "string" ? Number(targetCountField) : 1;
    const targetCount = Number.isFinite(parsedCount)
      ? Math.max(1, Math.min(100, Math.floor(parsedCount)))
      : 1;

    const realismRaw = getStringField(formData, "realism");
    const realism: CreativeBrief["realism"] =
      realismRaw === "balanced" || realismRaw === "ultra" ? realismRaw : "ultra";

    // Default ON. Wizard form passes "1"/"0" string. Anything other than
    // "0" is treated as on (so legacy callers without the field still
    // get the new agent-rewritten behavior).
    const useAgentPromptRaw = getStringField(formData, "useAgentPrompt");
    const useAgentPrompt = useAgentPromptRaw !== "0";

    const brief: CreativeBrief = {
      productName: getStringField(formData, "productName"),
      productDescription: getStringField(formData, "productDescription"),
      headline: getStringField(formData, "headline"),
      cta: getStringField(formData, "cta"),
      tone: getStringField(formData, "tone"),
      brandNotes: getStringField(formData, "brandNotes"),
      customPrompt: getStringField(formData, "customPrompt"),
      realism,
      useAgentPrompt
    };

    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length === 0) {
      throw new AppError("Upload at least one product image.", 400);
    }

    // Per-file role + label, sent as parallel arrays in the same order as
    // `files`. Missing entries default to "reference" (which forces the user
    // to pick a product; we coerce below). Empty array = legacy client.
    const rawRoles = formData.getAll("fileRoles").map((v) => (typeof v === "string" ? v : ""));
    const rawLabels = formData.getAll("fileLabels").map((v) => (typeof v === "string" ? v : ""));

    const project = await createProject({
      storeId,
      name,
      creativeType,
      aspectRatio,
      brief,
      provider
    });

    const savedSources: { id: string }[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await saveSourceUpload({
        storeId,
        projectId: project.id,
        originalName: file.name,
        contentType: file.type || "application/octet-stream",
        buffer
      });
      savedSources.push({ id: saved.id });
    }

    // Stitch the per-file role/label into briefJson by source id, after we've
    // got the ids. If the client sent no roles, mark the first upload as the
    // product (legacy single-upload behaviour). If they sent roles but none
    // are "product", promote the first one so generation has a clear subject.
    const sourceRoles: Record<string, CreativeSourceRoleEntry> = {};
    const normalizedRoles: CreativeSourceRole[] = files.map((_, i) =>
      rawRoles[i] === "product" ? "product" : "reference"
    );
    if (!normalizedRoles.includes("product")) normalizedRoles[0] = "product";
    files.forEach((_, i) => {
      const id = savedSources[i].id;
      sourceRoles[id] = {
        role: normalizedRoles[i],
        label: (rawLabels[i] ?? "").trim() || undefined
      };
    });
    await updateProjectBrief(project.id, { ...brief, sourceRoles });

    if (targetCount > 1) {
      // Batch path: persist the desired count, enqueue, return immediately.
      // The worker picks it up on the next cron tick (default 5s) and the
      // client polls /projects/[id]/jobs for progress.
      await setProjectTargetCount(project.id, targetCount);
      const job = await enqueueGenerateBatch({
        storeId,
        projectId: project.id,
        targetCount,
        provider,
        primarySourceId: savedSources[0].id
      });
      return NextResponse.json(
        { ok: true, projectId: project.id, jobId: job.id, queued: true },
        { status: 202 }
      );
    }

    // Single-shot path — synchronous, returns the finished asset.
    try {
      const asset = await generatePackshotSync(project.id, storeId);
      return NextResponse.json({ ok: true, projectId: project.id, asset });
    } catch (genError) {
      if (genError instanceof GenerationFailedError) {
        return NextResponse.json(
          {
            ok: false,
            projectId: project.id,
            asset: genError.asset,
            error: genError.message
          },
          { status: 502 }
        );
      }
      throw genError;
    }
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

function getStringField(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}
