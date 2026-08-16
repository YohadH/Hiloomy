import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { encryptSecret } from "@/lib/security/encryption";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";
import {
  importAffiliateConversionsCsv,
  type AffiliateConversionImportResult
} from "@/lib/services/affiliate-conversion-import-service";

function normalizePortalDomain(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!normalized) {
    throw new AppError("BixGrow portal domain is required.");
  }
  return normalized;
}

export async function saveBixGrowConnection(input: { portalDomain: string; apiKey?: string }) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);
  const store = await resolveOrCreateBaseStore();
  if (!store) throw new AppError("Unable to resolve a store for BixGrow settings.", 500);

  const portalDomain = normalizePortalDomain(input.portalDomain);
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

export async function getBixGrowConnectionSummary() {
  const db = getDb();
  if (!db) return null;
  const store = await resolveOrCreateBaseStore();
  if (!store) return null;
  return db.bixgrowConnection.findUnique({ where: { storeId: store.id } });
}

export async function syncBixGrowAttributionPlaceholder() {
  // Kept for backward compatibility. BixGrow has no stable public programmatic
  // export API, so merchants export a CSV from the BixGrow dashboard and upload
  // it via `syncBixGrowAttribution` (POST /api/affiliate-portal/bixgrow-import).
  return {
    ok: true,
    status: "manual_export_placeholder"
  };
}

export interface BixGrowImportSummary {
  ok: true;
  imported: number;
  skipped: number;
  errors: string[];
  // Richer detail from the underlying importer, kept so the UI can show
  // "X new affiliates / Y orders matched" without a second round-trip.
  detail: AffiliateConversionImportResult;
}

/**
 * Ingest a BixGrow attribution CSV export into `affiliate_attributions`.
 *
 * BixGrow is a manual-export affiliate platform — merchants download the
 * per-order conversion CSV from the BixGrow dashboard and upload it here.
 * This delegates to the shared affiliate-conversion importer (the canonical
 * BixGrow-export parser) which:
 *   - upserts each `AffiliateMember` by storeId + email,
 *   - best-effort matches the row's order number to a Shopify `Order`,
 *   - upserts the `AffiliateAttribution` by (affiliateMemberId, orderId) so
 *     re-uploading the same export does not create duplicates.
 *
 * The result is normalized to the `{ imported, skipped, errors }` shape the
 * upload endpoint returns to the client. `imported` counts both newly
 * created and updated attributions (every row that successfully landed in
 * `affiliate_attributions`); `skipped` counts rows that lacked the minimum
 * identifiers (order number + affiliate email); `errors` carries any
 * parser-level warnings (e.g. a missing required column).
 */
export async function syncBixGrowAttribution(
  storeId: string,
  csvContent: string
): Promise<BixGrowImportSummary> {
  if (!storeId) throw new AppError("A store id is required to import BixGrow attribution.", 400);
  if (!csvContent || !csvContent.trim()) {
    throw new AppError("The BixGrow CSV is empty.", 400);
  }

  const detail = await importAffiliateConversionsCsv({ storeId, csvText: csvContent });

  return {
    ok: true,
    imported: detail.attributionsCreated + detail.attributionsUpdated,
    skipped: detail.skipped,
    errors: detail.warnings,
    detail
  };
}
