// Brief generator — turns (store + product + brand voice) into N distinct
// ad concepts to feed Higgsfield.
//
// Strategy: 10 angle categories × (N / 10) variants per call, in parallel.
// One Anthropic call per angle keeps each LLM context focused on diversity
// within that angle instead of trying to satisfy "give me 100 different
// ideas" in a single shot — which tends to collapse to a few repeated
// patterns. 10 parallel calls × ~10 briefs each comes back in ~6-10s and
// stays well under model context limits.
//
// The angles are the classic DR (direct-response) creative taxonomy. Each
// angle has a different psychological lever, so spreading across them
// produces meaningfully different ads instead of 100 variations of "look
// at our cool product."
//
// Output: array of SprintBrief objects, length === targetCount. If the
// LLM under-delivers on a call we pad with simpler synthetic briefs so
// the caller always gets exactly targetCount rows back (sprint UX
// depends on that promise).

import { anthropicChatJson } from "@/lib/clients/anthropic-client";
import { askCreativeAgentJson, isBiAgentConfigured } from "@/lib/clients/bi-agent-client";

export interface SprintBriefProductContext {
  title: string;
  description?: string | null;
  priceDisplay?: string | null;
  tagline?: string | null;
  // Optional product image URL — included in the prompt so the LLM grounds
  // visual descriptions in the actual product look.
  imageUrl?: string | null;
}

export interface SprintBriefStoreContext {
  brandName: string;
  // Brand voice / tone snippet, e.g. "playful, premium, fragrance-first".
  // Editable per-store in Settings later; for now passed by the caller.
  voice?: string | null;
  language: "he" | "en";
}

export type SprintAngle =
  | "problem_solution"
  | "social_proof"
  | "urgency"
  | "lifestyle"
  | "demonstration"
  | "ugc_style"
  | "before_after"
  | "founder_direct"
  | "comparison"
  | "premium_feel";

export const SPRINT_ANGLES: ReadonlyArray<{ key: SprintAngle; label: string; lever: string }> = [
  { key: "problem_solution", label: "Problem → Solution", lever: "name a pain point, show the product as the fix" },
  { key: "social_proof", label: "Social proof", lever: "lean on reviews, ratings, customer counts" },
  { key: "urgency", label: "Urgency / scarcity", lever: "limited stock, today-only, seasonal window" },
  { key: "lifestyle", label: "Aspirational lifestyle", lever: "the kind of person who uses this" },
  { key: "demonstration", label: "Demonstration", lever: "literally show the product working" },
  { key: "ugc_style", label: "UGC / native", lever: "looks like a customer's own post, not an ad" },
  { key: "before_after", label: "Before / after", lever: "transformation framing" },
  { key: "founder_direct", label: "Founder talking-head", lever: "personal, mission, why we built it" },
  { key: "comparison", label: "Comparison", lever: "us vs. the obvious alternative" },
  { key: "premium_feel", label: "Premium / luxe", lever: "cinematic, quiet, restraint — the product is the hero" }
] as const;

export interface SprintBrief {
  angle: SprintAngle;
  // Short tag for the matrix board, e.g. "social proof #3".
  variantLabel: string;
  // The ad headline (Meta primary text or video title card).
  headline: string;
  // Body copy / caption underneath the headline.
  body: string;
  // Call-to-action button label, e.g. "Shop now", "Get yours".
  cta: string;
  // Higgsfield visual prompt — descriptive, cinematic, mentions camera
  // motion when video is desired. Composed for a 9:16 vertical Meta ad.
  visualPrompt: string;
  // Recommended asset type. We default to "image" to keep Higgsfield gen
  // costs bounded; the operator can flip to "video" per-ad in review.
  assetType: "image" | "video";
}

export interface GenerateBriefsInput {
  store: SprintBriefStoreContext;
  product: SprintBriefProductContext;
  targetCount: number;
  // Optional model override (defaults to ANTHROPIC_MODEL env / claude-sonnet-4-6).
  model?: string;
}

interface LlmBriefDraft {
  variantLabel?: string;
  headline?: string;
  body?: string;
  cta?: string;
  visualPrompt?: string;
  assetType?: "image" | "video";
}

function buildAnglePrompt(
  angle: (typeof SPRINT_ANGLES)[number],
  perAngle: number,
  store: SprintBriefStoreContext,
  product: SprintBriefProductContext
): string {
  const languageInstruction =
    store.language === "he"
      ? "All ad copy (headline, body, CTA) must be in HEBREW. visualPrompt stays in English (it's a directive to an image model)."
      : "All copy is in ENGLISH.";

  return [
    `You are a senior performance-marketing creative director writing Meta ad concepts for ${store.brandName}.`,
    "",
    `Brand voice: ${store.voice || "modern, confident, direct"}.`,
    "",
    `Product:`,
    `  - Title: ${product.title}`,
    product.description ? `  - Description: ${product.description}` : null,
    product.priceDisplay ? `  - Price: ${product.priceDisplay}` : null,
    product.tagline ? `  - Tagline: ${product.tagline}` : null,
    "",
    `Angle for this batch: **${angle.label}** — ${angle.lever}.`,
    "",
    `Produce exactly ${perAngle} ad concepts that all use this angle but feel meaningfully different from each other.`,
    "Different angles within the same lever: different hooks, different headlines, different visual concepts.",
    "Headlines should be punchy (max ~8 words for HE, max ~10 for EN).",
    "Body copy 1-2 short sentences max — Meta truncates anyway.",
    "CTA picked from: Shop now / Get yours / See more / Try today / Order now (or HE equivalents).",
    "visualPrompt: 1-2 sentences describing a vertical 9:16 ad shot. Mention lighting, mood, what's in frame.",
    'assetType is "image" for static, "video" for motion — pick whichever serves the angle best.',
    "",
    languageInstruction,
    "",
    `Output JSON array of length ${perAngle}, each element:`,
    `{ "variantLabel": "<short tag>", "headline": "...", "body": "...", "cta": "...", "visualPrompt": "...", "assetType": "image" | "video" }`
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function synthesizePadding(
  angle: SprintAngle,
  count: number,
  product: SprintBriefProductContext,
  language: "he" | "en"
): SprintBrief[] {
  const headline = language === "he" ? `${product.title} — חדש בחנות` : `${product.title} — now available`;
  const body =
    language === "he"
      ? "המוצר שכולם מדברים עליו."
      : "The product everyone's talking about.";
  const cta = language === "he" ? "קנו עכשיו" : "Shop now";
  return Array.from({ length: count }, (_, i) => ({
    angle,
    variantLabel: `${angle} fallback ${i + 1}`,
    headline,
    body,
    cta,
    visualPrompt: `Clean vertical 9:16 product hero shot of ${product.title}, soft studio lighting, neutral background.`,
    assetType: "image" as const
  }));
}

// Provider switch:
//   - Default: Brandzp's Creative BI agent (askCreativeAgentJson). It's
//     domain-tuned for marketing copy and runs through our gateway.
//   - Fallback: Anthropic Claude direct (anthropicChatJson). Used only
//     when BI agent isn't configured OR the BI call throws — so a tunnel
//     hiccup never strands a sprint. Set BI_AGENT_DISABLE=1 to skip BI
//     entirely (useful when comparing outputs).
async function callLlmForBriefs(prompt: string, perAngle: number, model?: string): Promise<LlmBriefDraft[]> {
  const biDisabled = process.env.BI_AGENT_DISABLE === "1";
  const biAvailable = !biDisabled && isBiAgentConfigured();
  if (biAvailable) {
    try {
      return await askCreativeAgentJson<LlmBriefDraft[]>({
        question: prompt,
        jsonHint: `array of ${perAngle} brief objects`,
        timeoutMs: 90_000
      });
    } catch (err) {
      // Fall through to Anthropic if it's configured; otherwise rethrow.
      if (!process.env.ANTHROPIC_API_KEY) throw err;
      console.warn("[brief-generator] BI agent failed, falling back to Anthropic:", err);
    }
  }
  return anthropicChatJson<LlmBriefDraft[]>({
    messages: [{ role: "user", content: prompt }],
    model,
    maxTokens: 4096,
    temperature: 0.9,
    jsonHint: `array of ${perAngle} brief objects`
  });
}

async function generateForAngle(
  angle: (typeof SPRINT_ANGLES)[number],
  perAngle: number,
  store: SprintBriefStoreContext,
  product: SprintBriefProductContext,
  model?: string
): Promise<SprintBrief[]> {
  const prompt = buildAnglePrompt(angle, perAngle, store, product);
  try {
    const drafts = await callLlmForBriefs(prompt, perAngle, model);
    if (!Array.isArray(drafts) || drafts.length === 0) {
      return synthesizePadding(angle.key, perAngle, product, store.language);
    }
    // Map drafts to briefs, defaulting any missing fields.
    const mapped = drafts.slice(0, perAngle).map((d, i): SprintBrief => ({
      angle: angle.key,
      variantLabel: d.variantLabel || `${angle.key} ${i + 1}`,
      headline: d.headline?.trim() || product.title,
      body: d.body?.trim() || "",
      cta: d.cta?.trim() || (store.language === "he" ? "קנו עכשיו" : "Shop now"),
      visualPrompt:
        d.visualPrompt?.trim() ||
        `Clean vertical 9:16 hero shot of ${product.title}, modern lighting.`,
      assetType: d.assetType === "video" ? "video" : "image"
    }));
    if (mapped.length < perAngle) {
      mapped.push(...synthesizePadding(angle.key, perAngle - mapped.length, product, store.language));
    }
    return mapped;
  } catch (err) {
    console.error(`[brief-generator] angle ${angle.key} failed:`, err);
    return synthesizePadding(angle.key, perAngle, product, store.language);
  }
}

export async function generateSprintBriefs(input: GenerateBriefsInput): Promise<SprintBrief[]> {
  if (input.targetCount <= 0) return [];
  // Distribute targetCount across the 10 angles. Round up so the angles
  // collectively over-produce, then trim to exact targetCount below.
  const angleCount = SPRINT_ANGLES.length;
  const perAngle = Math.ceil(input.targetCount / angleCount);

  const allAngleResults = await Promise.all(
    SPRINT_ANGLES.map((angle) =>
      generateForAngle(angle, perAngle, input.store, input.product, input.model)
    )
  );

  // Interleave the angles so the first 10 ads cover all 10 angles, the
  // next 10 do the same, etc. Makes the matrix board (and any partial
  // run) feel balanced across angles rather than top-heavy on one.
  const interleaved: SprintBrief[] = [];
  for (let i = 0; i < perAngle; i++) {
    for (const angleResults of allAngleResults) {
      const brief = angleResults[i];
      if (brief) interleaved.push(brief);
    }
  }
  return interleaved.slice(0, input.targetCount);
}
