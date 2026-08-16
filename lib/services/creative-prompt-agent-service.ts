// Creative agent prompt refinement.
//
// Given the operator's brief + the actual uploaded image roles, ask the
// Creative agent to write the image-generation prompt that the image
// model will receive verbatim.
//
// CRITICAL contract enforced here (the user kept hitting "the model
// generates a NEW product instead of using mine"):
//   - The PRODUCT image must be preserved EXACTLY — same bottle, label,
//     color, proportions, branding. The agent is told this in caps and
//     it's part of the prompt the image model receives.
//   - REFERENCE images are inspiration ONLY (model pose, lighting,
//     background style, mood) — never copied verbatim, never replaces the
//     product, never adds new packaging.
//
// Hebrew input: the brief fields (productName/description/tone) can be
// in Hebrew because the operator is Israeli. The agent must translate
// concepts into English (image models reason in English) but never try
// to render Hebrew text inside the image.
//
// Fail-safe: returns null on any failure. Callers fall back to the
// deterministic template — never worse than today.

import { askCreativeAgentJson, isBiAgentConfigured, isCreativeAgentConfigured } from "@/lib/clients/bi-agent-client";
import type { CreativeBrief, CreativeType, CreativeAspectRatio } from "@/lib/domain/creative-types";

// One uploaded image with its role + label. Agent uses this to know
// what to preserve vs what to use as inspiration.
export interface PromptAgentReference {
  // "product" → must be kept identical in the output.
  // "reference" → inspiration only (model/lighting/background/mood).
  role: "product" | "reference";
  // Operator-supplied freeform label ("model pose", "lighting mood",
  // "background scene"). For role=product, label is ignored — we name it
  // "Product" so the agent treats it consistently.
  label?: string | null;
}

export interface CraftPromptInput {
  creativeType: CreativeType;
  aspectRatio: CreativeAspectRatio;
  brief: CreativeBrief | null;
  // Full per-image breakdown. When passed, the agent gets the structured
  // role list (product vs each labelled reference). When NOT passed, we
  // fall back to the legacy `referenceLabels` shape + `hasReferenceImage`
  // boolean so existing callers don't break.
  images?: PromptAgentReference[];
  // Legacy: labels of non-product uploads. Used when `images` is absent.
  referenceLabels?: string[];
  // Legacy: indicator that ANY product image is attached. Used when
  // `images` is absent. When `images` is passed we derive this from it.
  hasReferenceImage?: boolean;
}

function typeStyleHint(t: CreativeType): string {
  switch (t) {
    case "PACKSHOT":
      return "clean studio packshot, neutral seamless background, ultra-sharp product focus, no people or props";
    case "INSTAGRAM_POST":
      return "modern lifestyle composition, golden-hour warmth, tasteful negative space for headline overlay";
    case "UGC_VIDEO":
      return "authentic iPhone-vertical UGC look, natural daylight, handheld feel, real-room background";
    case "META_AD":
      return "thumb-stopping editorial Meta-feed creative, bold composition, headline-friendly negative space";
  }
}

// Walk the images array and produce a human-readable role breakdown
// the agent can reason about. Falls back to legacy shape if needed.
function describeImages(input: CraftPromptInput): {
  hasProduct: boolean;
  productLines: string[];
  referenceLines: string[];
} {
  if (input.images && input.images.length > 0) {
    const productLines: string[] = [];
    const referenceLines: string[] = [];
    for (const img of input.images) {
      if (img.role === "product") {
        productLines.push("• PRODUCT image attached — this is the EXACT item that must appear in the output.");
      } else {
        const label = (img.label ?? "").trim() || "reference";
        referenceLines.push(`• ${label} — use as INSPIRATION only (mood/composition/lighting/pose). Do NOT copy literally. Do NOT use any product, packaging or branding from this reference.`);
      }
    }
    return {
      hasProduct: productLines.length > 0,
      productLines,
      referenceLines
    };
  }
  // Legacy fallback
  const productLines = input.hasReferenceImage
    ? ["• PRODUCT image attached — this is the EXACT item that must appear in the output."]
    : [];
  const referenceLines = (input.referenceLabels ?? [])
    .filter((s) => s && s.trim())
    .map((label) => `• ${label.trim()} — use as INSPIRATION only (mood/composition/lighting/pose). Do NOT copy literally.`);
  return {
    hasProduct: productLines.length > 0,
    productLines,
    referenceLines
  };
}

function buildAgentInstruction(input: CraftPromptInput): string {
  const b = input.brief ?? {};
  const { hasProduct, productLines, referenceLines } = describeImages(input);

  const preservation = hasProduct
    ? [
        `PRODUCT PRESERVATION (hard rule — the user's #1 complaint is that we ignore this):`,
        `  - The product reference image is the CANONICAL product. The image model will receive it.`,
        `  - Output prompt MUST instruct the model to keep the bottle/box/package, all labels, all colors, all proportions, all branding, all printed text EXACTLY identical to the reference.`,
        `  - The prompt MUST forbid: redesigning, recoloring, resizing, relabelling, adding new packaging, swapping the product for a different SKU, adding extra bottles or duplicates of the product.`,
        `  - Do NOT describe the product's appearance — the reference image handles that. You describe ONLY the scene, lighting, surface, props, atmosphere.`
      ].join("\n")
    : `No product reference image. Describe the product visually so the model can render it from scratch using the product name/description below.`;

  const referenceRule = referenceLines.length
    ? [
        `REFERENCE IMAGES (style / mood / pose inspiration only — NOT to be reproduced verbatim):`,
        ...referenceLines,
        `  - When you mention something from a reference (e.g. "match the lighting from the reference"), be explicit about which aspect: lighting / pose / background / mood — NEVER product or branding.`
      ].join("\n")
    : "";

  const lines = [
    `You are a senior performance-marketing art director writing an image-generation prompt.`,
    `The output is a SINGLE polished prompt the image model will receive verbatim.`,
    "",
    `Asset type: ${input.creativeType} — ${typeStyleHint(input.creativeType)}`,
    `Aspect ratio: ${input.aspectRatio}`,
    "",
    `BRIEF FROM OPERATOR (may be in Hebrew — translate concepts to English; never render Hebrew text inside the image):`,
    b.productName ? `  Product name: ${b.productName}` : null,
    b.productDescription ? `  Product description: ${b.productDescription}` : null,
    b.headline ? `  Headline being teased: ${b.headline}` : null,
    b.tone ? `  Tone: ${b.tone}` : null,
    b.brandNotes ? `  Brand notes: ${b.brandNotes}` : null,
    b.customPrompt ? `  Operator hint (inspiration, not verbatim): ${b.customPrompt}` : null,
    b.realism ? `  Realism preference: ${b.realism}` : null,
    "",
    `UPLOADED IMAGES (the image model will see these too):`,
    ...(productLines.length ? productLines : ["• No product image attached."]),
    ...(referenceLines.length ? referenceLines : ["• No additional reference images."]),
    "",
    preservation,
    "",
    referenceRule,
    "",
    `OUTPUT RULES:`,
    `  1. SINGLE prompt string, ~4–6 sentences. ENGLISH ONLY (image models reason in English).`,
    `  2. Photography (not illustration). Mention camera/lens hints when useful (e.g. "50mm prime, f/2.8, full-frame DSLR").`,
    `  3. Specific lighting direction (left/right/overhead/backlit), mood, surface texture.`,
    `  4. No generic adjectives ("beautiful", "amazing", "stunning"). Use specific visual nouns.`,
    `  5. No prose-style chains. Punchy directives.`,
    hasProduct
      ? `  6. INCLUDE explicit preservation language: "keep the product (bottle/box/package), all labels, all colors, all proportions, all branding, all printed text EXACTLY identical to the uploaded reference. Do NOT redesign, recolor, resize, relabel, or duplicate the product."`
      : `  6. Describe the product clearly enough for the model to render it from text alone.`,
    `  7. If reference images are provided, name what aspect to borrow from each (lighting / pose / background) — never the product itself.`,
    "",
    `Output JSON object: { "prompt": "<the polished prompt>" }`
  ];
  return lines.filter(Boolean).join("\n");
}

export async function craftPromptWithCreativeAgent(input: CraftPromptInput): Promise<string | null> {
  if (!isCreativeAgentConfigured()) return null;
  if (process.env.BI_AGENT_DISABLE === "1") return null;
  try {
    const parsed = await askCreativeAgentJson<{ prompt?: string }>({
      question: buildAgentInstruction(input),
      jsonHint: 'object with prompt:string',
      timeoutMs: 45_000
    });
    const prompt = (parsed.prompt ?? "").trim();
    if (!prompt) return null;
    return prompt;
  } catch (err) {
    console.warn("[creative-prompt-agent] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
