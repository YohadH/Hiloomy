// String unions for Creative-feature DB columns. Keep these in lockstep with
// the comments next to the matching String fields in prisma/schema.prisma.

export type CreativeType = "PACKSHOT" | "UGC_VIDEO" | "INSTAGRAM_POST" | "META_AD";
export type CreativeAspectRatio = "1:1" | "4:5" | "9:16" | "16:9";
export type CreativeProjectStatus = "draft" | "generating" | "ready" | "archived";
export type CreativeAssetType = "IMAGE" | "VIDEO";
export type CreativeAssetStatus = "pending" | "rendering" | "ready" | "failed";
export type CreativeJobType = "GENERATE_BATCH" | "REGEN_ASSET" | "EDIT_IMAGE";
export type CreativeJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type CreativeSourceKind = "USER_UPLOAD" | "SHOPIFY_PRODUCT_IMAGE";

export type CreativeProvider = "replicate" | "higgsfield" | "nanobanana" | "openai";
export const CREATIVE_PROVIDERS: CreativeProvider[] = [
  "replicate",
  "higgsfield",
  "nanobanana",
  "openai"
];
export function isCreativeProvider(value: unknown): value is CreativeProvider {
  return typeof value === "string" && (CREATIVE_PROVIDERS as string[]).includes(value);
}

// Which capabilities a provider supports. Used by the UI to grey-out video
// options when an image-only provider is selected.
export const PROVIDER_CAPABILITIES: Record<CreativeProvider, { image: boolean; video: boolean }> = {
  replicate: { image: true, video: true }, // Replicate Veo wired in M3
  higgsfield: { image: true, video: true },
  nanobanana: { image: true, video: false },
  openai: { image: true, video: false } // gpt-image-1 is image-only
};

export const CREATIVE_TYPES: CreativeType[] = ["PACKSHOT", "UGC_VIDEO", "INSTAGRAM_POST", "META_AD"];
export const CREATIVE_ASPECT_RATIOS: CreativeAspectRatio[] = ["1:1", "4:5", "9:16", "16:9"];

export function isCreativeType(value: unknown): value is CreativeType {
  return typeof value === "string" && (CREATIVE_TYPES as string[]).includes(value);
}

export function isCreativeAspectRatio(value: unknown): value is CreativeAspectRatio {
  return typeof value === "string" && (CREATIVE_ASPECT_RATIOS as string[]).includes(value);
}

// Default aspect for each creative type if the user doesn't override.
export const DEFAULT_ASPECT_RATIO: Record<CreativeType, CreativeAspectRatio> = {
  PACKSHOT: "1:1",
  UGC_VIDEO: "9:16",
  INSTAGRAM_POST: "4:5",
  META_AD: "1:1"
};

export interface CreativeBrief {
  productName?: string;
  productDescription?: string;
  headline?: string;
  cta?: string;
  tone?: string;
  brandNotes?: string;
  // Free-form text appended to the generated AI prompt. Optional — when set,
  // it goes in after the structured prompt parts so user intent wins over the
  // template defaults.
  customPrompt?: string;
  // How hard to push photorealism in the prompt. "ultra" injects strong
  // photo-real descriptors + explicit "no AI artifacts" guidance; "balanced"
  // is the default and leaves room for the template's own style notes to
  // shape the look. Stored in briefJson so each project remembers its own
  // setting.
  realism?: CreativeRealismLevel;
  // When true (default), the Creative agent rewrites the prompt before it
  // hits the image model — using product/tone/brand notes as context. Set
  // to false to bypass the agent and use only the deterministic template
  // (legacy behavior). See creative-prompt-agent-service.
  useAgentPrompt?: boolean;
  // Per-source-id metadata: which uploaded file is the actual product vs a
  // reference (model pose, lighting style, mood…). The product role is what
  // we pass to the model as the image-conditioning reference; reference rows
  // are described by their label inside the text prompt.
  sourceRoles?: Record<string, CreativeSourceRoleEntry>;
}

export type CreativeSourceRole = "product" | "reference";

export type CreativeRealismLevel = "balanced" | "ultra";
export const CREATIVE_REALISM_LEVELS: CreativeRealismLevel[] = ["balanced", "ultra"];

export interface CreativeSourceRoleEntry {
  role: CreativeSourceRole;
  label?: string; // free-text descriptor for reference roles ("model pose", "lighting")
}

// Persisted on CreativeAsset.overlaysJson. Konva canvas + the Sharp compositor
// both render against this same schema so the editor preview matches the
// rendered output 1:1.
export interface TextOverlay {
  // Discriminator. Missing on legacy rows — readers should treat undefined as "text".
  type?: "text";
  id: string;
  text: string;
  // Position is normalized 0..1 against the rendered asset's width/height
  // so overlays survive aspect-ratio / resolution changes.
  xPct: number;
  yPct: number;
  widthPct: number;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  rotation?: number;
  // Optional destination URL. Doesn't make the rendered pixels clickable —
  // the editor draws an underline so designers can see it's a link, and
  // downstream publish flows (e.g. Shopify product description, Meta ad) can
  // wire it up to a real anchor.
  linkUrl?: string;
  // Per-overlay backdrop. When enabled, the compositor draws a colored
  // rounded-rect behind the text for legibility on busy backgrounds. Empty /
  // undefined → no backdrop (the old hard-coded translucent box is gone).
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number; // 0..1
}

// Image overlay — logo, badge, sticker. Stored inline as a data URL so the
// editor can preview without a second round-trip. Capped to ~512 KB at upload
// time so overlaysJson rows stay small.
export interface ImageOverlay {
  type: "image";
  id: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  // base64 data URL (image/png, image/jpeg, image/webp)
  dataUrl: string;
  rotation?: number;
  opacity?: number; // 0..1
}

export type CanvasOverlay = TextOverlay | ImageOverlay;

export function isImageOverlay(value: CanvasOverlay): value is ImageOverlay {
  return (value as ImageOverlay).type === "image";
}
export function isTextOverlay(value: CanvasOverlay): value is TextOverlay {
  // Treat legacy (no `type`) rows as text.
  const t = (value as TextOverlay).type;
  return t === undefined || t === "text";
}

export interface CreativeProjectSummary {
  id: string;
  name: string;
  creativeType: CreativeType;
  aspectRatio: CreativeAspectRatio;
  status: CreativeProjectStatus;
  provider: CreativeProvider;
  targetCount: number;
  assetCount: number;
  readyCount: number;
  failedCount: number;
  coverThumbUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeAssetSummary {
  id: string;
  projectId: string;
  assetType: CreativeAssetType;
  status: CreativeAssetStatus;
  fileUrl: string | null;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  promptUsed: string | null;
  overlays: CanvasOverlay[];
  errorMessage: string | null;
  createdAt: string;
}

export interface CreativeProjectDetail extends CreativeProjectSummary {
  brief: CreativeBrief | null;
  sources: { id: string; fileUrl: string | null; mimeType: string }[];
  assets: CreativeAssetSummary[];
}
