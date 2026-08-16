import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/server/errors";
import { runIncrementalSync } from "@/lib/services/shopify-sync-service";
import { syncMetaAdsCampaignInsights } from "@/lib/services/meta-ads-service";
import { crawlPublicInstagramProfiles } from "@/lib/services/instagram-public-crawler-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";

type SourceResult = { ok: boolean; error?: string };

function describe(result: PromiseSettledResult<unknown>): SourceResult {
  return result.status === "fulfilled"
    ? { ok: true }
    : { ok: false, error: toErrorMessage(result.reason) };
}

/**
 * Triggered when the reporting date range is applied. Pulls the freshest data
 * from every external source so the dashboard reflects "now" for the new
 * window. Each source is best-effort: Meta / Instagram not being connected (or
 * a Shopify sync already running) must not fail the whole refresh.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const storeId = typeof body.storeId === "string" && body.storeId.trim() ? body.storeId.trim() : null;

  if (!storeId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await assertStoreInActiveOrg(storeId);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: err instanceof Error && "statusCode" in err ? (err as any).statusCode : 403 }
    );
  }

  const [shopify, meta, instagram] = await Promise.allSettled([
    runIncrementalSync(storeId),
    syncMetaAdsCampaignInsights({ storeId }),
    crawlPublicInstagramProfiles({ storeId })
  ]);

  return NextResponse.json({
    ok: true,
    results: {
      shopify: describe(shopify),
      meta: describe(meta),
      instagram: describe(instagram)
    }
  });
}
