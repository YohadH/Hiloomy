const BIXGROW_SOURCE_PLATFORM = "bixgrow";

export function safeTrackingString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function extractTrackingQueryValue(urlLike: string | null | undefined, key: string) {
  if (!urlLike) return null;
  try {
    const normalized = urlLike.startsWith("http")
      ? urlLike
      : `https://placeholder.local${urlLike.startsWith("/") ? urlLike : `/${urlLike}`}`;
    return new URL(normalized).searchParams.get(key);
  } catch {
    return null;
  }
}

export function extractTrackingNoteAttribute(payload: any, key: string) {
  const match = Array.isArray(payload?.note_attributes)
    ? payload.note_attributes.find((item: any) => item?.name === key || item?.key === key)
    : null;
  return match?.value ?? null;
}

export function normalizeAffiliateSourcePlatform(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized || null;
}

export function isBixGrowSourcePlatform(value: string | null | undefined) {
  return normalizeAffiliateSourcePlatform(value) === BIXGROW_SOURCE_PLATFORM;
}

export function isBixGrowTrackingMethod(value: string | null | undefined) {
  return typeof value === "string" && value.toLowerCase().startsWith("bixgrow_");
}

export function resolveAffiliateSourcePlatform(input: {
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
  landingSite?: string | null;
  referringSite?: string | null;
  bgRefCode?: string | null;
  trackingMethod?: string | null;
}) {
  const explicitPlatform = normalizeAffiliateSourcePlatform(input.sourcePlatform);
  if (explicitPlatform) {
    return explicitPlatform;
  }

  if (isBixGrowTrackingMethod(input.trackingMethod)) {
    return BIXGROW_SOURCE_PLATFORM;
  }

  if (input.bgRefCode) {
    return BIXGROW_SOURCE_PLATFORM;
  }

  const urls = [input.sourceUrl, input.landingSite, input.referringSite];
  if (urls.some((urlLike) => Boolean(extractTrackingQueryValue(urlLike, "bg_ref")))) {
    return BIXGROW_SOURCE_PLATFORM;
  }

  return null;
}

export function buildAffiliateTrackingMethod(input: {
  hasClickSignal: boolean;
  hasCouponSignal: boolean;
  sourcePlatform?: string | null;
}) {
  const baseMethod = input.hasClickSignal && input.hasCouponSignal
    ? "link_and_coupon"
    : input.hasClickSignal
      ? "link_only"
      : input.hasCouponSignal
        ? "coupon"
        : "unknown";

  return isBixGrowSourcePlatform(input.sourcePlatform)
    ? `bixgrow_${baseMethod}`
    : baseMethod;
}

export function isBixGrowAttributedRecord(input: {
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
  landingSite?: string | null;
  referringSite?: string | null;
  bgRefCode?: string | null;
  trackingMethod?: string | null;
}) {
  return resolveAffiliateSourcePlatform(input) === BIXGROW_SOURCE_PLATFORM;
}

export function humanizeAffiliateSourcePlatform(value: string | null | undefined) {
  if (isBixGrowSourcePlatform(value)) {
    return "BixGrow";
  }

  return value ?? null;
}
