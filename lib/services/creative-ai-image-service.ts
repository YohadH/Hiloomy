import Replicate from "replicate";
import type { BuiltPrompt } from "@/lib/services/creative-prompt-templates";
import type { CreativeAspectRatio, CreativeProvider } from "@/lib/domain/creative-types";
import { fluxAspectRatio } from "@/lib/services/creative-prompt-templates";
import {
  higgsfieldGenerateImage,
  higgsfieldGenerateVideo
} from "@/lib/services/creative-ai-higgsfield-service";
import { nanoBananaGenerateImage } from "@/lib/services/creative-ai-nanobanana-service";
import { openaiGenerateImage } from "@/lib/services/creative-ai-openai-service";

// Provider-agnostic façade for image (and, for Higgsfield, video) generation.
// Callers pick a CreativeProvider; the router below dispatches to either the
// Replicate (Flux family) or Higgsfield (Soul / DoP) backend. Each backend
// returns the same GenerateImageOutput shape so downstream code (storage
// service, project service, future queue worker) stays agnostic.

// `quality` controls the default model. Cheap mode (Flux Schnell) for big
// batches and previews; pro for final deliverables. Higgsfield has its own
// model knobs — quality maps to model env vars there.
export type ImageGenQuality = "fast" | "pro";

export interface ReferenceImageInput {
  buffer: Buffer;
  contentType: string;
  // The user-facing role descriptor for this image. "product" for the subject
  // itself, otherwise the user's freeform label ("model", "lighting", "mood
  // board"…). Used by providers that support multi-image conditioning to tell
  // the model what each image represents.
  label?: string;
}

export interface GenerateImageInput {
  provider: CreativeProvider;
  prompt: BuiltPrompt;
  aspectRatio: CreativeAspectRatio;
  quality: ImageGenQuality;
  // The product image (the subject). Always passed to the provider. Single-
  // image providers (Replicate Flux, Higgsfield) condition on this; multi-
  // image providers (OpenAI gpt-image-1, Nano Banana / Gemini) condition on
  // this plus `additionalReferenceImages`.
  referenceImageBuffer?: { buffer: Buffer; contentType: string; label?: string } | null;
  referenceImageUrl?: string | null;
  // Extra images the user uploaded as inspiration (model, lighting style,
  // mood board…). Providers that don't support multi-image input ignore
  // these — the prompt builder still mentions their labels as text hints.
  additionalReferenceImages?: ReferenceImageInput[];
  seed?: number;
}

export interface GenerateImageOutput {
  buffer: Buffer;
  contentType: string;
  modelUsed: string;
  promptUsed: string;
  seedUsed: number | null;
  providerName: CreativeProvider;
}

/**
 * Generate a single image via the requested provider. Synchronous wait — the
 * M1 wizard uses this directly; the M2 queue worker will invoke it from a
 * concurrency-bounded loop.
 */
// Decide whether to override the caller's provider pick.
//
// The user's repeated complaint: when they upload a product image and pick
// Higgsfield/Replicate, the model "creates a new product" instead of using
// theirs. Reason: only OpenAI's gpt-image-1 `/v1/images/edits` and Nano
// Banana's Gemini multi-image input actually preserve product identity.
// Higgsfield Soul treats the reference as STYLE; Replicate Flux ignores
// it. So whenever there's a product reference AND OpenAI is configured,
// we force-route to OpenAI regardless of the picker. Logged so the user
// can see why their pick was overridden.
function chooseProvider(input: GenerateImageInput): CreativeProvider {
  const hasReference =
    Boolean(input.referenceImageBuffer) || Boolean(input.referenceImageUrl);
  if (!hasReference) return input.provider;
  if (input.provider === "openai" || input.provider === "nanobanana") {
    // These already preserve products well — honour the pick.
    return input.provider;
  }
  const openaiAvailable = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (openaiAvailable) {
    console.warn(
      `[creative-ai-image-service] Provider override: '${input.provider}' cannot preserve product identity with a reference image. Routing to 'openai' (gpt-image-1 edits) instead. Set OPENAI_API_KEY='' or pick OpenAI explicitly to silence this override.`
    );
    return "openai";
  }
  // No OpenAI configured — honour the original pick but the user will get
  // the "new product" output. Better than failing outright.
  console.warn(
    `[creative-ai-image-service] Provider '${input.provider}' cannot preserve product identity with a reference image, and OPENAI_API_KEY is not set so we cannot override. The output product will likely differ from the reference.`
  );
  return input.provider;
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const provider = chooseProvider(input);
  if (provider !== input.provider) {
    input = { ...input, provider };
  }
  if (input.provider === "higgsfield") {
    const result = await higgsfieldGenerateImage({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      // URL preferred — Higgsfield fetches it directly. If we only have a
      // buffer, the service uploads to R2 first and uses the resulting URL.
      referenceImageUrl: input.referenceImageUrl ?? null,
      referenceImageBuffer: input.referenceImageBuffer ?? null,
      seed: input.seed
    });
    return {
      buffer: result.buffer,
      contentType: result.contentType,
      modelUsed: result.modelUsed,
      promptUsed: result.promptUsed,
      seedUsed: result.seedUsed,
      providerName: "higgsfield"
    };
  }
  if (input.provider === "nanobanana") {
    const result = await nanoBananaGenerateImage({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      referenceImageBuffer: input.referenceImageBuffer ?? null,
      additionalReferenceImages: input.additionalReferenceImages ?? [],
      seed: input.seed
    });
    return {
      buffer: result.buffer,
      contentType: result.contentType,
      modelUsed: result.modelUsed,
      promptUsed: result.promptUsed,
      seedUsed: result.seedUsed,
      providerName: "nanobanana"
    };
  }
  if (input.provider === "openai") {
    // Map our cross-provider "fast"/"pro" knob onto gpt-image-1's
    // low/medium/high. "pro" wants the sharpest output; "fast" is for
    // throwaway batches where soft renders are acceptable.
    const openaiQuality: "low" | "medium" | "high" = input.quality === "fast" ? "medium" : "high";
    const result = await openaiGenerateImage({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      referenceImageBuffer: input.referenceImageBuffer ?? null,
      additionalReferenceImages: input.additionalReferenceImages ?? [],
      quality: openaiQuality,
      seed: input.seed
    });
    return {
      buffer: result.buffer,
      contentType: result.contentType,
      modelUsed: result.modelUsed,
      promptUsed: result.promptUsed,
      seedUsed: result.seedUsed,
      providerName: "openai"
    };
  }
  const result = await replicateGenerateImage(input);
  return { ...result, providerName: "replicate" };
}

// Video generation is M3 in the plan but Higgsfield's video path slots in
// cleanly today since it shares the same upload + poll + download flow.
// Routes/services can call this when CREATIVE_VIDEO_ENABLED is on.
export interface GenerateVideoInput {
  provider: CreativeProvider;
  prompt: BuiltPrompt;
  aspectRatio: CreativeAspectRatio;
  referenceImageBuffer: { buffer: Buffer; contentType: string };
  durationSeconds?: number;
  seed?: number;
}

export interface GenerateVideoOutput {
  buffer: Buffer;
  contentType: string;
  modelUsed: string;
  promptUsed: string;
  seedUsed: number | null;
  durationMs: number | null;
  providerName: CreativeProvider;
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  if (input.provider === "higgsfield") {
    const result = await higgsfieldGenerateVideo({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      referenceImageBuffer: input.referenceImageBuffer,
      durationSeconds: input.durationSeconds,
      seed: input.seed
    });
    return { ...result, providerName: "higgsfield" };
  }
  if (input.provider === "nanobanana") {
    throw new Error("Nano Banana is image-only. Pick Higgsfield or Replicate for video.");
  }
  const result = await replicateGenerateVideo(input);
  return { ...result, providerName: "replicate" };
}

// ─────────────────────────────────────────────────────────────────────────
// Replicate video — Veo 3 Fast
// ─────────────────────────────────────────────────────────────────────────

function resolveReplicateVideoModelId(): `${string}/${string}` | `${string}/${string}:${string}` {
  return (process.env.CREATIVE_VIDEO_MODEL_DEFAULT as `${string}/${string}`) ||
    "google/veo-3-fast";
}

async function replicateGenerateVideo(
  input: GenerateVideoInput
): Promise<Omit<GenerateVideoOutput, "providerName">> {
  const client = getReplicateClient();
  const model = resolveReplicateVideoModelId();

  // Upload the reference frame to Replicate so the model can image-to-video
  // condition on the actual product (same upload trick we use for Flux).
  const referenceUrl = await replicateUploadBuffer(client, input.referenceImageBuffer);

  const duration = Math.max(2, Math.min(12, input.durationSeconds ?? 6));
  const inputPayload: Record<string, unknown> = {
    prompt: input.prompt.prompt,
    image: referenceUrl,
    aspect_ratio: fluxAspectRatio(input.aspectRatio),
    duration_seconds: duration
  };
  if (typeof input.seed === "number") inputPayload.seed = input.seed;

  const rawOutput = (await client.run(model, { input: inputPayload })) as unknown;
  const url = normalizeReplicateOutput(rawOutput);
  if (!url) {
    throw new Error(`Video generation returned no URL. Raw: ${JSON.stringify(rawOutput).slice(0, 200)}`);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated video: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "video/mp4";

  return {
    buffer,
    contentType,
    modelUsed: model,
    promptUsed: input.prompt.prompt,
    seedUsed: typeof input.seed === "number" ? input.seed : null,
    durationMs: duration * 1000
  };
}

async function replicateUploadBuffer(
  client: Replicate,
  ref: { buffer: Buffer; contentType: string }
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = new Blob([ref.buffer as any], { type: ref.contentType });
  const uploaded = (await client.files.create(blob as unknown as File)) as unknown as {
    urls?: { get?: string };
  };
  const url = uploaded?.urls?.get;
  if (!url) throw new Error("Replicate files.create returned no URL.");
  return url;
}

// ─────────────────────────────────────────────────────────────────────────
// Replicate backend
// ─────────────────────────────────────────────────────────────────────────

let replicateClient: Replicate | null = null;
function getReplicateClient(): Replicate {
  if (replicateClient) return replicateClient;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      "REPLICATE_API_TOKEN is not set. Add it to .env to generate creative assets with the Replicate provider."
    );
  }
  replicateClient = new Replicate({ auth: token });
  return replicateClient;
}

function resolveReplicateModelId(
  quality: ImageGenQuality
): `${string}/${string}` | `${string}/${string}:${string}` {
  if (quality === "fast") {
    return (process.env.CREATIVE_IMAGE_MODEL_FAST as `${string}/${string}`) ||
      "black-forest-labs/flux-schnell";
  }
  return (process.env.CREATIVE_IMAGE_MODEL_DEFAULT as `${string}/${string}`) ||
    "black-forest-labs/flux-1.1-pro";
}

async function replicateGenerateImage(input: GenerateImageInput): Promise<Omit<GenerateImageOutput, "providerName">> {
  const client = getReplicateClient();
  const model = resolveReplicateModelId(input.quality);

  const inputPayload: Record<string, unknown> = {
    prompt: input.prompt.prompt,
    aspect_ratio: fluxAspectRatio(input.aspectRatio),
    output_format: "webp",
    output_quality: 90,
    safety_tolerance: 2,
    prompt_upsampling: false
  };
  const referenceUrl = await resolveReplicateReferenceImage(client, input);
  if (referenceUrl) {
    inputPayload.image_prompt = referenceUrl;
  }
  if (typeof input.seed === "number") {
    inputPayload.seed = input.seed;
  }

  const rawOutput = (await client.run(model, { input: inputPayload })) as unknown;
  const url = normalizeReplicateOutput(rawOutput);
  if (!url) {
    throw new Error(`Image generation returned no URL. Raw output: ${JSON.stringify(rawOutput).slice(0, 200)}`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/webp";

  return {
    buffer,
    contentType,
    modelUsed: model,
    promptUsed: input.prompt.prompt,
    seedUsed: typeof input.seed === "number" ? input.seed : null
  };
}

async function resolveReplicateReferenceImage(
  client: Replicate,
  input: GenerateImageInput
): Promise<string | null> {
  if (input.referenceImageBuffer) {
    const { buffer, contentType } = input.referenceImageBuffer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob([buffer as any], { type: contentType });
    const uploaded = (await client.files.create(blob as unknown as File)) as unknown as {
      urls?: { get?: string };
    };
    const url = uploaded?.urls?.get;
    if (!url) {
      throw new Error("Replicate files.create returned no URL.");
    }
    return url;
  }
  if (input.referenceImageUrl) return input.referenceImageUrl;
  return null;
}

function normalizeReplicateOutput(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === "string" ? first : null;
  }
  if (typeof raw === "object" && raw !== null) {
    const maybeUrl = (raw as { url?: unknown }).url;
    if (typeof maybeUrl === "function") {
      const value = (maybeUrl as () => unknown).call(raw);
      if (typeof value === "string") return value;
      if (value && typeof (value as URL).toString === "function") return (value as URL).toString();
    }
    if (typeof maybeUrl === "string") return maybeUrl;
  }
  return null;
}
