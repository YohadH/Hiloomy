import type { CreativeAspectRatio, CreativeBrief, CreativeType } from "@/lib/domain/creative-types";

export interface PromptInput {
  creativeType: CreativeType;
  aspectRatio: CreativeAspectRatio;
  brief: CreativeBrief | null;
  index?: number; // for batch jobs — drives prompt variation
  // Optional descriptors for the reference images the user uploaded under the
  // "reference" role (e.g. "model pose", "lighting style"). The model only
  // receives the product image as a visual reference, so these labels become
  // text hints in the prompt body.
  referenceLabels?: string[];
}

export interface BuiltPrompt {
  prompt: string;
  // Negative prompt is empty by default for Flux family; kept for future use.
  negativePrompt: string;
  styleNotes: string[];
}

function joinNonEmpty(parts: (string | undefined | null)[], sep = " "): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(sep);
}

function describeBrief(brief: CreativeBrief | null): string {
  if (!brief) return "";
  return joinNonEmpty([
    brief.productName ? `product: ${brief.productName}.` : "",
    brief.productDescription ?? "",
    brief.tone ? `tone: ${brief.tone}.` : "",
    brief.brandNotes ?? ""
  ]);
}

const STYLE_BY_TYPE: Record<CreativeType, string[]> = {
  PACKSHOT: [
    "clean studio packshot",
    "neutral seamless background",
    "soft natural product lighting",
    "ultra-sharp focus on product",
    "subtle reflection on a polished surface",
    "no people, no props, no text",
    "true-to-life product colors",
    "professional commercial product photography"
  ],
  INSTAGRAM_POST: [
    "modern lifestyle composition",
    "warm natural light, golden hour feel",
    "tasteful negative space for a headline overlay",
    "vertical-friendly composition",
    "minimal premium aesthetic",
    "shot on full-frame DSLR, 50mm prime"
  ],
  UGC_VIDEO: [
    "authentic UGC look",
    "iPhone vertical photo aesthetic",
    "natural daylight, slight grain",
    "handheld feel, real-room background",
    "no text overlays, no logos"
  ],
  META_AD: [
    "high-contrast scroll-stopping composition",
    "clear product hero, single focal point",
    "vivid but believable colors",
    "tasteful negative space for an ad headline",
    "premium commercial photography aesthetic"
  ]
};

// Cheap rotation seeds so a batch of N requests yields visibly different outputs
// without the user having to write distinct briefs.
const VARIATION_HINTS = [
  "neutral light-grey background",
  "warm cream background with soft shadow",
  "moody dark backdrop with rim light",
  "outdoor natural setting with shallow depth of field",
  "marble surface with soft window light",
  "linen fabric backdrop with diffused light",
  "wooden surface with warm afternoon light",
  "matte black surface with controlled studio light"
];

// When the user uploaded a "model" reference, the AI tends to copy its exact
// pose across the whole batch. These pose directives rotate per index so each
// generated image presents the *same person* in a *different pose* — the
// model's identity is locked by the reference image; the pose is steered by
// text. Keep these directives concrete (joints, hand placement, head angle)
// because vague pose words ("dynamic") don't move the model far enough.
const POSE_VARIATIONS = [
  "holding the product close to their chest with both hands, looking slightly down at it",
  "raising the product near their face with one hand, gazing past the camera into soft light",
  "tilting their head, smiling subtly, presenting the product at shoulder height",
  "leaning against a clean surface with the product resting in their open palm, three-quarter angle",
  "showing the product over their shoulder, body turned away, looking back at the camera",
  "seated, product placed on their lap, hands relaxed around it, calm gaze forward",
  "standing tall with the product extended forward toward the camera, confident stance",
  "cradling the product in both hands at waist height, eyes closed in a soft moment"
];

// Photorealism boosters. When realism is "ultra" we lean hard on these and add
// the anti-AI-artifact tail so the model produces image-real skin and texture
// instead of the airbrushed gloss the default style notes can produce.
const REALISM_BOOSTERS = [
  "shot on a full-frame DSLR with a 50mm prime lens at f/2.8",
  "natural skin texture with visible pores and fine hair, no airbrushing",
  "accurate skin tones, subtle blemishes preserved, true-to-life shadows",
  "soft directional light from a single key source with a gentle fill",
  "fine fabric detail and realistic micro-creases on clothing",
  "subtle film grain and natural color balance — not over-saturated"
];

const REALISM_NEGATIVE_TAIL =
  "Avoid AI rendering artifacts: no plastic-looking skin, no waxy face, no exaggerated symmetry, no over-smooth retouching, no extra fingers, no warped jewellery, no melting hands, no double pupils, no glassy eyes.";

// gpt-image-1 (and Gemini, to a lesser extent) will arrange multi-image
// references into a 2×2 contact sheet when the prompt mentions "different
// poses" / "variations" / multiple inputs. This is the model's natural
// interpretation, not a bug — we override it with a hard, last-position
// "single image only" instruction. Position matters: stick it at the end of
// the prompt so it overrides anything the user wrote upstream.
const SINGLE_IMAGE_GUARD =
  "OUTPUT FORMAT: produce exactly ONE single composed image filling the entire frame. " +
  "Do NOT produce a collage, grid, 2x2 layout, 3x3 layout, contact sheet, multi-panel, " +
  "comparison sheet, side-by-side, storyboard, before/after, mood-board, or any " +
  "arrangement of multiple smaller images. The reference images are inputs only — " +
  "they must not appear as sub-panels in the output. The final image is a single " +
  "full-bleed photograph of the product (and model, if a model reference was given).";

export function buildPrompt(input: PromptInput): BuiltPrompt {
  const briefText = describeBrief(input.brief);
  const styleNotes = STYLE_BY_TYPE[input.creativeType] ?? STYLE_BY_TYPE.PACKSHOT;
  const variation = typeof input.index === "number"
    ? VARIATION_HINTS[input.index % VARIATION_HINTS.length]
    : VARIATION_HINTS[0];

  // Detect whether any of the user's reference labels look like a model/person.
  // If so, rotate a pose directive per index so the batch stops cloning the
  // reference image's pose into every output.
  const hasModelReference = (input.referenceLabels ?? []).some((label) =>
    /\b(model|person|woman|man|girl|boy|face|portrait|pose)\b/i.test(label || "")
  );
  const poseDirective =
    hasModelReference && typeof input.index === "number"
      ? `Pose for this variation: the person should be ${POSE_VARIATIONS[input.index % POSE_VARIATIONS.length]}. Keep their face, hair, skin tone and overall identity identical to the reference image — only the pose changes.`
      : "";

  const aspectHint = `composed for a ${input.aspectRatio} aspect ratio frame`;

  const referenceLabels = (input.referenceLabels ?? [])
    .map((l) => (l || "").trim())
    .filter((l) => l.length > 0);
  // Enumerate each reference by its slot so multi-image providers can map
  // image-N to a role. Image 1 is always the product. Each subsequent image
  // gets a role-specific instruction so the model knows what to TAKE from
  // each ref (face vs lighting vs background) and — just as important —
  // what to IGNORE (e.g. don't copy the style image's subject into the
  // output as a person).
  const referenceHint =
    referenceLabels.length > 0
      ? `You are given ${referenceLabels.length + 1} input images. ` +
        `Image 1 is the product — reproduce it identically (label, shape, color, proportions). ` +
        referenceLabels
          .map((label, i) => describeReferenceRole(label, i + 2))
          .join(" ") +
        " " +
        synthesisHint(referenceLabels) +
        " Compose them together into ONE final image."
      : "";

  const customPrompt = (input.brief?.customPrompt ?? "").trim();
  const realism: "balanced" | "ultra" = input.brief?.realism ?? "ultra";
  const realismBoosters = realism === "ultra" ? REALISM_BOOSTERS.join(", ") + "." : "";
  const realismTail = realism === "ultra" ? REALISM_NEGATIVE_TAIL : "";

  const prompt = joinNonEmpty(
    [
      PRODUCT_LOCKDOWN,
      briefText,
      referenceHint,
      poseDirective,
      styleNotes.join(", ") + ".",
      variation + ".",
      aspectHint + ".",
      "Photorealistic, high resolution, magazine-quality.",
      realismBoosters,
      customPrompt,
      realismTail,
      // Single-image guard MUST be last — it overrides any "variations" /
      // "different poses" phrasing earlier (whether from the user's custom
      // prompt or our own pose rotation), which otherwise gets interpreted
      // as "arrange the variations into one grid".
      SINGLE_IMAGE_GUARD
    ],
    " "
  );

  // Negative prompt. Most providers don't expose a dedicated negative-prompt
  // field on their /edits endpoints, so this is mainly for Replicate / Flux
  // and for any future provider that does. Even when unused as a separate
  // field, it documents what failure modes the positive prompt is trying to
  // avoid — useful when debugging "why is the output bad?".
  const negativePrompt = realism === "ultra" ? NEGATIVE_PROMPT_FULL : NEGATIVE_PROMPT_BASE;

  return { prompt, negativePrompt, styleNotes };
}

// ─────────────────────────────────────────────────────────────────────────
// Product lockdown
// ─────────────────────────────────────────────────────────────────────────
//
// Pattern lifted from the user's tested Weavy prompt. The previous one-liner
// ("Use the uploaded product image as the exact reference for the product")
// wasn't strong enough — gpt-image-1 would still tweak labels, change bottle
// proportions, or invent variant packaging. This version enumerates the
// attributes that must NOT change and ends with "ONLY changes allowed:"
// language to box in what the model is permitted to do.
const PRODUCT_LOCKDOWN =
  "PRODUCT LOCKDOWN: the uploaded product image is the canonical reference for the product. " +
  "Do NOT redesign, replace, modify, relabel, recolor, resize, or change the product in any way. " +
  "Keep every bottle/box/package, all sizes, all labels, all colors, all proportions, all materials, " +
  "all branding, all typography, and all printed text exactly identical to the source image. " +
  "Do NOT generate new packaging. Do NOT add or remove products. " +
  "The ONLY transformations allowed are placing the product into a new scene, lighting, and composition.";

// Negative prompt fragments. Order matters less here — these are CSV-style
// keyword lists most negative-prompt-aware models consume.
const NEGATIVE_PROMPT_BASE =
  "low quality, blurry, distorted product, warped logo, text artifacts, watermark, " +
  "label morphing, changing product design, warped label, unreadable text, extra limbs";

const NEGATIVE_PROMPT_FULL =
  NEGATIVE_PROMPT_BASE +
  ", plastic skin, waxy face, airbrushed look, AI rendering artifacts, " +
  "melting hands, extra fingers, fused fingers, missing fingers, deformed fingers, " +
  "face distortion, face morphing, uncanny smile, bad teeth, " +
  "glassy eyes, double pupils, exaggerated symmetry, over-smooth retouching, " +
  "harsh shadows, blown highlights, CGI, cartoon, " +
  "subtitles, captions, on-screen text, brand-name additions, " +
  "collage, grid, 2x2 layout, multi-panel, contact sheet";

// Aspect-ratio mapping for Flux models (Replicate). Flux accepts shorthand
// strings; for any other model we fall back to "1:1".
export function fluxAspectRatio(ratio: CreativeAspectRatio): string {
  return ratio;
}

// ─────────────────────────────────────────────────────────────────────────
// Reference role classification
// ─────────────────────────────────────────────────────────────────────────
//
// Each user-uploaded reference comes in with a freeform label ("model",
// "style", "lighting reference", "perfume mood-board"…). We classify the
// label into a known role and emit a tailored instruction that tells the
// model exactly what to take FROM the image (and what to ignore).
//
// Critical: without this branching, the AI applies the same "match identity
// + pose + style" instruction to every reference, which causes nightmares
// like the model's face being replaced by the style reference's subject.

type ReferenceRole =
  | "model"
  | "style"
  | "lighting"
  | "background"
  | "pose"
  | "outfit"
  | "composition"
  | "other";

function classifyReferenceLabel(label: string): ReferenceRole {
  const normalized = label.toLowerCase();
  if (/\b(model|person|woman|man|girl|boy|face|portrait|identity|character)\b/.test(normalized))
    return "model";
  // Composition refs describe layout/positioning of products — must be
  // checked before "style" because labels like "composition style" should
  // route here, not to style.
  if (/\b(composition|layout|arrangement|positioning|placement|grouping|cluster)\b/.test(normalized))
    return "composition";
  if (/\b(style|mood|aesthetic|vibe|look|color|colour|palette|grading|tone|atmosphere|moodboard|mood-board)\b/.test(normalized))
    return "style";
  if (/\b(light|lighting|exposure|shadow|highlight|key.?light|rim.?light)\b/.test(normalized))
    return "lighting";
  if (/\b(background|backdrop|setting|environment|scene|location|context)\b/.test(normalized))
    return "background";
  if (/\b(pose|stance|posture|gesture|position)\b/.test(normalized))
    return "pose";
  if (/\b(outfit|clothing|clothes|wardrobe|dress|shirt|fashion)\b/.test(normalized))
    return "outfit";
  return "other";
}

// Per-role lockdown text. Pattern borrowed from the user's tested Weavy
// prompts: each role explicitly states what to TAKE from the reference image
// AND what to NOT transfer. The "do not transfer" half is doing most of the
// work — without it the model fuses references (style ref's subject ends up
// on the model's body, etc.).
function describeReferenceRole(label: string, imageIndex: number): string {
  const role = classifyReferenceLabel(label);
  const head = `Image ${imageIndex} ("${label}") is a ${role.toUpperCase()} reference.`;
  switch (role) {
    case "model":
      return (
        `${head} Use Image ${imageIndex} as the EXCLUSIVE reference for this person's identity. ` +
        `Their face, facial structure, facial features, skin texture, skin tone, hair type, hair color, age, and overall appearance must remain IDENTICAL and unchanged. ` +
        `Do NOT invent a different person. Do NOT transfer any facial features from the other reference images onto this person.`
      );
    case "style":
      return (
        `${head} Take from Image ${imageIndex} ONLY: color grading, color palette, contrast, film/photo aesthetic, post-processing look, overall mood and atmosphere. ` +
        `Do NOT copy the subject, person, face, body, clothing, products, or specific objects from this reference into the output. ` +
        `This image's content is irrelevant — only its visual treatment matters.`
      );
    case "lighting":
      return (
        `${head} Take from Image ${imageIndex} ONLY: lighting direction, hardness/softness, color temperature, shadow pattern, key/fill ratio. ` +
        `Do NOT copy any subject, composition, or content from this reference.`
      );
    case "background":
      return (
        `${head} Take from Image ${imageIndex} ONLY: the background, setting, surface, and environment. ` +
        `Do NOT copy any person, product, or foreground object from this reference.`
      );
    case "pose":
      return (
        `${head} Take from Image ${imageIndex} ONLY: body pose, stance, joint angles, hand placement, head tilt. ` +
        `Do NOT copy the person's face, hair, skin tone, clothing, or background from this reference.`
      );
    case "outfit":
      return (
        `${head} Take from Image ${imageIndex} ONLY: the clothing, wardrobe, and accessories. ` +
        `Do NOT copy the person's face, body, pose, or background from this reference.`
      );
    case "composition":
      return (
        `${head} Take from Image ${imageIndex} ONLY: the arrangement, positioning, grouping, depth, and spatial layout of objects. ` +
        `Do NOT copy any actual products, branding, or content from this reference — only mirror its layout structure.`
      );
    default:
      return (
        `${head} Use it as visual inspiration but do not copy its subject directly. ` +
        `Prioritize the role implied by the label "${label}".`
      );
  }
}

// When we have a model PLUS other references, spell out the synthesis rule
// explicitly. The most common failure modes:
//   • style-ref's person ends up on the model's body
//   • style-ref's color treatment (e.g. dramatic B&W) bleeds into the model
//     when the user only wanted the mood
//   • a "different poses" request returns a 2×2 contact sheet of the model
// The phrasing here is lifted from the user's "Use Image 1 as the exclusive
// reference for the woman's identity..." prompt, which produces the cleanest
// composites on gpt-image-1.
function synthesisHint(labels: string[]): string {
  const roles = labels.map(classifyReferenceLabel);
  const hasModel = roles.includes("model");
  const hasStyle = roles.includes("style");
  const hasBackground = roles.includes("background");
  const hasLighting = roles.includes("lighting");
  const hasComposition = roles.includes("composition");
  const hasPose = roles.includes("pose");
  const hasOutfit = roles.includes("outfit");

  const parts: string[] = [];

  if (hasModel && (hasStyle || hasLighting || hasBackground || hasPose || hasOutfit || hasComposition)) {
    const synthesisPieces: string[] = [
      "SYNTHESIS RULE — read carefully:",
      "The PERSON in the final image must be the model from the MODEL reference — same face, same facial features, same hair, same skin tone, same age, same identity.",
      "Do NOT transfer any facial features from non-model references."
    ];
    if (hasStyle) synthesisPieces.push("Apply the STYLE reference's color grading / mood / aesthetic to the SCENE only — not to the model's identity.");
    if (hasLighting) synthesisPieces.push("Apply the LIGHTING reference's light setup to the scene.");
    if (hasBackground) synthesisPieces.push("Place the model in the setting from the BACKGROUND reference.");
    if (hasPose) synthesisPieces.push("Pose the model according to the POSE reference (but keep the model's own face and clothing identity from the MODEL reference).");
    if (hasOutfit) synthesisPieces.push("Dress the model in the wardrobe from the OUTFIT reference.");
    if (hasComposition) synthesisPieces.push("Arrange products/elements per the COMPOSITION reference's layout.");
    parts.push(synthesisPieces.join(" "));
  }

  // Composition + product but no model — packshot-style synthesis where the
  // arrangement comes from one ref and the product comes from another.
  if (!hasModel && hasComposition) {
    parts.push(
      "SYNTHESIS RULE: rearrange the product(s) to match the layout/positioning from the COMPOSITION reference. " +
        "Do NOT modify or replace the products themselves — preserve every label, color, size, and branding detail exactly."
    );
  }

  // The output-is-one-photograph framing line — borrowed from the user's
  // "Create a new, original photograph" template line. Short, load-bearing,
  // tells the model to synthesize instead of collage.
  if (parts.length > 0) {
    parts.push("Create a new, original photograph that combines these elements. Preserve natural skin texture and realistic proportions.");
  }

  return parts.join(" ");
}
