// In-app, per-brand affiliate signup (HLA-12/B1-B4/B7).
//
// Owns: slug resolution (the brand word in /join/{slug}, /r/{slug}/{code},
// /my/{slug}), public signup, readable code generation, Hiloomy link
// issuance + backfill (the actual F-078 fix — links must route through the
// click tracker that already exists), the signup/branding settings, and
// the magic-link email.
//
// Tenancy: EVERYTHING here is keyed by the program's signupSlug → storeId.
// A public visitor can only ever reach the store their slug names.

import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { toNumber } from "@/lib/server/numbers";
import {
  createAffiliateLoginToken,
  createAffiliateSessionToken
} from "@/lib/server/affiliate-session";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export function appBaseUrl(): string {
  const raw = process.env.APP_URL?.trim() || "https://www.hiloomy.com";
  return raw.replace(/\/$/, "");
}

export function buildJoinUrl(slug: string): string {
  return `${appBaseUrl()}/join/${slug}`;
}

export function buildTrackedLink(slug: string, affiliateCode: string): string {
  return `${appBaseUrl()}/r/${slug}/${encodeURIComponent(affiliateCode)}`;
}

export function buildAffiliateHomeUrl(slug: string): string {
  return `${appBaseUrl()}/my/${slug}`;
}

/** Default slug suggestion: first word of the store name if it's a real word, else the whole name slugified. */
export function suggestSlug(storeName: string): string {
  const words = storeName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0] ?? "";
  const candidate = first.length >= 4 ? first : words.join("-");
  return candidate.slice(0, 30) || "brand";
}

export interface SignupProgramContext {
  program: {
    id: string;
    name: string;
    signupSlug: string;
    autoApprove: boolean;
    commissionRatePct: number;
    brandLogoUrl: string | null;
    brandAccentColor: string | null;
    signupHeadline: string | null;
    signupCopy: string | null;
    termsText: string | null;
  };
  store: { id: string; name: string; domain: string; currency: string };
}

export async function getProgramBySlug(slug: string): Promise<SignupProgramContext | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const normalized = String(slug ?? "").trim().toLowerCase();
  if (!normalized || !db?.affiliateProgram) return null;
  const program = await db.affiliateProgram.findUnique({
    where: { signupSlug: normalized },
    include: { store: { select: { id: true, name: true, domain: true, currency: true } } }
  });
  if (!program?.store) return null;
  return {
    program: {
      id: program.id,
      name: program.name,
      signupSlug: program.signupSlug,
      autoApprove: Boolean(program.autoApprove),
      commissionRatePct: Math.round(toNumber(program.commissionRate) * 10000) / 100,
      brandLogoUrl: program.brandLogoUrl ?? null,
      brandAccentColor: program.brandAccentColor ?? null,
      signupHeadline: program.signupHeadline ?? null,
      signupCopy: program.signupCopy ?? null,
      termsText: program.termsText ?? null
    },
    store: program.store
  };
}

// ── Affiliate codes ─────────────────────────────────────────────────────
// Six random digits (owner request 2026-08-26 — replaced the old
// identity-derived codes like "YOADHAKIMV"): short in shared URLs and no
// name/handle leaking through the ref parameter. First digit non-zero so
// the code survives spreadsheets and retyping intact. 900k keyspace per
// store is plenty for realistic rosters; collisions just redraw.

function newAffiliateKey(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

async function uniqueAffiliateCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  storeId: string
): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const candidate = newAffiliateKey();
    const exists = await db.affiliateMember.findFirst({
      where: { storeId, affiliateCode: { equals: candidate, mode: "insensitive" } },
      select: { id: true }
    });
    if (!exists) return candidate;
  }
  // 20 straight collisions ≈ a saturated keyspace — widen instead of failing.
  return `${newAffiliateKey()}${Date.now() % 1000}`;
}

// ── Public signup ───────────────────────────────────────────────────────

// Per-IP throttle: an in-memory sliding window is enough for the single
// production instance; a restart resets it, which is fine for abuse
// protection (the honeypot + duplicate-email checks still hold).
const signupHits = new Map<string, number[]>();
const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_MAX_PER_WINDOW = 5;

export function isSignupRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (signupHits.get(ip) ?? []).filter((t) => now - t < SIGNUP_WINDOW_MS);
  hits.push(now);
  signupHits.set(ip, hits);
  if (signupHits.size > 5000) signupHits.clear(); // unbounded-growth guard
  return hits.length > SIGNUP_MAX_PER_WINDOW;
}

export interface RegisterAffiliateResult {
  mode: "created" | "existing";
  memberId: string;
  storeId: string;
  affiliateCode: string;
  status: string;
  sessionToken?: string;
}

// Accepts whatever people actually paste — "@name", "name", or a full
// profile link (instagram.com/name?igsh=…) — and reduces it to the bare
// handle. Returns null when nothing resolvable remains, which the caller
// treats as "field not filled" (it is mandatory).
function normalizeInstagramHandle(raw: unknown): string | null {
  let value = String(raw ?? "").trim();
  if (!value) return null;
  const urlMatch = value.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch) value = urlMatch[1];
  value = value.replace(/^@+/, "").trim();
  // Instagram's own handle rules: letters, digits, dots, underscores, ≤30.
  if (!/^[A-Za-z0-9._]{1,30}$/.test(value)) return null;
  return value.toLowerCase();
}

export async function registerAffiliate(input: {
  slug: string;
  fullName?: string;
  email?: string;
  instagram?: string | null;
}): Promise<RegisterAffiliateResult> {
  const context = await getProgramBySlug(input.slug);
  if (!context) throw new AppError("Unknown signup page.", 404);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;

  const fullName = String(input.fullName ?? "").trim().slice(0, 120);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  const instagram = normalizeInstagramHandle(input.instagram);
  if (fullName.length < 2) throw new AppError("נא למלא שם מלא.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("כתובת אימייל לא תקינה.", 400);
  // Mandatory — the profile URL feeds the content crawler, so a signup
  // without a resolvable Instagram account is worthless to the program.
  if (!instagram) {
    throw new AppError("נא למלא שם משתמש באינסטגרם או קישור לפרופיל (למשל @yourname).", 400);
  }

  // Same email already registered for THIS store → this is a returning
  // affiliate, not a duplicate: hand back a login path instead of erroring.
  const existing = await db.affiliateMember.findFirst({
    where: { storeId: context.store.id, email: { equals: email, mode: "insensitive" } },
    select: { id: true, affiliateCode: true, status: true }
  });
  if (existing) {
    return {
      mode: "existing",
      memberId: existing.id,
      storeId: context.store.id,
      affiliateCode: existing.affiliateCode,
      status: existing.status
    };
  }

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] ?? fullName;
  const lastName = nameParts.slice(1).join(" ");
  const affiliateCode = await uniqueAffiliateCode(db, context.store.id);
  const status = context.program.autoApprove ? "approved" : "pending";

  const member = await db.affiliateMember.create({
    data: {
      storeId: context.store.id,
      programId: context.program.id,
      firstName,
      lastName,
      email,
      status,
      source: "In-app signup",
      affiliateCode,
      instagramUsername: instagram,
      instagramProfileUrl: instagram ? `https://instagram.com/${instagram}` : null,
      referralLink: buildTrackedLink(context.program.signupSlug, affiliateCode),
      lastLoginAt: new Date()
    },
    select: { id: true }
  });

  return {
    mode: "created",
    memberId: member.id,
    storeId: context.store.id,
    affiliateCode,
    status,
    // Auto-login straight after signup (confirmed call #5) — they just
    // proved the email by typing it; a wrong email only means the magic
    // link later reaches nobody.
    sessionToken: createAffiliateSessionToken(member.id, context.store.id)
  };
}

// ── Magic-link login ────────────────────────────────────────────────────

export async function issueLoginLink(input: {
  slug: string;
  email: string;
}): Promise<{ sent: boolean }> {
  const context = await getProgramBySlug(input.slug);
  if (!context) return { sent: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const member = await db.affiliateMember.findFirst({
    where: {
      storeId: context.store.id,
      email: { equals: String(input.email ?? "").trim().toLowerCase(), mode: "insensitive" }
    },
    select: { id: true, email: true, firstName: true }
  });
  // Never reveal whether an email is registered — same response either way.
  if (!member) return { sent: false };

  const token = createAffiliateLoginToken(member.id, context.store.id);
  const url = `${buildAffiliateHomeUrl(context.program.signupSlug)}?token=${encodeURIComponent(token)}`;
  const sent = await sendLoginEmail({
    to: member.email,
    firstName: member.firstName,
    brandName: context.store.name,
    url
  });
  return { sent };
}

/** Owner-side helper: a copyable one-time login link for any member (the no-email fallback). */
export async function buildOwnerLoginLink(storeId: string, memberId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const [member, program] = await Promise.all([
    db.affiliateMember.findFirst({ where: { id: memberId, storeId }, select: { id: true } }),
    db.affiliateProgram.findFirst({ where: { storeId }, select: { signupSlug: true } })
  ]);
  if (!member) throw new AppError("Affiliate not found for this store.", 404);
  if (!program?.signupSlug) {
    throw new AppError("Set a signup slug first (affiliate settings) — the login page lives under it.", 400);
  }
  const token = createAffiliateLoginToken(memberId, storeId);
  return `${buildAffiliateHomeUrl(program.signupSlug)}?token=${encodeURIComponent(token)}`;
}

async function sendLoginEmail(input: {
  to: string;
  firstName: string;
  brandName: string;
  url: string;
}): Promise<boolean> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.REPORT_FROM_EMAIL ?? "").trim();
  if (!apiKey || !from) return false;
  try {
    const { Resend } = await import("resend");
    const client = new Resend(apiKey);
    await client.emails.send({
      from,
      to: [input.to],
      subject: `הכניסה שלך לפורטל השותפים של ${input.brandName}`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
        <p>היי ${input.firstName},</p>
        <p>לחיצה על הכפתור תכניס אותך לדשבורד השותפים שלך אצל ${input.brandName} — המכירות, העמלות והקישור האישי שלך.</p>
        <p><a href="${input.url}" style="display:inline-block;background:#047857;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">כניסה לדשבורד</a></p>
        <p style="color:#666;font-size:12px">הקישור תקף ל־15 דקות ומיועד לך בלבד. אם לא ביקשת אותו — אפשר להתעלם.</p>
      </div>`
    });
    return true;
  } catch (err) {
    console.warn("[affiliate-signup] login email failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Link issuance / backfill (B4 — the F-078 fix) ───────────────────────

export async function regenerateReferralLinks(storeId: string, slug: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const members = (await db.affiliateMember.findMany({
    where: { storeId },
    select: { id: true, affiliateCode: true }
  })) as Array<{ id: string; affiliateCode: string }>;
  for (const member of members) {
    await db.affiliateMember.update({
      where: { id: member.id },
      data: { referralLink: buildTrackedLink(slug, member.affiliateCode) }
    });
  }
  return members.length;
}

// ── Settings (B7) ───────────────────────────────────────────────────────

export interface SignupSettings {
  signupSlug: string | null;
  suggestedSlug: string;
  autoApprove: boolean;
  commissionRatePct: number;
  brandLogoUrl: string | null;
  brandAccentColor: string | null;
  signupHeadline: string | null;
  signupCopy: string | null;
  termsText: string | null;
  joinUrl: string | null;
  affiliateHomeUrl: string | null;
  sampleTrackedLink: string | null;
}

export async function getSignupSettings(storeId: string): Promise<SignupSettings> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const [store, program] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { name: true } }),
    db.affiliateProgram.findFirst({ where: { storeId }, orderBy: { createdAt: "asc" } })
  ]);
  const slug = program?.signupSlug ?? null;
  return {
    signupSlug: slug,
    suggestedSlug: suggestSlug(store?.name ?? "brand"),
    autoApprove: Boolean(program?.autoApprove),
    commissionRatePct: program ? Math.round(toNumber(program.commissionRate) * 10000) / 100 : 10,
    brandLogoUrl: program?.brandLogoUrl ?? null,
    brandAccentColor: program?.brandAccentColor ?? null,
    signupHeadline: program?.signupHeadline ?? null,
    signupCopy: program?.signupCopy ?? null,
    termsText: program?.termsText ?? null,
    joinUrl: slug ? buildJoinUrl(slug) : null,
    affiliateHomeUrl: slug ? buildAffiliateHomeUrl(slug) : null,
    sampleTrackedLink: slug ? buildTrackedLink(slug, "CODE") : null
  };
}

export async function updateSignupSettings(
  storeId: string,
  input: {
    signupSlug?: string;
    autoApprove?: boolean;
    commissionRatePct?: number;
    brandLogoUrl?: string | null;
    brandAccentColor?: string | null;
    signupHeadline?: string | null;
    signupCopy?: string | null;
    termsText?: string | null;
  }
): Promise<SignupSettings> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) throw new AppError("Store not found.", 404);

  const slug = String(input.signupSlug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new AppError(
      "הסלאג חייב להיות באנגלית: אותיות קטנות/ספרות/מקפים, 3–30 תווים (למשל incense).",
      400
    );
  }
  const clash = await db.affiliateProgram.findFirst({
    where: { signupSlug: slug, storeId: { not: storeId } },
    select: { id: true }
  });
  if (clash) throw new AppError(`הסלאג "${slug}" כבר תפוס על ידי מותג אחר — בחרו מילה אחרת.`, 409);

  const ratePct = Number(input.commissionRatePct);
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 90) {
    throw new AppError("אחוז העמלה חייב להיות בין 0 ל־90.", 400);
  }

  const trimOrNull = (v: unknown, max: number) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s.slice(0, max) : null;
  };

  const data = {
    signupSlug: slug,
    autoApprove: Boolean(input.autoApprove),
    commissionRate: Math.round(ratePct * 100) / 10000,
    brandLogoUrl: trimOrNull(input.brandLogoUrl, 500),
    brandAccentColor: trimOrNull(input.brandAccentColor, 30),
    signupHeadline: trimOrNull(input.signupHeadline, 200),
    signupCopy: trimOrNull(input.signupCopy, 2000),
    termsText: trimOrNull(input.termsText, 8000),
    signUpLink: buildJoinUrl(slug)
  };

  const existing = await db.affiliateProgram.findFirst({
    where: { storeId },
    orderBy: { createdAt: "asc" },
    select: { id: true, signupSlug: true }
  });
  if (existing) {
    await db.affiliateProgram.update({ where: { id: existing.id }, data });
  } else {
    await db.affiliateProgram.create({
      data: { storeId, name: `${store.name} Affiliate Program`, ...data }
    });
  }

  // Slug set or changed → every member's link must point at the tracker
  // under the new word (B4). Idempotent, so re-running is harmless.
  if (existing?.signupSlug !== slug) {
    await regenerateReferralLinks(storeId, slug);
  }

  return getSignupSettings(storeId);
}
