import { AppError } from "@/lib/server/errors";

const SHOP_DOMAIN_PATTERN = /^(?!https?:\/\/)([a-zA-Z0-9-]+\.)?myshopify\.com$/;

export function normalizeShopDomain(input: string) {
  const value = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!SHOP_DOMAIN_PATTERN.test(value)) {
    throw new AppError("Enter a valid Shopify shop domain like example.myshopify.com.", 400);
  }

  return value;
}

export function validateAdminAccessToken(token: string) {
  const value = token.trim();
  if (!value) {
    throw new AppError("Admin API access token is required.", 400);
  }

  if (value.length < 16) {
    throw new AppError("Admin API access token looks invalid.", 400);
  }

  return value;
}

export function validateOptionalAdminAccessToken(token?: string | null) {
  const value = token?.trim() ?? "";
  return value ? validateAdminAccessToken(value) : null;
}
