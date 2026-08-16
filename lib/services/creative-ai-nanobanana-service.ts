// Nano Banana — Google's Gemini 2.5 Flash Image model. Image generation +
// editing with strong product fidelity, great for packshots and lifestyle
// shots when conditioned on a reference image.
//
// We call the Generative Language API directly (no SDK) to keep the install
// footprint minimal. Endpoint shape:
//
//   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
//   header  x-goog-api-key: <GEMINI_API_KEY>
//   body    { contents: [{ parts: [{ text }, { inline_data: { mime_type, data } }] }] }
//
// Response candidates contain image parts as inline_data with base64 bytes.

import type { BuiltPrompt } from "@/lib/services/creative-prompt-templates";
import type { CreativeAspectRatio } from "@/lib/domain/creative-types";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash-image-preview";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env to use the Nano Banana provider.");
  }
  return key;
}

function getBaseUrl(): string {
  let raw = (process.env.GEMINI_API_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, "");
  // Be forgiving — if the user only set the host (no /v1beta or /v1 segment),
  // append /v1beta so /models/<id>:generateContent resolves correctly.
  if (!/\/v\d[a-z0-9]*$/i.test(raw)) {
    raw = `${raw}/v1beta`;
  }
  return raw;
}

function getModel(): string {
  return process.env.NANOBANANA_MODEL || DEFAULT_MODEL;
}

// Gateway versions can return either snake_case or camelCase on the nested
// inline-data object. Declare both keys on one shape so we can read either.
interface GeminiInlineData {
  mime_type?: string;
  mimeType?: string;
  data?: string;
}

interface GeminiInlinePart {
  inline_data?: GeminiInlineData;
  inlineData?: GeminiInlineData;
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiInlinePart[] } }>;
  error?: { message?: string };
}

export interface NanoBananaGenerateImageInput {
  prompt: BuiltPrompt;
  aspectRatio: CreativeAspectRatio;
  referenceImageBuffer?: { buffer: Buffer; contentType: string; label?: string } | null;
  // Extra inspiration images (model, lighting, mood…). Passed as additional
  // inline_data parts so Gemini conditions on all of them, with a short text
  // marker before each so the model knows what role each image plays.
  additionalReferenceImages?: Array<{ buffer: Buffer; contentType: string; label?: string }>;
  seed?: number;
}

export interface NanoBananaGenerateImageOutput {
  buffer: Buffer;
  contentType: string;
  modelUsed: string;
  promptUsed: string;
  seedUsed: number | null;
}

export async function nanoBananaGenerateImage(
  input: NanoBananaGenerateImageInput
): Promise<NanoBananaGenerateImageOutput> {
  const model = getModel();
  const url = `${getBaseUrl()}/models/${model}:generateContent`;

  // Compose the prompt parts. Gemini takes text + inline image parts in any
  // order. We send the product first, then each additional reference image,
  // each preceded by a text marker so the model knows what role it plays
  // (e.g. "Image 2 — model: use this exact person's face and pose"). All
  // images condition the generation jointly.
  const parts: GeminiInlinePart[] = [];
  let imageIndex = 0;

  if (input.referenceImageBuffer) {
    imageIndex += 1;
    const label = input.referenceImageBuffer.label?.trim() || "product";
    parts.push({
      text: `Image ${imageIndex} — ${label}: the exact subject of the generation. Reproduce the product faithfully (label, shape, color, proportions).`
    });
    parts.push({
      inline_data: {
        mime_type: input.referenceImageBuffer.contentType,
        data: input.referenceImageBuffer.buffer.toString("base64")
      }
    });
  }

  for (const ref of input.additionalReferenceImages ?? []) {
    imageIndex += 1;
    const label = ref.label?.trim() || "reference";
    parts.push({
      text: `Image ${imageIndex} — ${label}: use this image as the reference for ${label}. Match its identity / pose / style, but apply it to the product above.`
    });
    parts.push({
      inline_data: {
        mime_type: ref.contentType,
        data: ref.buffer.toString("base64")
      }
    });
  }

  // Aspect ratio control isn't a separate API field for this model — fold it
  // into the prompt so the model honors the framing.
  const aspectText = `Render the result composed for a ${input.aspectRatio} aspect ratio.`;
  parts.push({ text: `${input.prompt.prompt}\n\n${aspectText}` });

  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      // The image-generation models expect IMAGE in responseModalities; some
      // gateways also accept TEXT alongside. Asking for IMAGE only keeps the
      // payload smaller.
      responseModalities: ["IMAGE"]
    }
  };
  if (typeof input.seed === "number") {
    (body.generationConfig as Record<string, unknown>).seed = input.seed;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": getApiKey()
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // Surface the exact failure to the caller — most 4xxs from Google's API
    // are config-side (wrong model id, missing /v1beta) and the response body
    // contains the actionable detail.
    const detail = text.slice(0, 500).replace(/\s+/g, " ").trim();
    const hint = response.status === 404
      ? ` Check that NANOBANANA_MODEL is an image model (e.g. gemini-2.5-flash-image-preview) and GEMINI_API_BASE_URL includes /v1beta.`
      : response.status === 403
        ? ` Check GEMINI_API_KEY scopes.`
        : "";
    throw new Error(
      `Nano Banana request failed: HTTP ${response.status} at ${url}.${hint}${detail ? ` Body: ${detail}` : ""}`
    );
  }

  const payload = (await response.json()) as GeminiResponse;
  if (payload.error) {
    throw new Error(`Nano Banana returned an error: ${payload.error.message ?? "unknown"}`);
  }

  const candidate = payload.candidates?.[0];
  const partsOut = candidate?.content?.parts ?? [];
  // The image is returned as the first part with inline_data. Different
  // gateway versions camelCase or snake_case the field, so check both.
  for (const part of partsOut) {
    const inline = part.inline_data ?? part.inlineData;
    if (inline?.data) {
      const mime = inline.mime_type ?? inline.mimeType ?? "image/png";
      return {
        buffer: Buffer.from(inline.data, "base64"),
        contentType: mime,
        modelUsed: `google/${model}`,
        promptUsed: input.prompt.prompt,
        seedUsed: typeof input.seed === "number" ? input.seed : null
      };
    }
  }

  throw new Error(
    `Nano Banana response contained no image data. Model "${model}" may not support image generation — try gemini-2.5-flash-image-preview.`
  );
}
