// OpenAI Images API provider — gpt-image-1.
//
// Two endpoints:
//   POST /v1/images/generations  → text-to-image
//   POST /v1/images/edits        → image-conditioning (multipart)
//
// We use `edits` when the caller passes a reference image (our normal flow —
// the user always uploads a product photo) and `generations` as a fallback
// when no reference is available. Both return base64 PNG bytes via
// `data[0].b64_json` for gpt-image-1.
//
// Auth: Bearer <OPENAI_API_KEY> header.

import type { BuiltPrompt } from "@/lib/services/creative-prompt-templates";
import type { CreativeAspectRatio } from "@/lib/domain/creative-types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-1";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env to use the OpenAI provider.");
  }
  return key;
}

function getBaseUrl(): string {
  return (process.env.OPENAI_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getModel(): string {
  return process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`
  };
  const org = process.env.OPENAI_ORG_ID;
  if (org && org.trim()) headers["OpenAI-Organization"] = org.trim();
  return headers;
}

// gpt-image-1 currently accepts these three sizes. Map our aspect ratios to
// the closest supported value.
function sizeFor(aspect: CreativeAspectRatio): string {
  switch (aspect) {
    case "1:1":
      return "1024x1024";
    case "4:5":
    case "9:16":
      return "1024x1536"; // portrait
    case "16:9":
      return "1536x1024"; // landscape
    default:
      return "1024x1024";
  }
}

interface OpenAIImagesResponse {
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { message?: string; type?: string; code?: string };
}

// gpt-image-1's `quality` parameter. Bigger steps = sharper output but more
// money per image. From OpenAI's pricing:
//   low    ≈ $0.011  (cheap previews, often blurry)
//   medium ≈ $0.042  (default if unset — readable but soft)
//   high   ≈ $0.167  (sharp detail, legible labels, real skin texture)
export type OpenAIImageQuality = "low" | "medium" | "high" | "auto";

export interface OpenAIGenerateImageInput {
  prompt: BuiltPrompt;
  aspectRatio: CreativeAspectRatio;
  referenceImageBuffer?: { buffer: Buffer; contentType: string; label?: string } | null;
  // Extra inspiration images. When set, we hit /v1/images/edits and pass all
  // images (product first, then references) as `image[]` multipart entries —
  // gpt-image-1 supports up to 16 references and conditions on each.
  additionalReferenceImages?: Array<{ buffer: Buffer; contentType: string; label?: string }>;
  // Image fidelity knob. Caller picks; defaults to "high" because that's the
  // quality users expect from anything labelled "Generate" in a paid SaaS.
  // Override default via OPENAI_IMAGE_QUALITY env.
  quality?: OpenAIImageQuality;
  seed?: number; // OpenAI doesn't expose a seed for gpt-image-1 today; kept for parity
}

function resolveQuality(input: OpenAIGenerateImageInput): OpenAIImageQuality {
  if (input.quality) return input.quality;
  const envValue = (process.env.OPENAI_IMAGE_QUALITY ?? "").trim().toLowerCase();
  if (envValue === "low" || envValue === "medium" || envValue === "high" || envValue === "auto") {
    return envValue;
  }
  return "high";
}

export interface OpenAIGenerateImageOutput {
  buffer: Buffer;
  contentType: string;
  modelUsed: string;
  promptUsed: string;
  seedUsed: number | null;
}

export async function openaiGenerateImage(
  input: OpenAIGenerateImageInput
): Promise<OpenAIGenerateImageOutput> {
  const model = getModel();
  const size = sizeFor(input.aspectRatio);
  const quality = resolveQuality(input);

  // With a reference image we hit /images/edits (multipart). Without, we hit
  // /images/generations (json). Both return data[0].b64_json for gpt-image-1.
  let response: Response;
  const references = collectReferences(input);
  if (references.length > 0) {
    const form = new FormData();
    form.append("model", model);
    // gpt-image-1 ignores most negative-prompt phrasing, so we only send the
    // positive prompt. Roles are described inside `input.prompt.prompt`
    // (e.g. "Image 1 is the product, image 2 is the model…") by the prompt
    // builder upstream.
    form.append("prompt", input.prompt.prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("n", "1");
    // gpt-image-1 accepts a single `image` OR multiple `image[]` entries.
    // Always use `image[]` so the array form matches the documented contract.
    references.forEach((ref) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = new Blob([ref.buffer as any], { type: ref.contentType });
      form.append("image[]", blob, suggestUploadFilename(ref.contentType));
    });
    response = await fetch(`${getBaseUrl()}/images/edits`, {
      method: "POST",
      headers: authHeaders(),
      body: form
    });
  } else {
    response = await fetch(`${getBaseUrl()}/images/generations`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: input.prompt.prompt,
        size,
        quality,
        n: 1
      })
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const detail = text.slice(0, 500).replace(/\s+/g, " ").trim();
    const hint =
      response.status === 401
        ? " Check that OPENAI_API_KEY is valid."
        : response.status === 403
          ? " Your account may not have access to gpt-image-1; request access in the OpenAI dashboard."
          : response.status === 429
            ? " Rate limit / quota exceeded."
            : "";
    throw new Error(`OpenAI request failed: HTTP ${response.status}.${hint}${detail ? ` Body: ${detail}` : ""}`);
  }

  const payload = (await response.json()) as OpenAIImagesResponse;
  if (payload.error) {
    throw new Error(`OpenAI returned an error: ${payload.error.message ?? "unknown"}`);
  }
  const first = payload.data?.[0];
  if (first?.b64_json) {
    return {
      buffer: Buffer.from(first.b64_json, "base64"),
      // gpt-image-1 always returns PNG.
      contentType: "image/png",
      modelUsed: `openai/${model}`,
      promptUsed: input.prompt.prompt,
      seedUsed: null
    };
  }
  if (first?.url) {
    // Some models / accounts may still return a hosted URL — handle it.
    const dl = await fetch(first.url);
    if (!dl.ok) throw new Error(`Failed to download OpenAI image: ${dl.status}`);
    return {
      buffer: Buffer.from(await dl.arrayBuffer()),
      contentType: dl.headers.get("content-type") ?? "image/png",
      modelUsed: `openai/${model}`,
      promptUsed: input.prompt.prompt,
      seedUsed: null
    };
  }
  throw new Error("OpenAI response contained no image data.");
}

function collectReferences(
  input: OpenAIGenerateImageInput
): Array<{ buffer: Buffer; contentType: string; label?: string }> {
  const list: Array<{ buffer: Buffer; contentType: string; label?: string }> = [];
  if (input.referenceImageBuffer) list.push(input.referenceImageBuffer);
  for (const ref of input.additionalReferenceImages ?? []) list.push(ref);
  // gpt-image-1 caps at 16 reference images per edits call.
  return list.slice(0, 16);
}

function suggestUploadFilename(contentType: string): string {
  if (contentType.includes("png")) return "reference.png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "reference.jpg";
  if (contentType.includes("webp")) return "reference.webp";
  return "reference.bin";
}
