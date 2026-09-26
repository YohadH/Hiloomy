// Pure helpers for affiliate campaigns and briefs (ported from the Creators
// project, 2026-09-26). Value sets are strings, like the rest of the schema.

export const CAMPAIGN_STATUSES = ["draft", "active", "ended"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const BRIEF_FORMATS = ["post", "story", "reel", "video", "other"] as const;
export type BriefFormat = (typeof BRIEF_FORMATS)[number];

export const BRIEF_STATUSES = ["planned", "posted", "missed", "cancelled"] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export const BRIEF_FORMAT_LABEL: Record<BriefFormat, { he: string; en: string }> = {
  post: { he: "פוסט", en: "Post" },
  story: { he: "סטורי", en: "Story" },
  reel: { he: "ריל", en: "Reel" },
  video: { he: "וידאו", en: "Video" },
  other: { he: "אחר", en: "Other" }
};

export const BRIEF_STATUS_LABEL: Record<BriefStatus, { he: string; en: string }> = {
  planned: { he: "מתוכנן", en: "Planned" },
  posted: { he: "פורסם", en: "Posted" },
  missed: { he: "הוחמץ", en: "Missed" },
  cancelled: { he: "בוטל", en: "Cancelled" }
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, { he: string; en: string }> = {
  draft: { he: "טיוטה", en: "Draft" },
  active: { he: "פעיל", en: "Active" },
  ended: { he: "הסתיים", en: "Ended" }
};

export function isCampaignStatus(v: unknown): v is CampaignStatus {
  return typeof v === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(v);
}
export function isBriefFormat(v: unknown): v is BriefFormat {
  return typeof v === "string" && (BRIEF_FORMATS as readonly string[]).includes(v);
}
export function isBriefStatus(v: unknown): v is BriefStatus {
  return typeof v === "string" && (BRIEF_STATUSES as readonly string[]).includes(v);
}

// A brief that is still planned after its due date is "late" — shown to both
// sides, never auto-marked missed (the merchant decides).
export function briefIsLate(brief: { status: string; dueDate: Date | string }, now = new Date()): boolean {
  return brief.status === "planned" && new Date(brief.dueDate).getTime() < now.getTime() - 86_400_000;
}

// Which brief a click should be tied to when the link carries a campaign:
// the member's planned brief with the nearest due date around now, else the
// most recent one of any status, else null.
export function pickBriefForClick<T extends { id: string; status: string; dueDate: Date | string }>(briefs: T[], now = new Date()): T | null {
  if (!briefs.length) return null;
  const t = now.getTime();
  const planned = briefs.filter((b) => b.status === "planned").sort((a, b) => Math.abs(new Date(a.dueDate).getTime() - t) - Math.abs(new Date(b.dueDate).getTime() - t));
  if (planned.length) return planned[0];
  return [...briefs].sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0];
}
