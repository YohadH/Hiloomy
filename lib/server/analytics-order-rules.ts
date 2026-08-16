function normalizeDiscountCode(code?: string | null) {
  return String(code ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isAnalyticsDiscountCode(code?: string | null) {
  // Count every real discount code, matching Shopify's reports. (Previously
  // "custom discount" was suppressed, which made our discount totals diverge
  // from Shopify.)
  return Boolean(normalizeDiscountCode(code));
}

export function pickAnalyticsDiscountCode(codes: Array<string | null | undefined>) {
  const match = codes.find((code) => isAnalyticsDiscountCode(code));
  return typeof match === "string" ? match : undefined;
}

export function shouldIgnoreOrderForAnalytics(_order: {
  totalPrice?: number | null;
  fulfillmentStatus?: string | null;
}) {
  // Shopify's reports count every order. We previously dropped fulfilled
  // orders <= 20 (intended to hide test/sample orders) but that silently made
  // every analytics total lower than Shopify, so it's disabled.
  return false;
}
