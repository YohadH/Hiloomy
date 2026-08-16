import * as XLSX from "xlsx";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";
import { ensureAffiliateProgramSeed } from "@/lib/services/affiliate-portal-admin-service";
import { getAffiliateConversions, getAffiliates } from "@/lib/services/affiliate-portal-service";
import type { AffiliateStatus } from "@/lib/domain/affiliate-portal-types";

type DirectoryContext = Awaited<ReturnType<typeof getDirectoryContext>>;

type AffiliateDraft = {
  email: string;
  firstName: string;
  lastName?: string | null;
  country?: string | null;
  source?: string | null;
  status?: AffiliateStatus | null;
  affiliateCode?: string | null;
  couponCode?: string | null;
  referralLink?: string | null;
  shortLink?: string | null;
  instagramUsername?: string | null;
  instagramProfileUrl?: string | null;
  programName?: string | null;
  joinedAt?: Date | null;
  lastLoginAt?: Date | null;
};

type ImportResult = {
  ok: true;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  programsCreated: number;
};

export const SAMPLE_EXPORT_COLUMNS = [
  "Email",
  "First Name",
  "Last Name",
  "Address",
  "Company",
  "Country",
  "Phone",
  "Personal ID",
  "City",
  "Zipcode",
  "Site",
  "Website",
  "Facebook",
  "Youtube",
  "Instagram",
  "Tiktok",
  "Additional Tiktok",
  "Program",
  "Shortlink",
  "Referral code",
  "Network link",
  "Payment Method",
  "Payment Info",
  "Coupons",
  "Status",
  "Approved",
  "Date created",
  "Parent name",
  "Parent email",
  "Last login"
] as const;

const HEADER_ALIASES = {
  email: ["email", "mail", "affiliateemail"],
  firstName: ["firstname", "first", "first_name", "givenname"],
  lastName: ["lastname", "last", "surname", "familyname", "last_name"],
  country: ["country"],
  source: ["source", "signupsource", "network", "channel"],
  status: ["status"],
  approved: ["approved", "approvalstatus"],
  affiliateCode: ["affiliatecode", "referralcode", "refcode", "promo", "promocode", "partnercode"],
  couponCode: ["coupon", "coupons", "couponcode", "discountcode"],
  referralLink: ["referrallink", "networklink", "trackinglink", "affiliatelink", "link"],
  shortLink: ["shortlink", "shorturl"],
  instagramProfileUrl: ["instagram", "instagramurl", "instagramprofile", "instagramprofileurl", "ig", "igurl", "ighandle", "instagramhandle"],
  programName: ["program", "programname"],
  joinedAt: ["datecreated", "createdat", "datejoined", "joinedat"],
  lastLoginAt: ["lastlogin", "lastloginat", "lastseen"]
} as const;

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toStringValue(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeInstagramUsername(value: string | null | undefined) {
  const raw = toStringValue(value);
  if (!raw) return null;

  let candidate = raw.replace(/^@+/, "").trim();
  try {
    const url = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
    if (url.hostname.includes("instagram.com")) {
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    }
  } catch {
    candidate = candidate.split(/[/?#]/)[0] ?? candidate;
  }

  candidate = candidate.replace(/^@+/, "").replace(/\/+$/, "").trim().toLowerCase();
  if (!candidate || ["p", "reel", "reels", "stories", "explore", "accounts"].includes(candidate)) return null;
  return /^[a-z0-9._]{1,30}$/i.test(candidate) ? candidate : null;
}

function normalizeInstagramProfileUrl(value: string | null | undefined) {
  const username = normalizeInstagramUsername(value);
  return username ? `https://www.instagram.com/${username}/` : null;
}

function parseBooleanLike(value: unknown) {
  const normalized = toStringValue(value).toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "approved", "active", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "denied", "inactive", "n"].includes(normalized)) return false;
  return null;
}

function parseDateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000) {
      const timestamp = Math.round((value - 25569) * 86400 * 1000);
      const parsed = new Date(timestamp);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  const normalized = toStringValue(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeAffiliateStatus(statusValue: unknown, approvedValue?: unknown): AffiliateStatus {
  const explicit = toStringValue(statusValue).toLowerCase();
  if (explicit.includes("approve") || explicit === "active") return "approved";
  if (explicit.includes("deny") || explicit.includes("reject") || explicit === "inactive") return "denied";
  if (explicit.includes("pending")) return "pending";

  const approved = parseBooleanLike(approvedValue);
  if (approved === true) return "approved";
  if (approved === false) return "pending";
  return "pending";
}

function sanitizeAffiliateCodeSegment(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 24);
}

function buildFallbackAffiliateCode(draft: Pick<AffiliateDraft, "firstName" | "lastName" | "email">) {
  const fromNames = sanitizeAffiliateCodeSegment(`${draft.firstName}${draft.lastName ?? ""}`);
  if (fromNames) return fromNames;

  const emailPrefix = sanitizeAffiliateCodeSegment(draft.email.split("@")[0] ?? "AFFILIATE");
  return emailPrefix || "AFFILIATE";
}

function buildReferralLink(storeDomain: string, affiliateCode: string, couponCode?: string | null) {
  const url = new URL(`https://${storeDomain}/`);
  url.searchParams.set("ref", affiliateCode);
  if (couponCode) {
    url.searchParams.set("coupon", couponCode);
  }
  url.searchParams.set("utm_source", "affiliate");
  return url.toString();
}

function escapeCsv(value: unknown) {
  const text = toStringValue(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function buildCsv(rows: string[][]) {
  return `\uFEFF${rows.map((row) => row.map((value) => escapeCsv(value)).join(",")).join("\r\n")}`;
}

function getFieldValue(row: Record<string, unknown>, aliases: readonly string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (match) return match[1];
  }
  return undefined;
}

function isRowEmpty(row: Record<string, unknown>) {
  return Object.values(row).every((value) => !toStringValue(value));
}

function mapImportRow(row: Record<string, unknown>) {
  if (isRowEmpty(row)) return null;

  const email = toStringValue(getFieldValue(row, HEADER_ALIASES.email));
  const firstName = toStringValue(getFieldValue(row, HEADER_ALIASES.firstName));
  const lastName = toStringValue(getFieldValue(row, HEADER_ALIASES.lastName));

  if (!email || !firstName) {
    return null;
  }

  return {
    email,
    firstName,
    lastName,
    country: toStringValue(getFieldValue(row, HEADER_ALIASES.country)) || null,
    source: toStringValue(getFieldValue(row, HEADER_ALIASES.source)) || "Import",
    status: normalizeAffiliateStatus(
      getFieldValue(row, HEADER_ALIASES.status),
      getFieldValue(row, HEADER_ALIASES.approved)
    ),
    affiliateCode: toStringValue(getFieldValue(row, HEADER_ALIASES.affiliateCode)) || null,
    couponCode: toStringValue(getFieldValue(row, HEADER_ALIASES.couponCode)) || null,
    referralLink: toStringValue(getFieldValue(row, HEADER_ALIASES.referralLink)) || null,
    shortLink: toStringValue(getFieldValue(row, HEADER_ALIASES.shortLink)) || null,
    instagramProfileUrl: toStringValue(getFieldValue(row, HEADER_ALIASES.instagramProfileUrl)) || null,
    programName: toStringValue(getFieldValue(row, HEADER_ALIASES.programName)) || null,
    joinedAt: parseDateValue(getFieldValue(row, HEADER_ALIASES.joinedAt)),
    lastLoginAt: parseDateValue(getFieldValue(row, HEADER_ALIASES.lastLoginAt))
  } satisfies AffiliateDraft;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractRowsFromJsonImport(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (isRecord(value)) {
    const nested = value.affiliates ?? value.rows ?? value.data;
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
  }

  return [];
}

async function readImportRows(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".json")) {
    const parsed = JSON.parse(await file.text());
    const rows = extractRowsFromJsonImport(parsed);
    if (!rows.length) {
      throw new AppError("The uploaded JSON file does not contain any affiliate rows.", 400);
    }
    return rows;
  }

  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  if (!sheet) {
    throw new AppError("The uploaded file does not contain a readable worksheet.", 400);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    blankrows: false
  });

  if (!rows.length) {
    throw new AppError("The uploaded file does not contain any affiliate rows.", 400);
  }

  return rows;
}

async function getDirectoryContext(storeId?: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  const store = storeId
    ? await db.store.findUnique({ where: { id: storeId } })
    : await resolveOrCreateBaseStore();

  if (!store) throw new AppError("Store was not found.", 404);
  if (!db.affiliateMember || !db.affiliateProgram) {
    throw new AppError("Affiliate tables are not ready. Run Prisma generate and db push first.", 500);
  }

  await ensureAffiliateProgramSeed(store.id);
  return { db, store };
}

async function ensureUniqueAffiliateCode(context: DirectoryContext, preferredCode: string, currentAffiliateId?: string) {
  const base = sanitizeAffiliateCodeSegment(preferredCode) || "AFFILIATE";
  let candidate = base;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    // Scoped lookup: codes are unique PER STORE, not globally. Without
    // this scope another tenant's code would block ours AND we'd leak the
    // existence of their members by trial-and-error. Case-insensitive so
    // "sara" can't slip past an existing "SARA" — matching is insensitive
    // downstream, so case-variant duplicates would be credited arbitrarily.
    const existing = await context.db.affiliateMember.findFirst({
      where: { storeId: context.store.id, affiliateCode: { equals: candidate, mode: "insensitive" } }
    }).catch(() => null);
    if (!existing || existing.id === currentAffiliateId) {
      return candidate;
    }

    const suffix = `${attempt + 2}`;
    const budget = Math.max(1, 24 - suffix.length);
    candidate = `${base.slice(0, budget)}${suffix}`;
  }

  throw new AppError("Could not generate a unique affiliate code.", 400);
}

async function resolveProgramId(context: DirectoryContext, programName?: string | null) {
  const normalizedName = toStringValue(programName);
  if (!normalizedName) {
    const fallbackProgram = await context.db.affiliateProgram.findFirst({
      where: { storeId: context.store.id },
      orderBy: { createdAt: "asc" }
    });
    return {
      programId: fallbackProgram?.id ?? null,
      created: false
    };
  }

  const existing = await context.db.affiliateProgram.findFirst({
    where: { storeId: context.store.id, name: normalizedName }
  });
  if (existing) {
    return { programId: existing.id, created: false };
  }

  const createdProgram = await context.db.affiliateProgram.create({
    data: {
      storeId: context.store.id,
      name: normalizedName,
      status: "active",
      commissionRate: 0.1,
      signUpLink: `https://${context.store.domain}/pages/affiliate-signup`
    }
  });

  return { programId: createdProgram.id, created: true };
}

async function syncImportedCouponSnapshot(
  context: DirectoryContext,
  affiliate: { id: string; affiliateCode: string; couponCode?: string | null },
  couponCode?: string | null,
  applyLink?: string | null
) {
  const normalizedCouponCode = toStringValue(couponCode);
  if (!normalizedCouponCode || !context.db.affiliateCoupon || !context.db.affiliateCouponAssignment) {
    return;
  }

  const existingCoupon = await context.db.affiliateCoupon.findUnique({
    where: { storeId_code: { storeId: context.store.id, code: normalizedCouponCode } }
  });
  const previousAffiliateId = existingCoupon?.affiliateMemberId ?? null;

  const coupon = await context.db.affiliateCoupon.upsert({
    where: { storeId_code: { storeId: context.store.id, code: normalizedCouponCode } },
    update: {
      affiliateMemberId: affiliate.id,
      title: existingCoupon?.title ?? `Imported coupon ${normalizedCouponCode}`,
      discountType: existingCoupon?.discountType ?? "percent",
      discountValue: existingCoupon?.discountValue ?? 0,
      applyLink: applyLink ?? existingCoupon?.applyLink ?? buildReferralLink(context.store.domain, affiliate.affiliateCode, normalizedCouponCode),
      status: "active"
    },
    create: {
      storeId: context.store.id,
      affiliateMemberId: affiliate.id,
      title: `Imported coupon ${normalizedCouponCode}`,
      code: normalizedCouponCode,
      discountType: "percent",
      discountValue: 0,
      appliesOncePerCustomer: false,
      applyLink: applyLink ?? buildReferralLink(context.store.domain, affiliate.affiliateCode, normalizedCouponCode),
      status: "active"
    }
  });

  const latestAssignment = await context.db.affiliateCouponAssignment.findFirst({
    where: { storeId: context.store.id, affiliateMemberId: affiliate.id, couponCode: normalizedCouponCode },
    orderBy: { createdAt: "desc" }
  });

  if (!latestAssignment || latestAssignment.affiliateCouponId !== coupon.id || latestAssignment.connectionSource !== "existing_coupon") {
    await context.db.affiliateCouponAssignment.create({
      data: {
        storeId: context.store.id,
        affiliateMemberId: affiliate.id,
        affiliateCouponId: coupon.id,
        couponCode: normalizedCouponCode,
        couponTitle: coupon.title,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        applyLink: coupon.applyLink,
        assignmentMode: "single",
        connectionSource: "existing_coupon"
      }
    });
  }

  if (previousAffiliateId && previousAffiliateId !== affiliate.id) {
    const latestPreviousCoupon = await context.db.affiliateCoupon.findFirst({
      where: { storeId: context.store.id, affiliateMemberId: previousAffiliateId, status: "active" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });
    await context.db.affiliateMember.update({
      where: { id: previousAffiliateId },
      data: { couponCode: latestPreviousCoupon?.code ?? null }
    });
  }
}

async function saveAffiliateDraft(context: DirectoryContext, draft: AffiliateDraft) {
  const email = toStringValue(draft.email).toLowerCase();
  if (!email) throw new AppError("Affiliate email is required.", 400);

  const existing = await context.db.affiliateMember.findUnique({
    where: {
      storeId_email: {
        storeId: context.store.id,
        email
      }
    }
  });

  const firstName = toStringValue(draft.firstName) || existing?.firstName;
  const lastName = toStringValue(draft.lastName) || existing?.lastName || "";
  if (!firstName) throw new AppError("Affiliate first name is required.", 400);

  const nextCouponCode = toStringValue(draft.couponCode) || existing?.couponCode || null;
  const desiredCode = toStringValue(draft.affiliateCode) || existing?.affiliateCode || buildFallbackAffiliateCode({
    email,
    firstName,
    lastName
  });
  const affiliateCode = await ensureUniqueAffiliateCode(context, desiredCode, existing?.id);

  const { programId, created } = await resolveProgramId(context, draft.programName);
  const referralLink =
    toStringValue(draft.referralLink) ||
    existing?.referralLink ||
    buildReferralLink(context.store.domain, affiliateCode, nextCouponCode);
  const shortLink = toStringValue(draft.shortLink) || existing?.shortLink || referralLink;
  const status = draft.status ?? (existing?.status as AffiliateStatus | undefined) ?? "pending";
  const source = toStringValue(draft.source) || existing?.source || "Manual";
  const country = toStringValue(draft.country) || existing?.country || "";
  const instagramUsername =
    normalizeInstagramUsername(draft.instagramUsername)
    ?? normalizeInstagramUsername(draft.instagramProfileUrl)
    ?? existing?.instagramUsername
    ?? null;
  const instagramProfileUrl =
    normalizeInstagramProfileUrl(draft.instagramProfileUrl)
    ?? normalizeInstagramProfileUrl(instagramUsername)
    ?? existing?.instagramProfileUrl
    ?? null;
  const joinedAt = draft.joinedAt ?? existing?.joinedAt ?? new Date();
  const lastLoginAt = draft.lastLoginAt ?? existing?.lastLoginAt ?? null;

  const data = {
    programId,
    firstName,
    lastName,
    status,
    source,
    country,
    affiliateCode,
    couponCode: nextCouponCode,
    referralLink,
    shortLink,
    instagramUsername,
    instagramProfileUrl,
    joinedAt,
    lastLoginAt
  };

  const affiliate = existing
    ? await context.db.affiliateMember.update({
        where: { id: existing.id },
        data
      })
    : await context.db.affiliateMember.create({
        data: {
          storeId: context.store.id,
          email,
          ...data
        }
      });

  await syncImportedCouponSnapshot(context, affiliate, nextCouponCode, referralLink);

  return {
    createdAffiliate: !existing,
    createdProgram: created,
    affiliate
  };
}

export async function createAffiliate(input: {
  storeId?: string;
  email: string;
  firstName: string;
  lastName?: string | null;
  country?: string | null;
  source?: string | null;
  status?: string | null;
  affiliateCode?: string | null;
  couponCode?: string | null;
  referralLink?: string | null;
  shortLink?: string | null;
  instagramUsername?: string | null;
  instagramProfileUrl?: string | null;
  programName?: string | null;
}) {
  const context = await getDirectoryContext(input.storeId);
  const result = await saveAffiliateDraft(context, {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    country: input.country,
    source: input.source || "Manual",
    status: normalizeAffiliateStatus(input.status),
    affiliateCode: input.affiliateCode,
    couponCode: input.couponCode,
    referralLink: input.referralLink,
    shortLink: input.shortLink,
    instagramUsername: input.instagramUsername,
    instagramProfileUrl: input.instagramProfileUrl,
    programName: input.programName
  });

  return {
    ok: true,
    affiliateId: result.affiliate.id,
    created: result.createdAffiliate,
    programCreated: result.createdProgram
  };
}

export async function updateAffiliateInstagramProfile(input: {
  storeId?: string | null;
  affiliateId: string;
  instagramProfileUrl?: string | null;
}) {
  const context = await getDirectoryContext(input.storeId ?? undefined);
  const affiliateId = toStringValue(input.affiliateId);
  if (!affiliateId) throw new AppError("Affiliate id is required.", 400);

  const existing = await context.db.affiliateMember.findFirst({
    where: {
      id: affiliateId,
      storeId: context.store.id
    }
  });

  if (!existing) throw new AppError("Affiliate was not found for this store.", 404);

  const rawValue = toStringValue(input.instagramProfileUrl);
  const instagramUsername = rawValue ? normalizeInstagramUsername(rawValue) : null;
  if (rawValue && !instagramUsername) {
    throw new AppError("Use a valid Instagram handle or profile URL.", 400);
  }

  const instagramProfileUrl = instagramUsername ? normalizeInstagramProfileUrl(instagramUsername) : null;
  const row = await context.db.affiliateMember.update({
    where: { id: existing.id },
    data: {
      instagramUsername,
      instagramProfileUrl
    }
  });

  return {
    ok: true,
    affiliateId: row.id,
    instagramUsername: row.instagramUsername ?? null,
    instagramProfileUrl: row.instagramProfileUrl ?? null
  };
}

export async function ensureAffiliateProgramReady(storeId?: string) {
  return ensureAffiliateProgramSeed(storeId);
}

export async function importAffiliatesFromFile(file: File, storeId?: string): Promise<ImportResult> {
  const context = await getDirectoryContext(storeId);
  const rows = await readImportRows(file);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let programsCreated = 0;
  const errors: string[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const draft = mapImportRow(row);

    if (!draft) {
      skipped += 1;
      continue;
    }

    try {
      const result = await saveAffiliateDraft(context, draft);
      if (result.createdAffiliate) {
        created += 1;
      } else {
        updated += 1;
      }
      if (result.createdProgram) {
        programsCreated += 1;
      }
    } catch (error) {
      errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "Import failed."}`);
    }
  }

  return {
    ok: true,
    created,
    updated,
    skipped,
    errors,
    programsCreated
  };
}

// One cell per SAMPLE_EXPORT_COLUMNS entry, derived from a header→value
// record so a count/order mismatch is structurally impossible — the previous
// positional array shipped 28 cells under 30 headers and corrupted
// round-trips through our own importer.
export function buildAffiliateExportRow(affiliate: {
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  instagramProfileUrl?: string | null;
  programName: string;
  shortLink: string;
  affiliateCode: string;
  referralLink: string;
  couponCode?: string | null;
  status: string;
  dateJoined: string;
  lastLogin?: string | null;
}): string[] {
  const record: Record<(typeof SAMPLE_EXPORT_COLUMNS)[number], string> = {
    "Email": affiliate.email,
    "First Name": affiliate.firstName,
    "Last Name": affiliate.lastName,
    "Address": "",
    "Company": "",
    "Country": affiliate.country,
    "Phone": "",
    "Personal ID": "",
    "City": "",
    "Zipcode": "",
    "Site": "",
    "Website": "",
    "Facebook": "",
    "Youtube": "",
    "Instagram": affiliate.instagramProfileUrl ?? "",
    "Tiktok": "",
    "Additional Tiktok": "",
    "Program": affiliate.programName,
    "Shortlink": affiliate.shortLink,
    "Referral code": affiliate.affiliateCode,
    "Network link": affiliate.referralLink,
    "Payment Method": "",
    "Payment Info": "",
    "Coupons": affiliate.couponCode ?? "",
    "Status": affiliate.status,
    "Approved": affiliate.status === "approved" ? "Yes" : "No",
    "Date created": affiliate.dateJoined,
    "Parent name": "",
    "Parent email": "",
    "Last login": affiliate.lastLogin ?? ""
  };
  return SAMPLE_EXPORT_COLUMNS.map((column) => record[column] ?? "");
}

export async function exportAffiliatesAsCsv() {
  const affiliates = await getAffiliates();
  const rows = [
    [...SAMPLE_EXPORT_COLUMNS],
    ...affiliates.map((affiliate) => buildAffiliateExportRow(affiliate))
  ];

  return buildCsv(rows);
}

export async function exportAffiliatesAsJson() {
  const affiliates = await getAffiliates();
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      affiliates
    },
    null,
    2
  );
}

export async function exportAffiliateConversionsAsCsv() {
  const conversions = await getAffiliateConversions();
  const rows = [
    ["Order Number", "Date", "Affiliate", "Total", "Commission", "Status", "Tracking Method", "Source URL", "Content Title"],
    ...conversions.map((conversion) => [
      conversion.orderNumber,
      conversion.date,
      conversion.affiliateName,
      `${conversion.total}`,
      `${conversion.commission}`,
      conversion.status,
      conversion.trackingBy,
      conversion.sourceUrl,
      conversion.contentTitle ?? ""
    ])
  ];

  return buildCsv(rows);
}
