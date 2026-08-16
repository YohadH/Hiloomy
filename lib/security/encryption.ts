import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { AppError } from "@/lib/server/errors";

const IV_LENGTH = 16;

function getKey() {
  const secret = process.env.SHOPIFY_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new AppError(
      "Missing SHOPIFY_CREDENTIALS_ENCRYPTION_KEY. Set this env var before saving Shopify credentials.",
      500
    );
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(value: string) {
  const [ivHex, authTagHex, encryptedHex] = value.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new AppError("Stored Shopify credential is malformed.", 500);
  }

  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
