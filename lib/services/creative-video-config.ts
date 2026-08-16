// Single source of truth for video-feature gating. The feature is gated
// because video generation is significantly more expensive than images —
// $0.40-$0.50/clip via Veo/DoP and ~60s of provider time per clip. Until
// the merchant explicitly opts in, the wizard hides video flows and the
// API rejects video creation jobs.

const DEFAULT_MAX_VIDEO_BATCH = 10;

export function isCreativeVideoEnabled(): boolean {
  const value = process.env.CREATIVE_VIDEO_ENABLED;
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

export function maxVideoBatchSize(): number {
  const parsed = Number(process.env.CREATIVE_MAX_VIDEO_BATCH);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_VIDEO_BATCH;
}

// Per-creative-type capability check used by the worker dispatcher. Mirrors
// the implicit "PACKSHOT/INSTAGRAM_POST/META_AD = image, UGC_VIDEO = video"
// rule we use elsewhere — put it in one place so it can't drift.
export function isVideoCreativeType(creativeType: string): boolean {
  return creativeType === "UGC_VIDEO";
}
