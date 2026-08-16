import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { encryptSecret } from "@/lib/security/encryption";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";

function normalizeWorkspaceDomain(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!normalized) {
    throw new AppError("Attribution workspace domain is required.", 400);
  }
  return normalized;
}

export async function saveCreatorAttributionSettings(input: { portalDomain: string; apiKey?: string }) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  const store = await resolveOrCreateBaseStore();
  if (!store) throw new AppError("Unable to resolve a store for attribution settings.", 500);

  const portalDomain = normalizeWorkspaceDomain(input.portalDomain);
  const apiKey = input.apiKey?.trim();

  await db.bixgrowConnection.upsert({
    where: { storeId: store.id },
    update: {
      portalDomain,
      apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
      tokenLastFour: apiKey ? apiKey.slice(-4) : null,
      exportMode: "manual_export"
    },
    create: {
      storeId: store.id,
      portalDomain,
      apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
      tokenLastFour: apiKey ? apiKey.slice(-4) : null,
      exportMode: "manual_export"
    }
  });

  return {
    ok: true,
    portalDomain
  };
}

